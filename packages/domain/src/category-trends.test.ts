import assert from "node:assert/strict";
import test from "node:test";
import { buildSubcategoryBreakdown } from "./category-trends";

const october = [
  { categoryId: "aluguel", name: "Aluguel", cents: 280000 },
  { categoryId: "condominio", name: "Condomínio", cents: 65000 },
  { categoryId: "faxina", name: "Faxina", cents: 48000 },
  { categoryId: "iptu", name: "IPTU", cents: 31240 },
  { categoryId: null, name: null, cents: 18990 },
];

for (const scenario of [
  {
    name: "orders children by amount and keeps the direct row last",
    rows: october,
    expected: [
      { categoryId: "aluguel", name: "Aluguel", amount: 2800, percentage: 63.2 },
      { categoryId: "condominio", name: "Condomínio", amount: 650, percentage: 14.7 },
      { categoryId: "faxina", name: "Faxina", amount: 480, percentage: 10.8 },
      { categoryId: "iptu", name: "IPTU", amount: 312.4, percentage: 7 },
      { categoryId: null, name: null, amount: 189.9, percentage: 4.3 },
    ],
  },
  {
    name: "a direct-only category is a single 100% row",
    rows: [{ categoryId: null, name: null, cents: 10000 }],
    expected: [{ categoryId: null, name: null, amount: 100, percentage: 100 }],
  },
  {
    name: "a zero total yields no rows",
    rows: [
      { categoryId: "aluguel", name: "Aluguel", cents: 0 },
      { categoryId: null, name: null, cents: 0 },
    ],
    expected: [],
  },
  {
    name: "a child with zero cents is omitted",
    rows: [
      { categoryId: "aluguel", name: "Aluguel", cents: 1000 },
      { categoryId: "luz", name: "Luz", cents: 0 },
      { categoryId: null, name: null, cents: 500 },
    ],
    expected: [
      { categoryId: "aluguel", name: "Aluguel", amount: 10, percentage: 66.7 },
      { categoryId: null, name: null, amount: 5, percentage: 33.3 },
    ],
  },
] as const) {
  test(`subcategory breakdown: ${scenario.name}`, () => {
    assert.deepEqual(buildSubcategoryBreakdown(scenario.rows), scenario.expected);
  });
}
