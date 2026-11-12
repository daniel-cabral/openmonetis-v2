import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { addMonthsToPeriod } from "@openmonetis/domain/transactions";
import type { ChangeAccountEmailOutput } from "@openmonetis/validators/settings";
import type { TransactionOutput } from "@openmonetis/validators/transactions";
import { hashPassword } from "better-auth/crypto";
import { and, eq, ne } from "drizzle-orm";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

// Local .env may enable Resend; blank it so the app loads with mail disabled.
process.env.RESEND_API_KEY = "";

type TransactionsPage = { items: TransactionOutput[]; total: number };
type ApiClient = Awaited<ReturnType<typeof createTestApiClient>>;

const defaultPreferences = {
  transactionsColumnOrder: null,
  groupTransactionsByDate: true,
  hideAnticipatedInstallments: false,
  showTransactionSummary: true,
  transactionNoteAsColumn: false,
  attachmentMaxSizeMb: 50,
};

function assertPreferences(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, key);
}

test("account preferences persist per field and hide anticipated installments from the list only", {
  skip: process.env.ACCOUNT_PREFERENCES_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const readPreferences = async (identity: typeof owner) =>
      api.data<Record<string, unknown>>(await api.request("/preferences", identity));

    await t.test("first read returns the documented defaults", async () => {
      assertPreferences(await readPreferences(owner), defaultPreferences);
    });

    await t.test("each field is saved on its own and stays isolated per user", async () => {
      await api.data(
        await api.request("/preferences", owner, "PATCH", {
          transactionsColumnOrder: ["amount", "name"],
        }),
      );
      await api.data(
        await api.request("/preferences", owner, "PATCH", { transactionNoteAsColumn: true }),
      );
      assertPreferences(await readPreferences(owner), {
        ...defaultPreferences,
        transactionsColumnOrder: ["amount", "name"],
        transactionNoteAsColumn: true,
      });
      assertPreferences(await readPreferences(stranger), defaultPreferences);
    });

    await t.test("invalid values are rejected and saved preferences stay unchanged", async () => {
      for (const body of [
        { attachmentMaxSizeMb: 100 },
        { transactionsColumnOrder: ["amount", "amount"] },
        { transactionsColumnOrder: ["type"] },
      ]) {
        await api.error(await api.request("/preferences", owner, "PATCH", body), 400);
      }
      assertPreferences(await readPreferences(owner), {
        ...defaultPreferences,
        transactionsColumnOrder: ["amount", "name"],
        transactionNoteAsColumn: true,
      });
    });

    await t.test(
      "hiding anticipated installments shrinks the list and total but not the export",
      async () => {
        const account = await api.account(owner);
        const card = await api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            accountId: account.id,
            name: "Cartão parcelado",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 5000,
          }),
          201,
        );
        const first = await api.expense(owner, {
          name: "Notebook",
          paymentMethod: "credit_card",
          condition: "installment",
          installmentCount: 3,
          amount: 300,
          purchaseDate: "2026-03-10",
          cardId: card.id,
          accountId: null,
        });
        assert.ok(first.seriesId);
        const seriesId = first.seriesId;
        const target = first.period;
        const installmentRecordId = async (period: string) => {
          const page = await api.data<TransactionsPage>(
            await api.request(`/transactions?period=${period}`, owner),
          );
          const [item] = page.items.filter((row) => row.seriesId === seriesId);
          assert.ok(item?.recordId);
          return item.recordId;
        };
        const second = await installmentRecordId(addMonthsToPeriod(target, 1));
        const third = await installmentRecordId(addMonthsToPeriod(target, 2));
        await api.data(
          await api.request(`/reports/installments/${seriesId}/anticipations`, owner, "POST", {
            installmentIds: [second, third],
            targetPeriod: target,
            discount: 5,
          }),
          201,
        );

        const listTarget = async () =>
          api.data<TransactionsPage>(await api.request(`/transactions?period=${target}`, owner));
        const before = await listTarget();
        const adjustment = before.items.find((row) => row.origin === "invoiceAdjustment");
        assert.ok(adjustment?.recordId);
        assert.equal(before.items.filter((row) => row.seriesId === seriesId).length, 3);

        await api.data(
          await api.request("/preferences", owner, "PATCH", { hideAnticipatedInstallments: true }),
        );
        const after = await listTarget();
        assert.deepEqual(after.items.map((row) => row.recordId).sort(), [
          first.recordId,
          adjustment.recordId,
        ].sort());
        assert.equal(after.total, before.total - 2);

        const exported = await api.data<{ items: TransactionOutput[]; rowCount: number }>(
          await api.request(`/transactions/export/items?period=${target}`, owner),
        );
        assert.deepEqual(
          exported.items.map((row) => row.recordId).sort(),
          before.items.map((row) => row.recordId).sort(),
        );
      },
    );

    await t.test(
      "the personal attachment limit rejects oversized prepares before any row is stored",
      async () => {
        await api.data(
          await api.request("/preferences", owner, "PATCH", { attachmentMaxSizeMb: 5 }),
        );
        const transaction = await api.expense(owner);
        const note = await api.data<{ id: string }>(
          await api.request("/notes", owner, "POST", {
            kind: "text",
            title: "Recibo",
            content: "Comprovante",
          }),
          201,
        );
        const { db, attachments } = await import("@openmonetis/db");
        const countOwnerAttachments = async () =>
          (
            await db
              .select({ id: attachments.id })
              .from(attachments)
              .where(eq(attachments.userId, owner.id))
          ).length;
        const before = await countOwnerAttachments();
        const oversized = {
          fileName: "recibo.pdf",
          fileSize: 6 * 1024 * 1024,
          mimeType: "application/pdf",
        };

        await api.error(
          await api.request("/attachments/prepare", owner, "POST", {
            transactionId: transaction.recordId,
            ...oversized,
          }),
          400,
          "attachment_too_large",
        );
        await api.error(
          await api.request("/attachments/note/prepare", owner, "POST", {
            noteId: note.id,
            ...oversized,
          }),
          400,
          "attachment_too_large",
        );
        assert.equal(await countOwnerAttachments(), before);

        const atLimit = await api.request("/attachments/prepare", owner, "POST", {
          transactionId: transaction.recordId,
          fileName: "recibo.pdf",
          fileSize: 5 * 1024 * 1024,
          mimeType: "application/pdf",
        });
        assert.notEqual(atLimit.status, 400);
      },
    );

    await t.test(
      "email change requires proof, refuses duplicates and keeps only the current session",
      (subtest) => changeAccountEmail(subtest, api),
    );
  }, {
    // Presigned URLs are built locally; the endpoint is never contacted. It only enables storage.
    environment: {
      S3_BUCKET: "account-preferences-test",
      S3_ENDPOINT: "http://127.0.0.1:9",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
    },
  });
});

async function changeAccountEmail(t: TestContext, api: ApiClient) {
  const { db, account, passkey, people, session, user } = await import("@openmonetis/db");
  const password = "integration-test-password-123";
  // Sign-up allows 3 requests per minute and the test above already makes 2, so only the owner
  // signs up through the API. The other accounts are inserted directly.
  const owner = await api.register();
  const readUser = async (userId: string) => {
    const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    assert.ok(row);
    return row;
  };
  const ownerEmail = (await readUser(owner.id)).email;
  const otherEmail = "outra.pessoa@exemplo.com";
  await db.insert(user).values({ name: "Outra pessoa", email: otherEmail });
  const signIn = async (email: string) => {
    const response = await api.request("/api/auth/sign-in/email", undefined, "POST", {
      email,
      password,
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
  };
  const ownerSecondSession = { ...owner, cookie: await signIn(ownerEmail) };

  await t.test("a wrong password is rejected and the email stays unchanged", async () => {
    await api.error(
      await api.request("/settings/email", owner, "POST", {
        newEmail: "novo@exemplo.com",
        currentPassword: "senha-errada-123",
      }),
      400,
      "email_change_rejected",
    );
    assert.equal((await readUser(owner.id)).email, ownerEmail);
  });

  await t.test("an address equal to the current one ignoring case is unchanged", async () => {
    await api.error(
      await api.request("/settings/email", owner, "POST", {
        newEmail: ownerEmail.toUpperCase(),
        currentPassword: password,
      }),
      400,
      "email_unchanged",
    );
  });

  await t.test(
    "an address used by another account gets the same code as a wrong password",
    async () => {
      await api.error(
        await api.request("/settings/email", owner, "POST", {
          newEmail: otherEmail.toUpperCase(),
          currentPassword: password,
        }),
        400,
        "email_change_rejected",
      );
      assert.equal((await readUser(owner.id)).email, ownerEmail);
    },
  );

  await t.test(
    "a valid change revokes other sessions, unverifies the address and keeps passkeys and external logins",
    async () => {
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, owner.id));
      await db.insert(passkey).values({
        userId: owner.id,
        publicKey: "public-key",
        credentialID: randomUUID(),
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      });
      await db
        .insert(account)
        .values({ userId: owner.id, providerId: "google", accountId: randomUUID() });
      const countAuthMethods = async () => ({
        passkeys: (
          await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, owner.id))
        ).length,
        externalAccounts: (
          await db
            .select({ id: account.id })
            .from(account)
            .where(and(eq(account.userId, owner.id), ne(account.providerId, "credential")))
        ).length,
      });
      const authMethodsBefore = await countAuthMethods();

      const result = await api.data<ChangeAccountEmailOutput>(
        await api.request("/settings/email", owner, "POST", {
          newEmail: "  Novo.Email@Exemplo.com ",
          currentPassword: password,
        }),
      );
      assert.deepEqual(result, { email: "novo.email@exemplo.com", verificationEmailSent: false });

      const changed = await readUser(owner.id);
      assert.equal(changed.email, "novo.email@exemplo.com");
      assert.equal(changed.emailVerified, false);
      const [adminPerson] = await db
        .select({ email: people.email })
        .from(people)
        .where(and(eq(people.userId, owner.id), eq(people.role, "admin")));
      assert.equal(adminPerson?.email, "novo.email@exemplo.com");
      assert.deepEqual(await countAuthMethods(), authMethodsBefore);

      await api.error(await api.request("/preferences", ownerSecondSession), 401);
      await api.data(await api.request("/preferences", owner));
      await signIn("novo.email@exemplo.com");
    },
  );

  await t.test(
    "a Google-only account needs a session started within the last 10 minutes",
    async () => {
      const googleOnlyEmail = "pessoa.google@exemplo.com";
      const [googleOnlyRow] = await db
        .insert(user)
        .values({ name: "Pessoa Google", email: googleOnlyEmail })
        .returning({ id: user.id });
      assert.ok(googleOnlyRow);
      await db.insert(account).values({
        userId: googleOnlyRow.id,
        accountId: googleOnlyRow.id,
        providerId: "credential",
        password: await hashPassword(password),
      });
      // api.request reads only the cookie of an identity; the other fields are unused here.
      const googleOnly = {
        ...owner,
        id: googleOnlyRow.id,
        cookie: await signIn(googleOnlyEmail),
      };
      await db
        .delete(account)
        .where(and(eq(account.userId, googleOnly.id), eq(account.providerId, "credential")));
      await db
        .update(session)
        .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(session.userId, googleOnly.id));

      await api.error(
        await api.request("/settings/email", googleOnly, "POST", {
          newEmail: "google.novo@exemplo.com",
        }),
        403,
        "fresh_session_required",
      );
      assert.equal((await readUser(googleOnly.id)).email, googleOnlyEmail);

      await db
        .update(session)
        .set({ createdAt: new Date() })
        .where(eq(session.userId, googleOnly.id));
      await api.data(
        await api.request("/settings/email", googleOnly, "POST", {
          newEmail: "google.novo@exemplo.com",
        }),
      );
      assert.equal((await readUser(googleOnly.id)).email, "google.novo@exemplo.com");
    },
  );
}
