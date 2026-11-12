import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryTrendsOutput } from "@openmonetis/validators/category-trends";
import {
  addCategoryToHistory,
  buildCategoryHistorySeries,
  categoryHistoryWindow,
  categoryTrendsCsv,
  parseCategoryHistorySelection,
  pruneCategoryHistory,
  resolveCategoryTrendsSearch,
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
