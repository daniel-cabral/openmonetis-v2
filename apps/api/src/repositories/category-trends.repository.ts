import {
  cards,
  categories,
  db,
  people,
  recurringTransactionRules,
  recurringTransactionSplits,
  transactionSplits,
  transactions,
  transactionTrips,
} from "@openmonetis/db";
import { resolveCardClosingRule } from "@openmonetis/domain/cards";
import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CategoryTrendsRepository } from "../services/category-trends.service";
import { effectiveRecurringEndDateSql } from "./recurring-transactions.repository";
import {
  effectiveSplitAmountSql,
  effectiveTransactionAmountSql,
  recurringOccurrenceOverridesSql,
} from "./settlements.repository";
import { recurringOccurrenceTripIdsSql } from "./transactions.repository";

const transactionPeople = alias(people, "category_trend_transaction_people");
const splitPeople = alias(people, "category_trend_split_people");
const recurringPeople = alias(people, "category_trend_recurring_people");
const recurringSplitPeople = alias(people, "category_trend_recurring_split_people");

export const categoryTrendsRepository = {
  async listCategoriesForUser(userId) {
    const rows = await db
      .select({
        categoryId: categories.id,
        parentId: categories.parentId,
        isSystem: categories.isSystem,
        name: categories.name,
        icon: categories.icon,
        type: categories.type,
      })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          or(ne(categories.name, invoicePaymentCategoryName), eq(categories.isSystem, false)),
        ),
      )
      .orderBy(asc(categories.name), asc(categories.id));
    return rows;
  },

  async listActualEntriesForUser(
    userId,
    startPeriod,
    endPeriod,
    categoryIds,
    personScope = "admin",
  ) {
    const rows = await db
      .select({
        categoryId: categories.id,
        origin: transactions.origin,
        transactionType: transactions.type,
        type: categories.type,
        period: transactions.period,
        tripId: transactionTrips.tripId,
        amount:
          sql<string>`case when ${transactionSplits.id} is not null then ${effectiveSplitAmountSql} else ${effectiveTransactionAmountSql} end`.as(
            "amount",
          ),
      })
      .from(transactions)
      .innerJoin(
        transactionPeople,
        and(eq(transactions.personId, transactionPeople.id), eq(transactionPeople.userId, userId)),
      )
      .leftJoin(
        transactionSplits,
        and(
          eq(transactionSplits.transactionId, transactions.id),
          eq(transactionSplits.userId, userId),
        ),
      )
      .leftJoin(
        splitPeople,
        and(eq(transactionSplits.personId, splitPeople.id), eq(splitPeople.userId, userId)),
      )
      .innerJoin(
        categories,
        and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId)),
      )
      .leftJoin(
        transactionTrips,
        and(
          eq(transactionTrips.transactionId, transactions.id),
          eq(transactionTrips.userId, userId),
        ),
      )
      .where(
        and(
          eq(transactions.userId, userId),
          ne(transactions.type, "transfer"),
          or(ne(categories.name, invoicePaymentCategoryName), eq(categories.isSystem, false)),
          gte(transactions.period, startPeriod),
          lte(transactions.period, endPeriod),
          personScope === "all"
            ? undefined
            : or(
                and(
                  isNull(transactionSplits.id),
                  personScope === "admin"
                    ? eq(transactionPeople.role, "admin")
                    : eq(transactionPeople.id, personScope),
                ),
                personScope === "admin"
                  ? eq(splitPeople.role, "admin")
                  : eq(splitPeople.id, personScope),
              ),
          categoryIds.length ? inArray(categories.id, [...categoryIds]) : undefined,
        ),
      )
      .orderBy(asc(transactions.period), asc(categories.name), asc(categories.id));
    return rows;
  },

  async listRecurringRulesForUser(userId, periodEnd, categoryIds, personScope = "admin") {
    const rows = await db
      .select({
        categoryId: categories.id,
        type: categories.type,
        amount:
          sql<string>`case when ${recurringTransactionSplits.id} is not null then ${recurringTransactionSplits.amount} else ${recurringTransactionRules.amount} end`.as(
            "amount",
          ),
        anchorDate: recurringTransactionRules.anchorDate,
        startDate: recurringTransactionRules.startDate,
        endDate: effectiveRecurringEndDateSql,

        configuredEndDate: sql<
          string | null
        >`to_char(${recurringTransactionRules.recurrenceEndDate}, 'YYYY-MM-DD')`.as(
          "configured_end_date",
        ),
        occurrenceOverrides: recurringOccurrenceOverridesSql,
        occurrenceTripIds: recurringOccurrenceTripIdsSql,
        allocationPersonId:
          sql<string>`coalesce(${recurringTransactionSplits.personId}, ${recurringTransactionRules.personId})`.as(
            "allocation_person_id",
          ),
        frequency: recurringTransactionRules.frequency,
        paymentMethod: recurringTransactionRules.paymentMethod,
        dueDate: recurringTransactionRules.dueDate,
        status: recurringTransactionRules.status,
        cardClosingDay: cards.closingDay,
        cardClosingRuleType: cards.closingRuleType,
        cardClosingOffsetDays: cards.closingOffsetDays,
        cardClosingOffsetMode: cards.closingOffsetMode,
        cardClosingDayPurchasesNextInvoice: cards.closingDayPurchasesNextInvoice,
        cardDueDay: cards.dueDay,
      })
      .from(recurringTransactionRules)
      .innerJoin(
        recurringPeople,
        and(
          eq(recurringTransactionRules.personId, recurringPeople.id),
          eq(recurringPeople.userId, userId),
        ),
      )
      .leftJoin(
        recurringTransactionSplits,
        and(
          eq(recurringTransactionSplits.recurringRuleId, recurringTransactionRules.id),
          eq(recurringTransactionSplits.userId, userId),
        ),
      )
      .leftJoin(
        recurringSplitPeople,
        and(
          eq(recurringTransactionSplits.personId, recurringSplitPeople.id),
          eq(recurringSplitPeople.userId, userId),
        ),
      )
      .innerJoin(
        categories,
        and(eq(recurringTransactionRules.categoryId, categories.id), eq(categories.userId, userId)),
      )
      .leftJoin(
        cards,
        and(eq(recurringTransactionRules.cardId, cards.id), eq(cards.userId, userId)),
      )
      .where(
        and(
          eq(recurringTransactionRules.userId, userId),
          ne(recurringTransactionRules.type, "transfer"),
          or(ne(categories.name, invoicePaymentCategoryName), eq(categories.isSystem, false)),
          lte(recurringTransactionRules.startDate, new Date(periodEnd.getTime() + 32 * 86_400_000)),
          personScope === "all"
            ? undefined
            : or(
                and(
                  isNull(recurringTransactionSplits.id),
                  personScope === "admin"
                    ? eq(recurringPeople.role, "admin")
                    : eq(recurringPeople.id, personScope),
                ),
                personScope === "admin"
                  ? eq(recurringSplitPeople.role, "admin")
                  : eq(recurringSplitPeople.id, personScope),
              ),
          categoryIds.length ? inArray(categories.id, [...categoryIds]) : undefined,
        ),
      )
      .orderBy(asc(recurringTransactionRules.startDate), asc(recurringTransactionRules.id));

    return rows.map((row) => ({
      categoryId: row.categoryId,
      type: row.type,
      amount: row.amount,
      anchorDate: row.anchorDate.toISOString().slice(0, 10),
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
      occurrenceOverrides: row.occurrenceOverrides,
      occurrenceTripIds: row.occurrenceTripIds,
      allocationPersonId: row.allocationPersonId,

      configuredEndDate: row.configuredEndDate,
      frequency: row.frequency,
      paymentMethod: row.paymentMethod,
      dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
      status: row.status,
      card:
        row.cardClosingRuleType !== null && row.cardDueDay !== null
          ? {
              closingDay: row.cardClosingDay,
              closingRule: resolveCardClosingRule({
                closingRuleType: row.cardClosingRuleType,
                closingDay: row.cardClosingDay,
                closingOffsetDays: row.cardClosingOffsetDays,
                closingOffsetMode: row.cardClosingOffsetMode,
                closingDayPurchasesNextInvoice: row.cardClosingDayPurchasesNextInvoice ?? false,
              }),
              dueDay: row.cardDueDay,
            }
          : null,
    }));
  },
} satisfies CategoryTrendsRepository;
