import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

test("reset and account deletion preserve other users and clean owned financial aggregates", {
  skip: process.env.SETTINGS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const { db, pool, ...schema } = await import("@openmonetis/db");
    const { eq } = await import("drizzle-orm");
    async function seed(identity: typeof owner) {
      const expense = await api.expense(identity, {
        condition: "installment",
        installmentCount: 3,
        amount: 30.01,
      });
      const recurring = await api.expense(identity, {
        condition: "recurring",
        recurrenceFrequency: "monthly",
        amount: 10,
      });
      await api.data(
        await api.request("/notes", identity, "POST", {
          kind: "checklist",
          title: "Tasks",
          items: [{ text: "One" }],
        }),
        201,
      );
      await api.data(
        await api.request("/budgets", identity, "POST", {
          categoryId: identity.expenseCategoryId,
          amount: 100,
          period: "2020-01",
        }),
        201,
      );
      await api.data(
        await api.request("/goals", identity, "POST", {
          name: "Reserve",
          trackingType: "account",
          accountId: expense.accountId,
          targetAmount: 100,
          targetDate: null,
        }),
        201,
      );
      const tag = await api.data<{ id: string }>(
        await api.request("/tags", identity, "POST", { name: `Seed ${randomUUID()}` }),
        201,
      );
      await api.data(
        await api.request(`/transactions/${expense.recordId}`, identity, "PATCH", {
          tagIds: [tag.id],
        }),
      );
      await api.data(
        await api.request("/transactions/settlement", identity, "PATCH", {
          ids: [expense.recordId],
          isSettled: true,
          settledDate: "2020-01-20",
        }),
      );
      await db.insert(schema.notificationStates).values({
        userId: identity.id,
        notificationKey: "test-notification",
        fingerprint: "test",
        readAt: new Date(),
      });
      return { expense, recurring };
    }
    await seed(owner);
    await seed(stranger);
    async function snapshot(userId: string) {
      const tables = await pool.query<{ table_name: string }>(
        "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by table_name",
      );
      const snapshot: Record<string, unknown[]> = {};
      for (const { table_name: table } of tables.rows) {
        assert.match(table, /^[a-z_]+$/);
        snapshot[table] = (
          await pool.query(`select * from "${table}" where user_id = $1 order by 1`, [userId])
        ).rows;
      }
      return snapshot;
    }
    const foreignSnapshot = await snapshot(stranger.id);
    await t.test("invalid confirmation cannot reset or delete data", async () => {
      const before = await snapshot(owner.id);
      await api.error(
        await api.request("/settings/reset", owner, "POST", { confirmation: "invalid" }),
        400,
      );
      await api.error(
        await api.request("/settings/account", owner, "DELETE", { confirmation: "invalid" }),
        400,
      );
      assert.deepEqual(await snapshot(owner.id), before);
    });
    await t.test(
      "reset refuses to discard attachment records when storage is unavailable",
      async () => {
        const [attachment] = await db
          .insert(schema.attachments)
          .values({
            userId: owner.id,
            fileKey: `pending/${randomUUID()}`,
            fileName: "receipt.pdf",
            fileSize: 8,
            mimeType: "application/pdf",
          })
          .returning();
        const before = await snapshot(owner.id);
        await api.error(
          await api.request("/settings/reset", owner, "POST", { confirmation: "ZERAR" }),
          503,
          "attachment_storage_unavailable",
        );
        assert.deepEqual(await snapshot(owner.id), before);
        await db.delete(schema.attachments).where(eq(schema.attachments.id, attachment.id));
      },
    );
    await t.test(
      "reset removes owned aggregates and recreates exactly one admin with default categories",
      async () => {
        await api.data(
          await api.request("/preferences", owner, "PATCH", {
            groupTransactionsByDate: false,
            attachmentMaxSizeMb: 5,
            transactionsColumnOrder: ["amount"],
          }),
        );
        await api.data(
          await api.request("/settings/reset", owner, "POST", { confirmation: "ZERAR" }),
        );
        const current = await snapshot(owner.id);
        for (const [table, rows] of Object.entries(current)) {
          if (["account", "session", "people", "categories"].includes(table)) continue;
          assert.deepEqual(rows, [], table);
        }
        const people = await db
          .select()
          .from(schema.people)
          .where(eq(schema.people.userId, owner.id));
        assert.equal(
          people.filter((row) => row.role === "admin" && row.status === "active").length,
          1,
        );
        assert.ok(
          (await db.select().from(schema.categories).where(eq(schema.categories.userId, owner.id)))
            .length > 0,
        );
        assert.deepEqual(await snapshot(stranger.id), foreignSnapshot);
        const preferences = await api.data<Record<string, unknown>>(
          await api.request("/preferences", owner),
        );
        assert.equal(preferences.groupTransactionsByDate, true);
        assert.equal(preferences.attachmentMaxSizeMb, 50);
        assert.equal(preferences.transactionsColumnOrder, null);
        await api.data(await api.request("/accounts", owner));
      },
    );
    await t.test(
      "account deletion removes credentials and sessions and rejects replay of the old cookie",
      async () => {
        await api.data(
          await api.request("/settings/account", owner, "DELETE", { confirmation: "EXCLUIR" }),
        );
        assert.deepEqual(
          await db.select().from(schema.user).where(eq(schema.user.id, owner.id)),
          [],
        );
        for (const [table, rows] of Object.entries(await snapshot(owner.id)))
          assert.deepEqual(rows, [], table);
        assert.deepEqual(await snapshot(stranger.id), foreignSnapshot);
        await api.error(await api.request("/accounts", owner), 401, "unauthorized");
      },
    );
  });
});
