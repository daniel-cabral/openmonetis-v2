import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
      getRecurringOccurrence: async () => {
        throw new Error("no recurring occurrence is linked in this test");
      },
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
    await service.create(
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

    const transactionsBefore = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, owner.id));
    await service.remove(lisboa.id, owner.id);
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
