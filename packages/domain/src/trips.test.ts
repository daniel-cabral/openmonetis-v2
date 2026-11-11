import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTripSuggestionOriginOptions,
  dedupeTripSuggestions,
  filterTripSuggestionsByOrigin,
  findOverlappingTrip,
  findTripForDate,
  isTripLinkable,
  paginateTripSuggestions,
  parseTripLinkTarget,
  planTripLinkChange,
  summarizeTrip,
  type TripSuggestionRow,
} from "./trips";

const lisboa = { id: "lisboa", startDate: "2026-05-12", endDate: "2026-05-22" };
const santiago = { id: "santiago", startDate: "2026-09-01", endDate: "2026-09-01" };
const trips = [lisboa, santiago];

test("overlap is inclusive and ignores the trip being edited", () => {
  const cases = [
    ["2026-05-20", "2026-05-25", true],
    ["2026-05-22", "2026-05-24", true],
    ["2026-05-01", "2026-05-12", true],
    ["2026-05-01", "2026-05-30", true],
    ["2026-05-23", "2026-05-25", false],
    ["2026-05-01", "2026-05-11", false],
  ] as const;
  for (const [startDate, endDate, conflicts] of cases) {
    const found = findOverlappingTrip({ startDate, endDate }, trips);
    assert.equal(found?.id, conflicts ? "lisboa" : undefined, `${startDate}..${endDate}`);
  }
  assert.equal(
    findOverlappingTrip({ id: "lisboa", startDate: "2026-05-12", endDate: "2026-05-23" }, trips),
    undefined,
  );
});

test("a date belongs to the inclusive trip range", () => {
  const cases = [
    ["2026-05-14", "lisboa"],
    ["2026-05-12", "lisboa"],
    ["2026-05-22", "lisboa"],
    ["2026-09-01", "santiago"],
    ["2026-05-11", undefined],
    ["2026-05-23", undefined],
  ] as const;
  for (const [date, tripId] of cases) {
    assert.equal(findTripForDate(trips, date)?.id, tripId, date);
  }
});

test("only expenses and refunds outside transfers can be linked to a trip", () => {
  assert.equal(isTripLinkable({ type: "expense", origin: "regular" }), true);
  assert.equal(isTripLinkable({ type: "income", origin: "refund" }), true);
  assert.equal(isTripLinkable({ type: "transfer", origin: "regular" }), false);
  assert.equal(isTripLinkable({ type: "expense", origin: "invoicePayment" }), false);
  assert.equal(isTripLinkable({ type: "income", origin: "invoiceAdjustment" }), false);
  assert.equal(isTripLinkable({ type: "income", origin: "accountBalanceAdjustment" }), false);
  assert.equal(isTripLinkable({ type: "income", origin: "personSettlement" }), false);
});

test("link changes follow the stored trip and the transaction condition", () => {
  assert.deepEqual(
    planTripLinkChange({ storedTripId: null, requestedTripId: "lisboa", condition: "installment" }),
    { kind: "linkSeries", tripId: "lisboa" },
  );
  assert.deepEqual(
    planTripLinkChange({ storedTripId: "lisboa", requestedTripId: null, condition: "installment" }),
    { kind: "unlinkRow" },
  );
  assert.deepEqual(
    planTripLinkChange({ storedTripId: "lisboa", requestedTripId: undefined, condition: "single" }),
    { kind: "none" },
  );
  assert.deepEqual(
    planTripLinkChange({ storedTripId: "lisboa", requestedTripId: "lisboa", condition: "single" }),
    { kind: "none" },
  );
  assert.deepEqual(
    planTripLinkChange({ storedTripId: null, requestedTripId: "lisboa", condition: "recurring" }),
    { kind: "linkRow", tripId: "lisboa" },
  );
});

test("link targets are transaction ids or recurring occurrences", () => {
  const ruleId = "3f6d2b84-6ed0-4a50-b257-8adf0b6178de";
  assert.deepEqual(parseTripLinkTarget(ruleId), { kind: "transaction", id: ruleId });
  assert.deepEqual(parseTripLinkTarget(`${ruleId}:2026-05-14`), {
    kind: "occurrence",
    recurringRuleId: ruleId,
    occurrenceDate: "2026-05-14",
  });
  assert.equal(parseTripLinkTarget("not-a-target"), null);
});

test("trip summary counts only the own share in cents and sorts breakdowns", () => {
  const summary = summarizeTrip([
    {
      id: "restaurant",
      name: "Jantar",
      purchaseDate: "2026-05-13",
      type: "expense",
      installment: null,
      categoryName: "Restaurantes",
      sourceLabel: "C6 Black",
      shares: [{ personName: "Eu", isAdmin: true, amountCents: 900000 }],
    },
    {
      id: "transport",
      name: "Uber",
      purchaseDate: "2026-05-14",
      type: "expense",
      installment: null,
      categoryName: "Transporte",
      sourceLabel: "Itaú",
      shares: [{ personName: "Eu", isAdmin: true, amountCents: 21230 }],
    },
    {
      id: "refund",
      name: "Reembolso",
      purchaseDate: "2026-05-20",
      type: "income",
      installment: null,
      categoryName: null,
      sourceLabel: null,
      shares: [{ personName: "Eu", isAdmin: true, amountCents: 80000 }],
    },
  ]);
  assert.equal(summary.netCostCents, 841230);
  assert.equal(summary.expenseCents, 921230);
  assert.equal(summary.reimbursementCents, 80000);
  assert.deepEqual(
    summary.byCategory.map((item) => item.label),
    ["Restaurantes", "Transporte"],
  );
  assert.deepEqual(
    summary.bySource.map((item) => item.label),
    ["C6 Black", "Itaú"],
  );
});

test("split and missing-owner expenses keep the own share and list every person", () => {
  const split = summarizeTrip([
    {
      id: "dinner",
      name: "Jantar",
      purchaseDate: "2026-05-13",
      type: "expense",
      installment: null,
      categoryName: null,
      sourceLabel: null,
      shares: [
        { personName: "Eu", isAdmin: true, amountCents: 15000 },
        { personName: "Ana", isAdmin: false, amountCents: 15000 },
      ],
    },
  ]);
  assert.equal(split.netCostCents, 15000);
  assert.deepEqual(split.byPerson, [
    { label: "Ana", amountCents: 15000 },
    { label: "Eu", amountCents: 15000 },
  ]);
  assert.deepEqual(split.byCategory, [{ label: "Sem categoria", amountCents: 15000 }]);
  assert.deepEqual(split.bySource, [{ label: "Sem cartão ou conta", amountCents: 15000 }]);

  const withoutOwner = summarizeTrip([
    {
      id: "gift",
      name: "Presente",
      purchaseDate: "2026-05-13",
      type: "expense",
      installment: null,
      categoryName: null,
      sourceLabel: null,
      shares: [{ personName: null, isAdmin: false, amountCents: 5000 }],
    },
  ]);
  assert.equal(withoutOwner.netCostCents, 0);
  assert.deepEqual(withoutOwner.byPerson, [{ label: "Sem pessoa", amountCents: 5000 }]);
});

const suggestion = (overrides: Partial<TripSuggestionRow>): TripSuggestionRow => ({
  condition: "single" as const,
  seriesId: null,
  cardId: null,
  cardName: null,
  accountId: null,
  accountName: null,
  ...overrides,
});

test("suggestions keep one row per installment series and filter by origin", () => {
  const c6 = { cardId: "c6", cardName: "C6 Black" };
  const itau = { accountId: "a1", accountName: "Conta C6" };
  const rows = [
    suggestion({ ...c6, condition: "installment", seriesId: "s1" }),
    suggestion({ ...c6, condition: "installment", seriesId: "s1" }),
    suggestion({ ...c6, condition: "recurring" }),
    suggestion({ ...c6, condition: "recurring" }),
    suggestion({ accountId: "a2", accountName: "Nubank" }),
  ];
  const visible = dedupeTripSuggestions(rows);
  assert.equal(visible.length, 4);
  const origins = ["all", "cards", "accounts", "card:c6", "account:a1", "card:unknown"] as const;
  const counts = origins.map((origin) => filterTripSuggestionsByOrigin(visible, origin).length);
  assert.deepEqual(counts, [4, 3, 1, 3, 0, 0]);
  assert.deepEqual(buildTripSuggestionOriginOptions([...rows, suggestion(itau)]), [
    { value: "card:c6", label: "C6 Black" },
    { value: "account:a1", label: "Conta C6" },
    { value: "account:a2", label: "Nubank" },
  ]);
});

test("suggestion pages are clamped and report the visible range", () => {
  const rows = Array.from({ length: 57 }, (_, index) => index);
  const last = paginateTripSuggestions(rows, 3);
  assert.deepEqual(
    [last.page, last.pageCount, last.from, last.to, last.items.length],
    [3, 3, 41, 57, 17],
  );
  assert.equal(paginateTripSuggestions(rows, 9).page, 3);
  assert.equal(paginateTripSuggestions(rows, 0).page, 1);
  assert.deepEqual(
    [
      paginateTripSuggestions([], 1).pageCount,
      paginateTripSuggestions([], 1).from,
      paginateTripSuggestions([], 1).to,
    ],
    [1, 0, 0],
  );
});
