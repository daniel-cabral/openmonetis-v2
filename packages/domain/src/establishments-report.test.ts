import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEstablishmentsReport,
  type EstablishmentPurchaseEntry,
  resolveEstablishmentsWindow,
} from "./establishments-report";

const window = { startPeriod: "2026-01", endPeriod: "2026-06" };

function purchase(
  overrides: Partial<EstablishmentPurchaseEntry> &
    Pick<EstablishmentPurchaseEntry, "name" | "period" | "amount">,
): EstablishmentPurchaseEntry {
  return {
    origin: "regular",
    transactionType: "expense",
    excludeFromBalance: false,
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    isInvoicePaymentCategory: false,
    tripId: null,
    ...overrides,
  };
}

function report(entries: EstablishmentPurchaseEntry[]) {
  return calculateEstablishmentsReport({
    window,
    tripFilter: { mode: "all" },
    entries,
    recurringRules: [],
  });
}

test("establishments rank by count, then total, then name, with literal summaries", () => {
  const entries = [
    ...Array.from({ length: 8 }, () => purchase({ name: "Mercado A", period: "2026-03", amount: 100 })),
    ...Array.from({ length: 3 }, () => purchase({ name: "Posto B", period: "2026-04", amount: 300 })),
    ...Array.from({ length: 8 }, () => purchase({ name: "Padaria C", period: "2026-05", amount: 50 })),
  ];

  const result = report(entries);

  assert.deepEqual(
    result.establishments.map((item) => item.name),
    ["Mercado A", "Padaria C", "Posto B"],
  );
  assert.deepEqual(
    result.establishments.map((item) => item.count),
    [8, 8, 3],
  );
  assert.deepEqual(
    result.establishments.map((item) => item.totalCents),
    [80000, 40000, 90000],
  );
  assert.deepEqual(
    result.establishments.map((item) => item.averageCents),
    [10000, 5000, 30000],
  );
  assert.deepEqual(result.summary, {
    establishmentCount: 3,
    transactionCount: 19,
    totalCents: 210000,
    averageCents: 11053,
    mostFrequent: "Mercado A",
    highestTotal: "Posto B",
  });
});

test("establishment categories keep the top 3 by count and skip uncategorized purchases", () => {
  const categorized = (categoryId: string, categoryName: string, count: number) =>
    Array.from({ length: count }, () =>
      purchase({
        name: "Mercado A",
        period: "2026-03",
        amount: 10,
        categoryId,
        categoryName,
        categoryIcon: null,
      }),
    );
  const entries = [
    ...categorized("mercado", "Mercado", 3),
    ...categorized("bebidas", "Bebidas", 2),
    ...categorized("casa", "Casa", 2),
    ...categorized("pet", "Pet", 1),
    purchase({ name: "Mercado A", period: "2026-04", amount: 10 }),
  ];

  const result = report(entries);
  const [mercadoA] = result.establishments;

  assert.equal(mercadoA.count, 9);
  assert.equal(mercadoA.totalCents, 9000);
  assert.deepEqual(
    mercadoA.categories.map((item) => [item.categoryId, item.count]),
    [
      ["mercado", 3],
      ["bebidas", 2],
      ["casa", 2],
    ],
  );
  assert.deepEqual(
    result.topCategories.map((item) => item.categoryId),
    ["mercado", "bebidas", "casa", "pet"],
  );
});

test("top categories keep the 10 largest by total", () => {
  const entries = Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return purchase({
      name: `Loja ${number}`,
      period: "2026-03",
      amount: (index + 1) * 10,
      categoryId: `cat-${number}`,
      categoryName: `Categoria ${index + 1}`,
      categoryIcon: null,
    });
  });

  const result = report(entries);

  assert.deepEqual(
    result.topCategories.map((item) => item.categoryId),
    [
      "cat-12",
      "cat-11",
      "cat-10",
      "cat-09",
      "cat-08",
      "cat-07",
      "cat-06",
      "cat-05",
      "cat-04",
      "cat-03",
    ],
  );
  assert.equal(result.topCategories[0].totalCents, 12000);
});

test("the window ends at the selected period and spans the requested months", () => {
  const cases = [
    [6, "2026-01", "2026-06"],
    [3, "2026-04", "2026-06"],
    [12, "2025-07", "2026-06"],
  ] as const;

  for (const [months, startPeriod, endPeriod] of cases) {
    assert.deepEqual(resolveEstablishmentsWindow("2026-06", months), { startPeriod, endPeriod });
  }
});

test("the listing is capped at 50 names while the establishment count keeps all of them", () => {
  const entries = Array.from({ length: 51 }, (_, index) =>
    purchase({
      name: `Loja ${String(index + 1).padStart(2, "0")}`,
      period: "2026-06",
      amount: 10,
    }),
  );

  const result = report(entries);

  assert.equal(result.summary.establishmentCount, 51);
  assert.equal(result.establishments.length, 50);
  assert.equal(result.establishments[0].name, "Loja 01");
  assert.equal(result.establishments[49].name, "Loja 50");
});

test("an empty window yields empty lists, zero summary and null names", () => {
  assert.deepEqual(report([]), {
    window,
    establishments: [],
    topCategories: [],
    summary: {
      establishmentCount: 0,
      transactionCount: 0,
      totalCents: 0,
      averageCents: 0,
      mostFrequent: null,
      highestTotal: null,
    },
  });
});

test("only purchases inside the window count", () => {
  const result = report([
    purchase({ name: "Parcela", period: "2026-03", amount: 100 }),
    purchase({ name: "Parcela", period: "2026-08", amount: 100 }),
  ]);

  assert.equal(result.summary.transactionCount, 1);
  assert.equal(result.summary.totalCents, 10000);
  assert.equal(result.establishments[0].count, 1);
});
