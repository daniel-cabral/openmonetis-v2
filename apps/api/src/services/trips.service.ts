import { fromCents, toCents } from "@openmonetis/domain/money";
import type {
  TransactionCondition,
  TransactionOrigin,
  TransactionType,
} from "@openmonetis/domain/transactions";
import {
  buildTripSuggestionOriginOptions,
  dedupeTripSuggestions,
  filterTripSuggestionsByOrigin,
  findOverlappingTrip,
  isTripLinkable,
  paginateTripSuggestions,
  parseTripLinkTarget,
  summarizeTrip,
  type TripLedgerEntry,
  type TripSuggestionRow,
  type TripSummary,
} from "@openmonetis/domain/trips";
import type { TransactionOutput } from "@openmonetis/validators/transactions";
import type {
  CreateTripInput,
  TripSuggestionsQuery,
  UpdateTripInput,
} from "@openmonetis/validators/trips";
import { ApiError, badRequest, conflict, notFound } from "../utils/errors";

export type TripRecord = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export type TripInput = Pick<TripRecord, "name" | "startDate" | "endDate" | "note">;
export type LedgerSplitRow = { personId: string; personName: string; amount: string };
export type LedgerTransactionRow = {
  id: string;
  name: string;
  purchaseDate: string;
  type: "income" | "expense" | "transfer";
  amount: string;
  condition: "single" | "installment" | "recurring";
  currentInstallment: number | null;
  installmentCount: number | null;
  seriesId: string | null;
  recurringRuleId: string | null;
  personId: string;
  personName: string;
  categoryName: string | null;
  cardName: string | null;
  accountName: string | null;
  tripId: string;
  splits: LedgerSplitRow[];
};
export type LedgerOccurrenceRow = {
  tripId: string;
  recurringSeriesId: string;
  occurrenceDate: string;
  recurringRuleId: string | null;
};
export type TripLedgerRows = {
  transactions: LedgerTransactionRow[];
  occurrences: LedgerOccurrenceRow[];
};
export type TripsRepository = {
  listForUser(userId: string): Promise<TripRecord[]>;
  findByIdForUser(id: string, userId: string): Promise<TripRecord | null>;
  createForUser(userId: string, input: TripInput): Promise<TripRecord>;
  updateForUser(id: string, userId: string, input: TripInput): Promise<TripRecord | null>;
  deleteForUser(id: string, userId: string): Promise<boolean>;
  listLedgerRowsForUser(userId: string, tripId?: string): Promise<TripLedgerRows>;
  findAdminPersonIdForUser(userId: string): Promise<string | null>;
  resolveLinkTargetsForUser(
    userId: string,
    input: { transactionIds: string[]; ruleIds: string[] },
  ): Promise<LinkTargetRows>;
  linkTransactionsForUser(userId: string, tripId: string, input: LinkWrite): Promise<string[]>;
  unlinkTransactionsForUser(userId: string, input: UnlinkWrite): Promise<void>;
};
export type LinkTargetTransactionRow = {
  id: string;
  seriesId: string | null;
  type: TransactionType;
  origin: TransactionOrigin;
  condition: TransactionCondition;
  tripId: string | null;
};
export type LinkTargetRows = {
  transactions: LinkTargetTransactionRow[];
  rules: Array<{ id: string; seriesId: string }>;
  occurrenceLinks: Array<{ recurringSeriesId: string; occurrenceDate: string; tripId: string }>;
};
export type LinkOccurrence = { seriesId: string; occurrenceDate: string };
export type LinkWrite = {
  transactionIds: string[];
  seriesIds: string[];
  occurrences: LinkOccurrence[];
};
export type UnlinkWrite = { transactionIds: string[]; occurrences: LinkOccurrence[] };
export type TripsServicePorts = {
  getRecurringOccurrence(
    ruleId: string,
    purchaseDate: string,
    userId: string,
  ): Promise<TransactionOutput>;
  listTransactionsByPurchaseDate(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<TransactionOutput[]>;
};

type TripSuggestionCandidate = TripSuggestionRow & {
  id: string;
  name: string;
  purchaseDate: string;
  amount: number;
  type: TransactionType;
  isRecurring: boolean;
  categoryName: string | null;
  currentInstallment: number | null;
  installmentCount: number | null;
};

const skippedOccurrenceCodes = new Set([
  "INVALID_RECURRING_OCCURRENCE",
  "RECURRING_RULE_NOT_FOUND",
]);

function toTripOutput(trip: TripRecord) {
  return {
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    note: trip.note,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

function parseLinkIds(ids: string[]) {
  return ids.map((id) => {
    const target = parseTripLinkTarget(id);
    if (!target) throw badRequest("Invalid trip link target", "INVALID_TRIP_LINK_TARGET");
    return { id, target };
  });
}

function toLinkId(item: TransactionOutput) {
  if (item.recordId) return item.recordId;
  return item.recurringRuleId ? `${item.recurringRuleId}:${item.purchaseDate}` : null;
}

function toSuggestionCandidate(item: TransactionOutput, id: string): TripSuggestionCandidate {
  return {
    id,
    name: item.name,
    purchaseDate: item.purchaseDate,
    amount: Math.abs(item.amount),
    type: item.type,
    isRecurring: item.isRecurring,
    condition: item.condition,
    seriesId: item.seriesId,
    cardId: item.cardId,
    cardName: item.cardName,
    accountId: item.accountId,
    accountName: item.accountName,
    categoryName: item.categoryName,
    currentInstallment: item.currentInstallment,
    installmentCount: item.installmentCount,
  };
}

function toSuggestionOutput(row: TripSuggestionCandidate) {
  return {
    id: row.id,
    name: row.name,
    purchaseDate: row.purchaseDate,
    amount: row.amount,
    type: row.type,
    isRecurring: row.isRecurring,
    cardId: row.cardId,
    cardName: row.cardName,
    accountId: row.accountId,
    accountName: row.accountName,
    categoryName: row.categoryName,
    currentInstallment: row.currentInstallment,
    installmentCount: row.installmentCount,
  };
}

function toBreakdownOutput(items: TripSummary["byCategory"]) {
  return items.map((item) => ({ label: item.label, amount: fromCents(item.amountCents) }));
}

function toSummaryOutput(summary: TripSummary) {
  return {
    netCost: fromCents(summary.netCostCents),
    expenses: fromCents(summary.expenseCents),
    reimbursements: fromCents(summary.reimbursementCents),
    byCategory: toBreakdownOutput(summary.byCategory),
    bySource: toBreakdownOutput(summary.bySource),
    byPerson: toBreakdownOutput(summary.byPerson),
  };
}

export function createTripsService(repository: TripsRepository, ports: TripsServicePorts) {
  async function resolveLedger(userId: string, tripId?: string) {
    const [rows, adminId] = await Promise.all([
      repository.listLedgerRowsForUser(userId, tripId),
      repository.findAdminPersonIdForUser(userId),
    ]);
    const isAdmin = (personId: string | null) => personId !== null && personId === adminId;
    const entries: Array<{ tripId: string; linked: LinkedEntry; entry: TripLedgerEntry }> = [];

    for (const row of rows.transactions) {
      const shares =
        row.splits.length > 0
          ? row.splits.map((split) => ({
              personId: split.personId,
              personName: split.personName,
              amountCents: toCents(Math.abs(Number(split.amount))),
            }))
          : [
              {
                personId: row.personId,
                personName: row.personName,
                amountCents: toCents(Math.abs(Number(row.amount))),
              },
            ];
      const amount = Math.abs(Number(row.amount));
      entries.push({
        tripId: row.tripId,
        linked: {
          id: row.id,
          name: row.name,
          purchaseDate: row.purchaseDate,
          type: row.type,
          amount,
          currentInstallment: row.condition === "installment" ? row.currentInstallment : null,
          installmentCount: row.condition === "installment" ? row.installmentCount : null,
          isRecurring: row.recurringRuleId !== null,
          personNames: [...new Set(shares.map((share) => share.personName))],
        },
        entry: {
          id: row.id,
          name: row.name,
          purchaseDate: row.purchaseDate,
          type: row.type === "income" ? "income" : "expense",
          installment:
            row.condition === "installment" && row.currentInstallment && row.installmentCount
              ? { current: row.currentInstallment, count: row.installmentCount }
              : null,
          categoryName: row.categoryName,
          sourceLabel: row.cardName ?? row.accountName,
          shares: shares.map((share) => ({
            personName: share.personName,
            isAdmin: isAdmin(share.personId),
            amountCents: share.amountCents,
          })),
        },
      });
    }

    for (const link of rows.occurrences) {
      if (!link.recurringRuleId) continue;
      let occurrence: TransactionOutput;
      try {
        occurrence = await ports.getRecurringOccurrence(
          link.recurringRuleId,
          link.occurrenceDate,
          userId,
        );
      } catch (error) {
        if (error instanceof ApiError && skippedOccurrenceCodes.has(error.code)) continue;
        throw error;
      }
      const splitShares = occurrence.splitShares.length
        ? occurrence.splitShares
        : [
            {
              personId: occurrence.personId,
              personName: occurrence.personName,
              amount: occurrence.amount,
            },
          ];
      const amount = Math.abs(occurrence.amount);
      entries.push({
        tripId: link.tripId,
        linked: {
          id: occurrence.id,
          name: occurrence.name,
          purchaseDate: occurrence.purchaseDate,
          type: occurrence.type,
          amount,
          currentInstallment: null,
          installmentCount: null,
          isRecurring: true,
          personNames: [...new Set(splitShares.map((share) => share.personName))],
        },
        entry: {
          id: occurrence.id,
          name: occurrence.name,
          purchaseDate: occurrence.purchaseDate,
          type: occurrence.type === "income" ? "income" : "expense",
          installment: null,
          categoryName: occurrence.categoryName,
          sourceLabel: occurrence.cardName ?? occurrence.accountName,
          shares: splitShares.map((share) => ({
            personName: share.personName,
            isAdmin: isAdmin(share.personId),
            amountCents: toCents(Math.abs(share.amount)),
          })),
        },
      });
    }

    return entries;
  }

  async function findTripOrThrow(id: string, userId: string) {
    const trip = await repository.findByIdForUser(id, userId);
    if (!trip) throw notFound("Trip not found", "TRIP_NOT_FOUND");
    return trip;
  }

  async function assertNoOverlap(
    input: { id?: string; startDate: string; endDate: string },
    userId: string,
  ) {
    const trips = await repository.listForUser(userId);
    if (findOverlappingTrip(input, trips)) {
      throw conflict("Trip dates overlap another trip", "TRIP_OVERLAP");
    }
  }

  async function resolveLinkTargets(userId: string, ids: string[]) {
    const targets = parseLinkIds(ids);
    const rows = await repository.resolveLinkTargetsForUser(userId, {
      transactionIds: targets.flatMap(({ target }) =>
        target.kind === "transaction" ? [target.id] : [],
      ),
      ruleIds: targets.flatMap(({ target }) =>
        target.kind === "occurrence" ? [target.recurringRuleId] : [],
      ),
    });
    return {
      targets,
      transactionsById: new Map(rows.transactions.map((row) => [row.id, row])),
      seriesByRuleId: new Map(rows.rules.map((rule) => [rule.id, rule.seriesId])),
      occurrenceLinks: rows.occurrenceLinks,
    };
  }

  return {
    async list(userId: string) {
      const [trips, entries] = await Promise.all([
        repository.listForUser(userId),
        resolveLedger(userId),
      ]);
      return trips
        .map((trip) => {
          const linked = entries.filter((item) => item.tripId === trip.id);
          const summary = summarizeTrip(linked.map((item) => item.entry));
          return {
            ...toTripOutput(trip),
            linkedCount: linked.length,
            netCost: fromCents(summary.netCostCents),
          };
        })
        .sort(
          (a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name, "pt-BR"),
        );
    },
    async create(input: CreateTripInput, userId: string) {
      await assertNoOverlap(input, userId);
      return toTripOutput(await repository.createForUser(userId, input));
    },
    async update(id: string, input: UpdateTripInput, userId: string) {
      await findTripOrThrow(id, userId);
      await assertNoOverlap({ ...input, id }, userId);
      const trip = await repository.updateForUser(id, userId, input);
      if (!trip) throw notFound("Trip not found", "TRIP_NOT_FOUND");
      return toTripOutput(trip);
    },
    async remove(id: string, userId: string) {
      if (!(await repository.deleteForUser(id, userId))) {
        throw notFound("Trip not found", "TRIP_NOT_FOUND");
      }
      return { id };
    },
    async getDetail(id: string, userId: string) {
      const trip = await findTripOrThrow(id, userId);
      const entries = await resolveLedger(userId, id);
      const linked = entries
        .map((item) => item.linked)
        .sort(
          (a, b) =>
            a.purchaseDate.localeCompare(b.purchaseDate) ||
            (a.currentInstallment ?? 0) - (b.currentInstallment ?? 0) ||
            a.name.localeCompare(b.name, "pt-BR"),
        );
      return {
        trip: toTripOutput(trip),
        summary: toSummaryOutput(summarizeTrip(entries.map((item) => item.entry))),
        linked,
      };
    },
    async listSuggestions(id: string, query: TripSuggestionsQuery, userId: string) {
      const trip = await findTripOrThrow(id, userId);
      const items = await ports.listTransactionsByPurchaseDate(
        userId,
        trip.startDate,
        trip.endDate,
      );
      const candidates = new Map<string, TripSuggestionCandidate>();
      for (const item of items) {
        const linkId = toLinkId(item);
        if (linkId === null || item.tripId || !isTripLinkable(item) || candidates.has(linkId)) {
          continue;
        }
        candidates.set(linkId, toSuggestionCandidate(item, linkId));
      }
      const sorted = [...candidates.values()].sort(
        (a, b) =>
          a.purchaseDate.localeCompare(b.purchaseDate) ||
          (a.currentInstallment ?? 0) - (b.currentInstallment ?? 0) ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
      const rows = dedupeTripSuggestions(sorted);
      const filtered = filterTripSuggestionsByOrigin(rows, query.origin);
      const page = paginateTripSuggestions(filtered, query.page);
      return {
        items: page.items.map(toSuggestionOutput),
        page: page.page,
        pageCount: page.pageCount,
        total: page.total,
        from: page.from,
        to: page.to,
        originOptions: buildTripSuggestionOriginOptions(rows),
        filteredIds: filtered.map((row) => row.id),
      };
    },
    async link(id: string, ids: string[], userId: string) {
      await findTripOrThrow(id, userId);
      const { targets, transactionsById, seriesByRuleId } = await resolveLinkTargets(userId, ids);
      const transactionIds: string[] = [];
      const seriesIds = new Set<string>();
      const occurrences: LinkOccurrence[] = [];
      const occurrenceIds: string[] = [];
      for (const { id: linkId, target } of targets) {
        if (target.kind === "transaction") {
          const row = transactionsById.get(target.id);
          if (!row) throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");
          if (!isTripLinkable(row)) {
            throw badRequest("Transaction cannot be linked to a trip", "TRIP_NOT_LINKABLE");
          }
          if (row.condition === "installment" && row.seriesId) seriesIds.add(row.seriesId);
          else transactionIds.push(row.id);
          continue;
        }
        const seriesId = seriesByRuleId.get(target.recurringRuleId);
        if (!seriesId) throw notFound("Recurring rule not found", "RECURRING_RULE_NOT_FOUND");
        const occurrence = await ports.getRecurringOccurrence(
          target.recurringRuleId,
          target.occurrenceDate,
          userId,
        );
        if (!isTripLinkable(occurrence)) {
          throw badRequest("Transaction cannot be linked to a trip", "TRIP_NOT_LINKABLE");
        }
        occurrences.push({ seriesId, occurrenceDate: target.occurrenceDate });
        occurrenceIds.push(linkId);
      }
      const linkedTransactionIds = await repository.linkTransactionsForUser(userId, id, {
        transactionIds,
        seriesIds: [...seriesIds],
        occurrences,
      });
      return { ids: [...linkedTransactionIds, ...occurrenceIds] };
    },
    async unlink(id: string, ids: string[], userId: string) {
      await findTripOrThrow(id, userId);
      const { targets, transactionsById, seriesByRuleId, occurrenceLinks } =
        await resolveLinkTargets(userId, ids);
      const transactionIds: string[] = [];
      const occurrences: LinkOccurrence[] = [];
      const unlinkedIds: string[] = [];
      for (const { id: linkId, target } of targets) {
        if (target.kind === "transaction") {
          const row = transactionsById.get(target.id);
          if (!row) throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");
          if (row.tripId === id) {
            transactionIds.push(row.id);
            unlinkedIds.push(linkId);
          }
          continue;
        }
        const seriesId = seriesByRuleId.get(target.recurringRuleId);
        if (!seriesId) throw notFound("Recurring rule not found", "RECURRING_RULE_NOT_FOUND");
        const isLinkedToTrip = occurrenceLinks.some(
          (link) =>
            link.recurringSeriesId === seriesId &&
            link.occurrenceDate === target.occurrenceDate &&
            link.tripId === id,
        );
        if (isLinkedToTrip) {
          occurrences.push({ seriesId, occurrenceDate: target.occurrenceDate });
          unlinkedIds.push(linkId);
        }
      }
      await repository.unlinkTransactionsForUser(userId, { transactionIds, occurrences });
      return { ids: unlinkedIds };
    },
  };
}

type LinkedEntry = {
  id: string;
  name: string;
  purchaseDate: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  currentInstallment: number | null;
  installmentCount: number | null;
  isRecurring: boolean;
  personNames: string[];
};

export type TripsService = ReturnType<typeof createTripsService>;
