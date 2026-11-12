import assert from "node:assert/strict";
import test from "node:test";
import { ListEstablishmentsReportQuerySchema } from "./establishments-report";

const TRIP_ID = "3c9d2a1e-5b7f-4e8a-8c6d-0f1e2d3c4b5a";

test("establishments report query defaults to six months and accepts only 3, 6 or 12 months, a period and a trip filter", () => {
  const defaults = ListEstablishmentsReportQuerySchema.parse({});
  assert.equal(defaults.months, 6);
  assert.equal(defaults.period, undefined);
  assert.equal(defaults.trip, undefined);

  assert.equal(ListEstablishmentsReportQuerySchema.parse({ months: "12" }).months, 12);
  assert.equal(ListEstablishmentsReportQuerySchema.parse({ period: "2026-06" }).period, "2026-06");
  assert.equal(ListEstablishmentsReportQuerySchema.parse({ trip: "none" }).trip, "none");
  assert.equal(ListEstablishmentsReportQuerySchema.parse({ trip: TRIP_ID }).trip, TRIP_ID);

  for (const query of [{ months: "5" }, { period: "2026-13" }, { trip: "lisboa" }]) {
    assert.equal(
      ListEstablishmentsReportQuerySchema.safeParse(query).success,
      false,
      JSON.stringify(query),
    );
  }
});
