import {
  cards,
  categories,
  db,
  people,
  recurringTransactionRules,
  recurringTransactionSplits,
  transactionSplits,
  transactions,
} from "@openmonetis/db";
import type {
  CardUsageCard,
  CardUsageEntry,
  CardUsageRecurringRule,
} from "@openmonetis/domain/card-usage-report";
import { resolveCardClosingRule } from "@openmonetis/domain/cards";
import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import { and, asc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { effectiveRecurringEndDateSql } from "./recurring-transactions.repository";
import {
  effectiveSplitAmountSql,
  effectiveTransactionAmountSql,
  recurringOccurrenceOverridesSql,
} from "./settlements.repository";

const transactionPeople = alias(people, "card_usage_transaction_people");
const splitPeople = alias(people, "card_usage_split_people");
const recurringPeople = alias(people, "card_usage_recurring_people");
const recurringSplitPeople = alias(people, "card_usage_recurring_split_people");

export const cardUsageReportRepository = {
  async listActiveCardsForUser(userId: string): Promise<CardUsageCard[]> {
    return db
      .select({
        id: cards.id,
        name: cards.name,
        brand: cards.brand,
        logo: cards.logo,
        limit: cards.limit,
      })
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.status, "active")));
  },

  async listCardEntriesForUser(
    userId: string,
    startPeriod: string,
    endPeriod: string,
  ): Promise<CardUsageEntry[]> {
    return db
      .select({
        cardId: sql<string>`${transactions.cardId}`.as("card_id"),
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
        categoryId: categories.id,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        isInvoicePaymentCategory:
          sql<boolean>`coalesce(${categories.isSystem} and ${categories.name} = ${invoicePaymentCategoryName}, false)`.as(
            "is_invoice_payment_category",
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
      .leftJoin(
        categories,
        and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId)),
      )
      .where(
        and(
          eq(transactions.userId, userId),
          isNotNull(transactions.cardId),
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

  async listCardRecurringRulesForUser(
    userId: string,
    periodEnd: Date,
  ): Promise<CardUsageRecurringRule[]> {
    const rows = await db
      .select({
        cardId: sql<string>`${recurringTransactionRules.cardId}`.as("card_id"),
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
      .innerJoin(
        cards,
        and(eq(recurringTransactionRules.cardId, cards.id), eq(cards.userId, userId)),
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
      cardId: row.cardId,
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
      configuredEndDate: row.configuredEndDate,
      frequency: row.frequency,
      paymentMethod: row.paymentMethod,
      dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
      status: row.status,
      card: {
        closingDay: row.cardClosingDay,
        closingRule: resolveCardClosingRule({
          closingRuleType: row.cardClosingRuleType,
          closingDay: row.cardClosingDay,
          closingOffsetDays: row.cardClosingOffsetDays,
          closingOffsetMode: row.cardClosingOffsetMode,
          closingDayPurchasesNextInvoice: row.cardClosingDayPurchasesNextInvoice ?? false,
        }),
        dueDay: row.cardDueDay,
      },
    }));
  },
};
