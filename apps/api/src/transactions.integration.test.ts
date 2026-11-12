import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { otherExpenseCategoryName, otherIncomeCategoryName } from "@openmonetis/domain/categories";
import type {
  TransactionOutput,
  TransactionRefundOutput,
} from "@openmonetis/validators/transactions";
import { withIntegrationDatabase } from "./test-support/integration-database";

type Identity = {
  id: string;
  cookie: string;
  personId: string;
  incomeCategoryId: string;
  expenseCategoryId: string;
};
type Account = { id: string; summary: { balance: number } };

test("assembled API protects financial endpoints and persists transfers and refunds", {
  skip: process.env.TRANSACTIONS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const { app } = await import("./app");
    const { db, ...schema } = await import("@openmonetis/db");
    const { and, eq } = await import("drizzle-orm");
    const period = "2020-01";
    const date = "2020-01-10";
    const refundDate = "2020-01-20";

    function request(path: string, identity?: Identity, method = "GET", body?: unknown) {
      return app.request(`http://localhost:7001${path}`, {
        method,
        headers: {
          origin: "http://localhost:7002",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(identity ? { cookie: identity.cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }

    async function data<T>(response: Response, status = 200): Promise<T> {
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
      assert.equal(body.error, null);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.doesNotMatch(
        JSON.stringify(body),
        /"(?:userId|password|digest|tokenDigest|stack)"\s*:/,
      );
      return body.data;
    }

    async function error(response: Response, status: number, code?: string) {
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
      assert.equal(body.error, true);
      if (code) assert.equal(body.code, code);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.doesNotMatch(JSON.stringify(body), /"(?:userId|password|digest|stack)"\s*:/);
    }

    async function register(): Promise<Identity> {
      const response = await request("/api/auth/sign-up/email", undefined, "POST", {
        name: "Test user",
        email: `${randomUUID()}@example.test`,
        password: "integration-test-password-123",
      });
      assert.equal(response.status, 200, await response.clone().text());
      const body = await response.json();
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      assert.ok(cookie);
      const [person] = await db
        .select()
        .from(schema.people)
        .where(and(eq(schema.people.userId, body.user.id), eq(schema.people.role, "admin")));
      const categories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, body.user.id));
      const income = categories.find((category) => category.name === otherIncomeCategoryName);
      const expense = categories.find((category) => category.name === otherExpenseCategoryName);
      assert.ok(person);
      assert.ok(income);
      assert.ok(expense);
      return {
        id: body.user.id,
        cookie,
        personId: person.id,
        incomeCategoryId: income.id,
        expenseCategoryId: expense.id,
      };
    }

    const owner = await register();
    const stranger = await register();

    async function fixture(identity = owner, funding = 100) {
      const source = await data<Account>(
        await request("/accounts", identity, "POST", {
          name: `Source ${randomUUID()}`,
          type: "checking",
        }),
        201,
      );
      const destination = await data<Account>(
        await request("/accounts", identity, "POST", {
          name: `Destination ${randomUUID()}`,
          type: "checking",
        }),
        201,
      );
      if (funding > 0)
        await data(
          await request("/transactions", identity, "POST", {
            type: "income",
            paymentMethod: "pix",
            name: "Funding",
            amount: funding,
            purchaseDate: date,
            personId: identity.personId,
            categoryId: identity.incomeCategoryId,
            accountId: source.id,
            isSettled: true,
            settledDate: date,
          }),
          201,
        );
      return {
        source,
        destination,
        transfer: {
          type: "transfer",
          paymentMethod: "bank_transfer",
          name: "Transfer",
          amount: 30.01,
          purchaseDate: date,
          personId: identity.personId,
          sourceAccountId: source.id,
          destinationAccountId: destination.id,
          isSettled: true,
        },
        expense: {
          type: "expense",
          paymentMethod: "pix",
          name: "Purchase",
          amount: 10.01,
          purchaseDate: date,
          personId: identity.personId,
          accountId: source.id,
          categoryId: identity.expenseCategoryId,
          isSettled: true,
          settledDate: date,
        },
      };
    }

    async function balances(identity: Identity, ...ids: string[]) {
      const accounts = await data<Account[]>(await request(`/accounts?period=${period}`, identity));
      return ids.map((id) => {
        const account = accounts.find((item) => item.id === id);
        assert.ok(account);
        return account.summary.balance;
      });
    }

    async function persistedTransferId(recordId: string | null) {
      assert.ok(recordId);
      const [row] = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, recordId));
      assert.ok(row?.transferId);
      return row.transferId;
    }

    async function transferRows(transferId: string) {
      return db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.transferId, transferId));
    }

    await t.test(
      "every documented private operation rejects requests without a session or device token",
      async (t) => {
        const response = await request("/openapi.json");
        assert.equal(response.status, 200);
        const document = await response.json();
        assert.ok(document.paths["/transactions"]?.post);
        const publicPaths = new Set(["/health", "/api/health", "/auth-config"]);
        for (const [path, operations] of Object.entries(
          document.paths as Record<string, Record<string, unknown>>,
        )) {
          if (publicPaths.has(path)) continue;
          for (const method of Object.keys(operations).filter((method) =>
            ["get", "post", "put", "patch", "delete"].includes(method),
          )) {
            await t.test(`${method.toUpperCase()} ${path}`, async () => {
              const url = path.replace(/\{[^}]+\}/g, "00000000-0000-4000-8000-000000000001");
              const result = await request(
                url,
                undefined,
                method.toUpperCase(),
                method === "get" ? undefined : {},
              );
              assert.equal(result.status, 401, await result.clone().text());
              assert.equal(result.headers.get("cache-control"), "private, no-store");
            });
          }
        }
      },
    );

    await t.test(
      "transfers persist two opposite postings and preserve the combined balance",
      async () => {
        const f = await fixture();
        const transfer = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", f.transfer),
          201,
        );
        const transferId = await persistedTransferId(transfer.recordId);
        const rows = await transferRows(transferId);
        assert.equal(rows.length, 2);
        assert.deepEqual(
          rows.map((row) => [row.accountId, row.amount]).sort(),
          [
            [f.source.id, "-30.01"],
            [f.destination.id, "30.01"],
          ].sort(),
        );
        assert.equal(
          rows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0),
          0,
        );
        assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [69.99, 30.01]);
      },
    );

    await t.test(
      "insufficient balance and identical accounts reject transfers without partial writes",
      async () => {
        const f = await fixture();
        const before = await db
          .select()
          .from(schema.transactions)
          .where(eq(schema.transactions.accountId, f.source.id));
        await error(
          await request("/transactions", owner, "POST", { ...f.transfer, amount: 100.01 }),
          400,
          "INSUFFICIENT_TRANSFER_BALANCE",
        );
        await error(
          await request("/transactions", owner, "POST", {
            ...f.transfer,
            destinationAccountId: f.source.id,
          }),
          400,
        );
        assert.deepEqual(
          await db
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.accountId, f.source.id)),
          before,
        );
        assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [100, 0]);
      },
    );

    await t.test(
      "pending transfers do not move cash and settlement validates the available balance",
      async () => {
        const f = await fixture(owner, 0);
        const transfer = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", { ...f.transfer, isSettled: false }),
          201,
        );
        assert.ok(transfer.recordId);
        const transferId = await persistedTransferId(transfer.recordId);
        assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [0, 0]);
        await error(
          await request("/transactions/settlement", owner, "PATCH", {
            ids: [transfer.recordId],
            isSettled: true,
          }),
          400,
          "INSUFFICIENT_TRANSFER_BALANCE",
        );
        assert.deepEqual(
          (await transferRows(transferId)).map((row) => row.isSettled),
          [false, false],
        );
      },
    );

    await t.test("editing and deleting a transfer update or remove both postings", async () => {
      const f = await fixture();
      const transfer = await data<TransactionOutput>(
        await request("/transactions", owner, "POST", f.transfer),
        201,
      );
      assert.ok(transfer.recordId);
      const transferId = await persistedTransferId(transfer.recordId);
      await data(
        await request(`/transactions/${transfer.recordId}`, owner, "PATCH", { amount: 40.01 }),
      );
      assert.deepEqual((await transferRows(transferId)).map((row) => row.amount).sort(), [
        "-40.01",
        "40.01",
      ]);
      assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [59.99, 40.01]);
      await error(
        await request(`/transactions/${transfer.recordId}`, owner, "PATCH", { amount: 100.01 }),
        400,
        "INSUFFICIENT_TRANSFER_BALANCE",
      );
      assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [59.99, 40.01]);
      await data(await request(`/transactions/${transfer.recordId}`, owner, "DELETE"));
      assert.deepEqual(await transferRows(transferId), []);
      assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [100, 0]);
    });

    await t.test("concurrent transfers cannot spend the same available balance twice", async () => {
      const f = await fixture();
      const outcomes = await Promise.all([
        request("/transactions", owner, "POST", { ...f.transfer, amount: 80 }),
        request("/transactions", owner, "POST", { ...f.transfer, amount: 80 }),
      ]);
      assert.deepEqual(outcomes.map((response) => response.status).sort(), [201, 400]);
      await error(
        outcomes.find((response) => response.status === 400) as Response,
        400,
        "INSUFFICIENT_TRANSFER_BALANCE",
      );
      const rows = await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.type, "transfer"),
            eq(schema.transactions.sourceAccountId, f.source.id),
          ),
        );
      assert.equal(rows.length, 2);
      assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [20, 80]);
    });

    await t.test(
      "foreign transfer accounts are rejected in both directions without moving either user's cash",
      async () => {
        const f = await fixture();
        const foreign = await fixture(stranger);
        await error(
          await request("/transactions", owner, "POST", {
            ...f.transfer,
            sourceAccountId: foreign.source.id,
          }),
          404,
          "SOURCE_ACCOUNT_NOT_FOUND",
        );
        await error(
          await request("/transactions", owner, "POST", {
            ...f.transfer,
            destinationAccountId: foreign.destination.id,
          }),
          404,
          "DESTINATION_ACCOUNT_NOT_FOUND",
        );
        assert.deepEqual(await balances(owner, f.source.id, f.destination.id), [100, 0]);
        assert.deepEqual(
          await balances(stranger, foreign.source.id, foreign.destination.id),
          [100, 0],
        );
      },
    );

    await t.test(
      "another session cannot read, edit, delete, refund or settle an owned transaction",
      async () => {
        const f = await fixture();
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", f.expense),
          201,
        );
        assert.ok(source.recordId);
        const path = `/transactions/${source.recordId}`;
        await error(await request(path, stranger), 404, "TRANSACTION_NOT_FOUND");
        await error(
          await request(path, stranger, "PATCH", { amount: 1 }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        await error(await request(path, stranger, "DELETE"), 404, "TRANSACTION_NOT_FOUND");
        await error(
          await request(`${path}/refunds`, stranger, "POST", { amount: 1, receivedAt: refundDate }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        await error(
          await request("/transactions/settlement", stranger, "PATCH", {
            ids: [source.recordId],
            isSettled: false,
          }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        const current = await data<TransactionOutput>(await request(path, owner));
        assert.equal(current.displayAmount, 10.01);
        assert.equal(current.isSettled, true);
        const listing = await data<{ items: TransactionOutput[] }>(
          await request(`/transactions?period=${period}`, stranger),
        );
        assert.ok(listing.items.every((row) => row.recordId !== source.recordId));
      },
    );

    await t.test(
      "foreign person, category, account and split participants are rejected before creating an expense",
      async () => {
        const f = await fixture();
        const foreign = await fixture(stranger);
        for (const [patch, code] of [
          [{ personId: stranger.personId }, "PERSON_NOT_FOUND"],
          [{ categoryId: stranger.expenseCategoryId }, "CATEGORY_NOT_FOUND"],
          [{ accountId: foreign.source.id }, "ACCOUNT_NOT_FOUND"],
          [
            {
              splitShares: [
                { personId: owner.personId, amount: 6 },
                { personId: stranger.personId, amount: 4.01 },
              ],
            },
            "SPLIT_PERSON_NOT_FOUND",
          ],
        ] as const)
          await error(
            await request("/transactions", owner, "POST", { ...f.expense, ...patch }),
            404,
            code,
          );
        assert.deepEqual(await balances(owner, f.source.id), [100]);
      },
    );

    await t.test(
      "partial and final refunds preserve the purchase and cannot exceed its original amount",
      async () => {
        const f = await fixture();
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", f.expense),
          201,
        );
        assert.ok(source.recordId);
        const path = `/transactions/${source.recordId}`;
        const partial = await data<TransactionRefundOutput>(
          await request(`${path}/refunds`, owner, "POST", { amount: 3.33, receivedAt: refundDate }),
          201,
        );
        assert.equal(partial.remainingRefundableAmount, 6.68);
        assert.deepEqual(await balances(owner, f.source.id), [93.32]);
        await error(
          await request(`${path}/refunds`, owner, "POST", { amount: 6.69, receivedAt: refundDate }),
          400,
          "INVALID_REFUND_AMOUNT",
        );
        const final = await data<TransactionRefundOutput>(
          await request(`${path}/refunds`, owner, "POST", { amount: 6.68, receivedAt: refundDate }),
          201,
        );
        assert.equal(final.remainingRefundableAmount, 0);
        const detail = await data<TransactionOutput>(await request(path, owner));
        assert.equal(detail.plannedAmount, 10.01);
        assert.equal(detail.refundedAmount, 10.01);
        assert.equal(detail.refundableAmount, 0);
        assert.deepEqual(await balances(owner, f.source.id), [100]);
        await error(
          await request(`${path}/refunds`, owner, "POST", { amount: 0.01, receivedAt: refundDate }),
          400,
          "INVALID_REFUND_AMOUNT",
        );
      },
    );

    await t.test(
      "refunds persist exact proportional allocations and inherit the purchase tags",
      async () => {
        const f = await fixture();
        const external = await data<{ id: string }>(
          await request("/people", owner, "POST", { name: "External" }),
          201,
        );
        const tag = await data<{ id: string }>(
          await request("/tags", owner, "POST", { name: `Refund ${randomUUID()}` }),
          201,
        );
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", {
            ...f.expense,
            tagIds: [tag.id],
            splitShares: [
              { personId: owner.personId, amount: 6 },
              { personId: external.id, amount: 4.01 },
            ],
          }),
          201,
        );
        const refund = await data<TransactionRefundOutput>(
          await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
            amount: 3.33,
            receivedAt: refundDate,
          }),
          201,
        );
        const detail = await data<TransactionOutput>(
          await request(`/transactions/${refund.id}`, owner),
        );
        assert.deepEqual(
          detail.splitShares.map((share) => [share.personId, share.amount]).sort(),
          [
            [owner.personId, 1.99],
            [external.id, 1.34],
          ].sort(),
        );
        assert.equal(
          detail.splitShares.reduce((total, share) => total + Math.round(share.amount * 100), 0),
          333,
        );
        assert.deepEqual(detail.tagIds, [tag.id]);
        assert.deepEqual(await balances(owner, f.source.id), [95.99]);
      },
    );

    await t.test(
      "concurrent refunds cannot exceed the purchase and create no orphan credits",
      async () => {
        const f = await fixture();
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", f.expense),
          201,
        );
        const outcomes = await Promise.all([
          request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
            amount: 8,
            receivedAt: refundDate,
          }),
          request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
            amount: 8,
            receivedAt: refundDate,
          }),
        ]);
        assert.equal(outcomes.filter((response) => response.status === 201).length, 1);
        const rejected = outcomes.find((response) => response.status !== 201);
        assert.ok(rejected);
        assert.ok([400, 409].includes(rejected.status));
        await error(rejected, rejected.status);
        const links = await db
          .select()
          .from(schema.transactionRefunds)
          .where(eq(schema.transactionRefunds.sourceTransactionId, source.recordId as string));
        assert.equal(links.length, 1);
        assert.equal(links[0].amount, "8.00");
        const credits = await db
          .select()
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.accountId, f.source.id),
              eq(schema.transactions.origin, "refund"),
            ),
          );
        assert.equal(credits.length, 1);
        assert.deepEqual(await balances(owner, f.source.id), [97.99]);
      },
    );

    await t.test(
      "deleting a refund restores its available amount and a refunded purchase cannot be deleted first",
      async () => {
        const f = await fixture();
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", f.expense),
          201,
        );
        const refund = await data<TransactionRefundOutput>(
          await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
            amount: 10.01,
            receivedAt: refundDate,
          }),
          201,
        );
        await error(
          await request(`/transactions/${source.recordId}`, owner, "DELETE"),
          400,
          "TRANSACTION_HAS_REFUNDS",
        );
        await data(await request(`/transactions/${refund.id}`, owner, "DELETE"));
        const detail = await data<TransactionOutput>(
          await request(`/transactions/${source.recordId}`, owner),
        );
        assert.equal(detail.refundedAmount, 0);
        assert.equal(detail.refundableAmount, 10.01);
        assert.deepEqual(await balances(owner, f.source.id), [89.99]);
        assert.deepEqual(
          await db
            .select()
            .from(schema.transactionRefunds)
            .where(eq(schema.transactionRefunds.sourceTransactionId, source.recordId as string)),
          [],
        );
        await data(await request(`/transactions/${source.recordId}`, owner, "DELETE"));
        assert.deepEqual(await balances(owner, f.source.id), [100]);
      },
    );

    await t.test(
      "refunds reject invalid amounts, future dates and ineligible income without credits",
      async () => {
        const f = await fixture();
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", f.expense),
          201,
        );
        for (const amount of [0, -1, 0.001])
          await error(
            await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
              amount,
              receivedAt: refundDate,
            }),
            400,
          );
        await error(
          await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
            amount: 1,
            receivedAt: "2999-01-01",
          }),
          400,
          "REFUND_DATE_FUTURE",
        );
        const income = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", {
            ...f.expense,
            type: "income",
            categoryId: owner.incomeCategoryId,
          }),
          201,
        );
        await error(
          await request(`/transactions/${income.recordId}/refunds`, owner, "POST", {
            amount: 1,
            receivedAt: refundDate,
          }),
          400,
          "TRANSACTION_NOT_REFUNDABLE",
        );
        assert.deepEqual(await balances(owner, f.source.id), [100]);
      },
    );

    await t.test("card refunds require an invoice period and reject a paid invoice", async () => {
      const f = await fixture();
      const card = await data<{ id: string }>(
        await request("/cards", owner, "POST", {
          accountId: f.source.id,
          name: "Card",
          brand: "visa",
          closingDay: 20,
          dueDay: 25,
          limit: 1000,
        }),
        201,
      );
      const source = await data<TransactionOutput>(
        await request("/transactions", owner, "POST", {
          ...f.expense,
          paymentMethod: "credit_card",
          accountId: null,
          cardId: card.id,
          invoicePeriod: period,
        }),
        201,
      );
      await error(
        await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
          amount: 1,
          receivedAt: refundDate,
        }),
        400,
        "REFUND_INVOICE_REQUIRED",
      );
      await data(
        await request(`/invoices/${card.id}/${period}/payments`, owner, "POST", {
          accountId: f.source.id,
          paidAt: refundDate,
          allocations: [{ personId: owner.personId, amount: 10.01 }],
        }),
        201,
      );
      await error(
        await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
          amount: 1,
          receivedAt: refundDate,
          invoicePeriod: period,
        }),
        400,
        "INVOICE_ALREADY_PAID",
      );
      const detail = await data<TransactionOutput>(
        await request(`/transactions/${source.recordId}`, owner),
      );
      assert.equal(detail.refundedAmount, 0);
    });

    await t.test(
      "card refunds credit an open invoice without depositing money into the account",
      async () => {
        const f = await fixture();
        const card = await data<{ id: string }>(
          await request("/cards", owner, "POST", {
            accountId: f.source.id,
            name: "Open card",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000,
          }),
          201,
        );
        const source = await data<TransactionOutput>(
          await request("/transactions", owner, "POST", {
            ...f.expense,
            paymentMethod: "credit_card",
            accountId: null,
            cardId: card.id,
            invoicePeriod: period,
          }),
          201,
        );
        const refund = await data<TransactionRefundOutput>(
          await request(`/transactions/${source.recordId}/refunds`, owner, "POST", {
            amount: 3.33,
            receivedAt: refundDate,
            invoicePeriod: period,
          }),
          201,
        );
        const detail = await data<TransactionOutput>(
          await request(`/transactions/${refund.id}`, owner),
        );
        assert.equal(detail.period, period);
        assert.equal(detail.cardId, card.id);
        assert.equal(detail.accountId, null);
        assert.equal(detail.origin, "refund");
        assert.deepEqual(await balances(owner, f.source.id), [100]);
      },
    );

    await t.test(
      "bulk actions categorize, rename, tag and delete only owned eligible records",
      async () => {
        const f = await fixture(owner, 0);
        const create = async (name: string) =>
          data<TransactionOutput>(
            await request("/transactions", owner, "POST", {
              ...f.expense,
              name,
              isSettled: false,
              settledDate: undefined,
            }),
            201,
          );
        const first = await create("Bulk first");
        const second = await create("Bulk second");
        const ids = [first.recordId, second.recordId] as string[];
        const tag = await data<{ id: string }>(
          await request("/tags", owner, "POST", { name: `Bulk ${randomUUID()}` }),
          201,
        );
        const [leisure] = await db
          .select()
          .from(schema.categories)
          .where(and(eq(schema.categories.userId, owner.id), eq(schema.categories.name, "Viagem")));
        assert.ok(leisure);

        await error(
          await request("/transactions/bulk/category", stranger, "PATCH", {
            ids,
            categoryId: stranger.expenseCategoryId,
          }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        await error(
          await request("/transactions/bulk/category", owner, "PATCH", {
            ids,
            categoryId: owner.incomeCategoryId,
          }),
          400,
          "BULK_CATEGORY_INCOMPATIBLE",
        );
        assert.deepEqual(
          await data(
            await request("/transactions/bulk/category", owner, "PATCH", {
              ids,
              categoryId: leisure.id,
            }),
          ),
          { ids },
        );
        await data(
          await request("/transactions/bulk/tags", owner, "PATCH", {
            ids,
            operation: "add",
            tagIds: [tag.id],
          }),
        );
        await data(
          await request("/transactions/bulk/tags", owner, "PATCH", {
            ids,
            operation: "add",
            tagIds: [tag.id],
          }),
        );
        for (const id of ids) {
          const detail = await data<TransactionOutput>(await request(`/transactions/${id}`, owner));
          assert.equal(detail.categoryId, leisure.id);
          assert.deepEqual(detail.tagIds, [tag.id]);
        }
        await data(
          await request("/transactions/bulk/tags", owner, "PATCH", {
            ids: [first.recordId],
            operation: "remove",
            tagIds: [tag.id],
          }),
        );
        const untagged = await data<TransactionOutput>(
          await request(`/transactions/${first.recordId}`, owner),
        );
        assert.deepEqual(untagged.tagIds, []);

        await error(
          await request("/transactions/bulk/names", stranger, "PATCH", {
            items: [{ id: ids[0], name: "Stolen" }],
          }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        await data(
          await request("/transactions/bulk/names", owner, "PATCH", {
            items: [
              { id: ids[0], name: "  Mercado  " },
              { id: ids[1], name: "Farmácia" },
            ],
          }),
        );
        const names = await Promise.all(
          ids.map(
            async (id) =>
              (await data<TransactionOutput>(await request(`/transactions/${id}`, owner))).name,
          ),
        );
        assert.deepEqual(names, ["Mercado", "Farmácia"]);

        await error(
          await request("/transactions/bulk/delete", stranger, "POST", { ids }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        assert.deepEqual(
          await data(await request("/transactions/bulk/delete", owner, "POST", { ids })),
          { ids },
        );
        const remaining = await db
          .select()
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.userId, owner.id),
              eq(schema.transactions.id, ids[0] as string),
            ),
          );
        assert.deepEqual(remaining, []);
      },
    );

    await t.test(
      "mass-add creates every row atomically with shared settings and rejects foreign or unusable references",
      async () => {
        // Own users: the shared owner has spent the per-user mutation budget (120/min) by now.
        const owner = await register();
        const stranger = await register();
        const f = await fixture(owner, 0);
        const createCard = async (name: string) =>
          data<{ id: string }>(
            await request("/cards", owner, "POST", {
              accountId: f.source.id,
              name,
              brand: "visa",
              closingDay: 20,
              dueDay: 25,
              limit: 1000,
            }),
            201,
          );
        const card = await createCard("Mass card");
        const rowFor = (
          name: string,
          amount: number,
          personId = owner.personId,
          categoryId = owner.expenseCategoryId,
        ) => ({ purchaseDate: date, name, amount, categoryId, personId });
        const detail = async (id: string) =>
          data<TransactionOutput>(await request(`/transactions/${id}`, owner));
        const ownerTransactions = async () =>
          (
            await db
              .select({ id: schema.transactions.id })
              .from(schema.transactions)
              .where(eq(schema.transactions.userId, owner.id))
          ).length;

        const cardBatch = await data<{ ids: string[] }>(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "credit_card",
            cardId: card.id,
            invoicePeriod: period,
            rows: [rowFor("Mass 1", 10.01), rowFor("Mass 2", 20), rowFor("Mass 3", 30.5)],
          }),
          201,
        );
        assert.equal(cardBatch.ids.length, 3);
        const cardRows = [];
        for (const id of cardBatch.ids) cardRows.push(await detail(id));
        assert.deepEqual(
          cardRows.map((item) => item.name),
          ["Mass 1", "Mass 2", "Mass 3"],
        );
        for (const item of cardRows) {
          assert.equal(item.condition, "single");
          assert.equal(item.period, period);
          assert.equal(item.cardId, card.id);
          assert.equal(item.isSettled, null);
        }

        const pixBatch = await data<{ ids: string[] }>(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "pix",
            accountId: f.source.id,
            rows: [rowFor("Pix 1", 5), rowFor("Pix 2", 6)],
          }),
          201,
        );
        assert.equal(pixBatch.ids.length, 2);
        for (const id of pixBatch.ids) {
          const item = await detail(id);
          assert.equal(item.accountId, f.source.id);
          assert.equal(item.cardId, null);
          assert.equal(item.isSettled, false);
        }

        const inactive = await data<{ id: string }>(
          await request("/people", owner, "POST", { name: "Inactive person" }),
          201,
        );
        await data(await request(`/people/${inactive.id}`, owner, "PATCH", { status: "inactive" }));
        const paidCard = await createCard("Paid card");
        const paidPeriod = "2020-02";
        await data<TransactionOutput>(
          await request("/transactions", owner, "POST", {
            ...f.expense,
            paymentMethod: "credit_card",
            accountId: null,
            cardId: paidCard.id,
            invoicePeriod: paidPeriod,
            isSettled: undefined,
            settledDate: undefined,
          }),
          201,
        );
        await data(
          await request(`/invoices/${paidCard.id}/${paidPeriod}/payments`, owner, "POST", {
            accountId: f.source.id,
            paidAt: refundDate,
            allocations: [{ personId: owner.personId, amount: 10.01 }],
          }),
          201,
        );
        const foreignAccount = await data<Account>(
          await request("/accounts", stranger, "POST", {
            name: "Stranger account",
            type: "checking",
          }),
          201,
        );

        const derived = await data<{ ids: string[] }>(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "credit_card",
            cardId: card.id,
            rows: [{ ...rowFor("After closing", 12), purchaseDate: "2020-01-25" }],
          }),
          201,
        );
        assert.equal((await detail(derived.ids[0] as string)).period, "2020-02");

        const before = await ownerTransactions();
        await error(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "credit_card",
            cardId: card.id,
            invoicePeriod: period,
            rows: [rowFor("Big 1", 600), rowFor("Big 2", 500)],
          }),
          400,
          "CARD_LIMIT_EXCEEDED",
        );
        await error(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "pix",
            accountId: f.source.id,
            rows: [
              rowFor("Ok", 7),
              rowFor("Foreign", 8, owner.personId, stranger.expenseCategoryId),
            ],
          }),
          404,
          "CATEGORY_NOT_FOUND",
        );
        await error(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "pix",
            accountId: f.source.id,
            rows: [rowFor("Ok", 7), rowFor("Inactive", 8, inactive.id)],
          }),
          404,
          "PERSON_NOT_FOUND",
        );
        await error(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "credit_card",
            cardId: paidCard.id,
            invoicePeriod: paidPeriod,
            rows: [rowFor("Late", 4)],
          }),
          400,
          "INVOICE_ALREADY_PAID",
        );
        await error(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "expense",
            paymentMethod: "pix",
            accountId: foreignAccount.id,
            rows: [rowFor("Stolen", 9)],
          }),
          404,
          "ACCOUNT_NOT_FOUND",
        );
        await error(
          await request("/transactions/bulk/create", owner, "POST", {
            type: "income",
            paymentMethod: "pix",
            accountId: f.source.id,
            rows: [rowFor("Wrong type", 3)],
          }),
          404,
          "CATEGORY_NOT_FOUND",
        );
        const pixRows = [rowFor("Pix row", 4)];
        const invalidBodies = [
          {
            type: "expense",
            paymentMethod: "pix",
            accountId: f.source.id,
            cardId: card.id,
            rows: pixRows,
          },
          {
            type: "expense",
            paymentMethod: "credit_card",
            cardId: card.id,
            accountId: f.source.id,
            rows: pixRows,
          },
          {
            type: "expense",
            paymentMethod: "pix",
            accountId: f.source.id,
            invoicePeriod: period,
            rows: pixRows,
          },
          { type: "expense", paymentMethod: "pix", accountId: f.source.id, rows: [] },
          {
            type: "expense",
            paymentMethod: "pix",
            accountId: f.source.id,
            rows: Array.from({ length: 501 }, (_, index) => rowFor(`Row ${index}`, 1)),
          },
        ];
        for (const body of invalidBodies) {
          await error(
            await request("/transactions/bulk/create", owner, "POST", body),
            400,
            "validation_error",
          );
        }
        assert.equal(await ownerTransactions(), before);
      },
    );

    await t.test(
      "bulk edit applies only changed fields across scopes, splits and invoices, all or nothing",
      async () => {
        // Own user: the shared owner has spent the per-user mutation budget (120/min) by now.
        const editor = await register();
        const f = await fixture(editor);
        const second = await data<{ id: string }>(
          await request("/people", editor, "POST", { name: "Second person" }),
          201,
        );
        const detail = async (id: string) =>
          data<TransactionOutput>(await request(`/transactions/${id}`, editor));
        const details = async (ids: string[]) => {
          const items: TransactionOutput[] = [];
          for (const id of ids) items.push(await detail(id));
          return items;
        };
        const edit = (ids: string[], changes: Record<string, unknown>, scope = "single") =>
          request("/transactions/bulk/update", editor, "PATCH", { ids, changes, scope });
        const create = async (body: Record<string, unknown>) =>
          data<TransactionOutput>(
            await request("/transactions", editor, "POST", {
              ...f.expense,
              isSettled: false,
              settledDate: undefined,
              ...body,
            }),
            201,
          );
        const keep = (item: TransactionOutput) => ({
          name: item.name,
          displayAmount: item.displayAmount,
          categoryId: item.categoryId,
          accountId: item.accountId,
          cardId: item.cardId,
          dueDate: item.dueDate,
          isSettled: item.isSettled,
        });

        const singles = [
          await create({ name: "Edit one" }),
          await create({ name: "Edit two" }),
          await create({ name: "Edit three" }),
        ];
        const singleIds = singles.map((item) => item.recordId as string);
        const oneId = singleIds[0] as string;
        const singlesBefore = await details(singleIds);
        const edited = await data<{ ids: string[] }>(
          await edit(singleIds, { personId: second.id, purchaseDate: "2020-02-05" }),
        );
        assert.deepEqual([...edited.ids].sort(), [...singleIds].sort());
        const singlesAfter = await details(singleIds);
        assert.deepEqual(singlesAfter.map(keep), singlesBefore.map(keep));
        assert.deepEqual(
          singlesAfter.map((item) => item.personId),
          [second.id, second.id, second.id],
        );
        assert.deepEqual(
          singlesAfter.map((item) => item.purchaseDate),
          ["2020-02-05", "2020-02-05", "2020-02-05"],
        );
        assert.deepEqual(
          singlesAfter.map((item) => item.period),
          ["2020-02", "2020-02", "2020-02"],
        );

        const refunded = await create({ name: "Refunded" });
        const refund = await data<TransactionRefundOutput>(
          await request(`/transactions/${refunded.recordId}/refunds`, editor, "POST", {
            amount: 3.33,
            receivedAt: refundDate,
          }),
          201,
        );
        await error(await edit([oneId, refund.id], { amount: 50 }), 400, "BULK_ACTION_UNSUPPORTED");
        assert.equal((await detail(oneId)).displayAmount, 10.01);

        const head = await create({
          name: "Plan",
          condition: "installment",
          installmentCount: 10,
          purchaseDate: "2026-01-10",
          dueDate: "2026-01-15",
        });
        assert.ok(head.seriesId);
        const members = await db
          .select({
            id: schema.transactions.id,
            installment: schema.transactions.currentInstallment,
          })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.userId, editor.id),
              eq(schema.transactions.seriesId, head.seriesId),
            ),
          );
        const planIds = members
          .sort((a, b) => (a.installment ?? 0) - (b.installment ?? 0))
          .map((member) => member.id);
        assert.equal(planIds.length, 10);
        const planBefore = await details(planIds);
        await data(await edit([planIds[2] as string], { dueDate: "2026-01-31" }, "future"));
        const planAfter = await details(planIds);
        assert.deepEqual(
          planAfter.slice(0, 2).map((item) => item.originalDueDate),
          planBefore.slice(0, 2).map((item) => item.originalDueDate),
        );
        assert.deepEqual(
          planAfter.slice(2).map((item) => item.originalDueDate),
          [
            "2026-01-31",
            "2026-02-28",
            "2026-03-31",
            "2026-04-30",
            "2026-05-31",
            "2026-06-30",
            "2026-07-31",
            "2026-08-31",
          ],
        );
        await error(await edit([oneId], { condition: "installment" }), 400, "validation_error");
        await error(await edit(singleIds, {}), 400, "validation_error");

        const split = await create({
          name: "Shared",
          amount: 100,
          splitShares: [
            { personId: editor.personId, amount: 60 },
            { personId: second.id, amount: 40 },
          ],
        });
        const splitId = split.recordId as string;
        await error(
          await edit([splitId], { personId: editor.personId }),
          400,
          "BULK_UPDATE_SPLIT_PERSON",
        );
        await data(await edit([splitId], { amount: 90.01 }));
        const shares = await db
          .select({
            personId: schema.transactionSplits.personId,
            amount: schema.transactionSplits.amount,
          })
          .from(schema.transactionSplits)
          .where(eq(schema.transactionSplits.transactionId, splitId));
        assert.deepEqual(
          Object.fromEntries(shares.map((share) => [share.personId, share.amount])),
          {
            [editor.personId]: "-54.01",
            [second.id]: "-36.00",
          },
        );
        assert.equal((await detail(splitId)).displayAmount, 90.01);

        const settled = await create({ name: "Settled", isSettled: true, settledDate: date });
        const settledId = settled.recordId as string;
        await error(await edit([settledId], { amount: 20 }), 400, "SETTLEMENT_REQUIRES_UNDO");
        assert.equal((await detail(settledId)).displayAmount, 10.01);

        const invoiceCard = await data<{ id: string }>(
          await request("/cards", editor, "POST", {
            accountId: f.source.id,
            name: "Bulk card",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000,
          }),
          201,
        );
        const cardItem = (invoicePeriod: string, name: string) =>
          create({
            name,
            paymentMethod: "credit_card",
            accountId: null,
            cardId: invoiceCard.id,
            invoicePeriod,
            isSettled: undefined,
            settledDate: undefined,
          });
        const paidItem = await cardItem("2020-05", "Paid item");
        const paidItemId = paidItem.recordId as string;
        await data(
          await request(`/invoices/${invoiceCard.id}/2020-05/payments`, editor, "POST", {
            accountId: f.source.id,
            paidAt: "2020-06-25",
            allocations: [{ personId: editor.personId, amount: 10.01 }],
          }),
          201,
        );
        const openItem = await cardItem("2020-06", "Open item");
        const openItemId = openItem.recordId as string;
        await error(
          await edit([openItemId], { invoicePeriod: "2020-05" }),
          400,
          "INVOICE_ALREADY_PAID",
        );
        await error(await edit([paidItemId], { amount: 20 }), 400, "INVOICE_ALREADY_PAID");
        assert.equal((await detail(openItemId)).period, "2020-06");
        assert.equal((await detail(paidItemId)).displayAmount, 10.01);

        const seriesIds = async (seriesId: string | null) => {
          const members = await db
            .select({
              id: schema.transactions.id,
              installment: schema.transactions.currentInstallment,
            })
            .from(schema.transactions)
            .where(
              and(
                eq(schema.transactions.userId, editor.id),
                eq(schema.transactions.seriesId, seriesId as string),
              ),
            );
          return members
            .sort((a, b) => (a.installment ?? 0) - (b.installment ?? 0))
            .map((member) => member.id);
        };

        // Card series: a future edit moves the anchor across a year boundary, then a series edit
        // from installment 2 re-anchors the earlier installment too.
        const cardPlan = await create({
          name: "Card plan",
          condition: "installment",
          installmentCount: 3,
          purchaseDate: "2021-03-10",
          paymentMethod: "credit_card",
          accountId: null,
          cardId: invoiceCard.id,
          isSettled: undefined,
          settledDate: undefined,
        });
        const cardPlanIds = await seriesIds(cardPlan.seriesId);
        assert.equal(cardPlanIds.length, 3);
        await data(
          await edit([cardPlanIds[0] as string], { purchaseDate: "2021-12-10" }, "future"),
        );
        const shifted = await details(cardPlanIds);
        assert.deepEqual(
          shifted.map((item) => item.purchaseDate),
          ["2021-12-10", "2022-01-10", "2022-02-10"],
        );
        assert.deepEqual(
          shifted.map((item) => item.period),
          ["2021-12", "2022-01", "2022-02"],
        );
        await data(
          await edit([cardPlanIds[1] as string], { purchaseDate: "2022-05-10" }, "series"),
        );
        const reanchored = await details(cardPlanIds);
        assert.deepEqual(
          reanchored.map((item) => item.purchaseDate),
          ["2022-04-10", "2022-05-10", "2022-06-10"],
        );
        assert.deepEqual(
          reanchored.map((item) => item.period),
          ["2022-04", "2022-05", "2022-06"],
        );

        // A settled sibling inside the future scope locks its series: the whole edit aborts.
        const fundedFixture = await fixture(editor, 500);
        const payPlan = await data<TransactionOutput>(
          await request("/transactions", editor, "POST", {
            ...fundedFixture.expense,
            name: "Pay plan",
            condition: "installment",
            installmentCount: 6,
            purchaseDate: "2026-01-10",
            dueDate: "2026-01-15",
            isSettled: false,
            settledDate: undefined,
          }),
          201,
        );
        const payIds = await seriesIds(payPlan.seriesId);
        await data(
          await request("/transactions/settlement", editor, "PATCH", {
            ids: [payIds[4] as string],
            isSettled: true,
            settledDate: "2026-01-20",
          }),
        );
        const payBefore = await details(payIds);
        assert.equal(payBefore[4]?.isSettled, true);
        await error(
          await edit([payIds[2] as string], { amount: 20 }, "future"),
          400,
          "SETTLEMENT_REQUIRES_UNDO",
        );
        assert.deepEqual((await details(payIds)).map(keep), payBefore.map(keep));
        await error(
          await edit([openItemId], { accountId: f.source.id }),
          400,
          "BULK_UPDATE_FIELD_NOT_APPLICABLE",
        );
        assert.equal((await detail(openItemId)).accountId, null);
        await error(
          await edit(singleIds, { categoryId: editor.incomeCategoryId }),
          400,
          "BULK_CATEGORY_INCOMPATIBLE",
        );
        assert.deepEqual((await details(singleIds)).map(keep), singlesAfter.map(keep));

        // A stored row of a recurring rule (as reconciliation stamps it) rejects the whole selection.
        const recurrence = await create({
          name: "Recurring edit",
          condition: "recurring",
          recurrenceFrequency: "monthly",
          purchaseDate: "2020-03-10",
        });
        assert.ok(recurrence.recurringRuleId);
        const occurrenceId = (await create({ name: "Recurring stamped" })).recordId as string;
        await db
          .update(schema.transactions)
          .set({ recurringRuleId: recurrence.recurringRuleId })
          .where(
            and(
              eq(schema.transactions.id, occurrenceId),
              eq(schema.transactions.userId, editor.id),
            ),
          );
        await error(
          await edit([...singleIds, occurrenceId], { note: "Recurring" }),
          400,
          "BULK_UPDATE_RECURRING",
        );
        assert.deepEqual(
          (await details(singleIds)).map((item) => item.note),
          [null, null, null],
        );
        assert.equal((await detail(occurrenceId)).note, null);

        // Every related id must belong to the owner, even when the transactions do.
        const strangerAccount = await data<Account>(
          await request("/accounts", stranger, "POST", {
            name: "Stranger bulk account",
            type: "checking",
          }),
          201,
        );
        const strangerCard = await data<{ id: string }>(
          await request("/cards", stranger, "POST", {
            accountId: strangerAccount.id,
            name: "Stranger card",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000,
          }),
          201,
        );
        const foreignChanges: Array<[Record<string, string>, string]> = [
          [{ personId: stranger.personId }, "PERSON_NOT_FOUND"],
          [{ categoryId: stranger.expenseCategoryId }, "CATEGORY_NOT_FOUND"],
          [{ accountId: strangerAccount.id }, "ACCOUNT_NOT_FOUND"],
          [{ cardId: strangerCard.id }, "CARD_NOT_FOUND"],
        ];
        for (const [changes, code] of foreignChanges) {
          await error(await edit(singleIds, changes), 404, code);
        }
        assert.deepEqual((await details(singleIds)).map(keep), singlesAfter.map(keep));
        assert.deepEqual(
          (await details(singleIds)).map((item) => item.personId),
          [second.id, second.id, second.id],
        );

        await error(
          await request("/transactions/bulk/update", stranger, "PATCH", {
            ids: singleIds,
            changes: { note: "Stolen" },
          }),
          404,
          "TRANSACTION_NOT_FOUND",
        );
        assert.deepEqual(
          (await details(singleIds)).map((item) => item.note),
          [null, null, null],
        );
      },
    );

    await t.test(
      "categoryMatch=exact lists only the selected category while the default includes its children",
      async () => {
        const f = await fixture(owner, 0);
        const parent = await data<{ id: string }>(
          await request("/categories", owner, "POST", {
            name: `Parent ${randomUUID()}`,
            type: "expense",
          }),
          201,
        );
        const child = await data<{ id: string }>(
          await request("/categories", owner, "POST", {
            name: `Child ${randomUUID()}`,
            type: "expense",
            parentId: parent.id,
          }),
          201,
        );
        const create = async (categoryId: string) =>
          data<TransactionOutput>(
            await request("/transactions", owner, "POST", { ...f.expense, categoryId }),
            201,
          );
        const parentRow = await create(parent.id);
        const childRow = await create(child.id);
        const listed = async (match = "") => {
          const body = await data<{ items: TransactionOutput[] }>(
            await request(`/transactions?period=${period}&categoryIds=${parent.id}${match}`, owner),
          );
          return body.items.map((item) => item.recordId).sort();
        };

        assert.deepEqual(await listed(), [parentRow.recordId, childRow.recordId].sort());
        assert.deepEqual(await listed("&categoryMatch=exact"), [parentRow.recordId]);
      },
    );

    await t.test(
      "export items return every filtered transaction beyond one page, matching the CSV export",
      async () => {
        const exporter = await register();
        const account = await data<Account>(
          await request("/accounts", exporter, "POST", {
            name: `Export ${randomUUID()}`,
            type: "checking",
          }),
          201,
        );
        const otherCategory = await data<{ id: string }>(
          await request("/categories", exporter, "POST", {
            name: `Export other ${randomUUID()}`,
            type: "expense",
          }),
          201,
        );
        const amounts = Array.from({ length: 35 }, (_, index) =>
          Number((1 + index * 0.37).toFixed(2)),
        );
        const rowFor = (name: string, amount: number, categoryId: string) => ({
          purchaseDate: date,
          name,
          amount,
          categoryId,
          personId: exporter.personId,
        });
        await data(
          await request("/transactions/bulk/create", exporter, "POST", {
            type: "expense",
            paymentMethod: "pix",
            accountId: account.id,
            rows: amounts.map((amount, index) =>
              rowFor(
                index === 0 ? '=HYPERLINK("x")' : `Export ${index}`,
                amount,
                exporter.expenseCategoryId,
              ),
            ),
          }),
          201,
        );
        await data(
          await request("/transactions/bulk/create", exporter, "POST", {
            type: "expense",
            paymentMethod: "pix",
            accountId: account.id,
            rows: [
              rowFor("Other 1", 5, otherCategory.id),
              rowFor("Other 2", 6, otherCategory.id),
              rowFor("Other 3", 7, otherCategory.id),
            ],
          }),
          201,
        );
        await data(
          await request("/transactions", exporter, "POST", {
            type: "income",
            paymentMethod: "pix",
            name: "Income",
            amount: 8,
            purchaseDate: date,
            personId: exporter.personId,
            categoryId: exporter.incomeCategoryId,
            accountId: account.id,
            isSettled: true,
            settledDate: date,
          }),
          201,
        );

        const filter = `period=${period}&categoryIds=${exporter.expenseCategoryId}`;
        const listed = await data<{ items: TransactionOutput[]; rowCount: number }>(
          await request(`/transactions/export/items?${filter}`, exporter),
        );
        assert.equal(listed.rowCount, 35);
        assert.equal(listed.items.length, 35);
        assert.ok(listed.items.every((item) => item.categoryId === exporter.expenseCategoryId));
        // Expenses are stored as negative amounts.
        assert.deepEqual(
          listed.items.map((item) => item.amount).sort((a, b) => a - b),
          amounts.map((amount) => -amount).sort((a, b) => a - b),
        );
        assert.ok(listed.items.some((item) => item.name === '=HYPERLINK("x")'));

        const exported = await data<{ rowCount: number; contentBase64: string }>(
          await request(`/transactions/export?${filter}&format=csv`, exporter),
        );
        assert.equal(exported.rowCount, 35);
        const [header, ...lines] = Buffer.from(exported.contentBase64, "base64")
          .toString("utf8")
          .replace(/^﻿/, "")
          .split("\r\n");
        const valueColumn = (header ?? "").split(";").indexOf('"Valor (R$)"');
        assert.ok(valueColumn >= 0);
        assert.deepEqual(
          lines.map((line) => Number(line.split(";")[valueColumn]?.replace(",", "."))),
          listed.items.map((item) => item.amount),
        );
      },
    );

    await t.test("a forged session cookie cannot authenticate a financial request", async () => {
      await error(
        await request("/accounts", {
          ...owner,
          cookie: "better-auth.session_token=forged-session.invalid-signature",
        }),
        401,
        "unauthorized",
      );
    });

    await t.test(
      "signing out revokes access even if the old signed cookie is replayed",
      async () => {
        const response = await request("/api/auth/sign-out", stranger, "POST", {});
        assert.equal(response.status, 200);
        await error(await request("/accounts", stranger), 401, "unauthorized");
      },
    );
  });
});
