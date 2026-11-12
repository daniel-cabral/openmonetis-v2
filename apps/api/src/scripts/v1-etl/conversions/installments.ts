import { fromCents } from "@openmonetis/domain/money";
import { v2Id } from "../ids";
import type {
  Cents,
  Finding,
  IdMapRow,
  InsertBatch,
  Severity,
  TableCount,
  V1Anticipation,
  V1Transaction,
} from "../types";
import { PAYMENT_METHOD_MAP, toTypedAmount } from "./amounts";
import type { CatalogRefs } from "./catalog";
import type { ConversionResult } from "./transactions";

const TRANSACTIONS_TABLE = "lancamentos";
const ANTICIPATIONS_TABLE = "antecipacoes_parcelas";
const SERIES_SOURCE = "installment_series";
const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 60;
const ANTICIPATION_LOST_COLUMNS = [
  "valor_total",
  "qtde_parcelas",
  "data_antecipacao",
  "anotacao",
  "pagador_id",
  "categoria_id",
] as const;

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function toAmount(cents: Cents): string {
  return fromCents(cents).toFixed(2);
}

function finding(
  rule: string,
  severity: Severity,
  seriesId: string,
  v1UserId: string,
  reason: string,
  context: Finding["context"],
  resolutions: string[],
): Finding {
  return {
    rule,
    severity,
    table: TRANSACTIONS_TABLE,
    v1Id: seriesId,
    v1UserId,
    reason,
    context: { seriesId, ...context },
    resolutions,
    resolutionKey: `${rule}:${TRANSACTIONS_TABLE}:${seriesId}`,
  };
}

function memberSignature(row: V1Transaction): string {
  return JSON.stringify([
    row.nome,
    row.cartao_id,
    row.conta_id,
    row.categoria_id,
    row.subcategoria_id,
    row.qtde_parcela,
  ]);
}

// Most frequent installment amount; ties go to the smaller amount so the result is deterministic.
function modalCents(amounts: Cents[]): Cents {
  const frequency = new Map<Cents, number>();
  for (const amount of amounts) frequency.set(amount, (frequency.get(amount) ?? 0) + 1);
  let best = amounts[0] as Cents;
  for (const [amount, count] of frequency) {
    const bestCount = frequency.get(best) ?? 0;
    if (count > bestCount || (count === bestCount && amount < best)) best = amount;
  }
  return best;
}

// Blocker findings of one series; an empty list means the series can be written.
function seriesBlockers(seriesId: string, members: V1Transaction[]): Finding[] {
  const v1UserId = (members[0] as V1Transaction).user_id;
  const dropRows = members.map((row) => `drop-row:${row.id}`);
  const total = (members[0] as V1Transaction).qtde_parcela;
  const blockers: Finding[] = [];

  if (
    members.some((row) => memberSignature(row) !== memberSignature(members[0] as V1Transaction))
  ) {
    blockers.push(
      finding(
        "installment.inconsistent-members",
        "blocker",
        seriesId,
        v1UserId,
        "Installment members disagree on name, card or account, category or count",
        { rows: members.map((row) => row.id) },
        dropRows,
      ),
    );
    return blockers;
  }

  if (
    total === null ||
    total < MIN_INSTALLMENTS ||
    total > MAX_INSTALLMENTS ||
    members.some(
      (row) => row.parcela_atual === null || row.parcela_atual < 1 || row.parcela_atual > total,
    )
  ) {
    blockers.push(
      finding(
        "installment.count-out-of-range",
        "blocker",
        seriesId,
        v1UserId,
        `Installment count or number outside ${MIN_INSTALLMENTS} to ${MAX_INSTALLMENTS}`,
        { totalInstallments: total },
        [],
      ),
    );
    return blockers;
  }

  const seen = new Map<number, string[]>();
  for (const row of members) {
    const number = row.parcela_atual as number;
    seen.set(number, [...(seen.get(number) ?? []), row.id]);
  }
  const duplicated = [...seen.entries()].filter(([, ids]) => ids.length > 1);
  if (duplicated.length > 0) {
    blockers.push(
      finding(
        "installment.duplicate-number",
        "blocker",
        seriesId,
        v1UserId,
        "Installment number appears more than once",
        { rows: duplicated.flatMap(([, ids]) => ids) },
        duplicated.flatMap(([, ids]) => ids.map((id) => `drop-row:${id}`)),
      ),
    );
  }
  return blockers;
}

function installmentRow(
  row: V1Transaction,
  seriesV2Id: string,
  type: "income" | "expense",
  amountCents: Cents,
  refs: CatalogRefs,
): Record<string, unknown> {
  return {
    id: v2Id(TRANSACTIONS_TABLE, row.id),
    userId: refs.userId,
    personId: (row.pagador_id && refs.personByPayer.get(row.pagador_id)) ?? refs.adminPersonId,
    type,
    origin: "regular",
    condition: "installment",
    paymentMethod: PAYMENT_METHOD_MAP[row.forma_pagamento] ?? null,
    name: row.nome,
    amount: toAmount(amountCents),
    purchaseDate: toDate(row.data_compra),
    period: row.periodo,
    accountId: row.conta_id ? (refs.accountByV1.get(row.conta_id) ?? null) : null,
    cardId: row.cartao_id ? (refs.cardByV1.get(row.cartao_id)?.id ?? null) : null,
    categoryId: row.subcategoria_id
      ? (refs.childBySubcategory.get(row.subcategoria_id) ?? null)
      : row.categoria_id
        ? (refs.categoryByV1.get(row.categoria_id) ?? null)
        : null,
    sourceAccountId: null,
    destinationAccountId: null,
    dueDate: toDate(row.data_vencimento),
    boletoPaymentDate: toDate(row.dt_pagamento_boleto),
    installmentCount: row.qtde_parcela,
    currentInstallment: row.parcela_atual,
    seriesId: seriesV2Id,
    transferId: null,
    recurringRuleId: null,
    isSettled: row.realizado,
    note: row.anotacao,
    createdAt: row.created_at,
  };
}

export function convertInstallments(
  rows: V1Transaction[],
  anticipations: V1Anticipation[],
  refs: CatalogRefs,
): ConversionResult {
  const seriesRows: Record<string, unknown>[] = [];
  const transactionRows: Record<string, unknown>[] = [];
  const anticipationRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const idMap: IdMapRow[] = [];
  const findings: Finding[] = [];
  const writtenRows = new Map<string, V1Transaction>();
  const writtenSeries = new Map<string, string>();
  let skippedZero = 0;
  let skippedWithoutSeries = 0;
  let skippedBlocked = 0;

  const bySeries = new Map<string, V1Transaction[]>();
  for (const row of rows) {
    if (row.series_id === null) {
      skippedWithoutSeries += 1;
      continue;
    }
    bySeries.set(row.series_id, [...(bySeries.get(row.series_id) ?? []), row]);
  }

  for (const seriesId of [...bySeries.keys()].sort()) {
    const members = (bySeries.get(seriesId) as V1Transaction[]).sort(
      (a, b) => (a.parcela_atual ?? 0) - (b.parcela_atual ?? 0) || a.id.localeCompare(b.id),
    );
    const blockers = seriesBlockers(seriesId, members);
    findings.push(...blockers);
    if (blockers.length > 0) {
      skippedBlocked += members.length;
      continue;
    }

    const typed = members.map((row) => ({ row, amount: toTypedAmount(row.valor) }));
    const loadable = typed.filter(
      (
        item,
      ): item is {
        row: V1Transaction;
        amount: Extract<ReturnType<typeof toTypedAmount>, { ok: true }>;
      } => item.amount.ok,
    );
    skippedZero += typed.length - loadable.length;
    if (loadable.length === 0) continue;

    const first = members[0] as V1Transaction;
    const v1UserId = first.user_id;
    const total = first.qtde_parcela as number;
    const trackedFrom = Math.min(...loadable.map((item) => item.row.parcela_atual as number));
    const present = new Set(loadable.map((item) => item.row.parcela_atual as number));
    const missing: number[] = [];
    for (let number = trackedFrom; number <= total; number += 1) {
      if (!present.has(number)) missing.push(number);
    }
    const presentCents = loadable.reduce((sum, item) => sum + item.amount.amountCents, 0);
    const modal = modalCents(loadable.map((item) => item.amount.amountCents));
    const originalCents = presentCents + modal * missing.length;

    if (missing.length > 0) {
      findings.push(
        finding(
          "installment.gap",
          "fixable",
          seriesId,
          v1UserId,
          `Installment series is missing numbers ${missing.join(", ")}`,
          { missing: missing.map(String) },
          [],
        ),
      );
    }

    const seriesV2Id = v2Id(SERIES_SOURCE, seriesId);
    writtenSeries.set(seriesId, seriesV2Id);
    seriesRows.push({
      id: seriesV2Id,
      userId: refs.userId,
      totalInstallments: total,
      trackedFromInstallment: trackedFrom,
      originalAmount: toAmount(originalCents),
      createdAt: first.created_at,
    });
    idMap.push({
      v1Table: SERIES_SOURCE,
      v1Id: seriesId,
      role: "",
      v2Table: "installment_series",
      v2Id: seriesV2Id,
      v1UserId,
    });

    for (const { row, amount } of loadable) {
      transactionRows.push(installmentRow(row, seriesV2Id, amount.type, amount.amountCents, refs));
      writtenRows.set(row.id, row);
      idMap.push({
        v1Table: TRANSACTIONS_TABLE,
        v1Id: row.id,
        role: "",
        v2Table: "transactions",
        v2Id: v2Id(TRANSACTIONS_TABLE, row.id),
        v1UserId: row.user_id,
      });
    }
  }

  const sortedAnticipations = [...anticipations].sort((a, b) => a.id.localeCompare(b.id));
  for (const anticipation of sortedAnticipations) {
    const seriesV2Id = writtenSeries.get(anticipation.series_id);
    if (seriesV2Id === undefined) continue;
    const anticipationV2Id = v2Id(ANTICIPATIONS_TABLE, anticipation.id);
    anticipationRows.push({
      id: anticipationV2Id,
      userId: refs.userId,
      seriesId: seriesV2Id,
      targetPeriod: anticipation.periodo_antecipacao,
      discount: anticipation.desconto,
      adjustmentTransactionId: v2Id(TRANSACTIONS_TABLE, anticipation.lancamento_id),
      createdAt: anticipation.created_at,
    });
    idMap.push({
      v1Table: ANTICIPATIONS_TABLE,
      v1Id: anticipation.id,
      role: "",
      v2Table: "installment_anticipations",
      v2Id: anticipationV2Id,
      v1UserId: anticipation.user_id,
    });
    for (const installmentId of [...anticipation.parcelas_antecipadas].sort()) {
      const installment = writtenRows.get(installmentId);
      if (installment === undefined) continue;
      itemRows.push({
        anticipationId: anticipationV2Id,
        userId: refs.userId,
        transactionId: v2Id(TRANSACTIONS_TABLE, installment.id),
        originalPeriod: installment.periodo,
      });
    }
  }

  const transactionCount: TableCount = {
    v1Table: TRANSACTIONS_TABLE,
    read: rows.length,
    written: transactionRows.length,
    merged: 0,
    skipped: [
      ...(skippedZero > 0 ? [{ reason: "amount.zero", rows: skippedZero }] : []),
      ...(skippedBlocked > 0
        ? [{ reason: "installment.blocked-series", rows: skippedBlocked }]
        : []),
      ...(skippedWithoutSeries > 0
        ? [{ reason: "installment.without-series", rows: skippedWithoutSeries }]
        : []),
    ],
    collapsed: [],
    detached: [],
    droppedColumns: [],
  };
  const anticipationCount: TableCount = {
    v1Table: ANTICIPATIONS_TABLE,
    read: anticipations.length,
    written: anticipationRows.length,
    merged: 0,
    skipped:
      anticipations.length > anticipationRows.length
        ? [
            {
              reason: "installment.blocked-series",
              rows: anticipations.length - anticipationRows.length,
            },
          ]
        : [],
    collapsed: [],
    detached: [],
    droppedColumns:
      anticipationRows.length > 0
        ? ANTICIPATION_LOST_COLUMNS.map((column) => ({ column, rows: anticipationRows.length }))
        : [],
  };

  const batches: InsertBatch[] = [
    { table: "installmentSeries", rows: seriesRows },
    { table: "transactions", rows: transactionRows },
    { table: "installmentAnticipations", rows: anticipationRows },
    { table: "installmentAnticipationItems", rows: itemRows },
  ].filter((batch) => batch.rows.length > 0);

  return { batches, idMap, counts: [transactionCount, anticipationCount], findings };
}
