import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

test("establishments report ranks the owner's purchases by window and months and isolates users", {
  skip: process.env.ESTABLISHMENTS_REPORT_INTEGRATION_TEST !== "1",
}, async () => {
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
    },
    { migrationsFolder },
  );
});
