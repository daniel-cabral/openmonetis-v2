import { fromCents } from "@openmonetis/domain/money";
import { resolveRecurringDueDate } from "@openmonetis/domain/recurring-expenses";
import { getEffectiveRecurringEndDate } from "@openmonetis/domain/recurring-transactions";
import {
  addMonthsToPeriod,
  deriveTransactionPeriod,
  listRecurrenceDatesInPeriod,
  normalizeTransactionAmount,
  type PaymentMethod,
} from "@openmonetis/domain/transactions";
import { v2Id } from "../ids";
import type { Cents, Finding, IdMapRow, InsertBatch, TableCount, V1Transaction } from "../types";
import { PAYMENT_METHOD_MAP, toTypedAmount } from "./amounts";
import type { CatalogRefs } from "./catalog";
import type { ConversionResult } from "./transactions";

export type RecurrenceVersion = {
  anchorDate: string;
  startDate: string;
  endDate: string;
  dueDate: string | null;
  amountCents: Cents;
  name: string;
  categoryId: string | null;
  isSettled: null;
};

type SeriesOccurrence = {
  date: string;
  isSettled: true;
  accountId: string | null;
  boletoPaymentDate: string | null;
};

export type RecurrenceResult = ConversionResult & {
  detached: V1Transaction[];
  series: {
    v1SeriesId: string;
    versions: RecurrenceVersion[];
    recurrenceEndDate: string;
    occurrences: SeriesOccurrence[];
  }[];
};

const TRANSACTIONS_TABLE = "lancamentos";
const SERIES_SOURCE = "recurring_series";
const DUPLICATE_RULE = "recurrence.duplicate-occurrence";
const NOT_REPRODUCIBLE_RULE = "recurrence.not-reproducible";

type Occurrence = {
  owner: V1Transaction;
  rows: V1Transaction[];
  date: string;
  period: string;
  dueDate: string | null;
  type: "income" | "expense";
  amountCents: Cents;
  signedCents: Cents;
  personId: string;
  splits: [string, Cents][];
  accountId: string | null;
  cardId: string | null;
  categoryId: string | null;
  paymentMethod: PaymentMethod;
  attributes: string;
};

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function signedAmount(type: "income" | "expense", cents: Cents): string {
  return normalizeTransactionAmount(type, fromCents(cents)).toFixed(2);
}

function day(date: string): number {
  return Number(date.slice(8, 10));
}

function signedCentsOf(row: V1Transaction): Cents | null {
  const typed = toTypedAmount(row.valor);
  if (typed.ok) return typed.type === "expense" ? -typed.amountCents : typed.amountCents;
  return typed.reason === "zero" ? 0 : null;
}

// Most frequent purchase day of the series; ties go to the smaller day.
function seriesDay(rows: V1Transaction[]): number {
  const frequency = new Map<number, number>();
  for (const row of rows)
    frequency.set(day(row.data_compra), (frequency.get(day(row.data_compra)) ?? 0) + 1);
  let best = day((rows[0] as V1Transaction).data_compra);
  for (const [candidate, count] of frequency) {
    const bestCount = frequency.get(best) ?? 0;
    if (count > bestCount || (count === bestCount && candidate < best)) best = candidate;
  }
  return best;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function byDateThenId(a: V1Transaction, b: V1Transaction): number {
  return a.data_compra.localeCompare(b.data_compra) || a.id.localeCompare(b.id);
}

// Owner of a split group: the admin person's row, else the first row.
function buildOccurrence(
  rows: V1Transaction[],
  refs: CatalogRefs,
): Occurrence | "zero" | "invalid" {
  const personOf = (row: V1Transaction) =>
    row.pagador_id === null
      ? refs.adminPersonId
      : (refs.personByPayer.get(row.pagador_id) ?? refs.adminPersonId);
  const sorted = [...rows].sort(byDateThenId);
  const owner =
    sorted.find((row) => personOf(row) === refs.adminPersonId) ?? (sorted[0] as V1Transaction);
  const cents = sorted.map(signedCentsOf);
  if (cents.some((value) => value === null)) return "invalid";
  const signedCents = (cents as Cents[]).reduce((sum, value) => sum + value, 0);
  if (signedCents === 0) return "zero";

  const type = signedCents < 0 ? "expense" : "income";
  const splits: [string, Cents][] =
    sorted.length > 1
      ? sorted
          .map((row, index) => [personOf(row), cents[index] as Cents] as [string, Cents])
          .sort((a, b) => a[0].localeCompare(b[0]))
      : [];
  const occurrence = {
    owner,
    rows: sorted,
    date: owner.data_compra,
    period: owner.periodo,
    dueDate: owner.data_vencimento,
    type,
    amountCents: Math.abs(signedCents),
    signedCents,
    personId: personOf(owner),
    splits,
    accountId: owner.conta_id === null ? null : (refs.accountByV1.get(owner.conta_id) ?? null),
    cardId: owner.cartao_id === null ? null : (refs.cardByV1.get(owner.cartao_id)?.id ?? null),
    categoryId:
      owner.subcategoria_id !== null
        ? (refs.childBySubcategory.get(owner.subcategoria_id) ?? null)
        : owner.categoria_id === null
          ? null
          : (refs.categoryByV1.get(owner.categoria_id) ?? null),
    paymentMethod: PAYMENT_METHOD_MAP[owner.forma_pagamento] as PaymentMethod,
  } as const;
  return {
    ...occurrence,
    attributes: JSON.stringify([
      occurrence.type,
      occurrence.amountCents,
      owner.nome,
      occurrence.categoryId,
      occurrence.accountId,
      occurrence.cardId,
      occurrence.paymentMethod,
      occurrence.personId,
      occurrence.splits,
    ]),
  };
}

// Consecutive months with equal attributes form one run. Purchase and due days are compared
// against the run's first occurrence after the month-end clamping the V2 expansion applies.
function buildRuns(occurrences: Occurrence[]): Occurrence[][] {
  const runs: Occurrence[][] = [];
  for (const occurrence of occurrences) {
    const run = runs.at(-1);
    const first = run?.[0];
    const last = run?.at(-1);
    if (
      run &&
      first &&
      last &&
      addMonthsToPeriod(last.date.slice(0, 7), 1) === occurrence.date.slice(0, 7) &&
      last.attributes === occurrence.attributes &&
      resolveRecurringDueDate(occurrence.date, first.date) === occurrence.date &&
      resolveRecurringDueDate(occurrence.date, first.dueDate) === occurrence.dueDate
    ) {
      run.push(occurrence);
    } else {
      runs.push([occurrence]);
    }
  }
  return runs;
}

// Round trip: expand the versions with the V2 domain and compare with the V1 occurrences.
function isReproducible(
  runs: Occurrence[][],
  recurrenceEndDate: string,
  cardByV2: Map<string, { closingDay: number; dueDay: number }>,
): boolean {
  const occurrences = runs.flat();
  const expected = occurrences
    .map((o) => `${o.date}|${o.period}|${o.signedCents}|${o.dueDate}`)
    .sort();
  const lastPeriod = (occurrences.at(-1) as Occurrence).date.slice(0, 7);
  const expanded: string[] = [];
  for (
    let period = (occurrences[0] as Occurrence).date.slice(0, 7);
    period <= lastPeriod;
    period = addMonthsToPeriod(period, 1)
  ) {
    for (const run of runs) {
      const first = run[0] as Occurrence;
      const endDate = getEffectiveRecurringEndDate(
        (run.at(-1) as Occurrence).date,
        recurrenceEndDate,
      );
      const dates = listRecurrenceDatesInPeriod({
        anchorDate: first.date,
        startDate: first.date,
        endDate,
        recurrenceEndDate,
        dueDate: first.dueDate,
        frequency: "monthly",
        period,
      });
      for (const date of dates) {
        const dueDate = resolveRecurringDueDate(date, first.dueDate);
        const card = first.cardId === null ? null : (cardByV2.get(first.cardId) ?? null);
        const derived = deriveTransactionPeriod({
          paymentMethod: first.paymentMethod,
          purchaseDate: date,
          dueDate,
          card: card && {
            closingDay: card.closingDay,
            closingRule: {
              type: "fixedDay",
              closingDay: card.closingDay,
              closingDayPurchasesNextInvoice: true,
            },
            dueDay: card.dueDay,
          },
        });
        expanded.push(`${date}|${derived}|${first.signedCents}|${dueDate}`);
      }
    }
  }
  expanded.sort();
  return (
    expanded.length === expected.length && expanded.every((key, index) => key === expected[index])
  );
}

export function convertRecurrence(
  rows: V1Transaction[],
  refs: CatalogRefs,
  r: Record<string, string>,
): RecurrenceResult {
  const findings: Finding[] = [];
  const detached: V1Transaction[] = [];
  const series: RecurrenceResult["series"] = [];
  const seriesRows: Record<string, unknown>[] = [];
  const ruleRows: Record<string, unknown>[] = [];
  const splitRows: Record<string, unknown>[] = [];
  const occurrenceRows: Record<string, unknown>[] = [];
  const tripRows: Record<string, unknown>[] = [];
  const idMap: IdMapRow[] = [];
  let collapsedRows = 0;
  let collapsedInto = 0;
  let zeroRows = 0;
  let droppedRows = 0;
  let duplicateRows = 0;
  let asSinglesRows = 0;
  const cardByV2 = new Map([...refs.cardByV1.values()].map((card) => [card.id, card]));

  const bySeries = groupBy(rows, (row) => row.series_id ?? row.id);
  for (const [seriesId, members] of [...bySeries.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const v1UserId = (members[0] as V1Transaction).user_id;
    const targetDay = seriesDay(members);
    const occurrences: Occurrence[] = [];
    let invalid = false;

    for (const periodRows of groupBy(members, (row) => row.periodo).values()) {
      const groups = [...groupBy(periodRows, (row) => row.split_group_id ?? row.id).values()]
        .map((group) => [...group].sort(byDateThenId))
        .sort((a, b) => {
          const first = a[0] as V1Transaction;
          const second = b[0] as V1Transaction;
          return (
            Math.abs(day(first.data_compra) - targetDay) -
              Math.abs(day(second.data_compra) - targetDay) || byDateThenId(first, second)
          );
        });
      for (const extra of groups.slice(1)) {
        const extraId = (extra[0] as V1Transaction).id;
        const resolutionKey = `${DUPLICATE_RULE}:${TRANSACTIONS_TABLE}:${extraId}`;
        findings.push({
          rule: DUPLICATE_RULE,
          severity: "fixable",
          table: TRANSACTIONS_TABLE,
          v1Id: extraId,
          v1UserId,
          reason: `Series has ${groups.length} occurrences in ${(extra[0] as V1Transaction).periodo}`,
          context: {
            seriesId,
            period: (extra[0] as V1Transaction).periodo,
            rows: groups.flat().map((row) => row.id),
          },
          resolutions: ["detach", "drop"],
          resolutionKey,
        });
        if (r[resolutionKey] === "drop") {
          droppedRows += extra.length;
        } else {
          detached.push(...extra);
          duplicateRows += extra.length;
        }
      }
      const occurrence = buildOccurrence(groups[0] as V1Transaction[], refs);
      if (occurrence === "invalid") invalid = true;
      else if (occurrence === "zero") zeroRows += (groups[0] as V1Transaction[]).length;
      else occurrences.push(occurrence);
    }

    // Rows with more than 2 decimals are blocked by amount.precision (validate/rules.ts).
    if (invalid || occurrences.length === 0) continue;
    occurrences.sort((a, b) => a.date.localeCompare(b.date));
    const runs = buildRuns(occurrences);
    const last = occurrences.at(-1) as Occurrence;
    const lastRunFirst = (runs.at(-1) as Occurrence[])[0] as Occurrence;
    const recurrenceEndDate = resolveRecurringDueDate(last.date, lastRunFirst.dueDate) ?? last.date;

    if (!isReproducible(runs, recurrenceEndDate, cardByV2)) {
      const resolutionKey = `${NOT_REPRODUCIBLE_RULE}:${TRANSACTIONS_TABLE}:${seriesId}`;
      findings.push({
        rule: NOT_REPRODUCIBLE_RULE,
        severity: "blocker",
        table: TRANSACTIONS_TABLE,
        v1Id: seriesId,
        v1UserId,
        reason: "V2 recurrence expansion does not reproduce the V1 occurrences",
        context: { seriesId, rows: occurrences.length },
        resolutions: ["as-singles"],
        resolutionKey,
      });
      if (r[resolutionKey] === "as-singles") {
        const singles = occurrences.flatMap((occurrence) => occurrence.rows);
        detached.push(...singles);
        asSinglesRows += singles.length;
      }
      continue;
    }

    const seriesV2Id = v2Id(SERIES_SOURCE, seriesId);
    seriesRows.push({ id: seriesV2Id, userId: refs.userId, createdAt: last.owner.created_at });
    idMap.push({
      v1Table: SERIES_SOURCE,
      v1Id: seriesId,
      role: "",
      v2Table: "recurring_transaction_series",
      v2Id: seriesV2Id,
      v1UserId,
    });

    const ruleIdByDate = new Map<string, string>();
    const versions = runs.map((run, index): RecurrenceVersion => {
      const first = run[0] as Occurrence;
      const role = `rule:${index}`;
      const ruleId = v2Id(SERIES_SOURCE, seriesId, role);
      for (const occurrence of run) ruleIdByDate.set(occurrence.date, ruleId);
      const version: RecurrenceVersion = {
        anchorDate: first.date,
        startDate: first.date,
        endDate: (run.at(-1) as Occurrence).date,
        dueDate: first.dueDate,
        amountCents: first.amountCents,
        name: first.owner.nome,
        categoryId: first.categoryId,
        isSettled: null,
      };
      ruleRows.push({
        id: ruleId,
        userId: refs.userId,
        seriesId: seriesV2Id,
        personId: first.personId,
        type: first.type,
        paymentMethod: first.paymentMethod,
        name: version.name,
        amount: signedAmount(first.type, first.amountCents),
        anchorDate: toDate(version.anchorDate),
        startDate: toDate(version.startDate),
        endDate: toDate(version.endDate),
        recurrenceEndDate: toDate(recurrenceEndDate),
        frequency: "monthly",
        accountId: first.accountId,
        cardId: first.cardId,
        categoryId: version.categoryId,
        dueDate: toDate(version.dueDate),
        isSettled: null,
        note: first.owner.anotacao,
        status: "active",
        createdAt: first.owner.created_at,
      });
      idMap.push({
        v1Table: SERIES_SOURCE,
        v1Id: seriesId,
        role,
        v2Table: "recurring_transaction_rules",
        v2Id: ruleId,
        v1UserId,
      });
      for (const [personId, cents] of first.splits) {
        splitRows.push({
          id: v2Id(SERIES_SOURCE, seriesId, `${role}:split:${personId}`),
          userId: refs.userId,
          recurringRuleId: ruleId,
          personId,
          amount: signedAmount(cents < 0 ? "expense" : "income", Math.abs(cents)),
          createdAt: first.owner.created_at,
        });
      }
      return version;
    });

    const settled: SeriesOccurrence[] = [];
    for (const occurrence of occurrences) {
      if (occurrence.owner.realizado === true) {
        const role = `occurrence:${occurrence.date}`;
        const occurrenceId = v2Id(SERIES_SOURCE, seriesId, role);
        const accountId = occurrence.accountId;
        settled.push({
          date: occurrence.date,
          isSettled: true,
          accountId,
          boletoPaymentDate: occurrence.owner.dt_pagamento_boleto,
        });
        occurrenceRows.push({
          id: occurrenceId,
          userId: refs.userId,
          recurringRuleId: ruleIdByDate.get(occurrence.date),
          recurringSeriesId: seriesV2Id,
          purchaseDate: toDate(occurrence.date),
          isSettled: true,
          settledAmount: null,
          settledDate: null,
          accountId,
          boletoPaymentDate: toDate(occurrence.owner.dt_pagamento_boleto),
          createdAt: occurrence.owner.created_at,
        });
        idMap.push({
          v1Table: SERIES_SOURCE,
          v1Id: seriesId,
          role,
          v2Table: "recurring_transaction_occurrences",
          v2Id: occurrenceId,
          v1UserId,
        });
      }
      const tripId =
        occurrence.owner.viagem_id === null
          ? undefined
          : refs.tripByV1.get(occurrence.owner.viagem_id);
      if (tripId !== undefined) {
        tripRows.push({
          recurringSeriesId: seriesV2Id,
          occurrenceDate: toDate(occurrence.date),
          userId: refs.userId,
          tripId,
        });
      }
    }

    collapsedRows += occurrences.reduce((sum, occurrence) => sum + occurrence.rows.length, 0);
    collapsedInto += versions.length;
    series.push({ v1SeriesId: seriesId, versions, recurrenceEndDate, occurrences: settled });
  }

  const batches: InsertBatch[] = [
    { table: "recurringTransactionSeries", rows: seriesRows },
    { table: "recurringTransactionRules", rows: ruleRows },
    { table: "recurringTransactionSplits", rows: splitRows },
    { table: "recurringTransactionOccurrences", rows: occurrenceRows },
    { table: "recurringOccurrenceTrips", rows: tripRows },
  ];
  const count: TableCount = {
    v1Table: TRANSACTIONS_TABLE,
    read: rows.length,
    written: 0,
    merged: 0,
    skipped: [
      { reason: "zero-recurrence-skip", rows: zeroRows },
      { reason: "recurrence-duplicate-dropped", rows: droppedRows },
    ].filter((item) => item.rows > 0),
    collapsed:
      collapsedRows > 0
        ? [{ reason: "recurrence-occurrences", rows: collapsedRows, into: collapsedInto }]
        : [],
    detached: [
      { reason: "recurrence-duplicate", rows: duplicateRows },
      { reason: "recurrence-as-singles", rows: asSinglesRows },
    ].filter((item) => item.rows > 0),
    droppedColumns: [],
  };

  return { batches, idMap, counts: [count], findings, detached, series };
}
