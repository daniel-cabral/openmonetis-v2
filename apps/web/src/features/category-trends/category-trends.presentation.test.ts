import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryTrendsOutput } from "@openmonetis/validators/category-trends";
import {
  addCategoryToHistory,
  buildCategoryHistorySeries,
  buildCategoryTrendsExportTable,
  categoryHistoryWindow,
  categoryTrendsCsv,
  getCategoryTrendsExportFileName,
  parseCategoryHistorySelection,
  pruneCategoryHistory,
  resolveCategoryTrendsSearch,
  toCategoryTrendsPdfTable,
  toCategoryTrendsXlsxSheet,
  validateCategoryTrendsSearch,
} from "./category-trends.presentation";

function report(name: string): CategoryTrendsOutput {
  return {
    periods: [{ period: "2026-10" }] as CategoryTrendsOutput["periods"],
    categories: [
      {
        categoryId: "10000000-0000-4000-8000-000000000001",
        name,
        icon: null,
        type: "expense",
        totalAmount: 10.05,
        averageAmount: 10.05,
        values: [
          {
            period: "2026-10",
            actualAmount: 10.05,
            recurringAmount: 0,
            totalAmount: 10.05,
            previousAmount: 20,
            changeAmount: -9.95,
            changePercentage: -49.75,
            changeKind: "decrease",
          },
        ],
      },
    ],
    availableCategories: [],
    summary: {} as CategoryTrendsOutput["summary"],
  };
}

test("category trends CSV lists one row per category and month", () => {
  const csv = categoryTrendsCsv(report("Mercado"));
  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /^﻿"Tipo";"Categoria";"Período"/);
  assert.match(csv, /"Despesa";"Mercado";"2026-10";"10,05";"0,00";"10,05";"-49,75"/);
});

test("category trends search keeps the no-trip and trip id filters and drops malformed ones", () => {
  const tripId = "10000000-0000-4000-8000-000000000001";
  const cases = [
    ["none", "none"],
    [tripId, tripId],
    ["lisboa", undefined],
  ] as const;

  for (const [trip, expected] of cases) {
    const search = validateCategoryTrendsSearch({
      startPeriod: "2026-03",
      endPeriod: "2026-06",
      trip,
    });
    assert.equal(search.trip, expected, trip);
    assert.equal(resolveCategoryTrendsSearch(search).trip, expected, trip);
  }
});

test("category history spans eight months back and one ahead, and fills missing months with zero", () => {
  const parentId = "10000000-0000-4000-8000-000000000001";
  const childId = "10000000-0000-4000-8000-000000000003";
  const trends = {
    periods: [{ period: "2026-01" }, { period: "2026-02" }, { period: "2026-03" }],
    categories: [
      {
        categoryId: parentId,
        name: "Mercado",
        icon: null,
        type: "expense",
        totalAmount: 200,
        averageAmount: 100,
        values: [
          { period: "2026-01", totalAmount: 120 },
          { period: "2026-03", totalAmount: 80 },
        ],
        subcategories: [
          {
            categoryId: childId,
            name: "Feira",
            icon: null,
            type: "expense",
            totalAmount: 45,
            averageAmount: 45,
            values: [{ period: "2026-02", totalAmount: 45 }],
          },
        ],
      },
    ],
  } as CategoryTrendsOutput;

  assert.deepEqual(categoryHistoryWindow("2026-01"), {
    startPeriod: "2025-05",
    endPeriod: "2026-02",
  });
  assert.deepEqual(buildCategoryHistorySeries(trends, [childId, parentId]), [
    { period: "2026-01", [childId]: 0, [parentId]: 120 },
    { period: "2026-02", [childId]: 45, [parentId]: 0 },
    { period: "2026-03", [childId]: 0, [parentId]: 80 },
  ]);
});

test("category names cannot inject spreadsheet formulas", () => {
  assert.match(categoryTrendsCsv(report('=HYPERLINK("https://example.test")')), /"'=HYPERLINK/);
  assert.match(categoryTrendsCsv(report("-2+3")), /"'-2\+3"/);
  assert.match(categoryTrendsCsv(report('Casa; "Aluguel"')), /"Casa; ""Aluguel"""/);
});

test("category history keeps at most five distinct categories and ignores invalid stored entries", () => {
  const full = ["a", "b", "c", "d", "e"];

  assert.deepEqual(parseCategoryHistorySelection(["a", 1, "b", "c", "d", "e", "f"]), full);
  assert.deepEqual(parseCategoryHistorySelection({ a: "a" }), []);
  assert.equal(addCategoryToHistory(full, "f"), full);
  assert.deepEqual(addCategoryToHistory(["a"], "a"), ["a"]);
  assert.deepEqual(addCategoryToHistory(["a"], "b"), ["a", "b"]);
});

test("category history prune drops categories that left the catalog", () => {
  const selected = ["a", "b"];

  assert.deepEqual(pruneCategoryHistory(selected, ["a"]), ["a"]);
  assert.equal(pruneCategoryHistory(selected, ["a", "b", "c"]), selected);
});

test("export table lists expense then income categories with API totals and variations", () => {
  const expenseId = "10000000-0000-4000-8000-000000000001";
  const incomeId = "10000000-0000-4000-8000-000000000002";
  const transportId = "10000000-0000-4000-8000-000000000004";
  const trends = {
    periods: [
      {
        period: "2026-01",
        incomeAmount: 500,
        expenseAmount: 300,
        netAmount: 200,
        actualAmount: 300,
        recurringAmount: 0,
      },
      {
        period: "2026-02",
        incomeAmount: 400,
        expenseAmount: 340,
        netAmount: 60,
        actualAmount: 340,
        recurringAmount: 0,
      },
    ],
    categories: [
      {
        categoryId: expenseId,
        name: "Mercado",
        icon: null,
        type: "expense",
        totalAmount: 235,
        averageAmount: 117.5,
        values: [
          {
            period: "2026-01",
            actualAmount: 100,
            recurringAmount: 0,
            totalAmount: 100,
            previousAmount: 0,
            changeAmount: 0,
            changePercentage: null,
            changeKind: "stable",
          },
          {
            period: "2026-02",
            actualAmount: 135,
            recurringAmount: 0,
            totalAmount: 135,
            previousAmount: 120,
            changeAmount: 15,
            changePercentage: 12.5,
            changeKind: "increase",
          },
        ],
      },
      {
        categoryId: transportId,
        name: "Transporte",
        icon: null,
        type: "expense",
        totalAmount: 140,
        averageAmount: 70,
        values: [
          {
            period: "2026-01",
            actualAmount: 80,
            recurringAmount: 0,
            totalAmount: 80,
            previousAmount: 0,
            changeAmount: 0,
            changePercentage: null,
            changeKind: "stable",
          },
          {
            period: "2026-02",
            actualAmount: 60,
            recurringAmount: 0,
            totalAmount: 60,
            previousAmount: 80,
            changeAmount: -20,
            changePercentage: -25,
            changeKind: "decrease",
          },
        ],
      },
      {
        categoryId: incomeId,
        name: "Freelance",
        icon: null,
        type: "income",
        totalAmount: 200,
        averageAmount: 100,
        values: [
          {
            period: "2026-01",
            actualAmount: 0,
            recurringAmount: 0,
            totalAmount: 0,
            previousAmount: 0,
            changeAmount: 0,
            changePercentage: null,
            changeKind: "stable",
          },
          {
            period: "2026-02",
            actualAmount: 200,
            recurringAmount: 0,
            totalAmount: 200,
            previousAmount: 0,
            changeAmount: 200,
            changePercentage: null,
            changeKind: "started",
          },
        ],
      },
    ],
    availableCategories: [],
    summary: { incomeAmount: 900, expenseAmount: 400 } as CategoryTrendsOutput["summary"],
  } as CategoryTrendsOutput;

  const table = buildCategoryTrendsExportTable(trends);
  assert.deepEqual(table, {
    periodLabel: "Janeiro 2026 - Fevereiro 2026",
    columns: ["Categoria", "Jan 2026", "Fev 2026", "Total"],
    rows: [
      {
        label: "Mercado",
        type: "expense",
        emphasis: false,
        cells: [
          { amount: 100, variation: null, trend: null },
          { amount: 135, variation: "+12,5%", trend: "up" },
        ],
        total: 235,
      },
      {
        label: "Transporte",
        type: "expense",
        emphasis: false,
        cells: [
          { amount: 80, variation: null, trend: null },
          { amount: 60, variation: "-25%", trend: "down" },
        ],
        total: 140,
      },
      {
        label: "Total Geral - Despesas",
        type: "expense",
        emphasis: true,
        cells: [
          { amount: 300, variation: null, trend: null },
          { amount: 340, variation: null, trend: null },
        ],
        total: 400,
      },
      {
        label: "Freelance",
        type: "income",
        emphasis: false,
        cells: [
          { amount: 0, variation: null, trend: null },
          { amount: 200, variation: "Novo", trend: null },
        ],
        total: 200,
      },
      {
        label: "Total Geral - Receitas",
        type: "income",
        emphasis: true,
        cells: [
          { amount: 500, variation: null, trend: null },
          { amount: 400, variation: null, trend: null },
        ],
        total: 900,
      },
    ],
  });

  const sheet = toCategoryTrendsXlsxSheet(table);
  assert.deepEqual(
    sheet.columns.map((column) => column.header),
    ["Categoria", "Tipo", "Jan 2026", "Jan 2026 var.", "Fev 2026", "Fev 2026 var.", "Total"],
  );
  assert.deepEqual(sheet.rows, [
    ["Mercado", "Despesa", 100, null, 135, "↑ 12,5%", 235],
    ["Transporte", "Despesa", 80, null, 60, "↓ 25%", 140],
    ["Total Geral - Despesas", "Despesa", 300, null, 340, null, 400],
    ["Freelance", "Receita", 0, null, 200, "Novo", 200],
    ["Total Geral - Receitas", "Receita", 500, null, 400, null, 900],
  ]);
  assert.equal(
    getCategoryTrendsExportFileName(trends, "pdf"),
    "relatorio-categorias-2026-01-2026-02.pdf",
  );

  const pdf = toCategoryTrendsPdfTable(table, { color: [201, 106, 58], logos: null }, "12/11/2026");
  const transportCell = pdf.rows[1]?.cells[2];
  assert.equal(transportCell?.tone, "expense");
  assert.equal(transportCell?.trend, "down");
  assert.match(transportCell?.text ?? "", /\n-25%$/);

  const expenseOnly = {
    ...trends,
    categories: trends.categories.filter((category) => category.type === "expense"),
  };
  assert.deepEqual(
    buildCategoryTrendsExportTable(expenseOnly).rows.map((row) => row.label),
    ["Mercado", "Transporte", "Total Geral - Despesas"],
  );
});
