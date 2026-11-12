import assert from "node:assert/strict";
import test from "node:test";
import type { TransactionOutput } from "@openmonetis/validators/transactions";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

test("financial mutations preserve cents, occurrence history and ownership", {
  skip: process.env.FINANCIAL_INTEGRITY_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const foreignAccount = await api.account(stranger);
    const {
      db,
      transactions,
      transactionSplits,
      recurringTransactionRules,
      recurringTransactionOccurrences,
      recurringTransactionSplits,
      settlementEvents,
    } = await import("@openmonetis/db");
    async function snapshot() {
      const tables = await Promise.all([
        db.select().from(transactions),
        db.select().from(transactionSplits),
        db.select().from(recurringTransactionRules),
        db.select().from(recurringTransactionOccurrences),
        db.select().from(recurringTransactionSplits),
        db.select().from(settlementEvents),
      ]);
      return tables.map((rows) => rows.map((row) => JSON.stringify(row)).sort());
    }
    async function listing(period: string) {
      return api.data<{ items: TransactionOutput[] }>(
        await api.request(`/transactions?period=${period}&pageSize=100`, owner),
      );
    }
    async function get(id: string) {
      return api.data<TransactionOutput>(await api.request(`/transactions/${id}`, owner));
    }

    await t.test(
      "a mixed-owner bulk settlement rejects the entire batch without events or partial writes",
      async () => {
        const own = await api.expense(owner, { isSettled: false });
        const foreign = await api.expense(stranger, { isSettled: false });
        const before = await snapshot();
        await api.error(
          await api.request("/transactions/settlement", owner, "PATCH", {
            ids: [own.id, foreign.id],
            isSettled: true,
            settledDate: "2020-01-20",
          }),
          404,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );

    await t.test(
      "foreign settlement accounts and split participants cannot alter an existing expense",
      async () => {
        const own = await api.expense(owner, { isSettled: false });
        const before = await snapshot();
        await api.error(
          await api.request("/transactions/settlement", owner, "PATCH", {
            ids: [own.id],
            isSettled: true,
            settledDate: "2020-01-20",
            accountId: foreignAccount.id,
          }),
          404,
        );
        await api.error(
          await api.request(`/transactions/${own.id}`, owner, "PATCH", {
            splitShares: [
              { personId: owner.personId, amount: 5 },
              { personId: stranger.personId, amount: 5.01 },
            ],
          }),
          404,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );

    await t.test(
      "foreign filters and exports do not reveal another user's transactions",
      async () => {
        const foreign = await api.expense(stranger, {
          accountId: foreignAccount.id,
          name: "Private foreign purchase",
        });
        for (const filter of [
          `personIds=${stranger.personId}`,
          `accountIds=${foreignAccount.id}`,
          `categoryIds=${stranger.expenseCategoryId}`,
        ]) {
          const result = await api.data<{ items: TransactionOutput[] }>(
            await api.request(`/transactions?period=2020-01&${filter}`, owner),
          );
          assert.deepEqual(result.items, []);
          const exported = await api.data<{ rowCount: number; contentBase64: string }>(
            await api.request(`/transactions/export?period=2020-01&format=csv&${filter}`, owner),
          );
          assert.equal(exported.rowCount, 0);
          assert.equal(
            Buffer.from(exported.contentBase64, "base64").toString().includes(foreign.name),
            false,
          );
        }
      },
    );

    await t.test(
      "actual settlement conserves split cents and undo restores the original projection",
      async () => {
        const guest = await api.data<{ id: string }>(
          await api.request("/people", owner, "POST", { name: "Guest" }),
          201,
        );
        const own = await api.expense(owner, {
          amount: 100.01,
          isSettled: false,
          splitShares: [
            { personId: owner.personId, amount: 60.01 },
            { personId: guest.id, amount: 40 },
          ],
        });
        await api.data(
          await api.request("/transactions/settlement", owner, "PATCH", {
            ids: [own.id],
            isSettled: true,
            settledDate: "2020-02-03",
            settledAmount: 90.01,
          }),
        );
        const paid = await get(own.id);
        assert.equal(paid.plannedAmount, 100.01);
        assert.equal(paid.displayAmount, 90.01);
        assert.equal(paid.settledDate, "2020-02-03");
        const allocations = await db.select().from(transactionSplits);
        const shares = allocations.filter((row) => row.transactionId === own.id);
        assert.equal(
          shares.reduce(
            (total, row) => total + Math.round(Math.abs(Number(row.settledAmount)) * 100),
            0,
          ),
          9001,
        );
        const statement = await api.data<{ items: TransactionOutput[] }>(
          await api.request(
            `/transactions?period=2020-02&view=accountStatement&accountIds=${own.accountId}`,
            owner,
          ),
        );
        assert.equal(
          statement.items
            .filter((item) => item.recordId === own.id)
            .reduce(
              (sum, item) =>
                sum + Math.round(Math.abs(item.allocation?.amount ?? item.amount) * 100),
              0,
            ),
          9001,
        );
        await api.data(
          await api.request("/transactions/settlement", owner, "PATCH", {
            ids: [own.id],
            isSettled: false,
          }),
        );
        const undone = await get(own.id);
        assert.equal(undone.displayAmount, 100.01);
        assert.equal(undone.isSettled, false);
        const after = await api.data<{ items: TransactionOutput[] }>(
          await api.request(
            `/transactions?period=2020-02&view=accountStatement&accountIds=${own.accountId}`,
            owner,
          ),
        );
        assert.equal(
          after.items.some((item) => item.recordId === own.id),
          false,
        );
      },
    );

    await t.test(
      "installments conserve the total and deleting a single installment preserves its siblings",
      async () => {
        const own = await api.expense(owner, {
          amount: 100.01,
          condition: "installment",
          installmentCount: 3,
          isSettled: false,
        });
        const items = (await Promise.all(["2020-01", "2020-02", "2020-03"].map(listing)))
          .flatMap((result) => result.items)
          .filter((item) => item.seriesId === own.seriesId);
        assert.equal(items.length, 3);
        assert.equal(
          items.reduce((total, item) => total + Math.round(item.displayAmount * 100), 0),
          10001,
        );
        const middle = items.find((item) => item.currentInstallment === 2);
        assert.ok(middle);
        await api.data(
          await api.request(`/transactions/${middle.id}?scope=single`, owner, "DELETE"),
        );
        const remaining = (await Promise.all(["2020-01", "2020-02", "2020-03"].map(listing)))
          .flatMap((result) => result.items)
          .filter((item) => item.seriesId === own.seriesId);
        assert.deepEqual(
          remaining.map((item) => item.currentInstallment),
          [1, 3],
        );
        assert.equal(
          remaining.reduce((total, item) => total + Math.round(item.displayAmount * 100), 0),
          10001 - Math.round(middle.displayAmount * 100),
        );
      },
    );

    await t.test(
      "recurring settlement rejects foreign rules, foreign accounts and dates outside the series",
      async () => {
        const own = await api.expense(owner, {
          condition: "recurring",
          recurrenceFrequency: "monthly",
          recurrenceEndDate: "2020-03-10",
          isSettled: false,
        });
        assert.ok(own.recurringRuleId);
        const before = await snapshot();
        const body = {
          recurringRuleId: own.recurringRuleId,
          purchaseDate: "2020-01-10",
          isSettled: true,
          settledDate: "2020-01-20",
        };
        await api.error(
          await api.request(
            "/transactions/recurring-occurrences/settlement",
            stranger,
            "PATCH",
            body,
          ),
          404,
        );
        await api.error(
          await api.request("/transactions/recurring-occurrences/settlement", owner, "PATCH", {
            ...body,
            accountId: foreignAccount.id,
          }),
          404,
        );
        for (const purchaseDate of ["2019-12-10", "2020-01-11", "2020-04-10"]) {
          await api.error(
            await api.request("/transactions/recurring-occurrences/settlement", owner, "PATCH", {
              ...body,
              purchaseDate,
            }),
            400,
            "INVALID_RECURRING_OCCURRENCE",
          );
        }
        assert.deepEqual(await snapshot(), before);
      },
    );

    await t.test(
      "recurring settlement and undo affect only the selected occurrence through the inclusive deadline",
      async () => {
        const own = await api.expense(owner, {
          amount: 25.01,
          condition: "recurring",
          recurrenceFrequency: "monthly",
          recurrenceEndDate: "2020-03-10",
          isSettled: false,
        });
        const body = {
          recurringRuleId: own.recurringRuleId,
          purchaseDate: "2020-02-10",
          isSettled: true,
          settledDate: "2020-02-11",
          settledAmount: 24.99,
        };
        await api.data(
          await api.request("/transactions/recurring-occurrences/settlement", owner, "PATCH", body),
        );
        const occurrences = (
          await Promise.all(["2020-01", "2020-02", "2020-03", "2020-04"].map(listing))
        )
          .flatMap((result) => result.items)
          .filter((item) => item.recurringRuleId === own.recurringRuleId);
        assert.deepEqual(
          occurrences.map((item) => [item.purchaseDate, item.displayAmount, item.isSettled]),
          [
            ["2020-01-10", 25.01, false],
            ["2020-02-10", 24.99, true],
            ["2020-03-10", 25.01, false],
          ],
        );
        await api.data(
          await api.request("/transactions/recurring-occurrences/settlement", owner, "PATCH", {
            ...body,
            isSettled: false,
          }),
        );
        const february = (await listing("2020-02")).items.find(
          (item) => item.recurringRuleId === own.recurringRuleId,
        );
        assert.equal(february?.displayAmount, 25.01);
        assert.equal(february?.isSettled, false);
      },
    );

    await t.test(
      "a settlement too small for its split is a client error and leaves no financial writes",
      async () => {
        const guest = await api.data<{ id: string }>(
          await api.request("/people", owner, "POST", { name: "Guest" }),
          201,
        );
        const own = await api.expense(owner, {
          amount: 10,
          dueDate: "2020-01-10",
          isSettled: false,
          splitShares: [
            { personId: owner.personId, amount: 5 },
            { personId: guest.id, amount: 5 },
          ],
        });
        const recurring = await api.expense(owner, {
          amount: 10,
          condition: "recurring",
          recurrenceFrequency: "monthly",
          isSettled: false,
          splitShares: [
            { personId: owner.personId, amount: 5 },
            { personId: guest.id, amount: 5 },
          ],
        });
        const before = await snapshot();
        await api.error(
          await api.request("/transactions/settlement", owner, "PATCH", {
            ids: [own.id],
            isSettled: true,
            settledDate: "2020-01-20",
            settledAmount: 0.01,
          }),
          400,
          "INVALID_SETTLEMENT_ALLOCATION",
        );
        await api.error(
          await api.request("/bills/2020-01/payments", owner, "POST", {
            billId: own.id,
            accountId: own.accountId,
            paidAt: "2020-01-20",
            amount: 0.01,
          }),
          400,
          "INVALID_SETTLEMENT_ALLOCATION",
        );
        await api.error(
          await api.request("/transactions/recurring-occurrences/settlement", owner, "PATCH", {
            recurringRuleId: recurring.recurringRuleId,
            purchaseDate: "2020-01-10",
            isSettled: true,
            settledDate: "2020-01-20",
            settledAmount: 0.01,
          }),
          400,
          "INVALID_SETTLEMENT_ALLOCATION",
        );
        assert.deepEqual(await snapshot(), before);
      },
    );

    await t.test(
      "duplicate ids settle once, concurrent confirmations produce one event, and an invalid batch rolls back",
      async () => {
        const candidates = [
          await api.expense(owner, { isSettled: false }),
          await api.expense(owner, { isSettled: false }),
        ].sort((left, right) => left.id.localeCompare(right.id));
        // The repository locks and processes IDs in order: force a write before the failing row.
        const [pending, own] = candidates;
        const requests = await Promise.all(
          [1, 2].map(() =>
            api.request("/transactions/settlement", owner, "PATCH", {
              ids: [own.id, own.id],
              isSettled: true,
              settledDate: "2020-01-20",
            }),
          ),
        );
        assert.deepEqual(requests.map((response) => response.status).sort(), [200, 400]);
        for (const response of requests) {
          if (response.status === 200) {
            const result = await api.data<{ ids: string[] }>(response);
            assert.deepEqual(result.ids, [own.id]);
          } else await api.error(response, 400, "SETTLEMENT_ALREADY_CONFIRMED");
        }
        const events = await db.select().from(settlementEvents);
        assert.equal(
          events.filter((event) => event.transactionId === own.id && event.action === "confirm")
            .length,
          1,
        );
        const before = await snapshot();
        await api.error(
          await api.request("/transactions/settlement", owner, "PATCH", {
            ids: [pending.id, own.id],
            isSettled: true,
            settledDate: "2020-01-20",
          }),
          400,
          "SETTLEMENT_ALREADY_CONFIRMED",
        );
        assert.deepEqual(await snapshot(), before);
      },
    );

    await t.test(
      "invoice writes reject foreign cards, accounts and participants without changing balances",
      async () => {
        const account = await api.account(owner);
        const card = await api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            accountId: account.id,
            name: "Private card",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000,
          }),
          201,
        );
        await api.expense(owner, {
          paymentMethod: "credit_card",
          cardId: card.id,
          accountId: null,
          amount: 50.01,
          invoicePeriod: "2020-01",
        });
        const path = `/invoices/${card.id}/2020-01`;
        const before = await (await api.request("/invoices?period=2020-01", owner)).text();
        const financialBefore = await snapshot();
        for (const [suffix, method, body] of [
          ["/dates", "PATCH", { closingDate: "2020-01-20", dueDate: "2020-01-25" }],
          ["/reopen", "POST", undefined],
          ["/adjustments", "POST", { amount: 20, date: "2020-01-15", personId: stranger.personId }],
          [
            "/payments",
            "POST",
            {
              accountId: foreignAccount.id,
              paidAt: "2020-01-20",
              allocations: [{ personId: stranger.personId, amount: 10 }],
            },
          ],
        ] as const)
          await api.error(await api.request(`${path}${suffix}`, stranger, method, body), 404);
        await api.error(
          await api.request(`${path}/payments`, owner, "POST", {
            accountId: foreignAccount.id,
            paidAt: "2020-01-20",
            allocations: [{ personId: owner.personId, amount: 10 }],
          }),
          404,
        );
        await api.error(
          await api.request(`${path}/payments`, owner, "POST", {
            accountId: account.id,
            paidAt: "2020-01-20",
            allocations: [{ personId: stranger.personId, amount: 10 }],
          }),
          400,
          "invalid_invoice_payment_amount",
        );
        assert.equal(await (await api.request("/invoices?period=2020-01", owner)).text(), before);
        assert.deepEqual(await snapshot(), financialBefore);
      },
    );

    await t.test(
      "a repeated full payment on a covered invoice is refused as a balance change and writes nothing",
      async () => {
        const account = await api.account(owner);
        const card = await api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            accountId: account.id,
            name: "Covered card",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000,
          }),
          201,
        );
        await api.expense(owner, {
          paymentMethod: "credit_card",
          cardId: card.id,
          accountId: null,
          amount: 50.01,
          invoicePeriod: "2020-01",
        });
        const path = `/invoices/${card.id}/2020-01`;
        const payment = {
          accountId: account.id,
          paidAt: "2020-01-20",
          allocations: [{ personId: owner.personId, amount: 50.01 }],
        };
        await api.data(await api.request(`${path}/payments`, owner, "POST", payment), 201);
        const before = await (await api.request("/invoices?period=2020-01", owner)).text();
        const financialBefore = await snapshot();
        await api.error(
          await api.request(`${path}/payments`, owner, "POST", payment),
          409,
          "invoice_payment_balance_changed",
        );
        assert.equal(await (await api.request("/invoices?period=2020-01", owner)).text(), before);
        assert.deepEqual(await snapshot(), financialBefore);
      },
    );

    await t.test(
      "copying a split expense preserves tags and responsibilities without changing the original",
      async () => {
        const tag = await api.data<{ id: string }>(
          await api.request("/tags", owner, "POST", { name: "Copy expense" }),
          201,
        );
        const guest = await api.data<{ id: string }>(
          await api.request("/people", owner, "POST", { name: "Copy guest" }),
          201,
        );
        const source = await api.expense(owner, {
          amount: 100.01,
          isSettled: false,
          tagIds: [tag.id],
          note: "Copy note",
          splitShares: [
            { personId: owner.personId, amount: 60.01 },
            { personId: guest.id, amount: 40 },
          ],
        });
        const before = await get(source.id);
        const copied = await api.data<TransactionOutput>(
          await api.request(`/transactions/${source.id}/copy`, owner, "POST"),
          201,
        );
        assert.notEqual(copied.id, source.id);
        assert.equal(copied.displayAmount, 100.01);
        assert.equal(copied.name, `${source.name} (cópia)`);
        const details = await get(copied.id);
        assert.deepEqual(details.tagIds, [tag.id]);
        assert.equal(details.note, "Copy note");
        assert.deepEqual(
          details.splitShares.map((share) => [share.personId, share.amount]).sort(),
          [
            [owner.personId, 60.01],
            [guest.id, 40],
          ].sort(),
        );
        assert.deepEqual(await get(source.id), before);
        const snapshotBeforeRejection = await snapshot();
        await api.error(
          await api.request(`/transactions/${source.id}/copy`, stranger, "POST"),
          404,
        );
        assert.deepEqual(await snapshot(), snapshotBeforeRejection);
      },
    );

    await t.test(
      "copying a recurring rule creates a new series without inheriting occurrence settlements",
      async () => {
        const tag = await api.data<{ id: string }>(
          await api.request("/tags", owner, "POST", { name: "Copy recurring" }),
          201,
        );
        const source = await api.expense(owner, {
          amount: 25.01,
          purchaseDate: "2026-10-01",
          condition: "recurring",
          recurrenceFrequency: "monthly",
          recurrenceEndDate: "2026-12-01",
          isSettled: false,
          tagIds: [tag.id],
        });
        await api.data(
          await api.request("/transactions/recurring-occurrences/settlement", owner, "PATCH", {
            recurringRuleId: source.recurringRuleId,
            purchaseDate: "2026-10-01",
            isSettled: true,
            settledDate: "2026-10-02",
            settledAmount: 24.99,
          }),
        );
        const originalRows = await snapshot();
        const copied = await api.data<TransactionOutput>(
          await api.request(
            `/transactions/recurring-rules/${source.recurringRuleId}/copy`,
            owner,
            "POST",
          ),
          201,
        );
        assert.ok(copied.recurringRuleId);
        assert.notEqual(copied.recurringRuleId, source.recurringRuleId);
        assert.equal(copied.displayAmount, 25.01);
        assert.equal(copied.isSettled, false);
        assert.deepEqual(copied.tagIds, [tag.id]);
        const rules = await db.select().from(recurringTransactionRules);
        const originalRule = rules.find((rule) => rule.id === source.recurringRuleId);
        const copyRule = rules.find((rule) => rule.id === copied.recurringRuleId);
        assert.ok(originalRule && copyRule);
        assert.notEqual(copyRule.seriesId, originalRule.seriesId);
        assert.equal(copyRule.recurrenceEndDate?.toISOString().slice(0, 10), "2026-12-01");
        const occurrences = await db.select().from(recurringTransactionOccurrences);
        assert.equal(
          occurrences.filter((row) => row.recurringSeriesId === copyRule.seriesId).length,
          0,
        );
        // Every old row remains byte-for-byte equal; the copy only adds a rule and its series links.
        const after = await snapshot();
        for (const [index, rows] of originalRows.entries()) {
          for (const row of rows) assert.ok(after[index].includes(row));
        }
        const beforeRejection = await snapshot();
        await api.error(
          await api.request(
            `/transactions/recurring-rules/${source.recurringRuleId}/copy`,
            stranger,
            "POST",
          ),
          404,
        );
        assert.deepEqual(await snapshot(), beforeRejection);
      },
    );

    await t.test(
      "copying any rounded installment preserves the purchase total in a separate series",
      async () => {
        const source = await api.expense(owner, {
          amount: 100.01,
          condition: "installment",
          installmentCount: 3,
          isSettled: false,
        });
        assert.ok(source.seriesId);
        const { findInstallmentSeriesByIdForUser } = await import(
          "./repositories/transactions.repository"
        );
        assert.deepEqual(await findInstallmentSeriesByIdForUser(source.seriesId, owner.id), {
          originalAmount: "100.01",
        });
        assert.equal(
          await findInstallmentSeriesByIdForUser(source.seriesId, stranger.id),
          undefined,
        );
        const original = (await Promise.all(["2020-01", "2020-02", "2020-03"].map(listing)))
          .flatMap((result) => result.items)
          .filter((item) => item.seriesId === source.seriesId);
        assert.deepEqual(
          original.map((item) => item.displayAmount),
          [33.34, 33.34, 33.33],
        );
        for (const item of [original[0], original[2]]) {
          const copy = await api.data<TransactionOutput>(
            await api.request(`/transactions/${item.id}/copy`, owner, "POST"),
            201,
          );
          assert.notEqual(copy.seriesId, source.seriesId);
          const copies = (await db.select().from(transactions)).filter(
            (row) => row.seriesId === copy.seriesId,
          );
          assert.equal(copies.length, 3);
          assert.equal(
            copies.reduce(
              (total, row) => total + Math.round(Math.abs(Number(row.amount)) * 100),
              0,
            ),
            10001,
          );
        }
        const originalAfter = (await db.select().from(transactions)).filter(
          (row) => row.seriesId === source.seriesId,
        );
        assert.equal(
          originalAfter.reduce(
            (total, row) => total + Math.round(Math.abs(Number(row.amount)) * 100),
            0,
          ),
          10001,
        );
      },
    );

    await t.test(
      "copying mixed-owner budgets preserves all existing limits and creates no target",
      async () => {
        const source = await api.data<{ id: string }>(
          await api.request("/budgets", owner, "POST", {
            categoryId: owner.expenseCategoryId,
            period: "2019-12",
            amount: 100.01,
          }),
          201,
        );
        const foreign = await api.data<{ id: string }>(
          await api.request("/budgets", stranger, "POST", {
            categoryId: stranger.expenseCategoryId,
            period: "2019-12",
            amount: 200.02,
          }),
          201,
        );
        await api.error(
          await api.request("/budgets/copy-previous", owner, "POST", {
            period: "2020-01",
            sourceBudgetIds: [source.id, foreign.id],
          }),
          400,
          "invalid_source_budgets",
        );
        const result = await api.data<{ items: unknown[] }>(
          await api.request("/budgets?period=2020-01", owner),
        );
        assert.deepEqual(result.items, []);
        const preserved = await api.data<{ amount: number }>(
          await api.request(`/budgets/${foreign.id}`, stranger),
        );
        assert.equal(preserved.amount, 200.02);
      },
    );
  });
});
