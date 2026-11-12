import type { ReconciliationLine } from "./reconciliations";

export type ClosureLine = {
  accountingDate: string;
  signedCents: number;
  dayBalanceCents: number | null;
};

export type StatementDayClosure = {
  day: string;
  balanceCents: number;
  previousBalanceCents: number;
  movementCents: number;
  sumCents: number;
  differenceCents: number;
  closes: boolean;
};

export type StatementClosure = {
  closes: boolean;
  days: StatementDayClosure[];
  unverifiedDays: string[];
  divergences: StatementDayClosure[];
};

export type FinalBalance = { date: string; cents: number };

export type InvoiceClosure = {
  closes: boolean;
  netCents: number;
  expectedCents: number;
  differenceCents: number;
};

type DayGroup = { sumCents: number; balanceCents: number | null };

const currencyPrefixPattern = /^R\$\s*/;
const commaAmountPattern = /^(\d+),(\d{1,2})$/;
const dotDecimalPattern = /^(\d+)\.(\d{1,2})$/;
const dotThousandsPattern = /^\d{1,3}(\.\d{3})+$/;
const integerPattern = /^\d+$/;

function groupByAccountingDate(lines: readonly ClosureLine[]) {
  const groups = new Map<string, DayGroup>();
  for (const line of lines) {
    const group = groups.get(line.accountingDate) ?? { sumCents: 0, balanceCents: null };
    group.sumCents += line.signedCents;
    group.balanceCents ??= line.dayBalanceCents;
    groups.set(line.accountingDate, group);
  }
  return groups;
}

export function checkStatementClosure(lines: readonly ClosureLine[]): StatementClosure {
  const groups = groupByAccountingDate(lines);
  const sortedDays = [...groups.keys()].sort();
  const days: StatementDayClosure[] = [];
  const unverifiedDays: string[] = [];
  let previous: number | null = null;

  for (const day of sortedDays) {
    const group = groups.get(day) as DayGroup;
    const balance = group.balanceCents;
    if (balance === null || previous === null) {
      unverifiedDays.push(day);
      previous = balance;
      continue;
    }
    const movementCents = balance - previous;
    const differenceCents = movementCents - group.sumCents;
    days.push({
      day,
      balanceCents: balance,
      previousBalanceCents: previous,
      movementCents,
      sumCents: group.sumCents,
      differenceCents,
      closes: differenceCents === 0,
    });
    previous = balance;
  }

  const divergences = days.filter((day) => !day.closes);
  return { closes: divergences.length === 0, days, unverifiedDays, divergences };
}

export function statementFinalBalance(lines: readonly ClosureLine[]): FinalBalance | null {
  let lastDate: string | null = null;
  for (const line of lines) {
    if (lastDate === null || line.accountingDate > lastDate) lastDate = line.accountingDate;
  }
  if (lastDate === null) return null;

  const finalLine = lines.find(
    (line) => line.accountingDate === lastDate && line.dayBalanceCents !== null,
  );
  if (!finalLine || finalLine.dayBalanceCents === null) return null;
  return { date: lastDate, cents: finalLine.dayBalanceCents };
}

export function invoiceNetCents(
  lines: readonly Pick<ReconciliationLine, "signedCents" | "lineKind">[],
): number {
  const sum = lines
    .filter((line) => line.lineKind !== "invoice-payment")
    .reduce((total, line) => total + line.signedCents, 0);
  return 0 - sum;
}

export function checkInvoiceClosure(netCents: number, expectedCents: number): InvoiceClosure {
  const differenceCents = expectedCents - netCents;
  return { closes: differenceCents === 0, netCents, expectedCents, differenceCents };
}

function parseUnsignedAmountCents(body: string): number | null {
  if (body.includes(",")) {
    const match = body.replaceAll(".", "").match(commaAmountPattern);
    if (!match) return null;
    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  }
  const decimal = body.match(dotDecimalPattern);
  if (decimal) return Number(decimal[1]) * 100 + Number((decimal[2] ?? "").padEnd(2, "0"));
  if (dotThousandsPattern.test(body)) return Number(body.replaceAll(".", "")) * 100;
  if (integerPattern.test(body)) return Number(body) * 100;
  return null;
}

export function parseAmountInputToCents(text: string): number | null {
  const trimmed = text.trim();
  const negative = trimmed.startsWith("-");
  const body = (negative ? trimmed.slice(1) : trimmed).replace(currencyPrefixPattern, "").trim();
  if (body === "") return null;
  const cents = parseUnsignedAmountCents(body);
  if (cents === null) return null;
  return negative ? -cents : cents;
}
