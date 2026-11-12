import assert from "node:assert/strict";
import test from "node:test";
import { ListCategoryTrendsQuerySchema } from "@openmonetis/validators/category-trends";
import { createCategoryTrendsService } from "./category-trends.service";

for (const scope of [undefined, "admin", "all", "80000000-0000-4000-8000-000000000008"] as const) {
  test(`category summary forwards ${scope ?? "default"} scope to actual and recurring queries`, async () => {
    const calls: unknown[][] = [];
    const service = createCategoryTrendsService({
      async listCategoriesForUser(userId) {
        assert.equal(userId, "owner");
        return [];
      },
      async listActualEntriesForUser(...args) {
        calls.push(args);
        return [];
      },
      async listRecurringRulesForUser(...args) {
        calls.push(args);
        return [];
      },
    });
    await service.list(
      "owner",
      ListCategoryTrendsQuerySchema.parse({
        startPeriod: "2026-09",
        endPeriod: "2026-09",
        personScope: scope,
      }),
    );
    assert.equal(calls.length, 2);
    for (const args of calls) {
      assert.equal(args[0], "owner");
      assert.equal(args.at(-1), scope ?? "admin");
    }
  });
}

test("category scope rejects unexpected values", () => {
  assert.equal(
    ListCategoryTrendsQuerySchema.safeParse({
      startPeriod: "2026-09",
      endPeriod: "2026-09",
      personScope: "external",
    }).success,
    false,
  );
});

test("invoice reductions lower expense trends without becoming income", async () => {
  const purchaseCategoryId = "10000000-0000-4000-8000-000000000001";
  const adjustmentCategoryId = "20000000-0000-4000-8000-000000000002";
  const service = createCategoryTrendsService({
    async listCategoriesForUser() {
      return [
        { categoryId: purchaseCategoryId, name: "Compras", icon: null, type: "expense" },
        {
          categoryId: adjustmentCategoryId,
          name: "Ajustes de fatura",
          icon: null,
          type: "expense",
        },
      ];
    },
    async listActualEntriesForUser() {
      return [
        {
          categoryId: purchaseCategoryId,
          origin: "regular" as const,
          transactionType: "expense" as const,
          type: "expense" as const,
          period: "2026-09",
          amount: "-100.00",
        },
        {
          categoryId: adjustmentCategoryId,
          origin: "invoiceAdjustment" as const,
          transactionType: "expense" as const,
          type: "expense" as const,
          period: "2026-09",
          amount: "20.00",
        },
      ];
    },
    async listRecurringRulesForUser() {
      return [];
    },
  });

  const report = await service.list(
    "owner",
    ListCategoryTrendsQuerySchema.parse({ startPeriod: "2026-09", endPeriod: "2026-09" }),
  );

  assert.equal(report.summary.incomeAmount, 0);
  assert.equal(report.summary.expenseAmount, 80);
  assert.equal(
    report.categories.find((category) => category.categoryId === adjustmentCategoryId)?.totalAmount,
    -20,
  );
});

test("grouped trends count direct, child, refund and recurrence amounts once across overlapping filters", async () => {
  const parentId = "10000000-0000-4000-8000-000000000001";
  const childId = "20000000-0000-4000-8000-000000000002";
  const otherId = "30000000-0000-4000-8000-000000000003";
  const categories = [
    { categoryId: parentId, name: "Casa", icon: "home", type: "expense" as const, parentId: null },
    { categoryId: childId, name: "Luz", icon: null, type: "expense" as const, parentId },
    { categoryId: otherId, name: "Lazer", icon: null, type: "expense" as const, parentId: null },
  ];
  const entries = [
    {
      categoryId: parentId,
      period: "2026-09",
      amount: "50.10",
      type: "expense" as const,
      transactionType: "expense" as const,
    },
    {
      categoryId: childId,
      period: "2026-09",
      amount: "200.20",
      type: "expense" as const,
      transactionType: "expense" as const,
    },
    {
      categoryId: childId,
      period: "2026-09",
      amount: "20.05",
      type: "expense" as const,
      transactionType: "income" as const,
      origin: "refund" as const,
    },
    {
      categoryId: childId,
      period: "2026-08",
      amount: "100.00",
      type: "expense" as const,
      transactionType: "expense" as const,
    },
    {
      categoryId: otherId,
      period: "2026-09",
      amount: "10.00",
      type: "expense" as const,
      transactionType: "expense" as const,
    },
  ];
  const service = createCategoryTrendsService({
    listCategoriesForUser: async () => categories,
    listActualEntriesForUser: async (_user, _start, _end, ids) =>
      entries.filter((row) => !ids.length || ids.includes(row.categoryId)),
    listRecurringRulesForUser: async (_user, _end, ids) =>
      !ids.length || ids.includes(childId)
        ? [
            {
              categoryId: childId,
              type: "expense",
              amount: "100.00",
              anchorDate: "2026-09-01",
              startDate: "2026-09-01",
              endDate: null,
              frequency: "monthly",
              paymentMethod: "pix",
              dueDate: null,
              status: "active",
              card: null,
            },
          ]
        : [],
  });
  const query = (categoryIds?: string) =>
    ListCategoryTrendsQuerySchema.parse({
      startPeriod: "2026-09",
      endPeriod: "2026-09",
      categoryIds,
    });
  const all = await service.list("owner", query());
  assert.equal(all.summary.expenseAmount, 340.25);
  assert.equal(all.categories.length, 2);
  const group = all.categories.find((category) => category.categoryId === parentId);
  assert.equal(group?.totalAmount, 330.25);
  assert.equal(group?.values[0]?.previousAmount, 100);
  assert.equal(group?.subcategories?.[0]?.totalAmount, 280.15);
  assert.equal(group?.directCategory?.totalAmount, 50.1);
  assert.deepEqual(group?.subcategoryBreakdown, [
    { categoryId: childId, name: "Luz", amount: 280.15, percentage: 84.8 },
    { categoryId: null, name: null, amount: 50.1, percentage: 15.2 },
  ]);
  const filtered = await service.list("owner", query(`${parentId},${childId}`));
  assert.equal(filtered.summary.expenseAmount, 330.25);
  assert.equal(filtered.categories.length, 1);
  const childOnly = await service.list("owner", query(childId));
  assert.equal(childOnly.summary.expenseAmount, 280.15);
  assert.equal(childOnly.categories[0]?.parentName, "Casa");
  assert.equal(childOnly.categories[0]?.categoryId, childId);
  assert.equal(childOnly.categories[0]?.subcategories, undefined);
});

for (const scenario of [
  {
    name: "trip t1 keeps its rows and its linked occurrence",
    trip: "90000000-0000-4000-8000-000000000001",
    expected: { expense: 125, actual: 100, recurring: 25, previous: 10 },
  },
  {
    name: "none keeps unlinked rows and unlinked occurrences",
    trip: "none",
    expected: { expense: 120, actual: 70, recurring: 50, previous: 45 },
  },
  {
    name: "absent trip keeps everything",
    trip: undefined,
    expected: { expense: 495, actual: 420, recurring: 75, previous: 55 },
  },
  {
    name: "trip not owned by the user behaves as absent",
    trip: "90000000-0000-4000-8000-000000000009",
    expected: { expense: 495, actual: 420, recurring: 75, previous: 55 },
  },
] as const) {
  test(`category trends filter by trip: ${scenario.name}`, async () => {
    const categoryId = "10000000-0000-4000-8000-000000000001";
    const firstTripId = "90000000-0000-4000-8000-000000000001";
    const secondTripId = "90000000-0000-4000-8000-000000000002";
    const service = createCategoryTrendsService(
      {
        async listCategoriesForUser() {
          return [{ categoryId, name: "Casa", icon: null, type: "expense" }];
        },
        async listActualEntriesForUser() {
          return [
            {
              categoryId,
              period: "2026-03",
              amount: "10.00",
              type: "expense",
              transactionType: "expense",
              tripId: firstTripId,
            },
            {
              categoryId,
              period: "2026-03",
              amount: "20.00",
              type: "expense",
              transactionType: "expense",
              tripId: null,
            },
            {
              categoryId,
              period: "2026-04",
              amount: "100.00",
              type: "expense",
              transactionType: "expense",
              tripId: firstTripId,
            },
            {
              categoryId,
              period: "2026-04",
              amount: "50.00",
              type: "expense",
              transactionType: "expense",
              tripId: secondTripId,
            },
            {
              categoryId,
              period: "2026-04",
              amount: "30.00",
              type: "expense",
              transactionType: "expense",
              tripId: null,
            },
            {
              categoryId,
              period: "2026-05",
              amount: "200.00",
              type: "expense",
              transactionType: "expense",
              tripId: secondTripId,
            },
            {
              categoryId,
              period: "2026-06",
              amount: "40.00",
              type: "expense",
              transactionType: "expense",
              tripId: null,
            },
          ];
        },
        async listRecurringRulesForUser() {
          return [
            {
              categoryId,
              type: "expense",
              amount: "25.00",
              anchorDate: "2026-03-01",
              startDate: "2026-03-01",
              endDate: null,
              frequency: "monthly",
              paymentMethod: "pix",
              dueDate: null,
              status: "active",
              card: null,
              occurrenceTripIds: { "2026-04-01": firstTripId },
            },
          ];
        },
      },
      {
        async findTripForUser(_userId, tripId) {
          return tripId === firstTripId || tripId === secondTripId ? { id: tripId } : null;
        },
      },
    );

    const report = await service.list(
      "owner",
      ListCategoryTrendsQuerySchema.parse({
        startPeriod: "2026-04",
        endPeriod: "2026-06",
        trip: scenario.trip,
      }),
    );

    assert.equal(report.summary.expenseAmount, scenario.expected.expense);
    assert.equal(report.summary.actualAmount, scenario.expected.actual);
    assert.equal(report.summary.recurringAmount, scenario.expected.recurring);
    assert.equal(report.categories[0]?.values[0]?.previousAmount, scenario.expected.previous);
  });
}
