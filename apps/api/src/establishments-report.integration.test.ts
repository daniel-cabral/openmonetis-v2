import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { CategoryTrendsOutput } from "@openmonetis/validators/category-trends";
import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

test("establishments report ranks the owner's purchases by window and months and isolates users", {
  skip: process.env.ESTABLISHMENTS_REPORT_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(
    async () => {
      const api = await createTestApiClient();
      const owner = await api.register();
      const stranger = await api.register();
      const account = await api.account(owner);
      const reportPath = "/reports/establishments?period=2026-06";
      await api.error(await api.request(reportPath), 401);

      for (let index = 0; index < 8; index += 1) {
        await api.expense(owner, {
          name: "Mercado A",
          amount: 100,
          purchaseDate: `2026-0${(index % 6) + 1}-10`,
          accountId: account.id,
        });
      }
      for (const purchaseDate of ["2026-02-10", "2026-03-10", "2026-04-10"]) {
        await api.expense(owner, {
          name: "Posto B",
          amount: 300,
          purchaseDate,
          accountId: account.id,
        });
      }
      await api.expense(owner, {
        name: "Mercado A",
        amount: 100,
        purchaseDate: "2025-11-10",
        accountId: account.id,
      });

      const report = await api.data<EstablishmentsReportOutput>(
        await api.request(reportPath, owner),
      );
      assert.deepEqual(report.window, { startPeriod: "2026-01", endPeriod: "2026-06" });
      assert.equal(report.months, 6);
      assert.deepEqual(report.tripFilter, { mode: "all" });
      assert.deepEqual(
        report.establishments.map((item) => [
          item.name,
          item.count,
          item.totalAmount,
          item.averageAmount,
        ]),
        [
          ["Mercado A", 8, 800, 100],
          ["Posto B", 3, 900, 300],
        ],
      );
      assert.deepEqual(report.summary, {
        establishmentCount: 2,
        transactionCount: 11,
        totalAmount: 1700,
        averageAmount: 154.55,
        mostFrequent: "Mercado A",
        highestTotal: "Posto B",
      });

      const longReport = await api.data<EstablishmentsReportOutput>(
        await api.request(`${reportPath}&months=12`, owner),
      );
      assert.deepEqual(longReport.window, { startPeriod: "2025-07", endPeriod: "2026-06" });
      assert.equal(longReport.establishments[0]?.name, "Mercado A");
      assert.equal(longReport.establishments[0]?.count, 9);

      const strangerReport = await api.data<EstablishmentsReportOutput>(
        await api.request(reportPath, stranger),
      );
      assert.deepEqual(strangerReport.establishments, []);
      assert.equal(strangerReport.summary.transactionCount, 0);
      assert.equal(strangerReport.summary.mostFrequent, null);
      await t.test(
        "counts only the owner's regular purchases, own shares and active recurrences",
        async () => {
          const owner = await api.register();
          const account = await api.account(owner);
          const destination = await api.account(owner);
          const ana = await api.data<{ id: string }>(
            await api.request("/people", owner, "POST", { name: "Ana" }),
            201,
          );
          const hiddenAccount = await api.data<{ id: string }>(
            await api.request("/accounts", owner, "POST", {
              name: "Hidden investment",
              type: "investment",
              excludeFromBalance: true,
            }),
            201,
          );
          const card = await api.data<{ id: string }>(
            await api.request("/cards", owner, "POST", {
              accountId: account.id,
              name: "Loja card",
              brand: "visa",
              closingDay: 20,
              dueDay: 25,
              limit: 1000,
            }),
            201,
          );

          await api.expense(owner, {
            name: "Loja",
            amount: 100,
            purchaseDate: "2026-06-02",
            accountId: account.id,
            splitShares: [
              { personId: owner.personId, amount: 50 },
              { personId: ana.id, amount: 50 },
            ],
          });
          await api.expense(owner, {
            name: "Loja",
            paymentMethod: "credit_card",
            cardId: card.id,
            accountId: null,
            amount: 30,
            purchaseDate: "2026-06-05",
            invoicePeriod: "2026-06",
          });
          await api.data(
            await api.request(`/invoices/${card.id}/2026-06/payments`, owner, "POST", {
              accountId: account.id,
              paidAt: "2026-06-25",
              allocations: [{ personId: owner.personId, amount: 30 }],
            }),
            201,
          );
          await api.data(
            await api.request(`/accounts/${account.id}/balance-adjustments`, owner, "POST", {
              balance: 500,
              date: "2026-06-15",
            }),
          );
          await api.data(
            await api.request("/transactions", owner, "POST", {
              type: "transfer",
              paymentMethod: "bank_transfer",
              name: "Transferencia",
              amount: 30,
              purchaseDate: "2026-06-12",
              personId: owner.personId,
              sourceAccountId: account.id,
              destinationAccountId: destination.id,
              isSettled: true,
            }),
            201,
          );
          await api.expense(owner, {
            name: "Loja",
            amount: 40,
            purchaseDate: "2026-06-08",
            accountId: hiddenAccount.id,
          });
          await api.expense(owner, {
            type: "income",
            name: "Loja",
            amount: 70,
            purchaseDate: "2026-06-03",
            categoryId: owner.incomeCategoryId,
            accountId: account.id,
          });
          await api.expense(owner, {
            name: "Academia",
            condition: "recurring",
            recurrenceFrequency: "monthly",
            amount: 99.9,
            purchaseDate: "2026-04-05",
            accountId: account.id,
          });

          const report = await api.data<EstablishmentsReportOutput>(
            await api.request("/reports/establishments?period=2026-06", owner),
          );
          assert.deepEqual(report.establishments.map((item) => item.name).sort(), [
            "Academia",
            "Loja",
          ]);
          const loja = report.establishments.find((item) => item.name === "Loja");
          assert.equal(loja?.count, 2);
          assert.equal(loja?.totalAmount, 80);
          assert.equal(report.establishments.find((item) => item.name === "Academia")?.count, 3);
        },
      );
      await t.test(
        "filters by trip, uses the trip period and falls back for foreign trips",
        async () => {
          const owner = await api.register();
          const stranger = await api.register();
          const account = await api.account(owner);
          const createTrip = async (
            identity: typeof owner,
            name: string,
            startDate: string,
            endDate: string,
          ) =>
            api.data<{ id: string }>(
              await api.request("/trips", identity, "POST", { name, startDate, endDate }),
              201,
            );
          const lisboa = await createTrip(owner, "Lisboa", "2025-05-12", "2025-05-22");
          const foreignTrip = await createTrip(stranger, "Porto", "2025-06-01", "2025-06-05");
          const deletedTrip = await createTrip(owner, "Sumida", "2025-08-01", "2025-08-02");
          await api.data(await api.request(`/trips/${deletedTrip.id}`, owner, "DELETE"));

          await api.expense(owner, {
            name: "Pastelaria",
            amount: 12,
            purchaseDate: "2025-05-13",
            accountId: account.id,
            tripId: lisboa.id,
          });
          await api.expense(owner, {
            name: "Metro",
            amount: 8,
            purchaseDate: "2025-05-14",
            accountId: account.id,
            tripId: lisboa.id,
          });
          await api.expense(owner, {
            name: "Mercado A",
            amount: 100,
            purchaseDate: "2026-06-10",
            accountId: account.id,
          });

          const path = "/reports/establishments?period=2026-06&months=3";
          const tripReport = await api.data<EstablishmentsReportOutput>(
            await api.request(`${path}&trip=${lisboa.id}`, owner),
          );
          assert.deepEqual(tripReport.tripFilter, {
            mode: "trip",
            tripId: lisboa.id,
            tripName: "Lisboa",
          });
          assert.deepEqual(tripReport.window, { startPeriod: "2025-05", endPeriod: "2025-05" });
          assert.deepEqual(tripReport.establishments.map((item) => item.name).sort(), [
            "Metro",
            "Pastelaria",
          ]);

          const noTripReport = await api.data<EstablishmentsReportOutput>(
            await api.request(`${path}&trip=none`, owner),
          );
          assert.deepEqual(noTripReport.tripFilter, { mode: "none" });
          assert.deepEqual(
            noTripReport.establishments.map((item) => item.name),
            ["Mercado A"],
          );

          const allReport = await api.data<EstablishmentsReportOutput>(
            await api.request(path, owner),
          );
          assert.deepEqual(allReport.tripFilter, { mode: "all" });
          assert.deepEqual(
            allReport.establishments.map((item) => item.name),
            ["Mercado A"],
          );
          for (const tripId of [foreignTrip.id, deletedTrip.id]) {
            const fallback = await api.data<EstablishmentsReportOutput>(
              await api.request(`${path}&trip=${tripId}`, owner),
            );
            assert.deepEqual(fallback, allReport);
          }

          const range = await api.data<{ startPeriod: string; endPeriod: string } | null>(
            await api.request(`/trips/${lisboa.id}/period-range`, owner),
          );
          assert.deepEqual(range, { startPeriod: "2025-05", endPeriod: "2025-05" });
          assert.equal(
            await api.data(await api.request(`/trips/${foreignTrip.id}/period-range`, owner)),
            null,
          );
        },
      );
      await t.test(
        "category trends and installments follow the trip filter over real rows",
        async () => {
          const owner = await api.register();
          const stranger = await api.register();
          const account = await api.account(owner);
          const card = await api.data<{ id: string }>(
            await api.request("/cards", owner, "POST", {
              accountId: account.id,
              name: "Trip card",
              brand: "visa",
              closingDay: 20,
              dueDay: 25,
              limit: 5000,
            }),
            201,
          );
          const createTrip = async (
            identity: typeof owner,
            name: string,
            startDate: string,
            endDate: string,
          ) =>
            api.data<{ id: string }>(
              await api.request("/trips", identity, "POST", { name, startDate, endDate }),
              201,
            );
          const lisboa = await createTrip(owner, "Lisboa", "2026-03-01", "2026-03-10");
          const porto = await createTrip(owner, "Porto", "2026-07-01", "2026-07-05");
          const madeira = await createTrip(owner, "Madeira", "2026-04-01", "2026-04-05");
          const foreignTrip = await createTrip(stranger, "Faro", "2026-03-01", "2026-03-10");

          await api.expense(owner, {
            name: "Hotel",
            paymentMethod: "credit_card",
            cardId: card.id,
            accountId: null,
            condition: "installment",
            installmentCount: 10,
            amount: 100,
            purchaseDate: "2026-03-05",
            invoicePeriod: "2026-03",
            tripId: lisboa.id,
          });
          await api.expense(owner, {
            name: "Jantar",
            amount: 40,
            purchaseDate: "2026-06-10",
            accountId: account.id,
            tripId: lisboa.id,
          });
          await api.expense(owner, {
            name: "Museu",
            amount: 25,
            purchaseDate: "2026-07-10",
            accountId: account.id,
            tripId: porto.id,
          });
          await api.expense(owner, {
            name: "Mercado",
            amount: 60,
            purchaseDate: "2026-08-10",
            accountId: account.id,
          });
          await api.expense(owner, {
            name: "Passeio",
            paymentMethod: "credit_card",
            cardId: card.id,
            accountId: null,
            condition: "installment",
            installmentCount: 30,
            amount: 300,
            purchaseDate: "2026-03-06",
            invoicePeriod: "2026-03",
            tripId: madeira.id,
          });

          const trendsPath = "/reports/category-trends?startPeriod=2026-03&endPeriod=2026-12";
          const expenseTotal = async (query: string) => {
            const report = await api.data<CategoryTrendsOutput>(
              await api.request(`${trendsPath}${query}`, owner),
            );
            return report.summary.expenseAmount;
          };
          assert.equal(await expenseTotal(""), 325);
          assert.equal(await expenseTotal("&trip=none"), 60);
          assert.equal(await expenseTotal(`&trip=${lisboa.id}`), 140);
          assert.equal(await expenseTotal(`&trip=${porto.id}`), 25);
          assert.equal(await expenseTotal(`&trip=${madeira.id}`), 100);

          const allTrends = await api.data<CategoryTrendsOutput>(
            await api.request(trendsPath, owner),
          );
          assert.deepEqual(
            await api.data<CategoryTrendsOutput>(
              await api.request(`${trendsPath}&trip=${foreignTrip.id}`, owner),
            ),
            allTrends,
          );

          const periodRange = async (tripId: string) =>
            api.data<{ startPeriod: string; endPeriod: string } | null>(
              await api.request(`/trips/${tripId}/period-range`, owner),
            );
          assert.deepEqual(await periodRange(lisboa.id), {
            startPeriod: "2026-03",
            endPeriod: "2026-12",
          });
          assert.deepEqual(await periodRange(madeira.id), {
            startPeriod: "2026-03",
            endPeriod: "2028-02",
          });
          assert.equal(await periodRange(foreignTrip.id), null);

          const installmentsPath = "/reports/installments?period=2026-06";
          assert.deepEqual(
            await api.data(await api.request(`${installmentsPath}&trip=${lisboa.id}`, owner)),
            await api.data(await api.request(installmentsPath, owner)),
          );
        },
      );
    },
    { migrationsFolder },
  );
});
