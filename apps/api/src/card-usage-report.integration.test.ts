import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

test("card usage report ranks active cards by limit use over real rows and isolates users", {
  skip: process.env.CARD_USAGE_REPORT_INTEGRATION_TEST !== "1",
}, async () => {
  await withIntegrationDatabase(
    async () => {
      const api = await createTestApiClient();
      const owner = await api.register();
      const stranger = await api.register();
      const account = await api.account(owner);
      const reportPath = "/reports/card-usage?period=2026-06";
      await api.error(await api.request(reportPath), 401);

      const ana = await api.data<{ id: string }>(
        await api.request("/people", owner, "POST", { name: "Ana" }),
        201,
      );
      const createCard = async (name: string, limit: number) =>
        api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            accountId: account.id,
            name,
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit,
          }),
          201,
        );
      // Limit is lowered to 5000 after the purchases: the limit check counts the full
      // purchase amount, so the fixture needs room for all of them first.
      const cardA = await createCard("Cartão A", 10000);
      const cardB = await createCard("Cartão B", 3000);
      await createCard("Cartão C", 2000);
      const cardD = await createCard("Cartão D", 1000);

      const cardPurchase = (overrides: Record<string, unknown>) =>
        api.expense(owner, {
          paymentMethod: "credit_card",
          accountId: null,
          name: "Compra no cartão",
          ...overrides,
        });
      await cardPurchase({
        cardId: cardA.id,
        amount: 2000,
        purchaseDate: "2026-05-10",
        invoicePeriod: "2026-05",
      });
      await cardPurchase({
        cardId: cardA.id,
        amount: 1500,
        purchaseDate: "2026-06-05",
        invoicePeriod: "2026-06",
      });
      await cardPurchase({
        cardId: cardA.id,
        amount: 2000,
        purchaseDate: "2026-06-12",
        invoicePeriod: "2026-06",
        splitShares: [
          { personId: owner.personId, amount: 1000 },
          { personId: ana.id, amount: 1000 },
        ],
      });
      const purchaseB = await cardPurchase({
        cardId: cardB.id,
        amount: 1500,
        purchaseDate: "2026-06-08",
        invoicePeriod: "2026-06",
      });
      await cardPurchase({
        cardId: cardD.id,
        amount: 900,
        purchaseDate: "2026-06-09",
        invoicePeriod: "2026-06",
      });
      await api.data(
        await api.request(`/transactions/${purchaseB.recordId}/refunds`, owner, "POST", {
          amount: 200,
          receivedAt: "2026-06-10",
          invoicePeriod: "2026-06",
        }),
        201,
      );
      await api.data(
        await api.request(`/cards/${cardD.id}`, owner, "PATCH", { status: "inactive" }),
      );
      await api.data(await api.request(`/cards/${cardA.id}`, owner, "PATCH", { limit: 5000 }));

      const report = await api.data<CardUsageReportOutput>(await api.request(reportPath, owner));
      assert.equal(report.summary.totalLimit, 10000);
      assert.equal(report.summary.totalUsed, 3800);
      assert.equal(report.summary.totalAvailable, 6200);
      assert.equal(report.summary.usagePercentage, 38);
      assert.deepEqual(
        report.cards.map((card) => card.name),
        ["Cartão A", "Cartão B", "Cartão C"],
      );
      const [a, b, c] = report.cards;
      assert.equal(a?.usedAmount, 2500);
      assert.equal(a?.usagePercentage, 50);
      assert.equal(a?.tone, "warning");
      assert.equal(a?.previousAmount, 2000);
      assert.equal(a?.changePercentage, 25);
      assert.equal(a?.trend, "up");
      assert.equal(b?.usedAmount, 1300);
      assert.equal(c?.usagePercentage, 0);
      assert.equal(c?.trend, "stable");
      assert.equal(report.selectedCardId, cardA.id);

      await api.data(
        await api.request(`/invoices/${cardA.id}/2026-05/payments`, owner, "POST", {
          accountId: account.id,
          paidAt: "2026-06-25",
          allocations: [{ personId: owner.personId, amount: 2000 }],
        }),
        201,
      );
      const detailed = await api.data<CardUsageReportOutput>(await api.request(reportPath, owner));
      const detail = detailed.detail;
      assert.equal(detail?.cardId, cardA.id);
      assert.deepEqual(
        detail?.history.map((item) => item.period),
        [
          "2025-07",
          "2025-08",
          "2025-09",
          "2025-10",
          "2025-11",
          "2025-12",
          "2026-01",
          "2026-02",
          "2026-03",
          "2026-04",
          "2026-05",
          "2026-06",
        ],
      );
      assert.equal(detail?.history.find((item) => item.period === "2026-05")?.usedAmount, 2000);
      assert.equal(detail?.history.find((item) => item.period === "2026-06")?.usedAmount, 2500);
      assert.equal(detail?.invoices.find((item) => item.period === "2026-05")?.state, "paid");
      assert.equal(detail?.invoices.find((item) => item.period === "2026-04")?.state, "none");
      assert.equal(detail?.invoices.find((item) => item.period === "2026-04")?.amount, 0);
      assert.notEqual(detail?.invoices.find((item) => item.period === "2026-06")?.state, "none");
      assert.deepEqual(
        detail?.categories.map((item) => [item.categoryId, item.amount, item.percentage]),
        [[owner.expenseCategoryId, 2500, 100]],
      );
      assert.equal(detail?.topExpenses[0]?.amount, 1500);
      assert.equal(detail?.topExpenses[1]?.amount, 1000);

      const switchedReport = await api.data<CardUsageReportOutput>(
        await api.request(`${reportPath}&cardId=${cardB.id}`, owner),
      );
      assert.equal(switchedReport.selectedCardId, cardB.id);
      assert.equal(switchedReport.detail?.cardId, cardB.id);
      const inactiveReport = await api.data<CardUsageReportOutput>(
        await api.request(`${reportPath}&cardId=${cardD.id}`, owner),
      );
      assert.equal(inactiveReport.selectedCardId, cardA.id);
      const strangerReport = await api.data<CardUsageReportOutput>(
        await api.request(reportPath, stranger),
      );
      assert.deepEqual(strangerReport.cards, []);
      assert.equal(strangerReport.selectedCardId, null);
      assert.equal(strangerReport.detail, null);
      const strangerCard = await api.data<{ id: string }>(
        await api.request("/cards", stranger, "POST", {
          accountId: (await api.account(stranger)).id,
          name: "Cartão alheio",
          brand: "visa",
          closingDay: 20,
          dueDay: 25,
          limit: 1000,
        }),
        201,
      );
      const foreignReport = await api.request(`${reportPath}&cardId=${strangerCard.id}`, owner);
      const foreignBody = await foreignReport.text();
      assert.equal(JSON.parse(foreignBody).data.selectedCardId, cardA.id);
      assert.doesNotMatch(foreignBody, new RegExp(strangerCard.id));
    },
    { migrationsFolder },
  );
});
