import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
  ReconciliationDetection,
  ReconciliationPreview,
} from "@openmonetis/validators/reconciliations";
import type {
  TransactionImportPreview,
  TransactionImportResult,
} from "@openmonetis/validators/transactions";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

function fixtureBase64(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../packages/domain/src/__fixtures__/${name}`, import.meta.url)),
  ).toString("base64");
}

function linesTotal(counts: ReconciliationPreview["counts"]) {
  return (
    counts.needsDecision +
    counts.matched +
    counts.bankOnly +
    counts.ambiguous +
    counts.ignored +
    counts.informational
  );
}

test("reconciliation detects, previews and isolates owners without writing", {
  skip: process.env.RECONCILIATIONS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const {
      db,
      transactions,
      reconciliationBatches,
      reconciliationIgnores,
      importNameMappings,
      recurringTransactionOccurrences,
    } = await import("@openmonetis/db");
    const { count } = await import("drizzle-orm");

    async function rowCounts() {
      const tables = [
        transactions,
        reconciliationBatches,
        reconciliationIgnores,
        importNameMappings,
        recurringTransactionOccurrences,
      ];
      return Promise.all(
        tables.map(async (table) => (await db.select({ value: count() }).from(table))[0].value),
      );
    }

    const statement = fixtureBase64("c6-extrato.csv");
    const invoice = fixtureBase64("c6-fatura.csv");
    const account = await api.data<{ id: string }>(
      await api.request("/accounts", owner, "POST", {
        name: "Conta C6 99999999",
        type: "checking",
      }),
      201,
    );

    await t.test("detect suggests the account carrying the file's digits, or none when ambiguous", async () => {
      const detection = await api.data<ReconciliationDetection>(
        await api.request("/reconciliations/detect", owner, "POST", {
          fileName: "c6-extrato.csv",
          contentBase64: statement,
        }),
      );
      assert.equal(detection.detectedProfileId, "c6-statement");
      assert.equal(detection.suggestedAccountId, account.id);

      await api.request("/accounts", owner, "POST", {
        name: "Conta antiga 99999999",
        type: "checking",
      });
      const ambiguous = await api.data<ReconciliationDetection>(
        await api.request("/reconciliations/detect", owner, "POST", {
          fileName: "c6-extrato.csv",
          contentBase64: statement,
        }),
      );
      assert.equal(ambiguous.suggestedAccountId, null);
    });

    const accountFile = {
      fileName: "c6-extrato.csv",
      contentBase64: statement,
      profileId: "c6-statement",
      targetType: "account",
      targetId: account.id,
    };
    const inRange = await api.expense(owner, {
      accountId: account.id,
      name: "Pix enviado para Pessoa Teste 1",
      amount: 120,
      purchaseDate: "2026-07-05",
    });
    const outOfRange = await api.expense(owner, {
      accountId: account.id,
      name: "Compra antes do extrato",
      amount: 77.77,
      purchaseDate: "2026-07-03",
    });

    await t.test(
      "preview classifies every file line once, matches a seeded entry and keeps out-of-range entries out of app-only",
      async () => {
        const before = await rowCounts();
        const preview = await api.data<ReconciliationPreview>(
          await api.request("/reconciliations/preview", owner, "POST", accountFile),
        );
        assert.deepEqual(await rowCounts(), before);

        assert.equal(preview.lines.length, 113);
        assert.equal(linesTotal(preview.counts), 113);
        assert.equal(preview.fileRange?.start, "2026-07-05");

        const [firstLine] = preview.lines;
        assert.equal(firstLine.bucket, "matched");
        assert.equal(firstLine.rule, "exact");
        assert.equal(firstLine.entryKey, `t:${inRange.id}`);
        assert.equal(firstLine.alignment.kind, "none");

        assert.ok(preview.entries.some((entry) => entry.entryKey === `t:${outOfRange.id}`));
        assert.ok(!preview.appOnlyKeys.includes(`t:${outOfRange.id}`));
        assert.ok(!preview.appOnlyKeys.includes(`t:${inRange.id}`));
      },
    );

    await t.test("a line already imported from the same file matches by identity", async () => {
      const imported = await api.data<TransactionImportPreview>(
        await api.request("/transactions/imports/preview", owner, "POST", {
          fileName: "c6-extrato.csv",
          contentBase64: statement,
          profileId: "c6-statement",
          destinationType: "account",
          destinationId: account.id,
        }),
      );
      const row = imported.transactions.find(
        (transaction) => transaction.name.startsWith("Pix enviado para Pessoa Teste 5"),
      );
      assert.ok(row);
      const result = await api.data<TransactionImportResult>(
        await api.request("/transactions/imports", owner, "POST", {
          sourceFingerprint: imported.sourceFingerprint,
          destinationType: "account",
          destinationId: account.id,
          paymentMethod: "pix",
          rows: [
            {
              externalId: row.externalId,
              name: row.name,
              amount: row.amount,
              type: row.type,
              purchaseDate: row.purchaseDate,
              personId: owner.personId,
              categoryId: owner.expenseCategoryId,
            },
          ],
        }),
        201,
      );
      assert.equal(result.imported, 1);

      const preview = await api.data<ReconciliationPreview>(
        await api.request("/reconciliations/preview", owner, "POST", accountFile),
      );
      const line = preview.lines.find(
        (candidate) => candidate.name.startsWith("Pix enviado para Pessoa Teste 5"),
      );
      assert.equal(line?.bucket, "matched");
      assert.equal(line?.rule, "identity");
    });

    await t.test("another user's account is not found and their entries never appear", async () => {
      const foreignAccount = await api.account(stranger);
      const foreignEntry = await api.expense(stranger, {
        accountId: foreignAccount.id,
        name: "Compra de outro usuario",
        amount: 55.55,
        purchaseDate: "2026-07-06",
      });
      await api.error(
        await api.request("/reconciliations/preview", owner, "POST", {
          ...accountFile,
          targetId: foreignAccount.id,
        }),
        404,
        "ACCOUNT_NOT_FOUND",
      );
      const preview = await api.data<ReconciliationPreview>(
        await api.request("/reconciliations/preview", owner, "POST", accountFile),
      );
      assert.ok(!preview.entries.some((entry) => entry.entryKey === `t:${foreignEntry.id}`));
    });

    await t.test(
      "card preview scopes app-only to the invoice period and matches the invoice line",
      async () => {
        const card = await api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            name: "C6 card",
            accountId: account.id,
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000000,
          }),
          201,
        );
        const cardPurchase = await api.data<{ id: string; period: string }>(
          await api.request("/transactions", owner, "POST", {
            type: "expense",
            paymentMethod: "credit_card",
            condition: "single",
            name: "MERCADOTESTE*MERCADOT",
            amount: 121.68,
            purchaseDate: "2026-07-28",
            personId: owner.personId,
            categoryId: owner.expenseCategoryId,
            cardId: card.id,
          }),
          201,
        );
        assert.equal(cardPurchase.period, "2026-08");
        const oldPurchase = await api.expense(owner, {
          accountId: null,
          cardId: card.id,
          paymentMethod: "credit_card",
          condition: "single",
          name: "Compra antiga do cartao",
          amount: 33.33,
          purchaseDate: "2026-06-15",
        });

        const preview = await api.data<ReconciliationPreview>(
          await api.request("/reconciliations/preview", owner, "POST", {
            fileName: "c6-fatura.csv",
            contentBase64: invoice,
            profileId: "c6-invoice",
            targetType: "card",
            targetId: card.id,
            invoicePeriod: "2026-08",
          }),
        );
        const line = preview.lines.find(
          (candidate) =>
            candidate.name.includes("MERCADOTESTE") && candidate.purchaseDate === "2026-07-28",
        );
        assert.equal(line?.bucket, "matched");
        assert.equal(line?.rule, "exact");
        assert.equal(line?.entryKey, `t:${cardPurchase.id}`);
        assert.ok(!preview.appOnlyKeys.includes(`t:${oldPurchase.id}`));

        await api.error(
          await api.request("/reconciliations/preview", owner, "POST", {
            fileName: "c6-fatura.csv",
            contentBase64: invoice,
            profileId: "c6-invoice",
            targetType: "card",
            targetId: card.id,
          }),
          400,
          "validation_error",
        );
      },
    );
  });
});
