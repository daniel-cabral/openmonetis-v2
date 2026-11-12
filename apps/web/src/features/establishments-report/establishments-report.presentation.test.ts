import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import {
  formatEstablishmentsPeriodLabel,
  formatPurchaseCount,
  resolveEstablishmentsReportSearch,
} from "./establishments-report.presentation";

const tripId = "10000000-0000-4000-8000-000000000001";

test("report search keeps valid values and falls back to the current period and 6 months", async (t) => {
  const cases = [
    {
      name: "empty search",
      input: {},
      expected: { period: getCurrentPeriodInBrazil(), months: 6, trip: undefined },
    },
    {
      name: "invalid period, unsupported months and malformed trip",
      input: { period: "2026-13", months: 5, trip: "lisboa" },
      expected: { period: getCurrentPeriodInBrazil(), months: 6, trip: undefined },
    },
    {
      name: "valid period, 3 months and trip id",
      input: { period: "2026-06", months: 3, trip: tripId },
      expected: { period: "2026-06", months: 3, trip: tripId },
    },
    {
      name: "12 months and the no-trip filter",
      input: { months: 12, trip: "none" },
      expected: { period: getCurrentPeriodInBrazil(), months: 12, trip: "none" },
    },
  ];

  for (const { name, input, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(resolveEstablishmentsReportSearch(input), expected);
    });
  }
});

test("report labels name the month window or the trip, and count purchases in PT-BR", () => {
  assert.equal(
    formatEstablishmentsPeriodLabel({ months: 3, tripFilter: { mode: "all" } }),
    "Últimos 3 meses",
  );
  assert.equal(
    formatEstablishmentsPeriodLabel({
      months: 6,
      tripFilter: { mode: "trip", tripId, tripName: "Lisboa" },
    }),
    "Viagem: Lisboa",
  );
  assert.equal(formatPurchaseCount(1), "1 compra");
  assert.equal(formatPurchaseCount(8), "8 compras");
});
