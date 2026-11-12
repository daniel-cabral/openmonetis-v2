// V2 side of the reconciliation (research R15): every figure is read through the real V2 services
// and repositories, built in-process over the `@openmonetis/db` singleton, so the V2 financial rules
// (balances, invoices, category trends, person totals) come from the code the app runs. Read-only:
// no service method that writes is called.
import { cards, db, recurringTransactionRules, transactions } from "@openmonetis/db";
import { resolveCardClosingRule } from "@openmonetis/domain/cards";
import { listRuleOccurrences } from "@openmonetis/domain/category-trends";
import { toCents } from "@openmonetis/domain/money";
import { addMonthsToPeriod, getPeriodEndDate } from "@openmonetis/domain/transactions";
import { and, count, eq } from "drizzle-orm";
import {
  accountsRepository,
  findAccountByIdForUser,
} from "../../../repositories/accounts.repository";
import { findCardByIdForUser } from "../../../repositories/cards.repository";
import {
  findCategoryByIdForUser,
  findSystemCategoryByNameForUser,
  listCategoriesByIdsForUser,
  listCategoryFamilyIdsForUser,
} from "../../../repositories/categories.repository";
import { categoryTrendsRepository } from "../../../repositories/category-trends.repository";
import { dueDateRulesRepository } from "../../../repositories/due-date-rules.repository";
import { invoicesRepository } from "../../../repositories/invoices.repository";
import {
  findAdminPersonByUserId,
  findPersonByIdForUser,
  listPeopleByIdsForUser,
  peopleRepository,
} from "../../../repositories/people.repository";
import { transitionRecurringRuleForUser } from "../../../repositories/recurring-transactions.repository";
import { listTagsByIdsForUser } from "../../../repositories/tags.repository";
import * as transactionsRepository from "../../../repositories/transactions.repository";
import { tripsRepository } from "../../../repositories/trips.repository";
import { createAccountsService } from "../../../services/accounts.service";
import { createCategoryTrendsService } from "../../../services/category-trends.service";
import { createInvoicesService } from "../../../services/invoices.service";
import { createPeopleService } from "../../../services/people.service";
import { createTransactionsService } from "../../../services/transactions.service";
import type { V2Figure } from "../types";

// `calculatePersonFinancialSummary` returns the selected period plus the five before it.
const PERSON_SUMMARY_WINDOW = 6;

function buildServices() {
  const accounts = createAccountsService(accountsRepository);
  const invoices = createInvoicesService(invoicesRepository, undefined, dueDateRulesRepository);
  const categoryTrends = createCategoryTrendsService(categoryTrendsRepository, {
    findTripForUser: (userId, tripId) => tripsRepository.findByIdForUser(tripId, userId),
  });
  // Same wiring as app.ts; only `listTransactions` is called. The attachment cleaner is never
  // reached by a read and stays inert so no S3 client is built.
  const transactionsService = createTransactionsService(
    {
      ...transactionsRepository,
      dueDateRules: dueDateRulesRepository,
      transitionRecurringRuleForUser,
      findAccountByIdForUser,
      findAdminPersonByUserId,
      findCardByIdForUser,
      findCategoryByIdForUser,
      findPersonByIdForUser,
      findSystemCategoryByNameForUser,
      getAccountBalanceSnapshotForUser: accounts.getBalanceSnapshot,
      listCategoriesByIdsForUser,
      listCategoryFamilyIdsForUser,
      listTagsByIdsForUser,
      listPeopleByIdsForUser,
      findTripByIdForUser: tripsRepository.findByIdForUser,
    },
    { cleanupOrphans: async () => ({ deleted: 0 }) } as never,
  );
  const people = createPeopleService(peopleRepository, {
    list: transactionsService.listTransactions,
  });
  return { accounts, invoices, categoryTrends, people };
}

type Services = ReturnType<typeof buildServices>;

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function accountBalanceFigures(
  s: Services,
  userId: string,
  periods: string[],
): Promise<V2Figure[]> {
  const figures: V2Figure[] = [];
  for (const account of await accountsRepository.listByUser(userId)) {
    for (const period of periods) {
      const date = toDateString(getPeriodEndDate(period));
      const balance = await s.accounts.getBalanceThroughDate(account.id, userId, date);
      figures.push({
        kind: "accountBalance",
        key: { account: account.id, periodEnd: period },
        value: toCents(balance),
      });
    }
  }
  return figures;
}

async function invoiceFigures(s: Services, userId: string, periods: string[]): Promise<V2Figure[]> {
  const figures: V2Figure[] = [];
  for (const period of periods) {
    const snapshot = await s.invoices.get(period, userId);
    for (const item of snapshot.items) {
      const paidDates = item.payments.map((payment) => payment.paidAt).sort();
      const paid = item.status === "paid";
      figures.push({
        kind: "invoiceTotal",
        key: { card: item.cardId, period },
        value: toCents(item.amount),
        status: paid ? "paid" : "pending",
        paidAt: paid ? (paidDates.at(-1) ?? null) : null,
      });
    }
  }
  return figures;
}

async function categoryFigures(
  s: Services,
  userId: string,
  periods: string[],
): Promise<V2Figure[]> {
  const report = await s.categoryTrends.list(userId, {
    startPeriod: periods[0] as string,
    endPeriod: periods.at(-1) as string,
    categoryIds: [],
  });
  return report.categories.flatMap((category) =>
    category.values
      .filter((value) => value.totalAmount !== 0)
      .map((value) => ({
        kind: "categoryTotal" as const,
        key: { period: value.period, rootCategory: category.categoryId, type: category.type },
        value: toCents(value.totalAmount),
      })),
  );
}

async function personFigures(s: Services, userId: string, periods: string[]): Promise<V2Figure[]> {
  const wanted = new Set(periods);
  // Summary windows ending at the last period and stepping back, so each period is read once.
  const windowEnds: string[] = [];
  for (
    let end = periods.at(-1) as string;
    end >= (periods[0] as string);
    end = addMonthsToPeriod(end, -PERSON_SUMMARY_WINDOW)
  ) {
    windowEnds.push(end);
  }
  const figures: V2Figure[] = [];
  for (const person of await s.people.list(userId)) {
    for (const end of windowEnds) {
      const summary = await s.people.getFinancialSummary(person.id, userId, end);
      for (const entry of summary.history) {
        if (!wanted.has(entry.period) || entry.expenses === 0) continue;
        figures.push({
          kind: "personTotal",
          key: { person: person.id, period: entry.period },
          value: toCents(entry.expenses),
        });
      }
    }
  }
  return figures;
}

async function countFigures(userId: string, periods: string[]): Promise<V2Figure[]> {
  const counts = new Map<string, { period: string; type: string; rows: number }>();
  const add = (period: string, type: string, rows: number) => {
    const key = `${period}|${type}`;
    const current = counts.get(key) ?? { period, type, rows: 0 };
    current.rows += rows;
    counts.set(key, current);
  };

  const rows = await db
    .select({ period: transactions.period, type: transactions.type, rows: count() })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(transactions.period, transactions.type);
  for (const row of rows) add(row.period, row.type, row.rows);

  const rules = await db
    .select({
      type: recurringTransactionRules.type,
      amount: recurringTransactionRules.amount,
      anchorDate: recurringTransactionRules.anchorDate,
      startDate: recurringTransactionRules.startDate,
      endDate: recurringTransactionRules.endDate,
      configuredEndDate: recurringTransactionRules.recurrenceEndDate,
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
    .leftJoin(cards, and(eq(recurringTransactionRules.cardId, cards.id), eq(cards.userId, userId)))
    .where(eq(recurringTransactionRules.userId, userId));
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    const card =
      rule.cardDueDay === null || rule.cardClosingRuleType === null
        ? null
        : {
            closingDay: rule.cardClosingDay,
            dueDay: rule.cardDueDay,
            closingRule: resolveCardClosingRule({
              closingRuleType: rule.cardClosingRuleType,
              closingDay: rule.cardClosingDay,
              closingOffsetDays: rule.cardClosingOffsetDays,
              closingOffsetMode: rule.cardClosingOffsetMode,
              closingDayPurchasesNextInvoice: rule.cardClosingDayPurchasesNextInvoice ?? false,
            }),
          };
    const occurrences = listRuleOccurrences(
      {
        ...rule,
        anchorDate: toDateString(rule.anchorDate),
        startDate: toDateString(rule.startDate),
        endDate: rule.endDate && toDateString(rule.endDate),
        configuredEndDate: rule.configuredEndDate && toDateString(rule.configuredEndDate),
        dueDate: rule.dueDate && toDateString(rule.dueDate),
        card,
      },
      periods[0] as string,
      periods.at(-1) as string,
    );
    for (const occurrence of occurrences) add(occurrence.period, rule.type, 1);
  }

  const wanted = new Set(periods);
  return [...counts.values()]
    .filter((item) => wanted.has(item.period))
    .map((item) => ({
      kind: "transactionCount" as const,
      key: { period: item.period, type: item.type },
      value: item.rows,
    }));
}

export async function computeV2Figures(v2UserId: string, periods: string[]): Promise<V2Figure[]> {
  if (periods.length === 0) return [];
  const s = buildServices();
  return [
    ...(await accountBalanceFigures(s, v2UserId, periods)),
    ...(await invoiceFigures(s, v2UserId, periods)),
    ...(await countFigures(v2UserId, periods)),
    ...(await categoryFigures(s, v2UserId, periods)),
    ...(await personFigures(s, v2UserId, periods)),
  ];
}
