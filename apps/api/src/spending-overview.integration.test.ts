import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { SpendingOverviewOutput } from "@openmonetis/validators/spending-overview";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

test("spending overview ranks the owner's June expenses by their own share and isolates users", {
  skip: process.env.SPENDING_OVERVIEW_INTEGRATION_TEST !== "1",
}, async () => {
  await withIntegrationDatabase(
    async () => {
      const api = await createTestApiClient();
      const owner = await api.register();
      const stranger = await api.register();
      const account = await api.account(owner);
      const overviewPath = "/dashboard/spending-overview?period=2026-06";
      await api.error(await api.request(overviewPath), 401);

      const ana = await api.data<{ id: string }>(
        await api.request("/people", owner, "POST", { name: "Ana" }),
        201,
      );
      for (const [purchaseDate, amount] of [
        ["2026-06-03", 120],
        ["2026-06-10", 80],
        ["2026-06-20", 50],
      ] as const) {
        await api.expense(owner, {
          name: "Mercado A",
          amount,
          purchaseDate,
          accountId: account.id,
        });
      }
      await api.expense(owner, {
        name: "Fatura de energia",
        amount: 412.8,
        purchaseDate: "2026-06-15",
        accountId: account.id,
      });
      await api.expense(owner, {
        name: "Loja",
        amount: 200,
        purchaseDate: "2026-06-05",
        accountId: account.id,
        splitShares: [
          { personId: owner.personId, amount: 60 },
          { personId: ana.id, amount: 140 },
        ],
      });
      await api.expense(owner, {
        name: "Cinema julho",
        amount: 999,
        purchaseDate: "2026-07-10",
        accountId: account.id,
      });
      await api.expense(owner, {
        type: "income",
        name: "Salario",
        amount: 5000,
        purchaseDate: "2026-06-01",
        categoryId: owner.incomeCategoryId,
        accountId: account.id,
      });
      await api.expense(stranger, {
        name: "Padaria Vizinha",
        amount: 70,
        purchaseDate: "2026-06-12",
      });

      const overview = await api.data<SpendingOverviewOutput>(
        await api.request(overviewPath, owner),
      );
      assert.deepEqual(
        overview.topExpenses.map((expense) => [expense.name, expense.amount]),
        [
          ["Fatura de energia", 412.8],
          ["Mercado A", 120],
          ["Mercado A", 80],
          ["Loja", 60],
          ["Mercado A", 50],
        ],
      );
      assert.deepEqual(
        overview.topEstablishments.map((item) => [item.name, item.count, item.total]),
        [
          ["Mercado A", 3, 250],
          ["Fatura de energia", 1, 412.8],
          ["Loja", 1, 60],
        ],
      );

      const strangerOverview = await api.data<SpendingOverviewOutput>(
        await api.request(overviewPath, stranger),
      );
      assert.deepEqual(
        strangerOverview.topEstablishments.map((item) => [item.name, item.count, item.total]),
        [["Padaria Vizinha", 1, 70]],
      );
      assert.deepEqual(
        strangerOverview.topExpenses.map((expense) => expense.name),
        ["Padaria Vizinha"],
      );
    },
    { migrationsFolder },
  );
});
