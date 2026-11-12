import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import { fromCents, toCents } from "@openmonetis/domain/money";
import { normalizeTransactionAmount, type TransactionType } from "@openmonetis/domain/transactions";
import { v2Id } from "../ids";
import type { Finding, IdMapRow, InsertBatch, V1Invoice, V1Transaction } from "../types";
import { PAYMENT_METHOD_MAP } from "./amounts";
import type { CatalogRefs } from "./catalog";

export type Marker =
  | { kind: "invoicePayment"; cardId: string; period: string; partialId: string | null }
  | { kind: "invoiceCredit"; cardId: string; period: string }
  | { kind: "refund"; sourceId: string };

type BuildResult = { batches: InsertBatch[]; idMap: IdMapRow[] };

const INVOICE_PREFIX = "AUTO_FATURA:";
const CREDIT_PREFIX = "AUTO_FATURA:CREDITO:";
const REFUND_PREFIX = "AUTO_REEMBOLSO:";
const TRANSACTIONS_TABLE = "lancamentos";

export function parseMarker(note: string | null): Marker | null {
  if (note === null) return null;
  if (note.startsWith(CREDIT_PREFIX)) {
    const [cardId, period] = note.slice(CREDIT_PREFIX.length).split(":");
    return cardId && period ? { kind: "invoiceCredit", cardId, period } : null;
  }
  if (note.startsWith(INVOICE_PREFIX)) {
    const [cardId, period, partialId] = note.slice(INVOICE_PREFIX.length).split(":");
    return cardId && period
      ? { kind: "invoicePayment", cardId, period, partialId: partialId || null }
      : null;
  }
  if (note.startsWith(REFUND_PREFIX)) {
    const sourceId = note.slice(REFUND_PREFIX.length);
    return sourceId ? { kind: "refund", sourceId } : null;
  }
  return null;
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function absoluteAmount(valor: string): number {
  return fromCents(Math.abs(toCents(Number(valor))));
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`v1-etl: unmapped ${what}`);
  return value;
}

function personFor(row: V1Transaction, refs: CatalogRefs): string {
  return row.pagador_id === null
    ? refs.adminPersonId
    : required(refs.personByPayer.get(row.pagador_id), "payer");
}

function categoryFor(row: V1Transaction, refs: CatalogRefs): string | null {
  if (row.subcategoria_id !== null) {
    return required(refs.childBySubcategory.get(row.subcategoria_id), "subcategory");
  }
  if (row.categoria_id === null) return null;
  return required(refs.categoryByV1.get(row.categoria_id), "category");
}

function accountFor(row: V1Transaction, refs: CatalogRefs): string | null {
  return row.conta_id === null ? null : required(refs.accountByV1.get(row.conta_id), "account");
}

function transactionRow(
  row: V1Transaction,
  refs: CatalogRefs,
  fields: {
    type: TransactionType;
    origin: "invoicePayment" | "invoiceCredit" | "refund";
    period: string;
    cardId: string | null;
    categoryId: string | null;
    isSettled: boolean | null;
  },
): Record<string, unknown> {
  return {
    id: v2Id(TRANSACTIONS_TABLE, row.id),
    userId: refs.userId,
    personId: personFor(row, refs),
    type: fields.type,
    origin: fields.origin,
    condition: "single",
    paymentMethod: PAYMENT_METHOD_MAP[row.forma_pagamento] ?? null,
    name: row.nome,
    amount: normalizeTransactionAmount(fields.type, absoluteAmount(row.valor)).toFixed(2),
    purchaseDate: toDate(row.data_compra),
    period: fields.period,
    accountId: accountFor(row, refs),
    cardId: fields.cardId,
    categoryId: fields.categoryId,
    sourceAccountId: null,
    destinationAccountId: null,
    dueDate: row.data_vencimento === null ? null : toDate(row.data_vencimento),
    boletoPaymentDate: row.dt_pagamento_boleto === null ? null : toDate(row.dt_pagamento_boleto),
    installmentCount: null,
    currentInstallment: null,
    seriesId: null,
    transferId: null,
    recurringRuleId: null,
    isSettled: fields.isSettled,
    note: null,
    createdAt: row.created_at,
  };
}

function idMapRow(row: V1Transaction, role: string, v2Table: string, id: string): IdMapRow {
  return { v1Table: TRANSACTIONS_TABLE, v1Id: row.id, role, v2Table, v2Id: id, v1UserId: row.user_id };
}

// Mirrors invoices.repository insertPayment: payment transaction + invoice_payments + allocation.
export function buildInvoicePayment(
  row: V1Transaction,
  m: Extract<Marker, { kind: "invoicePayment" }>,
  refs: CatalogRefs,
): BuildResult {
  const transaction = transactionRow(row, refs, {
    type: "expense",
    origin: "invoicePayment",
    period: row.periodo,
    cardId: null,
    categoryId: refs.systemCategory(invoicePaymentCategoryName, "expense"),
    isSettled: true,
  });
  const transactionId = transaction.id as string;
  const paymentId = v2Id(TRANSACTIONS_TABLE, row.id, "payment");
  const allocationId = v2Id(TRANSACTIONS_TABLE, row.id, "allocation");
  const amount = absoluteAmount(row.valor).toFixed(2);
  return {
    batches: [
      { table: "transactions", rows: [transaction] },
      {
        table: "invoicePayments",
        rows: [
          {
            id: paymentId,
            userId: refs.userId,
            cardId: required(refs.cardByV1.get(m.cardId), "card").id,
            period: m.period,
            accountId: transaction.accountId,
            transactionId,
            amount,
            paidAt: toDate(row.data_compra),
            createdAt: row.created_at,
          },
        ],
      },
      {
        table: "invoicePaymentAllocations",
        rows: [
          {
            id: allocationId,
            userId: refs.userId,
            paymentId,
            personId: transaction.personId,
            amount,
            createdAt: row.created_at,
          },
        ],
      },
    ],
    idMap: [
      idMapRow(row, "", "transactions", transactionId),
      idMapRow(row, "payment", "invoicePayments", paymentId),
      idMapRow(row, "allocation", "invoicePaymentAllocations", allocationId),
    ],
  };
}

export function buildInvoiceCredit(
  row: V1Transaction,
  m: Extract<Marker, { kind: "invoiceCredit" }>,
  refs: CatalogRefs,
): BuildResult {
  const transaction = transactionRow(row, refs, {
    type: "income",
    origin: "invoiceCredit",
    period: m.period,
    cardId: required(refs.cardByV1.get(m.cardId), "card").id,
    categoryId: categoryFor(row, refs),
    isSettled: row.realizado,
  });
  transaction.paymentMethod = "credit_card";
  return {
    batches: [{ table: "transactions", rows: [transaction] }],
    idMap: [idMapRow(row, "", "transactions", transaction.id as string)],
  };
}

export function buildRefund(
  row: V1Transaction,
  m: Extract<Marker, { kind: "refund" }>,
  refs: CatalogRefs,
): BuildResult {
  const transaction = transactionRow(row, refs, {
    type: "income",
    origin: "refund",
    period: row.periodo,
    cardId: row.cartao_id === null ? null : required(refs.cardByV1.get(row.cartao_id), "card").id,
    categoryId: categoryFor(row, refs),
    isSettled: row.realizado,
  });
  const refundId = v2Id(TRANSACTIONS_TABLE, row.id, "refund");
  return {
    batches: [
      { table: "transactions", rows: [transaction] },
      {
        table: "transactionRefunds",
        rows: [
          {
            id: refundId,
            userId: refs.userId,
            sourceTransactionId: v2Id(TRANSACTIONS_TABLE, m.sourceId),
            refundTransactionId: transaction.id,
            amount: absoluteAmount(row.valor).toFixed(2),
            createdAt: row.created_at,
          },
        ],
      },
    ],
    idMap: [
      idMapRow(row, "", "transactions", transaction.id as string),
      idMapRow(row, "refund", "transactionRefunds", refundId),
    ],
  };
}

function latestPayment(payments: V1Transaction[]): V1Transaction | null {
  let latest: V1Transaction | null = null;
  for (const payment of payments) {
    if (
      latest === null ||
      payment.data_compra > latest.data_compra ||
      (payment.data_compra === latest.data_compra && payment.created_at > latest.created_at)
    ) {
      latest = payment;
    }
  }
  return latest;
}

export function convertInvoices(
  invoices: V1Invoice[],
  payments: V1Transaction[],
  refs: CatalogRefs,
): { batches: InsertBatch[]; idMap: IdMapRow[]; findings: Finding[] } {
  const paymentsByInvoice = new Map<string, V1Transaction[]>();
  for (const payment of payments) {
    const marker = parseMarker(payment.anotacao);
    if (marker?.kind !== "invoicePayment") continue;
    const key = `${marker.cardId}:${marker.period}`;
    paymentsByInvoice.set(key, [...(paymentsByInvoice.get(key) ?? []), payment]);
  }

  const rows: Record<string, unknown>[] = [];
  const idMap: IdMapRow[] = [];
  const findings: Finding[] = [];
  for (const invoice of invoices) {
    // A missing card or period is reported by the validator (`invoice.without-card`).
    if (invoice.cartao_id === null || invoice.periodo === null) continue;
    const isPaid = invoice.status_pagamento === "pago";
    const payment = isPaid
      ? latestPayment(paymentsByInvoice.get(`${invoice.cartao_id}:${invoice.periodo}`) ?? [])
      : null;
    if (isPaid && payment === null) {
      findings.push({
        rule: "invoice.paid-without-date",
        severity: "blocker",
        table: "faturas",
        v1Id: invoice.id,
        v1UserId: invoice.user_id,
        reason: "paid invoice without a payment row",
        context: { period: invoice.periodo },
        resolutions: ["paid-at:<YYYY-MM-DD>"],
        resolutionKey: `invoice.paid-without-date:faturas:${invoice.id}`,
      });
      continue;
    }
    const id = v2Id("faturas", invoice.id);
    rows.push({
      id,
      userId: refs.userId,
      cardId: required(refs.cardByV1.get(invoice.cartao_id), "card").id,
      period: invoice.periodo,
      paymentStatus: isPaid ? "paid" : "pending",
      paidAt: payment === null ? null : toDate(payment.data_compra),
      paymentAccountId:
        payment?.conta_id == null ? null : required(refs.accountByV1.get(payment.conta_id), "account"),
      createdAt: invoice.created_at,
    });
    idMap.push({
      v1Table: "faturas",
      v1Id: invoice.id,
      role: "",
      v2Table: "invoices",
      v2Id: id,
      v1UserId: invoice.user_id,
    });
  }
  return { batches: rows.length ? [{ table: "invoices", rows }] : [], idMap, findings };
}
