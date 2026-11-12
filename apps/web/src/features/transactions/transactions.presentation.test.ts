import assert from "node:assert/strict";
import test from "node:test";
import {
  describeBulkTransactionAction,
  formatBulkTransactionResult,
  formatDate,
  formatImportInvalidLines,
  formatInstallmentOption,
  formatPaymentMethod,
  formatPaymentMethodTable,
  formatTransactionConditionSummary,
  formatTransactionSettlementSummary,
  getBulkUpdateErrorMessage,
  getMassAddErrorMessage,
  getTransactionDateLabel,
  getTransactionImportErrorMessage,
  getTransactionMutationErrorMessage,
  getTransactionSettlementAction,
  getTransactionSettlementLabel,
  groupTransactionRows,
  labelTransactionExportFileName,
  selectBulkTransactionIds,
  validateTransactionsSearch,
} from "./transactions.presentation";

test("balance adjustments identify their internal balance correction", () => {
  assert.equal(formatPaymentMethod(null, "accountBalanceAdjustment"), "Ajuste de saldo");
  assert.equal(formatPaymentMethodTable(null, "accountBalanceAdjustment"), "Ajuste de saldo");
  assert.equal(formatPaymentMethod(null), "Não se aplica");
});

test("installment labels do not hide cent redistribution", () => {
  assert.equal(
    formatInstallmentOption(2, { count: 2, minimumAmount: 1.5, maximumAmount: 1.5 }),
    "2x de R$\u00a01,50",
  );
  assert.equal(
    formatInstallmentOption(7, { count: 7, minimumAmount: 0.42, maximumAmount: 0.43 }),
    "7 parcelas · de R$\u00a00,42 a R$\u00a00,43",
  );
  assert.equal(formatInstallmentOption(7), "7x");
});

test("transaction dates describe their financial meaning", () => {
  assert.equal(getTransactionDateLabel("expense", "single"), "Data da compra");
  assert.equal(getTransactionDateLabel("income", "single"), "Data do recebimento");
  assert.equal(getTransactionDateLabel("transfer", "single"), "Data da transferência");
  assert.equal(getTransactionDateLabel("expense", "recurring"), "Início da recorrência");
});

test("split rows connect by record identity, preserving every visible share", () => {
  const share = (id: string, recordId: string | null, date = "2026-09-05") => ({
    id,
    recordId,
    purchaseDate: date,
    recurringRuleId: null as string | null,
    isDivided: true,
    allocation: { personId: id, personName: id, personAvatarUrl: null, amount: -10 },
  });
  const first = share("first", "purchase");
  const unrelated = share("other", "different-purchase");
  const second = share("second", "purchase");
  const third = share("third", "purchase");
  const input = [first, unrelated, second, third];
  assert.deepEqual(
    groupTransactionRows(input).map(({ transaction, splitConnector }) => [
      transaction.id,
      splitConnector,
    ]),
    [
      ["first", "start"],
      ["second", "middle"],
      ["third", "end"],
      ["other", null],
    ],
  );
  assert.deepEqual(input, [first, unrelated, second, third]);
  assert.equal(groupTransactionRows([second])[0].splitConnector, null);
  assert.deepEqual(
    groupTransactionRows([
      { ...share("a", null), recurringRuleId: "rule" },
      { ...share("b", null, "2026-09-12"), recurringRuleId: "rule" },
      { ...share("c", null), recurringRuleId: "rule" },
    ]).map(({ transaction, splitConnector }) => [transaction.id, splitConnector]),
    [
      ["a", "start"],
      ["c", "end"],
      ["b", null],
    ],
  );
  assert.deepEqual(groupTransactionRows([]), []);
});

test("settlement copy distinguishes receipts, payments and invoice-controlled amounts", () => {
  assert.equal(
    getTransactionSettlementLabel({ type: "income", isSettled: true, paymentMethod: "pix" }),
    "Recebido",
  );
  assert.equal(
    getTransactionSettlementAction({ type: "income", isSettled: false }),
    "Registrar recebimento",
  );
  assert.equal(
    getTransactionSettlementLabel({
      type: "expense",
      isSettled: null,
      paymentMethod: "credit_card",
    }),
    "Pagamento pela fatura",
  );
  assert.equal(
    getTransactionSettlementLabel({ type: "expense", isSettled: false, paymentMethod: "pix" }),
    "Em aberto",
  );
  assert.equal(
    getTransactionSettlementAction({ type: "transfer", isSettled: false }),
    "Confirmar transferência",
  );
  assert.equal(
    validateTransactionsSearch({ settlement: "invoice", sort: "dueDate" }).settlement,
    "invoice",
  );
  assert.equal(validateTransactionsSearch({ sort: "invalid" }).sort, undefined);
});

test("tag filters keep stable identifiers when labels are renamed or deleted", () => {
  const id = "a0000000-0000-4000-8000-000000000001";
  assert.equal(validateTransactionsSearch({ tags: `${id},${id.toUpperCase()}` }).tags, id);
  assert.equal(validateTransactionsSearch({ tags: "viagem" }).tags, undefined);
  assert.equal(validateTransactionsSearch({ tags: "" }).tags, undefined);
});
test("untagged URL filters normalize booleans and clear conflicting tag selections", () => {
  const id = "a0000000-0000-4000-8000-000000000001";
  assert.equal(validateTransactionsSearch({ withoutTags: "true", tags: id }).tags, undefined);
  assert.equal(validateTransactionsSearch({ withoutTags: "true" }).withoutTags, true);
  assert.equal(validateTransactionsSearch({ withoutTags: true }).withoutTags, true);
  assert.equal(validateTransactionsSearch({ withoutTags: "false", tags: id }).tags, id);
  assert.equal(validateTransactionsSearch({ withoutTags: "false" }).withoutTags, undefined);
});

test("details summary describes settlement date and condition progress", () => {
  assert.equal(
    formatTransactionSettlementSummary({
      type: "income",
      isSettled: true,
      paymentMethod: "pix",
      settledDate: "2026-10-12",
      dueDate: null,
    }),
    `Recebido em ${formatDate("2026-10-12")}`,
  );
  assert.equal(
    formatTransactionSettlementSummary({
      type: "expense",
      isSettled: false,
      paymentMethod: "boleto",
      settledDate: null,
      dueDate: "2026-11-05",
    }),
    `Em aberto · vence em ${formatDate("2026-11-05")}`,
  );
  assert.equal(
    formatTransactionSettlementSummary({
      type: "expense",
      isSettled: true,
      paymentMethod: "credit_card",
      settledDate: "2026-10-12",
      dueDate: null,
    }),
    "Pagamento pela fatura",
  );
  assert.equal(
    formatTransactionConditionSummary({
      condition: "installment",
      currentInstallment: 3,
      installmentCount: 10,
      recurrenceFrequency: null,
    }),
    "Parcela 3 de 10",
  );
  assert.equal(
    formatTransactionConditionSummary({
      condition: "recurring",
      currentInstallment: null,
      installmentCount: null,
      recurrenceFrequency: "monthly",
    }),
    "Recorrente · Mensal",
  );
  assert.equal(
    formatTransactionConditionSummary({
      condition: "single",
      currentInstallment: null,
      installmentCount: null,
      recurrenceFrequency: null,
    }),
    "Única",
  );
});

test("bulk selection collapses split shares and skips recurring occurrences", () => {
  const row = (id: string, recordId: string | null, patch: Record<string, unknown> = {}) =>
    ({
      id,
      recordId,
      origin: "regular",
      type: "expense",
      paymentMethod: "pix",
      cardId: null,
      isSettled: false,
      refundedAmount: 0,
      ...patch,
    }) as unknown as Parameters<typeof selectBulkTransactionIds>[0][number];
  const selection = selectBulkTransactionIds(
    [
      row("a:1", "a"),
      row("a:2", "a"),
      row("rule:2026-10-01", null),
      row("b", "b", { origin: "personSettlement" }),
    ],
    (target) => target.origin === "regular",
  );

  assert.deepEqual(selection.ids, ["a"]);
  assert.equal(selection.skippedCount, 2);
  assert.deepEqual(formatBulkTransactionResult("deleted", selection), {
    title: "1 lançamento removido",
    description: "2 ignorados: recorrentes, gerados pelo sistema ou incompatíveis com a ação.",
  });
  assert.equal(
    formatBulkTransactionResult("linked", selection).title,
    "1 lançamento vinculado à viagem",
  );
  assert.equal(formatBulkTransactionResult("unlinked", selection).title, "1 lançamento sem viagem");
});

test("bulk action hints show partial reach and why an action is unavailable", () => {
  assert.equal(
    describeBulkTransactionAction("settle", { count: 5, total: 5 }).hint,
    "Marcar como pago",
  );
  assert.equal(
    describeBulkTransactionAction("settle", { count: 3, total: 5 }).hint,
    "Marcar como pago · 3 de 5",
  );
  const unavailable = describeBulkTransactionAction("unsettle", { count: 0, total: 2 });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.hint, "Marcar em aberto · nenhum selecionado está pago");
});

test("transaction export file names include the scoped label as a slug", () => {
  assert.equal(
    labelTransactionExportFileName("lancamentos-2026-11.xlsx", "João da Silva"),
    "lancamentos-joao-da-silva-2026-11.xlsx",
  );
  assert.equal(
    labelTransactionExportFileName("lancamentos-2026-11.csv"),
    "lancamentos-2026-11.csv",
  );
  assert.equal(
    labelTransactionExportFileName("lancamentos-2026-11.csv", "!!!"),
    "lancamentos-2026-11.csv",
  );
});

test("skipped CSV lines are summarized in PT-BR grouped by reason with their file line numbers", () => {
  assert.equal(formatImportInvalidLines([]), null);
  assert.equal(
    formatImportInvalidLines([{ lineNumber: 3, reason: "invalid_date" }]),
    "1 linha ignorada (linha 3: data inválida)",
  );
  assert.equal(
    formatImportInvalidLines([
      { lineNumber: 3, reason: "invalid_date" },
      { lineNumber: 4, reason: "invalid_amount" },
      { lineNumber: 9, reason: "invalid_date" },
    ]),
    "3 linhas ignoradas (linhas 3, 9: data inválida / 4: valor inválido)",
  );
});

test("import error codes map to actionable copy, and unknown codes keep the unreadable-file fallback", () => {
  assert.equal(
    getTransactionImportErrorMessage({ code: "IMPORT_XLS_BINARY_NOT_SUPPORTED" }),
    "Arquivos .xls antigos (Excel 97-2003) não são suportados. Salve como .xlsx.",
  );
  assert.equal(getTransactionImportErrorMessage({ code: "IMPORT_FILE_INVALID" }), null);
  assert.equal(getTransactionImportErrorMessage(new Error("network")), null);
});

test("mass-add and bulk-edit errors use their own copy while other screens keep the generic text", () => {
  assert.equal(
    getMassAddErrorMessage({ code: "CATEGORY_NOT_FOUND" }),
    "Categoria não encontrada em uma das transações.",
  );
  assert.equal(
    getMassAddErrorMessage({ code: "PERSON_NOT_FOUND" }),
    "Pessoa não encontrada em uma das transações.",
  );
  assert.equal(
    getBulkUpdateErrorMessage({ code: "BULK_ACTION_UNSUPPORTED" }),
    "Lançamentos protegidos não podem ser atualizados em massa.",
  );
  assert.equal(
    getBulkUpdateErrorMessage({ code: "INVOICE_ALREADY_PAID" }),
    "Uma das faturas de destino já está paga. Desfaça o pagamento antes de mover estes lançamentos.",
  );
  assert.equal(
    getBulkUpdateErrorMessage({ code: "SETTLEMENT_REQUIRES_UNDO" }),
    "Desfaça a baixa dos lançamentos pagos antes de alterar valores, datas, pessoa, conta ou cartão.",
  );
  assert.equal(
    getBulkUpdateErrorMessage({ code: "BULK_UPDATE_RECURRING" }),
    "Lançamentos recorrentes devem ser editados individualmente.",
  );
  assert.equal(
    getBulkUpdateErrorMessage({ code: "BULK_UPDATE_SPLIT_PERSON" }),
    "Lançamentos divididos não podem trocar de pessoa em massa.",
  );
  assert.equal(
    getTransactionMutationErrorMessage({ code: "INVOICE_ALREADY_PAID" }),
    "A fatura selecionada já foi paga. Escolha outra fatura.",
  );
});
