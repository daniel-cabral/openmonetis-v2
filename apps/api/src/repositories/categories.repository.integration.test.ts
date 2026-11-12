import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ListCategoryTrendsQuerySchema } from "@openmonetis/validators/category-trends";
import {
  ListTransactionsQuerySchema,
  TransactionInputSchema,
} from "@openmonetis/validators/transactions";

// Opt-in: migrate and exercise real repositories in a dedicated development database.
test("subcategory hierarchy, ownership, filters and totals persist together", {
  skip: process.env.CATEGORIES_INTEGRATION_TEST !== "1",
}, async () => {
  const require = createRequire(new URL("../../../../packages/db/package.json", import.meta.url));
  require("dotenv").config({
    path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
    quiet: true,
  });
  const { Pool } = require("pg");
  const { migrate } = require("drizzle-orm/node-postgres/migrator");
  const { resolveDatabaseUrl } = await import("../../../../packages/db/src/database-url");
  assert.notEqual(process.env.NODE_ENV, "production");
  const connectionUrl = new URL(process.env.TEST_DATABASE_URL ?? resolveDatabaseUrl());
  const admin = new Pool({ connectionString: connectionUrl.toString() });
  const databaseName = `openmonetis_categories_test_${Date.now()}`;
  const originalExternalUrl = process.env.EXTERNAL_DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  let applicationPool: { end(): Promise<void> } | undefined;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  try {
    connectionUrl.pathname = `/${databaseName}`;
    process.env.NODE_ENV = "test";
    process.env.EXTERNAL_DATABASE_URL = connectionUrl.toString();
    const { db, pool, ...schema } = await import("@openmonetis/db");
    applicationPool = pool;
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)),
    });
    const categoryRepository = await import("./categories.repository");
    const { createCategoriesService } = await import("../services/categories.service");
    const { createCategoryTrendsService } = await import("../services/category-trends.service");
    const { categoryTrendsRepository } = await import("./category-trends.repository");
    const { createTransactionsService } = await import("../services/transactions.service");
    const transactions = await import("./transactions.repository");
    const accounts = await import("./accounts.repository");
    const cards = await import("./cards.repository");
    const people = await import("./people.repository");
    const tags = await import("./tags.repository");
    const { createDashboardService } = await import("../services/dashboard.service");
    const { dashboardRepository } = await import("./dashboard.repository");
    const { eq } = await import("drizzle-orm");
    const [owner, other] = await db
      .insert(schema.user)
      .values([
        { name: "Owner", email: "owner@example.test" },
        { name: "Other", email: "other@example.test" },
      ])
      .returning();
    const [person] = await db
      .insert(schema.people)
      .values({ userId: owner.id, name: "Admin", role: "admin" })
      .returning();
    const [account] = await db
      .insert(schema.financialAccounts)
      .values({ userId: owner.id, name: "Test", type: "checking" })
      .returning();
    const categories = createCategoriesService(categoryRepository.categoriesRepository);
    const home = await categories.create({ name: "Casa", type: "expense", icon: "home" }, owner.id);
    const travel = await categories.create(
      { name: "Viagem", type: "expense", icon: "plane" },
      owner.id,
    );
    const light = await categories.create(
      { name: "Luz", type: "expense", parentId: home.id },
      owner.id,
    );
    const water = await categories.create(
      { name: "Água", type: "expense", parentId: home.id },
      owner.id,
    );
    const otherLight = await categories.create(
      { name: "Luz", type: "expense", parentId: travel.id },
      owner.id,
    );
    assert.equal(home.parentId, null);
    assert.equal(light.parentName, "Casa");
    assert.equal("userId" in light, false);
    await assert.rejects(
      categories.create({ name: "Luz", type: "expense", parentId: home.id }, owner.id),
      { code: "category_name_conflict" },
    );
    await assert.rejects(
      categories.create({ name: "Invalid", type: "income", parentId: home.id }, owner.id),
      { code: "category_invalid_parent" },
    );
    await assert.rejects(
      categories.create({ name: "Invalid", type: "expense", parentId: home.id }, other.id),
      { code: "category_invalid_parent" },
    );
    await assert.rejects(
      categories.create({ name: "Invalid", type: "expense", parentId: light.id }, owner.id),
      { code: "category_invalid_parent" },
    );
    await assert.rejects(categories.update(home.id, owner.id, { parentId: light.id }), {
      code: "category_has_children",
    });
    await assert.rejects(categories.remove(home.id, owner.id), { code: "category_has_children" });
    // Database constraints also reject bypasses of the service validation.
    await assert.rejects(
      db
        .insert(schema.categories)
        .values({ userId: other.id, name: "Cross-owner", type: "expense", parentId: home.id }),
    );
    await assert.rejects(
      db
        .insert(schema.categories)
        .values({ userId: owner.id, name: "Third level", type: "expense", parentId: light.id }),
    );
    await assert.rejects(
      db
        .update(schema.categories)
        .set({ parentId: travel.id })
        .where(eq(schema.categories.id, home.id)),
    );
    await assert.rejects(
      db.update(schema.categories).set({ type: "income" }).where(eq(schema.categories.id, home.id)),
    );
    const { createCategoriesRoute } = await import("../routes/categories");
    const { ApiError } = await import("../utils/errors");
    const { OpenAPIHono } = await import("@hono/zod-openapi");
    const app = new OpenAPIHono<{ Variables: { userId: string } }>();
    app.use("*", async (context, next) => {
      context.set("userId", owner.id);
      await next();
    });
    app.onError((error, context) =>
      error instanceof ApiError
        ? context.json({ error: true, code: error.code, message: error.message }, error.status)
        : context.json({ error: true, message: "Internal error" }, 500),
    );
    app.route("/categories", createCategoriesRoute(categories));
    const post = (input: unknown) =>
      app.request("http://test/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    const response = await post({ name: "Internet", type: "expense", parentId: home.id });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.parentName, "Casa");
    assert.equal("userId" in body.data, false);
    assert.equal(
      (await post({ name: "Invalid", type: "expense", parentId: "bad-id" })).status,
      400,
    );
    assert.equal(
      (await post({ name: "Internet", type: "expense", parentId: home.id })).status,
      409,
    );
    await categories.remove(body.data.id, owner.id);
    const transactionService = createTransactionsService(
      {
        ...transactions,
        transitionRecurringRuleForUser: (await import("./recurring-transactions.repository"))
          .transitionRecurringRuleForUser,
        ...accounts,
        ...cards,
        ...categoryRepository,
        ...people,
        listTagsByIdsForUser: tags.listTagsByIdsForUser,
        getAccountBalanceSnapshotForUser: async () => ({ displayed: 10000, persisted: 10000 }),
      },
      { cleanupOrphans: async () => ({ deletedCount: 0 }) },
      { synchronize: async () => {} },
    );
    const createExpense = (
      categoryId: string,
      amount: number,
      condition: "single" | "recurring" = "single",
    ) =>
      transactionService.createTransaction({
        ...TransactionInputSchema.parse({
          type: "expense",
          paymentMethod: "pix",
          name: "Expense",
          categoryId,
          amount,
          personId: person.id,
          accountId: account.id,
          purchaseDate: "2026-09-10",
          condition,
          recurrenceFrequency: condition === "recurring" ? "monthly" : undefined,
        }),
        userId: owner.id,
      });
    await createExpense(home.id, 20);
    await createExpense(light.id, 100);
    await createExpense(water.id, 50);
    await createExpense(light.id, 30, "recurring");
    await createExpense(travel.id, 7);
    await db.insert(schema.transactions).values({
      userId: owner.id,
      personId: person.id,
      categoryId: light.id,
      accountId: account.id,
      type: "income",
      origin: "refund",
      paymentMethod: "pix",
      condition: "single",
      name: "Refund",
      amount: "10.00",
      purchaseDate: new Date("2026-09-11"),
      period: "2026-09",
      isSettled: true,
    });
    const list = (categoryIds: string[], pageSize = 30) =>
      transactionService.listTransactions(
        owner.id,
        ListTransactionsQuerySchema.parse({
          period: "2026-09",
          categoryIds: categoryIds.join(","),
          pageSize,
        }),
      );
    const grouped = await list([home.id], 20);
    assert.equal(grouped.items.length, 5);
    assert.equal(
      grouped.items.some((item) => item.categoryId === travel.id),
      false,
    );
    assert.equal(
      grouped.items.find((item) => item.categoryId === light.id)?.categoryName,
      "Casa › Luz",
    );
    assert.equal((await list([home.id, light.id])).items.length, 5);
    assert.equal((await list([light.id])).items.length, 3);
    const reportService = createCategoryTrendsService(categoryTrendsRepository);
    const report = (ids = "") =>
      reportService.list(
        owner.id,
        ListCategoryTrendsQuerySchema.parse({
          startPeriod: "2026-09",
          endPeriod: "2026-09",
          categoryIds: ids,
        }),
      );
    const totals = await report();
    assert.equal(totals.summary.expenseAmount, 197);
    const homeTotal = totals.categories.find((item) => item.categoryId === home.id);
    assert.equal(homeTotal?.totalAmount, 190);
    assert.equal(
      homeTotal?.subcategories?.find((item) => item.categoryId === light.id)?.totalAmount,
      120,
    );
    assert.equal(homeTotal?.directCategory?.totalAmount, 20);
    assert.equal((await report(`${home.id},${light.id}`)).summary.expenseAmount, 190);
    assert.equal((await report(light.id)).summary.expenseAmount, 120);
    const dashboard = await createDashboardService(dashboardRepository, {
      list: async () => [],
    }).getCategoryBreakdown("2026-09", owner.id);
    assert.equal(dashboard.expenses.find((item) => item.categoryId === home.id)?.amount, 190);
    assert.equal(dashboard.expensesTotal, 197);
    await assert.rejects(categories.remove(light.id, owner.id), { code: "category_in_use" });
    await assert.rejects(categories.update(light.id, owner.id, { parentId: travel.id }), {
      code: "category_name_conflict",
    });
    await categories.remove(otherLight.id, owner.id);
    await categories.update(light.id, owner.id, { parentId: travel.id });
    assert.equal((await list([home.id])).items.length, 2);
    assert.equal((await list([light.id])).items[0]?.categoryName, "Viagem › Luz");
    await categories.update(travel.id, owner.id, { name: "Transporte" });
    assert.equal((await list([light.id])).items[0]?.categoryName, "Transporte › Luz");
    assert.equal((await report(travel.id)).summary.expenseAmount, 127);
    const legacyEdit = await categories.replace(light.id, owner.id, {
      name: "Energia",
      type: "expense",
    });
    assert.equal(legacyEdit.parentId, travel.id);
    await db.insert(schema.transactions).values(
      Array.from({ length: 21 }, (_, index) => ({
        userId: owner.id,
        personId: person.id,
        categoryId: water.id,
        accountId: account.id,
        type: "expense" as const,
        paymentMethod: "pix" as const,
        condition: "single" as const,
        name: `Paged ${index}`,
        amount: "-1.00",
        purchaseDate: new Date("2026-09-12"),
        period: "2026-09",
        isSettled: true,
      })),
    );
    const page = await list([home.id], 20);
    assert.equal(page.total, 23);
    assert.equal(page.items.length, 20);
    assert.equal(
      page.items.every((item) => item.categoryId === home.id || item.categoryId === water.id),
      true,
    );
    // Competing hierarchy changes cannot commit a third level.
    const a = await categories.create({ name: "A", type: "expense" }, owner.id);
    const b = await categories.create({ name: "B", type: "expense" }, owner.id);
    const results = await Promise.allSettled([
      categories.update(a.id, owner.id, { parentId: b.id }),
      categories.create({ name: "C", type: "expense", parentId: a.id }, owner.id),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rows = await categories.list(owner.id);
    for (const row of rows.filter((row) => row.parentId))
      assert.equal(rows.find((parent) => parent.id === row.parentId)?.parentId, null);
    assert.deepEqual(await categories.list(other.id), []);
    await db
      .insert(schema.categories)
      .values({ userId: owner.id, name: "Pagamentos", type: "expense", isSystem: true });
    const customPayment = await categories.create(
      { name: "Pagamentos", type: "expense", parentId: home.id },
      owner.id,
    );
    await createExpense(customPayment.id, 2);
    assert.equal((await report(customPayment.id)).summary.expenseAmount, 2);
    // Cascading account-owner deletion remains possible with parent/child categories.
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
  } finally {
    await applicationPool?.end();
    if (originalExternalUrl === undefined) delete process.env.EXTERNAL_DATABASE_URL;
    else process.env.EXTERNAL_DATABASE_URL = originalExternalUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  }
});
