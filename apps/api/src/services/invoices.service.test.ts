import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultCategoryDrafts,
  invoiceAdjustmentCategoryName,
} from "@openmonetis/domain/categories";
import type { ApiError } from "../utils/errors";
import { createInvoicesService, type InvoicesRepository } from "./invoices.service";

const userId = "10000000-0000-4000-8000-000000000001";
const cardId = "20000000-0000-4000-8000-000000000002";
const accountId = "30000000-0000-4000-8000-000000000003";
const adminPersonId = "40000000-0000-4000-8000-000000000004";
const externalPersonId = "50000000-0000-4000-8000-000000000005";
const paymentId = "60000000-0000-4000-8000-000000000006";

type PaymentDraft = Parameters<InvoicesRepository["insertPayment"]>[0];

test("default categories use one expense category for every invoice adjustment", () => {
  const categories = createDefaultCategoryDrafts(userId).filter(
    (category) => category.name === invoiceAdjustmentCategoryName,
  );

  assert.deepEqual(
    categories.map((category) => ({ type: category.type, isSystem: category.isSystem })),
    [{ type: "expense", isSystem: true }],
  );
});

function createRepository(
  onInsert: (data: PaymentDraft) => void,
  overrides: Partial<InvoicesRepository> = {},
): InvoicesRepository {
  return new Proxy(
    {
      listCards: async () => [
        {
          id: cardId,
          accountId,
          name: "Nubank",
          logo: null,
          closingDay: 5,
          closingRuleType: "fixedDay" as const,
          closingOffsetDays: null,
          closingOffsetMode: null,
          closingDayPurchasesNextInvoice: false,
          dueDay: 10,
        },
      ],
      listAccounts: async () => [{ id: accountId, name: "Conta principal", logo: null }],
      listMovements: async () => [
        {
          cardId,
          personId: adminPersonId,
          personName: "Pessoa principal",
          personAvatarUrl: null,
          personRole: "admin" as const,
          amount: "-1000.00",
        },
        {
          cardId,
          personId: externalPersonId,
          personName: "Pessoa externa",
          personAvatarUrl: null,
          personRole: "external" as const,
          amount: "-9999.99",
        },
      ],
      listRecurringMovements: async () => [],
      listPaymentAllocations: async () => [],
      listPayments: async () => [],
      listDates: async () => [],
      findOwnedContext: async (
        _userId: string,
        _cardId: string,
        requestedAccountId: string | null,
        personIds: string[],
      ) => ({
        card: { id: cardId, name: "Nubank" },
        account:
          requestedAccountId === accountId ? { id: accountId, name: "Conta principal" } : null,
        people: [
          { id: adminPersonId, name: "Pessoa principal" },
          { id: externalPersonId, name: "Pessoa externa" },
        ].filter((person) => personIds.includes(person.id)),
        adminPersonId,
        paymentCategoryId: "70000000-0000-4000-8000-000000000007",
      }),
      insertPayment: async (data: PaymentDraft) => {
        onInsert(data);
        return { id: paymentId };
      },
      ...overrides,
      ...({} as Pick<InvoicesRepository, never>),
    },
    {
      get(target, property) {
        if (property in target) return target[property as keyof typeof target];
        return async () => {
          throw new Error(`Unexpected repository call: ${String(property)}`);
        };
      },
    },
  ) as unknown as InvoicesRepository;
}

test("full invoice payment moves only the primary person's allocation", async () => {
  let inserted: PaymentDraft | undefined;
  const service = createInvoicesService(
    createRepository((data) => {
      inserted = data;
    }),
    () => "2026-09-04",
  );

  const result = await service.pay(
    cardId,
    "2026-09",
    {
      accountId,
      paidAt: "2026-09-04",
      allocations: [
        { personId: adminPersonId, amount: 1000 },
        { personId: externalPersonId, amount: 9999.99 },
      ],
    },
    userId,
  );

  assert.equal(inserted?.amount, 10999.99);
  assert.equal(inserted?.adminAmount, 1000);
  assert.equal(inserted?.accountId, accountId);
  assert.deepEqual(result, {
    id: paymentId,
    amount: 10999.99,
    accountAmount: 1000,
    remainingAmount: 0,
    status: "paid",
  });
});

test("external person's payment does not require or move an account", async () => {
  let inserted: PaymentDraft | undefined;
  const service = createInvoicesService(
    createRepository((data) => {
      inserted = data;
    }),
    () => "2026-09-04",
  );

  const result = await service.pay(
    cardId,
    "2026-09",
    {
      accountId: null,
      paidAt: "2026-09-04",
      allocations: [{ personId: externalPersonId, amount: 9999.99 }],
    },
    userId,
  );

  assert.equal(inserted?.adminAmount, 0);
  assert.equal(inserted?.accountId, null);
  assert.equal(result.accountAmount, 0);
  assert.equal(result.remainingAmount, 1000);
  assert.notEqual(result.status, "paid");
});

test("primary person's payment requires a financial account", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined),
    () => "2026-09-04",
  );

  await assert.rejects(
    service.pay(
      cardId,
      "2026-09",
      {
        accountId: null,
        paidAt: "2026-09-04",
        allocations: [{ personId: adminPersonId, amount: 500 }],
      },
      userId,
    ),
    (error: ApiError) => error.code === "invoice_payment_account_required" && error.status === 400,
  );
});

test("invoice reduction is an expense adjustment assigned entirely to the selected person", async () => {
  let inserted: Parameters<InvoicesRepository["insertAdjustment"]>[0] | undefined;
  const adjustmentId = "80000000-0000-4000-8000-000000000008";
  const categoryId = "70000000-0000-4000-8000-000000000007";
  const service = createInvoicesService(
    createRepository(() => undefined, {
      findAdjustmentContext: async (_userId, _cardId, personId) => ({
        card: { id: cardId, name: "Nubank" },
        personId,
        categoryId,
      }),
      insertAdjustment: async (data) => {
        inserted = data;
        return { id: adjustmentId };
      },
    }),
    () => "2026-09-04",
  );

  const result = await service.adjust(
    cardId,
    "2026-09",
    { amount: 10989.99, date: "2026-09-04", personId: externalPersonId },
    userId,
  );

  assert.equal(inserted?.personId, externalPersonId);
  assert.equal(inserted?.categoryId, categoryId);
  assert.equal(inserted?.amount, "10.00");
  assert.equal(inserted?.type, "expense");
  assert.equal(result.id, adjustmentId);
});

test("paid invoice must be reopened before it can be adjusted", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined, {
      listPayments: async () => [{ id: paymentId, cardId, amount: "100.00", paidAt: "2026-09-03" }],
    }),
    () => "2026-09-04",
  );

  await assert.rejects(
    service.adjust(
      cardId,
      "2026-09",
      { amount: 11009.99, date: "2026-09-04", personId: externalPersonId },
      userId,
    ),
    (error: ApiError) => error.code === "invoice_requires_reopen" && error.status === 409,
  );
});

test("invoice reduction cannot exceed the selected person's amount", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined, {
      findAdjustmentContext: async () => ({
        card: { id: cardId, name: "Nubank" },
        personId: adminPersonId,
        categoryId: "70000000-0000-4000-8000-000000000007",
      }),
    }),
    () => "2026-09-04",
  );

  await assert.rejects(
    service.adjust(
      cardId,
      "2026-09",
      { amount: 8999.99, date: "2026-09-04", personId: adminPersonId },
      userId,
    ),
    (error: ApiError) =>
      error.code === "invoice_adjustment_exceeds_person_amount" && error.status === 400,
  );
});

test("reopening an invoice delegates reversal of every payment", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined, {
      reopenInvoice: async () => ({ reversedPaymentCount: 2, reversedAmount: 750 }),
    }),
  );

  assert.deepEqual(await service.reopen(cardId, "2026-09", userId), {
    reversedPaymentCount: 2,
    reversedAmount: 750,
  });
});

test("undoing an invoice payment scopes every identifier and returns its decimal amount", async () => {
  const calls: unknown[][] = [];
  const service = createInvoicesService(
    createRepository(() => undefined, {
      deletePayment: async (...args) => {
        calls.push(args);
        return { id: paymentId, amount: "25.01" };
      },
    }),
  );
  assert.deepEqual(await service.undo(cardId, "2026-09", paymentId, userId), {
    id: paymentId,
    amount: 25.01,
  });
  assert.deepEqual(calls, [[userId, cardId, "2026-09", paymentId]]);
});

test("a missing, unowned or already reversed payment returns not found", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined, { deletePayment: async () => null }),
  );
  await assert.rejects(service.undo(cardId, "2026-09", paymentId, userId), {
    status: 404,
    code: "invoice_payment_not_found",
  });
});

for (const outcome of ["deleted", "has_payments", "not_found"] as const) {
  test(`removing an invoice adjustment translates ${outcome} without requesting another mutation`, async () => {
    const calls: unknown[][] = [];
    const service = createInvoicesService(
      createRepository(() => undefined, {
        deleteAdjustment: async (...args) => {
          calls.push(args);
          return outcome;
        },
      }),
    );
    if (outcome === "deleted")
      assert.deepEqual(await service.removeAdjustment(cardId, "2026-09", paymentId, userId), {
        id: paymentId,
      });
    else
      await assert.rejects(service.removeAdjustment(cardId, "2026-09", paymentId, userId), {
        status: outcome === "has_payments" ? 409 : 404,
        code:
          outcome === "has_payments" ? "invoice_requires_reopen" : "invoice_adjustment_not_found",
      });
    assert.deepEqual(calls, [[userId, cardId, "2026-09", paymentId]]);
  });
}

const changedDates = { closingDate: "2026-09-05", dueDate: "2026-09-12" };

for (const [allocations, code, status] of [
  [[{ personId: adminPersonId, amount: 1000.01 }], "invoice_payment_balance_changed", 409],
  [[{ personId: adminPersonId, amount: 0 }], "invalid_invoice_payment_amount", 400],
  [[{ personId: "unowned", amount: 1 }], "invalid_invoice_payment_amount", 400],
  [
    [
      { personId: adminPersonId, amount: 1 },
      { personId: adminPersonId, amount: 1 },
    ],
    "invalid_invoice_payment_amount",
    400,
  ],
] as Array<[{ personId: string; amount: number }[], string, number]>) {
  test(`invalid invoice allocations reject before ownership lookup and writes: ${JSON.stringify(allocations)}`, async () => {
    const service = createInvoicesService(
      createRepository(() => assert.fail("Unexpected payment write"), {
        findOwnedContext: async () => {
          throw new Error("Unexpected ownership lookup");
        },
      }),
    );
    await assert.rejects(
      service.pay(cardId, "2026-09", { accountId, paidAt: "2026-09-10", allocations }, userId),
      { code, status },
    );
  });
}

test("invoice snapshot reports credit lines as already covered without changing the open balance", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined, {
      listMovements: async () => [
        {
          cardId,
          personId: adminPersonId,
          personName: "Pessoa principal",
          personAvatarUrl: null,
          personRole: "admin" as const,
          amount: "-100.00",
          origin: null,
        },
        {
          cardId,
          personId: adminPersonId,
          personName: "Pessoa principal",
          personAvatarUrl: null,
          personRole: "admin" as const,
          amount: "30.00",
          origin: "invoiceCredit" as const,
        },
      ],
    }),
  );
  const [invoice] = (await service.get("2026-09", userId)).items;
  assert.deepEqual(
    {
      amount: invoice?.amount,
      creditAmount: invoice?.creditAmount,
      remainingAmount: invoice?.remainingAmount,
    },
    { amount: 70, creditAmount: 30, remainingAmount: 70 },
  );
});

for (const [label, patch, code] of [
  ["card", { card: null }, "card_not_found"],
  ["primary person", { adminPersonId: null }, "person_not_found"],
  ["participant", { people: [] }, "person_not_found"],
  ["account", { account: null }, "account_not_found"],
  ["category", { paymentCategoryId: null }, "payment_category_not_found"],
] as Array<
  [string, Partial<Awaited<ReturnType<InvoicesRepository["findOwnedContext"]>>>, string]
>) {
  test(`invoice payment rejects unavailable ${label} before writing`, async () => {
    const repo = createRepository(() => assert.fail("Unexpected payment write"));
    const find = repo.findOwnedContext;
    repo.findOwnedContext = async (...args) => ({ ...(await find(...args)), ...patch });
    const service = createInvoicesService(repo);
    await assert.rejects(
      service.pay(
        cardId,
        "2026-09",
        {
          accountId,
          paidAt: "2026-09-10",
          allocations: [{ personId: adminPersonId, amount: 100 }],
        },
        userId,
      ),
      { code },
    );
  });
}

test("invoice payment detects a concurrent payment without retrying the write", async () => {
  let writes = 0;
  const service = createInvoicesService(
    createRepository(() => undefined, {
      insertPayment: async () => {
        writes++;
        return null;
      },
    }),
  );
  await assert.rejects(
    service.pay(
      cardId,
      "2026-09",
      {
        accountId,
        paidAt: "2026-09-10",
        allocations: [{ personId: adminPersonId, amount: 100 }],
      },
      userId,
    ),
    { status: 409, code: "invoice_payment_conflict" },
  );
  assert.equal(writes, 1);
});

for (const [date, code] of [
  ["2999-01-01", "invoice_adjustment_date_future"],
  ["2026-08-31", "invalid_invoice_adjustment_date"],
]) {
  test(`invoice adjustment rejects invalid date ${date} without reading or writing`, async () => {
    const service = createInvoicesService(
      createRepository(() => undefined, {
        listCards: async () => {
          throw new Error("Unexpected repository read");
        },
      }),
      () => "2026-10-20",
    );
    await assert.rejects(
      service.adjust(cardId, "2026-09", { date, amount: 100, personId: adminPersonId }, userId),
      { code },
    );
  });
}

test("unchanged invoice total returns a no-op without persisting an adjustment", async () => {
  const service = createInvoicesService(createRepository(() => undefined));
  assert.deepEqual(
    await service.adjust(
      cardId,
      "2026-09",
      {
        date: "2026-09-10",
        amount: 10999.99,
        personId: adminPersonId,
      },
      userId,
    ),
    {
      id: null,
      previousAmount: 10999.99,
      currentAmount: 10999.99,
      adjustmentAmount: 0,
      type: null,
    },
  );
});

for (const [label, patch, code] of [
  ["card", { card: null }, "card_not_found"],
  ["person", { personId: null }, "person_not_found"],
  ["category", { categoryId: null }, "invoice_adjustment_category_not_found"],
] as const) {
  test(`invoice adjustment rejects missing ${label}`, async () => {
    const service = createInvoicesService(
      createRepository(() => undefined, {
        findAdjustmentContext: async () => ({
          card: { id: cardId, name: "Card" },
          personId: adminPersonId,
          categoryId: "category",
          ...patch,
        }),
      }),
    );
    await assert.rejects(
      service.adjust(
        cardId,
        "2026-09",
        {
          date: "2026-09-10",
          amount: 11000,
          personId: adminPersonId,
        },
        userId,
      ),
      { code },
    );
  });
}

test("an allocation recorded without payment rows still prevents reducing below the paid total", async () => {
  const service = createInvoicesService(
    createRepository(() => undefined, {
      listPaymentAllocations: async () => [{ cardId, personId: adminPersonId, amount: "500.00" }],
    }),
  );
  await assert.rejects(
    service.adjust(
      cardId,
      "2026-09",
      {
        date: "2026-09-10",
        amount: 499.99,
        personId: adminPersonId,
      },
      userId,
    ),
    { code: "invoice_adjustment_below_paid_amount" },
  );
});

test("invoice adjustment handles a payment registered between the snapshot and insertion", async () => {
  const drafts: Parameters<InvoicesRepository["insertAdjustment"]>[0][] = [];
  const service = createInvoicesService(
    createRepository(() => undefined, {
      findAdjustmentContext: async () => ({
        card: { id: cardId, name: "Card" },
        personId: adminPersonId,
        categoryId: "category",
      }),
      insertAdjustment: async (draft) => {
        drafts.push(draft);
        return null;
      },
    }),
  );
  await assert.rejects(
    service.adjust(
      cardId,
      "2026-09",
      {
        date: "2026-09-10",
        amount: 11000,
        personId: adminPersonId,
      },
      userId,
    ),
    { status: 409, code: "invoice_requires_reopen" },
  );
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].amount, "-0.01");
  assert.equal(drafts[0].userId, userId);
});

test("recurring card purchases enter only their derived invoice through their inclusive end date", async () => {
  const repo = createRepository(() => undefined, {
    listMovements: async () => [],
    listRecurringMovements: async (owner, end) => {
      assert.equal(owner, userId);
      assert.ok(end instanceof Date);
      return [
        {
          cardId,
          personId: adminPersonId,
          personName: "Owner",
          personAvatarUrl: null,
          personRole: "admin",
          amount: "-75.01",
          anchorDate: "2026-08-20",
          startDate: "2026-08-20",
          endDate: "2026-09-20",
          frequency: "monthly",
          paymentMethod: "credit_card",
          dueDate: null,
          closingDay: 5,
          closingRuleType: "fixedDay",
          closingOffsetDays: null,
          closingOffsetMode: null,
          closingDayPurchasesNextInvoice: false,
          dueDay: 10,
        },
      ];
    },
  });
  const service = createInvoicesService(repo, () => "2026-10-20");
  for (const period of ["2026-09", "2026-10"]) {
    const snapshot = await service.get(period, userId);
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].amount, 75.01);
  }
  assert.equal((await service.get("2026-11", userId)).items.length, 0);
});

for (const operation of ["get", "pay", "adjust", "reopen"] as const) {
  test(`invoice ${operation} propagates an I/O failure without retry`, async () => {
    const failure = new Error("Database unavailable");
    let attempts = 0;
    const fail = async () => {
      attempts++;
      throw failure;
    };
    const service = createInvoicesService(
      createRepository(() => undefined, {
        ...(operation === "get" ? { listMovements: fail } : {}),
        insertPayment: fail,
        insertAdjustment: fail,
        reopenInvoice: fail,
        findAdjustmentContext: async () => ({
          card: { id: cardId, name: "Card" },
          personId: adminPersonId,
          categoryId: "category",
        }),
      }),
    );
    const result =
      operation === "get"
        ? service.get("2026-09", userId)
        : operation === "pay"
          ? service.pay(
              cardId,
              "2026-09",
              {
                accountId,
                paidAt: "2026-09-10",
                allocations: [{ personId: adminPersonId, amount: 1 }],
              },
              userId,
            )
          : operation === "adjust"
            ? service.adjust(
                cardId,
                "2026-09",
                { date: "2026-09-10", amount: 11000, personId: adminPersonId },
                userId,
              )
            : service.reopen(cardId, "2026-09", userId);
    await assert.rejects(result, (error) => error === failure);
    assert.equal(attempts, 1);
  });
}
test("invoice date changes apply the domain guard to the locked persistence state", async () => {
  const drafts: Parameters<InvoicesRepository["upsertDates"]>[0][] = [];
  const service = createInvoicesService(
    createRepository(() => undefined, {
      upsertDates: async (draft, assertEditable) => {
        assertEditable({
          target: "invoice",
          isSettled: false,
          hasPayments: false,
          datesCustomized: false,
        });
        drafts.push(draft);
        return true;
      },
    }),
  );
  assert.deepEqual(
    await service.updateDates(cardId, "2026-09", changedDates, userId),
    changedDates,
  );
  assert.deepEqual(drafts, [{ userId, cardId, period: "2026-09", ...changedDates }]);
});

for (const state of [
  { isSettled: true },
  { isSettled: false, hasPayments: true },
  { isSettled: false, datesCustomized: true },
]) {
  test(`invoice date changes reject a locked state ${JSON.stringify(state)}`, async () => {
    let committed = false;
    const service = createInvoicesService(
      createRepository(() => undefined, {
        upsertDates: async (_draft, assertEditable) => {
          assertEditable({ target: "invoice", ...state });
          committed = true;
          return true;
        },
      }),
    );
    await assert.rejects(service.updateDates(cardId, "2026-09", changedDates, userId), {
      status: 409,
      code: state.datesCustomized
        ? "DUE_DATE_EXCEPTION_CUSTOM_DATES"
        : "DUE_DATE_EXCEPTION_SETTLED",
    });
    assert.equal(committed, false);
  });
}

for (const dueDate of ["2026-09-04", "2026-09-05"]) {
  test(`invoice dates with due date ${dueDate} reject before persistence`, async () => {
    const service = createInvoicesService(createRepository(() => undefined));
    await assert.rejects(
      service.updateDates(cardId, "2026-09", { ...changedDates, dueDate }, userId),
      { status: 400, code: "invalid_invoice_dates" },
    );
  });
}

for (const missingAt of ["ownership", "write"] as const) {
  test(`invoice dates reject a card missing at ${missingAt}`, async () => {
    let writes = 0;
    const service = createInvoicesService(
      createRepository(() => undefined, {
        ...(missingAt === "ownership" ? { listCards: async () => [] } : {}),
        upsertDates: async () => {
          writes++;
          return false;
        },
      }),
    );
    await assert.rejects(service.updateDates(cardId, "2026-09", changedDates, userId), {
      status: 404,
      code: "card_not_found",
    });
    assert.equal(writes, missingAt === "ownership" ? 0 : 1);
  });
}

for (const operation of ["undo", "removeAdjustment", "updateDates"] as const) {
  test(`invoice ${operation} propagates persistence failures with no retries`, async () => {
    const failure = new Error("Database unavailable");
    let calls = 0;
    const reject = async () => {
      calls++;
      throw failure;
    };
    const service = createInvoicesService(
      createRepository(() => undefined, {
        deletePayment: reject,
        deleteAdjustment: reject,
        upsertDates: reject,
      }),
    );
    const result =
      operation === "undo"
        ? service.undo(cardId, "2026-09", paymentId, userId)
        : operation === "removeAdjustment"
          ? service.removeAdjustment(cardId, "2026-09", paymentId, userId)
          : service.updateDates(cardId, "2026-09", changedDates, userId);
    await assert.rejects(result, (error) => error === failure);
    assert.equal(calls, 1);
  });
}
