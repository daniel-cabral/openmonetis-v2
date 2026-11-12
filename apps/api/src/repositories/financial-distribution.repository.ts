import {
  cards,
  categories,
  db,
  financialAccounts,
  people,
  recurringTransactionRules,
  recurringTransactionSplits,
  transactionSplits,
  transactions,
} from "@openmonetis/db";
import { resolveCardClosingRule } from "@openmonetis/domain/cards";
import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import {
  uncategorizedExpenseKey,
  uncategorizedIncomeKey,
} from "@openmonetis/domain/financial-distribution";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FinancialDistributionRepository } from "../services/financial-distribution.service";
import { effectiveRecurringEndDateSql } from "./recurring-transactions.repository";
import {
  effectiveSplitAmountSql,
  effectiveTransactionAmountSql,
  recurringOccurrenceOverridesSql,
} from "./settlements.repository";

const transactionPeople = alias(people, "financial_distribution_transaction_people");
const splitPeople = alias(people, "financial_distribution_split_people");
const recurringPeople = alias(people, "financial_distribution_recurring_people");
const recurringSplitPeople = alias(people, "financial_distribution_recurring_split_people");
const transactionAccounts = alias(financialAccounts, "financial_distribution_transaction_accounts");
const transactionCardAccounts = alias(financialAccounts, "financial_distribution_card_accounts");
const recurringAccounts = alias(financialAccounts, "financial_distribution_recurring_accounts");
const recurringCardAccounts = alias(
  financialAccounts,
  "financial_distribution_recurring_card_accounts",
);

// Resolve account metadata for each confirmed occurrence: its settlement account may differ
// from the series account. Correlation keeps both occurrences and accounts scoped to the owner.
export const recurringOccurrenceAccountExclusionsSql = sql<Record<string, boolean>>`coalesce((
  select jsonb_object_agg(to_char(o.purchase_date, 'YYYY-MM-DD'), a.exclude_from_balance)
  from recurring_transaction_occurrences o
  inner join financial_accounts a on a.id = o.account_id and a.user_id = o.user_id
  where o.user_id = ${recurringTransactionRules.userId}
    and o.recurring_series_id = ${recurringTransactionRules.seriesId}
    and o.is_settled = true
), '{}'::jsonb)`.as("occurrence_account_exclusions");

export const financialDistributionRepository = {
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
        categoryId: sql<string>`coalesce(${categories.id}::text, case when ${transactions.type} = 'income' then ${uncategorizedIncomeKey} else ${uncategorizedExpenseKey} end)`,
        origin: transactions.origin,
        transactionType: transactions.type,
        type: sql<
          "income" | "expense"
        >`coalesce(${categories.type}::text, ${transactions.type}::text)`,
        period: transactions.period,
        excludeFromBalance:
          sql<boolean>`coalesce(${transactionAccounts.excludeFromBalance}, ${transactionCardAccounts.excludeFromBalance}, false)`.as(
            "exclude_from_balance",
          ),
        amount:
          sql<string>`case when ${transactionSplits.id} is not null then ${effectiveSplitAmountSql} else ${effectiveTransactionAmountSql} end`.as(
            "amount",
          ),
      })
      .from(transactions)
      .leftJoin(cards, and(eq(transactions.cardId, cards.id), eq(cards.userId, userId)))
      .leftJoin(
        transactionAccounts,
        and(
          eq(transactions.accountId, transactionAccounts.id),
          eq(transactionAccounts.userId, userId),
        ),
      )
      .leftJoin(
        transactionCardAccounts,
        and(
          eq(cards.accountId, transactionCardAccounts.id),
          eq(transactionCardAccounts.userId, userId),
        ),
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
      .where(
        and(
          eq(transactions.userId, userId),
          ne(transactions.type, "transfer"),
          ne(transactions.origin, "invoiceCredit"),
          or(
            isNull(categories.id),
            ne(categories.name, invoicePaymentCategoryName),
            eq(categories.isSystem, false),
          ),
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
        categoryId: sql<string>`coalesce(${categories.id}::text, case when ${recurringTransactionRules.type} = 'income' then ${uncategorizedIncomeKey} else ${uncategorizedExpenseKey} end)`,
        type: sql<
          "income" | "expense"
        >`coalesce(${categories.type}::text, ${recurringTransactionRules.type}::text)`,
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
        excludeFromBalance:
          sql<boolean>`coalesce(${recurringAccounts.excludeFromBalance}, ${recurringCardAccounts.excludeFromBalance}, false)`.as(
            "exclude_from_balance",
          ),
        occurrenceAccountExclusions: recurringOccurrenceAccountExclusionsSql,
        allocationPersonId:
          sql<string>`coalesce(${recurringTransactionSplits.personId}, ${recurringTransactionRules.personId})`.as(
            "allocation_person_id",
          ),
        frequency: recurringTransactionRules.frequency,
        paymentMethod: recurringTransactionRules.paymentMethod,
        dueDate: recurringTransactionRules.dueDate,
        status: recurringTransactionRules.status,
        isSettled: recurringTransactionRules.isSettled,
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
        recurringAccounts,
        and(
          eq(recurringTransactionRules.accountId, recurringAccounts.id),
          eq(recurringAccounts.userId, userId),
        ),
      )
      .leftJoin(
        recurringCardAccounts,
        and(
          eq(cards.accountId, recurringCardAccounts.id),
          eq(recurringCardAccounts.userId, userId),
        ),
      )
      .where(
        and(
          eq(recurringTransactionRules.userId, userId),
          ne(recurringTransactionRules.type, "transfer"),
          or(
            isNull(categories.id),
            ne(categories.name, invoicePaymentCategoryName),
            eq(categories.isSystem, false),
          ),
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
      excludeFromBalance: row.excludeFromBalance,
      occurrenceAccountExclusions: row.occurrenceAccountExclusions,
      allocationPersonId: row.allocationPersonId,

      configuredEndDate: row.configuredEndDate,
      frequency: row.frequency,
      paymentMethod: row.paymentMethod,
      dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
      status: row.status,
      isSettled: row.isSettled,
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
} satisfies FinancialDistributionRepository;
