import {
  cards,
  categories,
  db,
  financialAccounts,
  people,
  recurringOccurrenceTrips,
  recurringTransactionRules,
  transactionSplits,
  transactions,
  transactionTrips,
  trips,
} from "@openmonetis/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  LedgerTransactionRow,
  TripInput,
  TripLedgerRows,
  TripRecord,
  TripsRepository,
} from "../services/trips.service";

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const toDateString = (value: Date) => value.toISOString().slice(0, 10);

function toTripRecord(row: typeof trips.$inferSelect): TripRecord {
  return { ...row, startDate: toDateString(row.startDate), endDate: toDateString(row.endDate) };
}

function toTripValues(input: TripInput) {
  return {
    name: input.name,
    note: input.note,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
  };
}

export const tripsRepository: TripsRepository = {
  async listForUser(userId) {
    const rows = await db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(asc(trips.startDate), asc(trips.name));
    return rows.map(toTripRecord);
  },
  async findByIdForUser(id, userId) {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)));
    return trip ? toTripRecord(trip) : null;
  },
  async createForUser(userId, input) {
    const [trip] = await db
      .insert(trips)
      .values({ userId, ...toTripValues(input) })
      .returning();
    return toTripRecord(trip);
  },
  async updateForUser(id, userId, input) {
    const [trip] = await db
      .update(trips)
      .set({ ...toTripValues(input), updatedAt: new Date() })
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
      .returning();
    return trip ? toTripRecord(trip) : null;
  },
  async deleteForUser(id, userId) {
    const [trip] = await db
      .delete(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
      .returning({ id: trips.id });
    return Boolean(trip);
  },
  async listLedgerRowsForUser(userId, tripId) {
    const linkedRows = await db
      .select({
        id: transactions.id,
        name: transactions.name,
        purchaseDate: transactions.purchaseDate,
        type: transactions.type,
        amount: transactions.amount,
        condition: transactions.condition,
        currentInstallment: transactions.currentInstallment,
        installmentCount: transactions.installmentCount,
        seriesId: transactions.seriesId,
        recurringRuleId: transactions.recurringRuleId,
        personId: transactions.personId,
        personName: people.name,
        categoryName: categories.name,
        cardName: cards.name,
        accountName: financialAccounts.name,
        tripId: transactionTrips.tripId,
      })
      .from(transactionTrips)
      .innerJoin(
        transactions,
        and(
          eq(transactions.id, transactionTrips.transactionId),
          eq(transactions.userId, transactionTrips.userId),
        ),
      )
      .innerJoin(people, eq(people.id, transactions.personId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .leftJoin(cards, eq(cards.id, transactions.cardId))
      .leftJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
      .where(
        and(
          eq(transactionTrips.userId, userId),
          tripId ? eq(transactionTrips.tripId, tripId) : undefined,
        ),
      );

    const transactionIds = linkedRows.map((row) => row.id);
    const splitRows = transactionIds.length
      ? await db
          .select({
            transactionId: transactionSplits.transactionId,
            personId: transactionSplits.personId,
            personName: people.name,
            amount: transactionSplits.amount,
          })
          .from(transactionSplits)
          .innerJoin(people, eq(people.id, transactionSplits.personId))
          .where(
            and(
              eq(transactionSplits.userId, userId),
              inArray(transactionSplits.transactionId, transactionIds),
            ),
          )
      : [];

    const occurrenceLinks = await db
      .select({
        recurringSeriesId: recurringOccurrenceTrips.recurringSeriesId,
        occurrenceDate: recurringOccurrenceTrips.occurrenceDate,
        tripId: recurringOccurrenceTrips.tripId,
      })
      .from(recurringOccurrenceTrips)
      .where(
        and(
          eq(recurringOccurrenceTrips.userId, userId),
          tripId ? eq(recurringOccurrenceTrips.tripId, tripId) : undefined,
        ),
      );

    const seriesIds = [...new Set(occurrenceLinks.map((link) => link.recurringSeriesId))];
    const ruleVersions = seriesIds.length
      ? await db
          .select({
            id: recurringTransactionRules.id,
            seriesId: recurringTransactionRules.seriesId,
            startDate: recurringTransactionRules.startDate,
            endDate: recurringTransactionRules.endDate,
          })
          .from(recurringTransactionRules)
          .where(
            and(
              eq(recurringTransactionRules.userId, userId),
              inArray(recurringTransactionRules.seriesId, seriesIds),
            ),
          )
      : [];

    return {
      transactions: linkedRows.map(
        (row): LedgerTransactionRow => ({
          ...row,
          purchaseDate: toDateString(row.purchaseDate),
          splits: splitRows.filter((split) => split.transactionId === row.id),
        }),
      ),
      occurrences: occurrenceLinks.map((link) => {
        const occurrenceDate = toDateString(link.occurrenceDate);
        return {
          tripId: link.tripId,
          recurringSeriesId: link.recurringSeriesId,
          occurrenceDate,
          recurringRuleId:
            ruleVersions.find(
              (rule) =>
                rule.seriesId === link.recurringSeriesId &&
                toDateString(rule.startDate) <= occurrenceDate &&
                (rule.endDate === null || toDateString(rule.endDate) >= occurrenceDate),
            )?.id ?? null,
        };
      }),
    } satisfies TripLedgerRows;
  },
  async findAdminPersonIdForUser(userId) {
    const [admin] = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.userId, userId), eq(people.role, "admin")));
    return admin?.id ?? null;
  },
};
