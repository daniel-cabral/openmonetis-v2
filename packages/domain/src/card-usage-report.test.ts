import assert from "node:assert/strict";
import test from "node:test";
import {
  type CardUsageCard,
  type CardUsageEntry,
  type CardUsageRecurringRule,
  calculateCardUsageOverview,
  calculateUsagePercentage,
  calculateUsageTrend,
  resolveCardUsageInvoiceState,
  resolveUsageTone,
} from "./card-usage-report";

test("usage percentage and tone switch to warning at 50% and to danger at 80%", () => {
  const cases = [
    { used: 4990, limit: 10000, percentage: 49.9, tone: "success" },
    { used: 5000, limit: 10000, percentage: 50, tone: "warning" },
    { used: 7990, limit: 10000, percentage: 79.9, tone: "warning" },
    { used: 8000, limit: 10000, percentage: 80, tone: "danger" },
    { used: 12000, limit: 10000, percentage: 120, tone: "danger" },
    { used: 5000, limit: 0, percentage: 0, tone: "success" },
  ] as const;

  for (const item of cases) {
    const percentage = calculateUsagePercentage(item.used, item.limit);
    assert.equal(percentage, item.percentage, `percentage for ${item.used}/${item.limit}`);
    assert.equal(resolveUsageTone(percentage), item.tone, `tone for ${item.percentage}%`);
  }
});

test("usage trend is stable inside the ±5% band and flips just outside it", () => {
  const cases = [
    { current: 10500, previous: 10000, changePercentage: 5, trend: "stable" },
    { current: 10501, previous: 10000, changePercentage: 5.01, trend: "up" },
    { current: 9500, previous: 10000, changePercentage: -5, trend: "stable" },
    { current: 9499, previous: 10000, changePercentage: -5.01, trend: "down" },
    { current: 120000, previous: 100000, changePercentage: 20, trend: "up" },
    { current: 5000, previous: 0, changePercentage: 100, trend: "up" },
    { current: 0, previous: 0, changePercentage: 0, trend: "stable" },
    { current: 0, previous: 5000, changePercentage: -100, trend: "down" },
  ] as const;

  for (const item of cases) {
    assert.deepEqual(calculateUsageTrend(item.current, item.previous), {
      changePercentage: item.changePercentage,
      trend: item.trend,
    });
  }
});

test("invoice state maps paid, none, pending and overdue from status, amount and record", () => {
  const cases = [
    { status: "paid", amount: 0, hasRecord: false, state: "paid" },
    { status: "open", amount: 0, hasRecord: false, state: "none" },
    { status: "closed", amount: 0, hasRecord: true, state: "pending" },
    { status: "open", amount: 150, hasRecord: false, state: "pending" },
    { status: "overdue", amount: 150, hasRecord: true, state: "overdue" },
  ] as const;

  for (const item of cases) {
    assert.equal(
      resolveCardUsageInvoiceState({
        status: item.status,
        amount: item.amount,
        hasRecord: item.hasRecord,
      }),
      item.state,
      `${item.status}/${item.amount}/${item.hasRecord}`,
    );
  }
});

const expenseEntry: CardUsageEntry = {
  cardId: "card-1",
  name: "Mercado",
  period: "2026-11",
  purchaseDate: "2026-11-03",
  amount: 100,
  origin: "regular",
  transactionType: "expense",
  categoryId: null,
  categoryName: null,
  categoryIcon: null,
  isInvoicePaymentCategory: false,
};

const monthlyRule: CardUsageRecurringRule = {
  cardId: "card-1",
  name: "Streaming",
  transactionType: "expense",
  categoryId: null,
  categoryName: null,
  categoryIcon: null,
  isInvoicePaymentCategory: false,
  amount: 50,
  anchorDate: "2026-11-05",
  startDate: "2026-11-05",
  endDate: null,
  frequency: "monthly",
  paymentMethod: "debit_card",
  dueDate: null,
  status: "active",
  card: { closingDay: 28, dueDay: 5 },
};

function usageCard(id: string, name: string, limit: number): CardUsageCard {
  return { id, name, brand: "visa", logo: null, limit };
}

test("overview totals, order and selection follow usage, limits and the requested card", () => {
  const cards = [
    usageCard("A", "Alfa", 5000),
    usageCard("B", "Beta", 3000),
    usageCard("C", "Gama", 2000),
    usageCard("D", "Delta", 0),
  ];
  const entries = [
    { ...expenseEntry, cardId: "A", amount: 2500 },
    { ...expenseEntry, cardId: "B", amount: 1500 },
    { ...expenseEntry, cardId: "D", amount: 100 },
    { ...expenseEntry, cardId: "A", amount: 1000, period: "2026-10", purchaseDate: "2026-10-03" },
  ];
  const overview = calculateCardUsageOverview({
    period: "2026-11",
    today: "2026-11-12",
    cards,
    entries,
    recurringRules: [],
    requestedCardId: "foreign",
  });

  assert.deepEqual(overview.summary, {
    totalLimitCents: 1000000,
    totalUsedCents: 410000,
    totalAvailableCents: 590000,
    usagePercentage: 41,
    tone: "success",
  });
  assert.deepEqual(
    overview.cards.map((card) => card.id),
    ["A", "B", "D", "C"],
  );
  const alpha = overview.cards.find((card) => card.id === "A");
  assert.equal(alpha?.changePercentage, 150);
  assert.equal(alpha?.trend, "up");
  assert.equal(overview.cards.find((card) => card.id === "D")?.usagePercentage, 0);
  assert.equal(overview.selectedCardId, "A");

  const requestedB = calculateCardUsageOverview({
    period: "2026-11",
    today: "2026-11-12",
    cards,
    entries,
    recurringRules: [],
    requestedCardId: "B",
  });
  assert.equal(requestedB.selectedCardId, "B");

  const empty = calculateCardUsageOverview({
    period: "2026-11",
    today: "2026-11-12",
    cards: [],
    entries: [],
    recurringRules: [],
  });
  assert.deepEqual(empty.summary, {
    totalLimitCents: 0,
    totalUsedCents: 0,
    totalAvailableCents: 0,
    usagePercentage: 0,
    tone: "success",
  });
  assert.equal(empty.selectedCardId, null);
});

test("only own card spending counts: payments, transfers, balance moves and refunds adjust usage", () => {
  const payment = { ...expenseEntry, amount: 50 };
  const cases: Array<{
    label: string;
    extraEntries?: CardUsageEntry[];
    recurringRules?: CardUsageRecurringRule[];
    usedCents: number;
  }> = [
    {
      label: "invoice payment",
      extraEntries: [{ ...payment, origin: "invoicePayment" }],
      usedCents: 10000,
    },
    {
      label: "invoice credit",
      extraEntries: [{ ...payment, origin: "invoiceCredit" }],
      usedCents: 10000,
    },
    {
      label: "account balance adjustment",
      extraEntries: [{ ...payment, origin: "accountBalanceAdjustment" }],
      usedCents: 10000,
    },
    {
      label: "person settlement",
      extraEntries: [{ ...payment, origin: "personSettlement" }],
      usedCents: 10000,
    },
    {
      label: "transfer",
      extraEntries: [{ ...payment, transactionType: "transfer" }],
      usedCents: 10000,
    },
    {
      label: "regular income",
      extraEntries: [{ ...payment, transactionType: "income" }],
      usedCents: 10000,
    },
    {
      label: "invoice payment category",
      extraEntries: [{ ...payment, isInvoicePaymentCategory: true }],
      usedCents: 10000,
    },
    {
      label: "refund reduces usage",
      extraEntries: [{ ...payment, origin: "refund", transactionType: "income", amount: 30 }],
      usedCents: 7000,
    },
    {
      label: "refund above usage is floored at zero",
      extraEntries: [{ ...payment, origin: "refund", transactionType: "income", amount: 150 }],
      usedCents: 0,
    },
    {
      label: "only the occurrence dated on or before today counts",
      recurringRules: [
        monthlyRule,
        { ...monthlyRule, anchorDate: "2026-11-20", startDate: "2026-11-20" },
      ],
      usedCents: 15000,
    },
    {
      label: "paused rules do not count",
      recurringRules: [
        { ...monthlyRule, status: "paused" },
        { ...monthlyRule, anchorDate: "2026-11-20", startDate: "2026-11-20", status: "paused" },
      ],
      usedCents: 10000,
    },
  ];

  for (const { label, extraEntries = [], recurringRules = [], usedCents } of cases) {
    const overview = calculateCardUsageOverview({
      period: "2026-11",
      today: "2026-11-12",
      cards: [usageCard("card-1", "Nubank", 20000)],
      entries: [expenseEntry, ...extraEntries],
      recurringRules,
    });
    assert.equal(overview.cards[0]?.usedCents, usedCents, label);
  }
});
