import type { CardClosingRule } from "./cards";
import { getRecurringDueDate } from "./recurring-expenses";
import {
  addMonthsToPeriod,
  deriveTransactionPeriod,
  type PaymentMethod,
  type TransactionCondition,
  type TransactionOrigin,
  type TransactionType,
} from "./transactions";

export const tripNameMaxLength = 60;
export const tripNoteMaxLength = 500;
export const tripSuggestionsPageSize = 20;
export const tripPeriodRangeMaxMonths = 24;

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const transactionLinkPattern = new RegExp(`^(${uuidPattern})$`, "i");
const tripIdPattern = new RegExp(`^${uuidPattern}$`, "i");
const occurrenceLinkPattern = new RegExp(`^(${uuidPattern}):(\\d{4}-\\d{2}-\\d{2})$`, "i");

export type TripPeriod = { id: string; startDate: string; endDate: string };
export type TripLinkTarget =
  | { kind: "transaction"; id: string }
  | { kind: "occurrence"; recurringRuleId: string; occurrenceDate: string };
export type TripLinkChange =
  | { kind: "none" }
  | { kind: "linkRow"; tripId: string }
  | { kind: "linkSeries"; tripId: string }
  | { kind: "unlinkRow" };

export type TripFilter = { mode: "all" } | { mode: "none" } | { mode: "trip"; tripId: string };

export type TripLedgerShare = {
  personName: string | null;
  isAdmin: boolean;
  amountCents: number;
};

export type TripLedgerEntry = {
  id: string;
  name: string;
  purchaseDate: string;
  type: "income" | "expense";
  installment: { current: number; count: number } | null;
  categoryName: string | null;
  sourceLabel: string | null;
  shares: TripLedgerShare[];
};

export type TripBreakdownItem = { label: string; amountCents: number };

export type TripSummary = {
  netCostCents: number;
  expenseCents: number;
  reimbursementCents: number;
  byCategory: TripBreakdownItem[];
  bySource: TripBreakdownItem[];
  byPerson: TripBreakdownItem[];
};

export type TripSuggestionRow = {
  condition: TransactionCondition;
  seriesId: string | null;
  cardId: string | null;
  cardName: string | null;
  accountId: string | null;
  accountName: string | null;
};

export type TripSuggestionOriginOption = { value: string; label: string };

export function findOverlappingTrip<T extends TripPeriod>(
  candidate: { id?: string; startDate: string; endDate: string },
  trips: readonly T[],
): T | undefined {
  return trips.find(
    (trip) =>
      trip.id !== candidate.id &&
      trip.startDate <= candidate.endDate &&
      candidate.startDate <= trip.endDate,
  );
}

export function findTripForDate<T extends TripPeriod>(
  trips: readonly T[],
  date: string,
): T | undefined {
  return trips.find((trip) => trip.startDate <= date && date <= trip.endDate);
}

export function isTripLinkable(input: { type: TransactionType; origin: TransactionOrigin }) {
  return input.type !== "transfer" && (input.origin === "regular" || input.origin === "refund");
}

export function planTripLinkChange(input: {
  storedTripId: string | null;
  requestedTripId: string | null | undefined;
  condition: TransactionCondition;
}): TripLinkChange {
  const { storedTripId, requestedTripId, condition } = input;
  if (requestedTripId === undefined || requestedTripId === storedTripId) {
    return { kind: "none" };
  }
  if (requestedTripId === null) {
    return { kind: "unlinkRow" };
  }
  return condition === "installment"
    ? { kind: "linkSeries", tripId: requestedTripId }
    : { kind: "linkRow", tripId: requestedTripId };
}

export function parseTripLinkTarget(id: string): TripLinkTarget | null {
  const transaction = transactionLinkPattern.exec(id);
  if (transaction) return { kind: "transaction", id: transaction[1] };
  const occurrence = occurrenceLinkPattern.exec(id);
  if (occurrence) {
    return {
      kind: "occurrence",
      recurringRuleId: occurrence[1],
      occurrenceDate: occurrence[2],
    };
  }
  return null;
}

export function parseTripFilter(raw?: string | null): TripFilter {
  if (raw === "none") return { mode: "none" };
  if (raw && tripIdPattern.test(raw)) return { mode: "trip", tripId: raw };
  return { mode: "all" };
}

export function matchesTripFilter(tripId: string | null | undefined, filter: TripFilter): boolean {
  switch (filter.mode) {
    case "all":
      return true;
    case "none":
      return !tripId;
    case "trip":
      return tripId === filter.tripId;
  }
}

export function resolveTripPeriodRange(input: {
  periods: readonly string[];
  maxMonths?: number;
}): { startPeriod: string; endPeriod: string } | null {
  if (input.periods.length === 0) return null;
  const startPeriod = input.periods.reduce((min, period) => (period < min ? period : min));
  const latestPeriod = input.periods.reduce((max, period) => (period > max ? period : max));
  if (input.maxMonths === undefined) return { startPeriod, endPeriod: latestPeriod };
  const cappedPeriod = addMonthsToPeriod(startPeriod, input.maxMonths - 1);
  return {
    startPeriod,
    endPeriod: latestPeriod < cappedPeriod ? latestPeriod : cappedPeriod,
  };
}

export type TripPeriodSourceOccurrence = {
  occurrenceDate: string;
  paymentMethod: PaymentMethod;
  dueDate: string | null;
  card: { closingDay: number | null; closingRule?: CardClosingRule; dueDay: number } | null;
};

export function listTripLinkedPeriods(input: {
  transactionPeriods: readonly string[];
  occurrences: readonly TripPeriodSourceOccurrence[];
}): string[] {
  return [
    ...input.transactionPeriods,
    ...input.occurrences.map((occurrence) =>
      deriveTransactionPeriod({
        paymentMethod: occurrence.paymentMethod,
        purchaseDate: occurrence.occurrenceDate,
        dueDate: getRecurringDueDate(occurrence.dueDate, occurrence.occurrenceDate),
        card: occurrence.card,
      }),
    ),
  ];
}

function addToBreakdown(
  items: Map<string, number>,
  label: string | null,
  fallback: string,
  amountCents: number,
) {
  const key = label ?? fallback;
  items.set(key, (items.get(key) ?? 0) + amountCents);
}

function toSortedBreakdown(items: Map<string, number>): TripBreakdownItem[] {
  return [...items.entries()]
    .map(([label, amountCents]) => ({ label, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label, "pt-BR"));
}

export function summarizeTrip(entries: readonly TripLedgerEntry[]): TripSummary {
  let expenseCents = 0;
  let reimbursementCents = 0;
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byPerson = new Map<string, number>();

  for (const entry of entries) {
    const ownCents = entry.shares
      .filter((share) => share.isAdmin)
      .reduce((sum, share) => sum + share.amountCents, 0);

    if (entry.type === "income") {
      reimbursementCents += ownCents;
      continue;
    }

    expenseCents += ownCents;
    if (ownCents > 0) {
      addToBreakdown(byCategory, entry.categoryName, "Sem categoria", ownCents);
      addToBreakdown(bySource, entry.sourceLabel, "Sem cartão ou conta", ownCents);
    }
    for (const share of entry.shares) {
      addToBreakdown(byPerson, share.personName, "Sem pessoa", share.amountCents);
    }
  }

  return {
    netCostCents: expenseCents - reimbursementCents,
    expenseCents,
    reimbursementCents,
    byCategory: toSortedBreakdown(byCategory),
    bySource: toSortedBreakdown(bySource),
    byPerson: toSortedBreakdown(byPerson),
  };
}

export function dedupeTripSuggestions<T extends TripSuggestionRow>(rows: readonly T[]): T[] {
  const seenSeries = new Set<string>();
  return rows.filter((row) => {
    if (row.condition !== "installment" || row.seriesId === null) return true;
    if (seenSeries.has(row.seriesId)) return false;
    seenSeries.add(row.seriesId);
    return true;
  });
}

export function buildTripSuggestionOriginOptions(
  rows: readonly TripSuggestionRow[],
): TripSuggestionOriginOption[] {
  const options = new Map<string, string>();
  for (const row of rows) {
    if (row.cardId) options.set(`card:${row.cardId}`, row.cardName ?? "");
    if (row.accountId) options.set(`account:${row.accountId}`, row.accountName ?? "");
  }
  return [...options.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function filterTripSuggestionsByOrigin<T extends TripSuggestionRow>(
  rows: readonly T[],
  origin: string,
): T[] {
  switch (origin) {
    case "all":
      return [...rows];
    case "cards":
      return rows.filter((row) => row.cardId !== null);
    case "accounts":
      return rows.filter((row) => row.accountId !== null);
    default: {
      const [kind, id] = origin.split(":");
      if (kind === "card") return rows.filter((row) => row.cardId === id);
      if (kind === "account") return rows.filter((row) => row.accountId === id);
      return [];
    }
  }
}

export function paginateTripSuggestions<T>(rows: readonly T[], page: number) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / tripSuggestionsPageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const start = (currentPage - 1) * tripSuggestionsPageSize;
  const items = rows.slice(start, start + tripSuggestionsPageSize);
  return {
    items,
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + items.length,
  };
}
