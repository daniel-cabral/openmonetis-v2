import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ListTransactionsQuerySchema,
  TransactionInputSchema,
  UpdateRecurringRuleQuerySchema,
} from "@openmonetis/validators/transactions";

// Opt-in: uses the configured development PostgreSQL server, creating and dropping
// a dedicated database. Existing databases and financial records are untouched.
test("trips persist links and summaries with database ownership", {
  skip: process.env.TRIPS_INTEGRATION_TEST !== "1",
}, async () => {
  const require = createRequire(new URL("../../../../packages/db/package.json", import.meta.url));
  require("dotenv").config({
    path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
    quiet: true,
  });
  const { Pool } = require("pg");
  const { migrate } = require("drizzle-orm/node-postgres/migrator");
  const { resolveDatabaseUrl } = await import("../../../../packages/db/src/database-url");
  assert.notEqual(process.env.NODE_ENV, "production", "Integration tests require development mode");
  const connectionUrl = new URL(process.env.TEST_DATABASE_URL ?? resolveDatabaseUrl());
  const admin = new Pool({ connectionString: connectionUrl.toString() });
  const databaseName = `openmonetis_trips_test_${Date.now()}`;
  const originalExternalUrl = process.env.EXTERNAL_DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  let applicationPool: { end(): Promise<void> } | undefined;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  try {
    connectionUrl.pathname = `/${databaseName}`;
    process.env.NODE_ENV = "test";
    process.env.EXTERNAL_DATABASE_URL = connectionUrl.toString();
    const { db, pool } = await import("@openmonetis/db");
    applicationPool = pool;
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)),
    });
    const schema = await import("@openmonetis/db/schema");
    const { eq } = await import("drizzle-orm");
    const { tripsRepository } = await import("./trips.repository");
    const { createTripsService } = await import("../services/trips.service");
    const { ApiError } = await import("../utils/errors");
    const txRepository = await import("./transactions.repository");
    const accounts = await import("./accounts.repository");
    const cards = await import("./cards.repository");
    const categories = await import("./categories.repository");
    const people = await import("./people.repository");
    const recurring = await import("./recurring-transactions.repository");
    const { createTransactionsService } = await import("../services/transactions.service");
    const transactionsService = createTransactionsService(
      {
        ...txRepository,
        ...accounts,
        ...cards,
        ...categories,
        ...people,
        transitionRecurringRuleForUser: recurring.transitionRecurringRuleForUser,
        findTripByIdForUser: tripsRepository.findByIdForUser,
        getAccountBalanceSnapshotForUser: async () => ({ displayed: 10000, persisted: 10000 }),
      },
      { cleanupOrphans: async () => ({ deletedCount: 0 }) },
      { synchronize: async () => undefined },
    );
    const [owner, stranger] = await db
      .insert(schema.user)
      .values([
        { name: "Owner", email: "owner@example.test" },
        { name: "Stranger", email: "stranger@example.test" },
      ])
      .returning();
    const [person] = await db
      .insert(schema.people)
      .values({ userId: owner.id, name: "Eu", role: "admin" })
      .returning();
    const [c6, itau] = await db
      .insert(schema.financialAccounts)
      .values([
        { userId: owner.id, name: "C6", type: "checking" },
        { userId: owner.id, name: "Itaú", type: "checking" },
      ])
      .returning();
    const [restaurants, transport] = await db
      .insert(schema.categories)
      .values([
        { userId: owner.id, name: "Restaurantes", type: "expense" },
        { userId: owner.id, name: "Transporte", type: "expense" },
      ])
      .returning();
    const service = createTripsService(tripsRepository, {
      getRecurringOccurrence: transactionsService.getRecurringRuleOccurrence,
    });
    const expectError = async (promise: Promise<unknown>, code: string) => {
      await assert.rejects(promise, (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, code);
        return true;
      });
    };

    const lisboa = await service.create(
      { name: "Lisboa", startDate: "2026-05-12", endDate: "2026-05-22", note: null },
      owner.id,
    );
    await expectError(
      service.create(
        { name: "Porto", startDate: "2026-05-20", endDate: "2026-05-25", note: null },
        owner.id,
      ),
      "TRIP_OVERLAP",
    );
    assert.equal((await service.list(owner.id)).length, 1);
    const extended = await service.update(
      lisboa.id,
      { name: "Lisboa", startDate: "2026-05-12", endDate: "2026-05-23", note: null },
      owner.id,
    );
    assert.equal(extended.endDate, "2026-05-23");
    const santiago = await service.create(
      { name: "Santiago", startDate: "2026-09-01", endDate: "2026-09-01", note: null },
      owner.id,
    );

    const [dinner, ride, refund] = await db
      .insert(schema.transactions)
      .values([
        {
          userId: owner.id,
          personId: person.id,
          type: "expense",
          paymentMethod: "pix",
          name: "Jantar",
          amount: "9000.00",
          purchaseDate: new Date("2026-05-13T00:00:00.000Z"),
          period: "2026-05",
          accountId: c6.id,
          categoryId: restaurants.id,
        },
        {
          userId: owner.id,
          personId: person.id,
          type: "expense",
          paymentMethod: "pix",
          name: "Uber",
          amount: "212.30",
          purchaseDate: new Date("2026-05-14T00:00:00.000Z"),
          period: "2026-05",
          accountId: itau.id,
          categoryId: transport.id,
        },
        {
          userId: owner.id,
          personId: person.id,
          type: "income",
          paymentMethod: "pix",
          name: "Reembolso",
          amount: "800.00",
          purchaseDate: new Date("2026-05-20T00:00:00.000Z"),
          period: "2026-05",
          accountId: itau.id,
        },
      ])
      .returning();
    await db.insert(schema.transactionTrips).values([
      { transactionId: dinner.id, userId: owner.id, tripId: lisboa.id },
      { transactionId: ride.id, userId: owner.id, tripId: lisboa.id },
      { transactionId: refund.id, userId: owner.id, tripId: lisboa.id },
    ]);

    const detail = await service.getDetail(lisboa.id, owner.id);
    assert.equal(detail.summary.netCost, 8412.3);
    assert.equal(detail.summary.expenses, 9212.3);
    assert.equal(detail.summary.reimbursements, 800);
    assert.deepEqual(
      detail.summary.byCategory.map((item) => [item.label, item.amount]),
      [
        ["Restaurantes", 9000],
        ["Transporte", 212.3],
      ],
    );
    assert.deepEqual(
      detail.summary.bySource.map((item) => [item.label, item.amount]),
      [
        ["C6", 9000],
        ["Itaú", 212.3],
      ],
    );
    assert.equal(detail.linked.length, 3);
    const [listed] = (await service.list(owner.id)).filter((trip) => trip.id === lisboa.id);
    assert.equal(listed?.linkedCount, 3);

    await expectError(service.getDetail(lisboa.id, stranger.id), "TRIP_NOT_FOUND");
    await expectError(
      service.update(
        lisboa.id,
        { name: "Hack", startDate: "2026-05-12", endDate: "2026-05-23", note: null },
        stranger.id,
      ),
      "TRIP_NOT_FOUND",
    );
    await expectError(service.remove(lisboa.id, stranger.id), "TRIP_NOT_FOUND");

    const linkedIdsOf = async (tripId: string) =>
      new Set((await service.getDetail(tripId, owner.id)).linked.map((row) => row.id));
    const expenseBase = {
      type: "expense",
      paymentMethod: "pix",
      personId: person.id,
      accountId: c6.id,
      categoryId: restaurants.id,
    } as const;

    const purchase = await transactionsService.createTransaction({
      ...TransactionInputSchema.parse({
        ...expenseBase,
        name: "Parcelado",
        amount: 1000,
        purchaseDate: "2026-05-13",
        condition: "installment",
        installmentCount: 10,
        tripId: lisboa.id,
      }),
      userId: owner.id,
    });
    const installments = await txRepository.listTransactionSeriesForUser(
      purchase.seriesId as string,
      owner.id,
    );
    const missingFrom = (linked: Set<string>) =>
      installments.filter((row) => !linked.has(row.id)).map((row) => row.id);
    assert.equal(installments.length, 10);
    assert.deepEqual(missingFrom(await linkedIdsOf(lisboa.id)), []);
    // A row-level unlink touches only that installment.
    await transactionsService.updateTransaction(installments[6].id, owner.id, { tripId: null });
    assert.deepEqual(missingFrom(await linkedIdsOf(lisboa.id)), [installments[6].id]);
    // An update that omits tripId keeps the existing link state.
    await transactionsService.updateTransaction(installments[2].id, owner.id, {
      name: "Parcelado renomeado",
    });
    assert.deepEqual(missingFrom(await linkedIdsOf(lisboa.id)), [installments[6].id]);
    // Relinking one installment moves the whole series.
    await transactionsService.updateTransaction(installments[6].id, owner.id, {
      tripId: santiago.id,
    });
    assert.deepEqual(missingFrom(await linkedIdsOf(santiago.id)), []);
    assert.equal(missingFrom(await linkedIdsOf(lisboa.id)).length, 10);

    // Split expense: only the owner's share (R$ 150,00) reaches the net cost.
    const [ana] = await db
      .insert(schema.people)
      .values({ userId: owner.id, name: "Ana", role: "external" })
      .returning();
    await transactionsService.createTransaction({
      ...TransactionInputSchema.parse({
        ...expenseBase,
        name: "Jantar dividido",
        amount: 300,
        purchaseDate: "2026-05-13",
        splitShares: [
          { personId: person.id, amount: 150 },
          { personId: ana.id, amount: 150 },
        ],
        tripId: lisboa.id,
      }),
      userId: owner.id,
    });
    const splitDetail = await service.getDetail(lisboa.id, owner.id);
    assert.equal(splitDetail.summary.netCost, 8562.3);
    assert.equal(splitDetail.summary.byPerson.find((item) => item.label === "Ana")?.amount, 150);

    // Recurring: the entry occurrence is linked on create; other months stay unlinked.
    const netflixInput = TransactionInputSchema.parse({
      ...expenseBase,
      name: "Netflix",
      amount: 55.9,
      purchaseDate: "2026-04-10",
      condition: "recurring",
      recurrenceFrequency: "monthly",
      tripId: lisboa.id,
    });
    const netflixMay = { ...netflixInput, purchaseDate: "2026-05-10" };
    const netflix = await transactionsService.createTransaction({
      ...netflixInput,
      userId: owner.id,
    });
    const ruleId = netflix.recurringRuleId as string;
    const netflixTripOn = async (purchaseDate: string) =>
      (
        await transactionsService.listTransactions(
          owner.id,
          ListTransactionsQuerySchema.parse({ period: purchaseDate.slice(0, 7), pageSize: 100 }),
          false,
        )
      ).items.find((item) => item.name === "Netflix" && item.purchaseDate === purchaseDate)
        ?.tripId ?? null;
    const occurrenceRowCount = async () =>
      (
        await db
          .select({ id: schema.recurringTransactionOccurrences.id })
          .from(schema.recurringTransactionOccurrences)
          .where(eq(schema.recurringTransactionOccurrences.userId, owner.id))
      ).length;
    assert.equal(await netflixTripOn("2026-04-10"), lisboa.id);
    assert.equal(await netflixTripOn("2026-05-10"), null);
    const occurrenceRowsBefore = await occurrenceRowCount();
    // Dated edits version the rule, so the returned id is the one to edit next.
    const linkedRule = await transactionsService.updateRecurringRule(
      ruleId,
      owner.id,
      netflixMay,
      UpdateRecurringRuleQuerySchema.parse({ scope: "single", occurrenceDate: "2026-05-10" }),
    );
    const linkedRuleId = linkedRule.recurringRuleId as string;
    assert.equal(await netflixTripOn("2026-05-10"), lisboa.id);
    assert.equal(await netflixTripOn("2026-06-10"), null);
    assert.equal(await occurrenceRowCount(), occurrenceRowsBefore);
    await transactionsService.updateRecurringRule(
      linkedRuleId,
      owner.id,
      { ...netflixMay, tripId: null },
      UpdateRecurringRuleQuerySchema.parse({ scope: "single", occurrenceDate: "2026-05-10" }),
    );
    assert.equal(await netflixTripOn("2026-05-10"), null);
    assert.equal(await netflixTripOn("2026-04-10"), lisboa.id);

    // Transfers are not linkable; a foreign trip is not found.
    const linkedBeforeRejects = (await linkedIdsOf(lisboa.id)).size;
    await expectError(
      transactionsService.createTransaction({
        ...TransactionInputSchema.parse({
          type: "transfer",
          paymentMethod: "bank_transfer",
          name: "Transferência",
          amount: 50,
          purchaseDate: "2026-05-13",
          personId: person.id,
          sourceAccountId: c6.id,
          destinationAccountId: itau.id,
          tripId: lisboa.id,
        }),
        userId: owner.id,
      }),
      "TRIP_NOT_LINKABLE",
    );
    assert.equal((await linkedIdsOf(lisboa.id)).size, linkedBeforeRejects);
    const strangerTrip = await service.create(
      { name: "Outra", startDate: "2026-07-01", endDate: "2026-07-05", note: null },
      stranger.id,
    );
    await expectError(
      transactionsService.createTransaction({
        ...TransactionInputSchema.parse({
          ...expenseBase,
          name: "Café",
          amount: 10,
          purchaseDate: "2026-05-13",
          tripId: strangerTrip.id,
        }),
        userId: owner.id,
      }),
      "TRIP_NOT_FOUND",
    );

    const transactionsBefore = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, owner.id));
    await service.remove(lisboa.id, owner.id);
    await service.remove(santiago.id, owner.id);
    const transactionsAfter = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, owner.id));
    const linksAfter = await db
      .select({ id: schema.transactionTrips.transactionId })
      .from(schema.transactionTrips)
      .where(eq(schema.transactionTrips.userId, owner.id));
    assert.equal(transactionsAfter.length, transactionsBefore.length);
    assert.equal(linksAfter.length, 0);
  } finally {
    await applicationPool?.end();
    if (originalExternalUrl === undefined) delete process.env.EXTERNAL_DATABASE_URL;
    else process.env.EXTERNAL_DATABASE_URL = originalExternalUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    try {
      await admin.query(`DROP DATABASE "${databaseName}"`);
    } finally {
      await admin.end();
    }
  }
});
