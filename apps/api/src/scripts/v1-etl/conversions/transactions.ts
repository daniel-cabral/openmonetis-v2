import { balanceAdjustmentCategoryName } from "@openmonetis/domain/categories";
import { fromCents } from "@openmonetis/domain/money";
import {
  addMonthsToDate,
  buildTransferPostings,
  getPeriodFromDate,
  type TransactionType,
} from "@openmonetis/domain/transactions";
import { v2Id } from "../ids";
import type {
  Cents,
  ExtractedUser,
  Finding,
  IdMapRow,
  InsertBatch,
  Resolutions,
  TableCount,
  V1FinancialAccount,
  V1Transaction,
} from "../types";
import { PAYMENT_METHOD_MAP, toTypedAmount } from "./amounts";
import type { CatalogRefs } from "./catalog";
import { buildInvoiceCredit, buildInvoicePayment, buildRefund, parseMarker } from "./markers";

export type ConversionResult = {
  batches: InsertBatch[];
  idMap: IdMapRow[];
  counts: TableCount[];
  findings: Finding[];
};

type Row = Record<string, unknown>;

const TRANSACTIONS_TABLE = "lancamentos";
const ACCOUNTS_TABLE = "contas";
const TRANSFER_SOURCE = "transfer";
const INITIAL_BALANCE_NOTE = "saldo inicial";
const INITIAL_BALANCE_ROLE = "initial-balance";
const PERIOD_DATE_RULE = "transaction.period-date-mismatch";
const BATCH_ORDER = [
  "transactions",
  "transactionSplits",
  "invoicePayments",
  "invoicePaymentAllocations",
  "transactionRefunds",
];
const DROPPED_COLUMNS = [
  "dividido",
  "split_group_id",
  "antecipado",
  "qtde_recorrencia",
  "ofx_fit_id",
  "ofx_import_fingerprint",
  "import_batch_id",
] as const;

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`v1-etl: unmapped ${what}`);
  return value;
}

function signedCents(row: V1Transaction): Cents | null {
  const typed = toTypedAmount(row.valor);
  if (!typed.ok) return null;
  return typed.type === "expense" ? -typed.amountCents : typed.amountCents;
}

function monthIndex(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return (year as number) * 12 + (month as number);
}

// Operator resolution of `transaction.period-date-mismatch`; unresolved rows keep V1 values.
function periodAndDate(row: V1Transaction, r: Resolutions["resolutions"]) {
  const choice = r[`${PERIOD_DATE_RULE}:${TRANSACTIONS_TABLE}:${row.id}`];
  if (choice === "use-date") {
    return { period: getPeriodFromDate(row.data_compra), purchaseDate: row.data_compra };
  }
  if (choice === "use-period") {
    const months = monthIndex(row.periodo) - monthIndex(getPeriodFromDate(row.data_compra));
    return { period: row.periodo, purchaseDate: addMonthsToDate(row.data_compra, months) };
  }
  return { period: row.periodo, purchaseDate: row.data_compra };
}

function personOf(row: V1Transaction, refs: CatalogRefs): string {
  return row.pagador_id === null
    ? refs.adminPersonId
    : required(refs.personByPayer.get(row.pagador_id), "payer");
}

function categoryOf(row: V1Transaction, refs: CatalogRefs): string | null {
  if (row.subcategoria_id !== null) {
    return required(refs.childBySubcategory.get(row.subcategoria_id), "subcategory");
  }
  if (row.categoria_id === null) return null;
  return required(refs.categoryByV1.get(row.categoria_id), "category");
}

function accountOf(v1AccountId: string | null, refs: CatalogRefs): string | null {
  return v1AccountId === null ? null : required(refs.accountByV1.get(v1AccountId), "account");
}

function baseRow(
  row: V1Transaction,
  refs: CatalogRefs,
  r: Resolutions["resolutions"],
  type: TransactionType,
  cents: Cents,
): Row {
  const { period, purchaseDate } = periodAndDate(row, r);
  return {
    id: v2Id(TRANSACTIONS_TABLE, row.id),
    userId: refs.userId,
    personId: personOf(row, refs),
    type,
    origin: "regular",
    condition: "single",
    paymentMethod: PAYMENT_METHOD_MAP[row.forma_pagamento] ?? null,
    name: row.nome,
    amount: fromCents(cents).toFixed(2),
    purchaseDate: toDate(purchaseDate),
    period,
    accountId: accountOf(row.conta_id, refs),
    cardId: row.cartao_id === null ? null : required(refs.cardByV1.get(row.cartao_id), "card").id,
    categoryId: categoryOf(row, refs),
    sourceAccountId: null,
    destinationAccountId: null,
    dueDate: toDate(row.data_vencimento),
    boletoPaymentDate: toDate(row.dt_pagamento_boleto),
    installmentCount: null,
    currentInstallment: null,
    seriesId: null,
    transferId: null,
    recurringRuleId: null,
    isSettled: row.realizado,
    note: row.anotacao,
    createdAt: row.created_at,
  };
}

function txIdMap(row: V1Transaction, v2: string, role = "", v2Table = "transactions"): IdMapRow {
  return {
    v1Table: TRANSACTIONS_TABLE,
    v1Id: row.id,
    role,
    v2Table,
    v2Id: v2,
    v1UserId: row.user_id,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function byDateThenId(a: V1Transaction, b: V1Transaction): number {
  return a.data_compra.localeCompare(b.data_compra) || a.id.localeCompare(b.id);
}

export function convertTransactions(
  rows: V1Transaction[],
  x: ExtractedUser,
  refs: CatalogRefs,
  r: Resolutions["resolutions"],
): ConversionResult {
  const tables = new Map<string, Row[]>();
  const add = (table: string, ...items: Row[]) =>
    tables.set(table, [...(tables.get(table) ?? []), ...items]);
  const idMap: IdMapRow[] = [];
  let written = 0;
  let skippedZero = 0;
  let skippedPrecision = 0;
  let collapsedRows = 0;
  let collapsedInto = 0;

  const accountsByV1 = new Map(x.financialAccounts.map((account) => [account.id, account]));
  const accountsWithInitialRow = new Set<string>();
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));

  const loadable: V1Transaction[] = [];
  for (const row of sorted) {
    const marker = parseMarker(row.anotacao);
    if (marker !== null) {
      const built =
        marker.kind === "invoicePayment"
          ? buildInvoicePayment(row, marker, refs)
          : marker.kind === "invoiceCredit"
            ? buildInvoiceCredit(row, marker, refs)
            : buildRefund(row, marker, refs);
      for (const batch of built.batches) add(batch.table, ...batch.rows);
      idMap.push(...built.idMap);
      written += 1;
      continue;
    }
    const typed = toTypedAmount(row.valor);
    if (!typed.ok) {
      if (typed.reason === "zero") skippedZero += 1;
      else skippedPrecision += 1;
      continue;
    }
    loadable.push(row);
  }

  // Transfer pairs: V2 stores two `transfer` rows, negative on the source (buildTransferPostings).
  const transfers = groupBy(
    loadable.filter((row) => row.transfer_id !== null),
    (row) => row.transfer_id as string,
  );
  for (const [transferId, pair] of transfers) {
    const source = pair.find((row) => Number(row.valor) < 0);
    const destination = pair.find((row) => Number(row.valor) > 0);
    if (pair.length !== 2 || source === undefined || destination === undefined) {
      throw new Error(`v1-etl: transfer ${transferId} is not a source and destination pair`);
    }
    const sourceAccountId = required(accountOf(source.conta_id, refs) ?? undefined, "account");
    const destinationAccountId = required(
      accountOf(destination.conta_id, refs) ?? undefined,
      "account",
    );
    const postings = buildTransferPostings({
      sourceAccountId,
      destinationAccountId,
      amount: fromCents(Math.abs(signedCents(source) as Cents)),
    });
    const v2TransferId = v2Id(TRANSFER_SOURCE, transferId);
    for (const [row, posting] of [
      [source, postings[0]],
      [destination, postings[1]],
    ] as const) {
      const transaction = baseRow(row, refs, r, "transfer", 0);
      add("transactions", {
        ...transaction,
        amount: posting.amount.toFixed(2),
        accountId: posting.accountId,
        cardId: null,
        sourceAccountId,
        destinationAccountId,
        transferId: v2TransferId,
      });
      idMap.push(txIdMap(row, transaction.id as string));
      written += 1;
    }
  }

  // Split groups: one transaction for the owner plus one split per person, V1 amounts kept.
  const others = loadable.filter((row) => row.transfer_id === null);
  const groups = groupBy(others, (row) => row.split_group_id ?? row.id);
  for (const group of groups.values()) {
    if (group.length > 1) {
      const members = [...group].sort(byDateThenId);
      const owner =
        members.find((row) => personOf(row, refs) === refs.adminPersonId) ??
        (members[0] as V1Transaction);
      const memberCents = members.map((row) => signedCents(row) as Cents);
      const total = memberCents.reduce((sum, cents) => sum + cents, 0);
      if (total === 0) {
        skippedZero += members.length;
        continue;
      }
      const transaction = baseRow(owner, refs, r, total < 0 ? "expense" : "income", total);
      add("transactions", transaction);
      written += 1;
      collapsedRows += members.length;
      collapsedInto += 1;
      members.forEach((row, index) => {
        const personId = personOf(row, refs);
        const splitId = v2Id(TRANSACTIONS_TABLE, row.id, "split");
        add("transactionSplits", {
          id: splitId,
          userId: refs.userId,
          transactionId: transaction.id,
          personId,
          amount: fromCents(memberCents[index] as Cents).toFixed(2),
          createdAt: row.created_at,
        });
        idMap.push(txIdMap(row, transaction.id as string));
        idMap.push(txIdMap(row, splitId, `split:${personId}`, "transactionSplits"));
      });
      continue;
    }

    const row = group[0] as V1Transaction;
    const cents = signedCents(row) as Cents;
    const type = cents < 0 ? "expense" : "income";
    const transaction = baseRow(row, refs, r, type, cents);
    const account = row.conta_id === null ? undefined : accountsByV1.get(row.conta_id);
    if (row.anotacao === INITIAL_BALANCE_NOTE && account !== undefined) {
      accountsWithInitialRow.add(account.id);
      transaction.isSettled = true;
      if (account.excluir_saldo_inicial_receitas) {
        transaction.origin = "accountBalanceAdjustment";
        transaction.paymentMethod = null;
        transaction.categoryId = refs.systemCategory(balanceAdjustmentCategoryName, type);
      }
    }
    add("transactions", transaction);
    idMap.push(txIdMap(row, transaction.id as string));
    written += 1;
  }

  // Accounts with an initial balance but no "saldo inicial" row get one dated at creation.
  for (const account of [...x.financialAccounts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (accountsWithInitialRow.has(account.id)) continue;
    const synthesized = initialBalanceRow(account, refs);
    if (synthesized === null) continue;
    add("transactions", synthesized);
    idMap.push({
      v1Table: ACCOUNTS_TABLE,
      v1Id: account.id,
      role: INITIAL_BALANCE_ROLE,
      v2Table: "transactions",
      v2Id: synthesized.id as string,
      v1UserId: account.user_id,
    });
  }

  const count: TableCount = {
    v1Table: TRANSACTIONS_TABLE,
    read: rows.length,
    written,
    merged: 0,
    skipped: [
      { reason: "amount.zero", rows: skippedZero },
      { reason: "amount.precision", rows: skippedPrecision },
    ].filter((item) => item.rows > 0),
    collapsed:
      collapsedRows > 0
        ? [{ reason: "split-group", rows: collapsedRows, into: collapsedInto }]
        : [],
    detached: [],
    droppedColumns: DROPPED_COLUMNS.map((column) => ({
      column,
      rows: rows.filter((row) => row[column] !== null && row[column] !== false).length,
    })).filter((item) => item.rows > 0),
  };

  const batches: InsertBatch[] = BATCH_ORDER.flatMap((table) => {
    const tableRows = tables.get(table) ?? [];
    return tableRows.length > 0 ? [{ table, rows: tableRows }] : [];
  });
  return { batches, idMap, counts: [count], findings: [] };
}

function initialBalanceRow(account: V1FinancialAccount, refs: CatalogRefs): Row | null {
  const typed = toTypedAmount(account.saldo_inicial);
  const accountId = refs.accountByV1.get(account.id);
  if (!typed.ok || accountId === undefined) return null;
  const date = account.created_at.toISOString().slice(0, 10);
  return {
    id: v2Id(ACCOUNTS_TABLE, account.id, INITIAL_BALANCE_ROLE),
    userId: refs.userId,
    personId: refs.adminPersonId,
    type: typed.type,
    origin: "accountBalanceAdjustment",
    condition: "single",
    paymentMethod: null,
    name: `${balanceAdjustmentCategoryName} - ${account.nome}`,
    amount: fromCents(typed.type === "expense" ? -typed.amountCents : typed.amountCents).toFixed(2),
    purchaseDate: toDate(date),
    period: getPeriodFromDate(date),
    accountId,
    cardId: null,
    categoryId: refs.systemCategory(balanceAdjustmentCategoryName, typed.type),
    sourceAccountId: null,
    destinationAccountId: null,
    dueDate: null,
    boletoPaymentDate: null,
    installmentCount: null,
    currentInstallment: null,
    seriesId: null,
    transferId: null,
    recurringRuleId: null,
    isSettled: true,
    note: null,
    createdAt: account.created_at,
  };
}
