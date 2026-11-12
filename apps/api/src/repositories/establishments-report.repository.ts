import {
  cards,
  categories,
  db,
  financialAccounts,
  people,
  recurringTransactionRules,
  recurringTransactionSplits,
  transactionSplits,
  transactionTrips,
  transactions,
} from "@openmonetis/db";
import { resolveCardClosingRule } from "@openmonetis/domain/cards";
import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import type {
  EstablishmentPurchaseEntry,
  EstablishmentRecurringRule,
} from "@openmonetis/domain/establishments-report";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recurringOccurrenceAccountExclusionsSql } from "./financial-distribution.repository";
import { effectiveRecurringEndDateSql } from "./recurring-transactions.repository";
import {
  effectiveSplitAmountSql,
  effectiveTransactionAmountSql,
  recurringOccurrenceOverridesSql,
} from "./settlements.repository";
import { recurringOccurrenceTripIdsSql } from "./transactions.repository";

const transactionPeople = alias(people, "establishments_transaction_people");
const splitPeople = alias(people, "establishments_split_people");
const recurringPeople = alias(people, "establishments_recurring_people");
const recurringSplitPeople = alias(people, "establishments_recurring_split_people");

export const establishmentsReportRepository = {
  async listPurchaseEntriesForUser(
    userId: string,
    startPeriod: string,
    endPeriod: string,
  ): Promise<EstablishmentPurchaseEntry[]> {
    return db
      .select({
        id: transactions.id,
        name: transactions.name,
        period: transactions.period,
        purchaseDate: sql<string>`to_char(${transactions.purchaseDate}, 'YYYY-MM-DD')`.as(
          "purchase_date",
        ),
        amount:
          sql<string>`case when ${transactionSplits.id} is not null then ${effectiveSplitAmountSql} else ${effectiveTransactionAmountSql} end`.as(
            "amount",
          ),
        origin: transactions.origin,
        transactionType: transactions.type,
        excludeFromBalance:
          sql<boolean>`coalesce(${financialAccounts.excludeFromBalance}, false)`.as(
            "exclude_from_balance",
          ),
        categoryId: categories.id,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        isInvoicePaymentCategory:
          sql<boolean>`coalesce(${categories.isSystem} and ${categories.name} = ${invoicePaymentCategoryName}, false)`.as(
            "is_invoice_payment_category",
          ),
        tripId: transactionTrips.tripId,
      })
      .from(transactions)
      .leftJoin(
        financialAccounts,
        and(eq(transactions.accountId, financialAccounts.id), eq(financialAccounts.userId, userId)),
      )
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
      .leftJoin(
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
          eq(transactions.type, "expense"),
          gte(transactions.period, startPeriod),
          lte(transactions.period, endPeriod),
          or(
            and(isNull(transactionSplits.id), eq(transactionPeople.role, "admin")),
            eq(splitPeople.role, "admin"),
          ),
        ),
      )
      .orderBy(asc(transactions.period), asc(transactions.id));
  },

  async listRecurringRulesForUser(
    userId: string,
    periodEnd: Date,
  ): Promise<EstablishmentRecurringRule[]> {
    const rows = await db
      .select({
        id: recurringTransactionRules.id,
        name: recurringTransactionRules.name,
        transactionType: recurringTransactionRules.type,
        categoryId: categories.id,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        isInvoicePaymentCategory:
          sql<boolean>`coalesce(${categories.isSystem} and ${categories.name} = ${invoicePaymentCategoryName}, false)`.as(
            "is_invoice_payment_category",
          ),
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
        occurrenceAccountExclusions: recurringOccurrenceAccountExclusionsSql,
        occurrenceTripIds: recurringOccurrenceTripIdsSql,
        excludeFromBalance:
          sql<boolean>`coalesce(${financialAccounts.excludeFromBalance}, false)`.as(
            "exclude_from_balance",
          ),
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
      .leftJoin(
        categories,
        and(eq(recurringTransactionRules.categoryId, categories.id), eq(categories.userId, userId)),
      )
      .leftJoin(
        cards,
        and(eq(recurringTransactionRules.cardId, cards.id), eq(cards.userId, userId)),
      )
      .leftJoin(
        financialAccounts,
        and(
          eq(recurringTransactionRules.accountId, financialAccounts.id),
          eq(financialAccounts.userId, userId),
        ),
      )
      .where(
        and(
          eq(recurringTransactionRules.userId, userId),
          eq(recurringTransactionRules.type, "expense"),
          lte(recurringTransactionRules.startDate, new Date(periodEnd.getTime() + 32 * 86_400_000)),
          or(
            and(isNull(recurringTransactionSplits.id), eq(recurringPeople.role, "admin")),
            eq(recurringSplitPeople.role, "admin"),
          ),
        ),
      )
      .orderBy(asc(recurringTransactionRules.startDate), asc(recurringTransactionRules.id));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      transactionType: row.transactionType,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
      isInvoicePaymentCategory: row.isInvoicePaymentCategory,
      amount: row.amount,
      anchorDate: row.anchorDate.toISOString().slice(0, 10),
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
      occurrenceOverrides: row.occurrenceOverrides,
      occurrenceAccountExclusions: row.occurrenceAccountExclusions,
      occurrenceTripIds: row.occurrenceTripIds,
      excludeFromBalance: row.excludeFromBalance,
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
};
