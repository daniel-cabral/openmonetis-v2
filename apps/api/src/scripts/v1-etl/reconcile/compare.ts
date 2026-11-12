import { fromCents } from "@openmonetis/domain/money";
import { getPeriodFromDate } from "@openmonetis/domain/transactions";
import { PAYMENT_METHOD_MAP, toTypedAmount } from "../conversions/amounts";
import type {
  ExpectedDifference,
  ExtractedUser,
  Figure,
  FigureKey,
  FigureKind,
  InformationalItem,
  Resolutions,
  TableCount,
  UserPlan,
  UserReconciliation,
  V1Figure,
  V1Transaction,
  V2Figure,
} from "../types";

const TRANSACTIONS_TABLE = "lancamentos";
const PERIOD_DATE_RULE = "transaction.period-date-mismatch";
const ADMIN_PAYER_ROLE = "admin";
const ZERO_RECURRENCE_REASON = "zero-recurrence-skip";
const SPLIT_GROUP_REASON = "split-group";
const DETACHED_DUPLICATE_REASON = "recurrence-duplicate";
const COUNT_KIND = "transactionCount" as const;

function formatCents(cents: number): string {
  return fromCents(cents).toFixed(2);
}

function transactionCounts(counts: TableCount[]): TableCount[] {
  return counts.filter((count) => count.v1Table === TRANSACTIONS_TABLE);
}

function skippedRows(counts: TableCount[], reason: string): number {
  return transactionCounts(counts)
    .flatMap((count) => count.skipped)
    .filter((item) => item.reason === reason)
    .reduce((sum, item) => sum + item.rows, 0);
}

// Rows removed by collapsing: n source rows become `into` V2 rows.
function collapsedAway(counts: TableCount[], reason: string): number {
  return transactionCounts(counts)
    .flatMap((count) => count.collapsed)
    .filter((item) => item.reason === reason)
    .reduce((sum, item) => sum + item.rows - item.into, 0);
}

function detachedRows(counts: TableCount[], reason: string): number {
  return transactionCounts(counts)
    .flatMap((count) => count.detached)
    .filter((item) => item.reason === reason)
    .reduce((sum, item) => sum + item.rows, 0);
}

function periodDateResolved(x: ExtractedUser, r: Resolutions | null): ExpectedDifference | null {
  const rows = x.transactions.flatMap((row) => {
    const resolution = r?.resolutions[`${PERIOD_DATE_RULE}:${TRANSACTIONS_TABLE}:${row.id}`];
    if (resolution !== "use-date" && resolution !== "use-period") return [];
    const period = resolution === "use-date" ? getPeriodFromDate(row.data_compra) : row.periodo;
    return [{ v1Id: row.id, resolution: resolution as "use-date" | "use-period", period }];
  });
  return rows.length > 0 ? { reason: "period-date-resolved", kind: COUNT_KIND, rows } : null;
}

// Settled admin boletos on an account whose payment month differs from the V1 period: V1 posts
// them in `periodo`, V2 in the payment month, so balances between the two month ends differ.
function boletoPostingMonth(x: ExtractedUser): ExpectedDifference | null {
  const adminPayers = new Set(
    x.payers.filter((payer) => payer.role === ADMIN_PAYER_ROLE).map((payer) => payer.id),
  );
  const isAdmin = (row: V1Transaction) =>
    row.pagador_id === null || adminPayers.has(row.pagador_id);
  const rows = x.transactions.flatMap((row) => {
    if (
      PAYMENT_METHOD_MAP[row.forma_pagamento] !== "boleto" ||
      row.realizado !== true ||
      row.conta_id === null ||
      row.dt_pagamento_boleto === null ||
      !isAdmin(row)
    ) {
      return [];
    }
    const paymentMonth = getPeriodFromDate(row.dt_pagamento_boleto);
    const typed = toTypedAmount(row.valor);
    if (paymentMonth === row.periodo || !typed.ok) return [];
    const cents = typed.type === "expense" ? -typed.amountCents : typed.amountCents;
    const postedLater = paymentMonth > row.periodo;
    return [
      {
        v1Id: row.id,
        period: row.periodo,
        paymentMonth,
        amount: formatCents(cents),
        differenceVsRawV1: {
          periodEnd: postedLater ? row.periodo : paymentMonth,
          value: formatCents(postedLater ? -cents : cents),
        },
      },
    ];
  });
  return rows.length > 0 ? { reason: "boleto-posting-month", kind: "accountBalance", rows } : null;
}

export function buildExpectedDifferences(
  x: ExtractedUser,
  plan: UserPlan,
  r: Resolutions | null,
): { expected: ExpectedDifference[]; informational: InformationalItem[] } {
  const zero = skippedRows(plan.counts, ZERO_RECURRENCE_REASON);
  const split = collapsedAway(plan.counts, SPLIT_GROUP_REASON);
  const expected = [
    zero > 0
      ? { reason: "zero-recurrence-skip" as const, kind: "transactionCount" as const, count: zero }
      : null,
    split > 0
      ? { reason: "split-group" as const, kind: "transactionCount" as const, count: split }
      : null,
    periodDateResolved(x, r),
    boletoPostingMonth(x),
  ].filter((item): item is ExpectedDifference => item !== null);

  const duplicates = detachedRows(plan.counts, DETACHED_DUPLICATE_REASON);
  const informational: InformationalItem[] = [
    ...plan.informational,
    ...(duplicates > 0 ? [{ reason: "recurrence-duplicate-detached", rows: duplicates }] : []),
  ];
  return { expected, informational };
}

function keyOf(kind: FigureKind, key: FigureKey): string {
  return JSON.stringify([
    kind,
    ...Object.keys(key)
      .sort()
      .map((name) => [name, key[name]]),
  ]);
}

// Count budget explained by the load: honored only up to what the load actually skipped or collapsed.
function countBudget(expected: ExpectedDifference[], loadCounts: TableCount[]): number {
  const expectedCount = (reason: "zero-recurrence-skip" | "split-group") =>
    expected
      .filter((item) => item.reason === reason)
      .reduce((sum, item) => sum + ("count" in item ? item.count : 0), 0);
  return (
    Math.min(
      expectedCount("zero-recurrence-skip"),
      skippedRows(loadCounts, ZERO_RECURRENCE_REASON),
    ) + Math.min(expectedCount("split-group"), collapsedAway(loadCounts, SPLIT_GROUP_REASON))
  );
}

function lastPeriodEndByAccount(figures: V1Figure[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const figure of figures) {
    if (figure.kind !== "accountBalance") continue;
    const account = figure.key.account as string;
    const periodEnd = figure.key.periodEnd as string;
    if ((last.get(account) ?? "") < periodEnd) last.set(account, periodEnd);
  }
  return last;
}

export function compareUser(
  v1UserId: string,
  v1: V1Figure[],
  v2: V2Figure[],
  loadCounts: TableCount[],
  informational: UserPlan["informational"],
  expected: ExpectedDifference[],
): UserReconciliation {
  const v2ByKey = new Map(v2.map((figure) => [keyOf(figure.kind, figure.key), figure]));
  const v1Keys = new Set(v1.map((figure) => keyOf(figure.kind, figure.key)));
  // A V2 figure with no V1 counterpart compares against an empty V1 figure.
  const pairs: {
    kind: FigureKind;
    key: FigureKey;
    left: V1Figure | null;
    right: V2Figure | null;
  }[] = [
    ...v1.map((figure) => ({
      kind: figure.kind,
      key: figure.key,
      left: figure,
      right: v2ByKey.get(keyOf(figure.kind, figure.key)) ?? null,
    })),
    ...v2
      .filter((figure) => !v1Keys.has(keyOf(figure.kind, figure.key)))
      .map((figure) => ({ kind: figure.kind, key: figure.key, left: null, right: figure })),
  ];

  const lastPeriodEnd = lastPeriodEndByAccount(v1);
  const boletoListed = expected.some(
    (item) => item.reason === "boleto-posting-month" && item.rows.length > 0,
  );
  let budget = countBudget(expected, loadCounts);

  const figures = pairs.map(({ kind, key, left, right }): Figure => {
    const a = left?.value ?? 0;
    const b = right?.value ?? 0;
    const difference = b - a;

    if (kind === COUNT_KIND) {
      let pass = difference === 0;
      if (difference < 0 && -difference <= budget) {
        budget += difference;
        pass = true;
      }
      return { kind, key, v1: a, v2: b, difference, pass };
    }

    if (kind === "accountBalance") {
      const withPosting = left?.valueWithV2Posting ?? a;
      const isLast = lastPeriodEnd.get(key.account as string) === key.periodEnd;
      const pass = b === withPosting && (b === a || (!isLast && boletoListed));
      return {
        kind,
        key,
        v1: formatCents(a),
        v1WithV2Posting: formatCents(withPosting),
        v2: formatCents(b),
        difference: formatCents(difference),
        pass,
      };
    }

    const figure: Figure = {
      kind,
      key,
      v1: formatCents(a),
      v2: formatCents(b),
      difference: formatCents(difference),
      pass: difference === 0,
    };
    if (kind === "invoiceTotal") {
      figure.status = { v1: left?.status ?? null, v2: right?.status ?? null };
      figure.paidAt = { v1: left?.paidAt ?? null, v2: right?.paidAt ?? null };
      figure.pass =
        figure.pass &&
        figure.status.v1 === figure.status.v2 &&
        figure.paidAt.v1 === figure.paidAt.v2;
    }
    return figure;
  });

  return {
    v1UserId,
    pass: figures.every((figure) => figure.pass),
    figures,
    informational,
    expectedDifferences: expected,
  };
}
