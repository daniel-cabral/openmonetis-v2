import assert from "node:assert/strict";
import test from "node:test";
import {
  getChangedTransactionInput,
  getDefaultTransactionFormValues,
  normalizeTransactionInput,
  resolveTransactionTripId,
  type TransactionFormValues,
  validateTransactionForm,
} from "./transaction-form.validation";

const paidBoleto = {
  type: "expense",
  condition: "single",
  paymentMethod: "boleto",
  name: "Conta de energia",
  amount: "100",
  purchaseDate: "2026-08-20",
  invoicePeriod: "",
  personId: "10000000-0000-4000-8000-000000000001",
  accountId: "20000000-0000-4000-8000-000000000002",
  cardId: "",
  categoryId: "30000000-0000-4000-8000-000000000003",
  sourceAccountId: "",
  destinationAccountId: "",
  dueDate: "2026-09-03",
  boletoPaymentDate: "2026-08-20",
  installmentCount: "2",
  startInstallment: "1",
  recurrenceFrequency: "monthly",
  recurrenceEndDate: "",
  dueDateRuleExcluded: false,
  recurrenceAnchorDate: "",
  isSettled: "true",
  note: "",
  splitShares: [],
  tagIds: [],
} satisfies TransactionFormValues;

test("recurrence deadlines are optional, inclusive and validated in the form", () => {
  const recurring: TransactionFormValues = {
    ...paidBoleto,
    condition: "recurring",
    paymentMethod: "pix",
    boletoPaymentDate: "",
    recurrenceEndDate: "2026-08-20",
  };
  assert.equal(validateTransactionForm({ value: recurring }), undefined);
  assert.equal(normalizeTransactionInput(recurring).recurrenceEndDate, "2026-08-20");
  assert.equal(
    normalizeTransactionInput({ ...recurring, recurrenceEndDate: "" }).recurrenceEndDate,
    null,
  );
  assert.ok(
    validateTransactionForm({ value: { ...recurring, recurrenceEndDate: "2026-08-19" } })?.fields
      .recurrenceEndDate,
  );
  assert.equal(
    normalizeTransactionInput({ ...paidBoleto, recurrenceEndDate: "2026-12-31" }).recurrenceEndDate,
    null,
  );
  assert.deepEqual(
    getChangedTransactionInput(
      normalizeTransactionInput({ ...recurring, recurrenceEndDate: "" }),
      { ...recurring, recurrenceEndDate: "" },
      recurring,
    ),
    { recurrenceEndDate: null },
  );
});

test("paid boleto form preserves a payment date before the due month", () => {
  const input = normalizeTransactionInput(paidBoleto);

  assert.equal(input.dueDate, "2026-09-03");
  assert.equal(input.boletoPaymentDate, "2026-08-20");
  assert.equal(validateTransactionForm({ value: paidBoleto }), undefined);
});

test("non-card expense forms retain optional due dates for payables, installments and recurring rules", () => {
  for (const paymentMethod of ["pix", "debit_card", "cash", "bank_transfer", "benefits"] as const) {
    for (const condition of ["single", "installment", "recurring"] as const) {
      const values: TransactionFormValues = {
        ...paidBoleto,
        paymentMethod,
        condition,
        isSettled: "false",
        boletoPaymentDate: "",
      };
      assert.equal(validateTransactionForm({ value: values }), undefined);
      assert.equal(normalizeTransactionInput(values).dueDate, "2026-09-03");
      assert.equal(normalizeTransactionInput({ ...values, dueDate: "" }).dueDate, null);
    }
  }
  assert.equal(
    normalizeTransactionInput({
      ...paidBoleto,
      paymentMethod: "credit_card",
      cardId: paidBoleto.accountId,
    }).dueDate,
    null,
  );
});

test("paid boleto form requires the effective payment date", () => {
  const validation = validateTransactionForm({
    value: { ...paidBoleto, boletoPaymentDate: "" },
  });

  assert.equal(validation?.fields.boletoPaymentDate, "Informe uma data de pagamento válida.");
});

test("new transactions start pending unless a caller provides another default", () => {
  assert.equal(getDefaultTransactionFormValues([], [], [], "expense").isSettled, "false");
  assert.equal(getDefaultTransactionFormValues([], [], [], "income").isSettled, "false");
  assert.equal(getDefaultTransactionFormValues([], [], [], "transfer").isSettled, "false");
  assert.equal(
    getDefaultTransactionFormValues([], [], [], "expense", undefined, { isSettled: "true" })
      .isSettled,
    "true",
  );
});

test("tag edits preserve unchanged scopes and send explicit removals", () => {
  const tagId = "40000000-0000-4000-8000-000000000004";
  const defaults = { ...paidBoleto, tagIds: [tagId] };
  const renamed = { ...defaults, name: "Conta renomeada" };
  const renamedInput = normalizeTransactionInput(renamed);
  assert.deepEqual(renamedInput.tagIds, [tagId]);
  assert.equal(getChangedTransactionInput(renamedInput, renamed, defaults).tagIds, undefined);
  const removed = { ...defaults, tagIds: [] };
  assert.deepEqual(
    getChangedTransactionInput(normalizeTransactionInput(removed), removed, defaults).tagIds,
    [],
  );
  assert.equal(
    validateTransactionForm({ value: { ...defaults, tagIds: [tagId, tagId] } })?.fields.tagIds,
    "Selecione até 20 etiquetas.",
  );
});

test("trip field suggests the trip for the purchase date until the user touches it", () => {
  const lisboa = "70000000-0000-4000-8000-000000000007";
  const porto = "80000000-0000-4000-8000-000000000008";
  const trips = [{ id: lisboa, startDate: "2026-05-12", endDate: "2026-05-22" }];
  const resolve = ({
    mode,
    origin = "regular",
    touched = false,
    type = "expense",
    purchaseDate = "2026-05-14",
    tripId = "",
  }: {
    mode: "create" | "edit" | "copy";
    origin?: "regular" | "invoicePayment";
    touched?: boolean;
    type?: "expense" | "transfer";
    purchaseDate?: string;
    tripId?: string;
  }) =>
    resolveTransactionTripId({
      mode,
      origin,
      touched,
      trips,
      value: { type, purchaseDate, tripId },
    });

  assert.equal(resolve({ mode: "create" }), lisboa);
  assert.equal(resolve({ mode: "copy" }), lisboa);
  assert.equal(resolve({ mode: "create", purchaseDate: "2026-06-01" }), "");
  assert.equal(resolve({ mode: "create", touched: true, tripId: porto }), porto);
  assert.equal(resolve({ mode: "create", touched: true, tripId: "" }), "");
  assert.equal(resolve({ mode: "edit", tripId: porto }), porto);
  assert.equal(resolve({ mode: "edit", tripId: "" }), "");
  assert.equal(resolve({ mode: "create", type: "transfer" }), "");
  assert.equal(resolve({ mode: "create", origin: "invoicePayment" }), "");
});

test("trip edits send tripId only when it differs from the stored link", () => {
  const lisboa = "70000000-0000-4000-8000-000000000007";
  const defaults = { ...paidBoleto, tripId: lisboa };
  const renamed = { ...defaults, name: "Conta renomeada" };
  assert.equal(
    getChangedTransactionInput(normalizeTransactionInput(renamed), renamed, defaults).tripId,
    undefined,
  );
  const unlinked = { ...defaults, tripId: "" };
  assert.equal(
    getChangedTransactionInput(normalizeTransactionInput(unlinked), unlinked, defaults).tripId,
    null,
  );
});
