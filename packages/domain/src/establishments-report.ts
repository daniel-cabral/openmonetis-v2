import { type CategoryTrendRecurringRule, listRuleOccurrences } from "./category-trends";
import { toCents } from "./money";
import { addMonthsToPeriod, type TransactionOrigin, type TransactionType } from "./transactions";
import { matchesTripFilter, type TripFilter } from "./trips";

export const establishmentsReportMonthOptions = [3, 6, 12] as const;
export type EstablishmentsReportMonths = (typeof establishmentsReportMonthOptions)[number];
export const defaultEstablishmentsReportMonths = 6;
export const establishmentsListLimit = 50;
export const establishmentCategoryLimit = 3;
export const topCategoriesLimit = 10;

export type EstablishmentsWindow = { startPeriod: string; endPeriod: string };

export type EstablishmentPurchaseEntry = {
  id?: string;
  name: string;
  period: string;
  purchaseDate?: string;
  amount: string | number;
  origin: TransactionOrigin;
  transactionType: TransactionType;
  excludeFromBalance: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  isInvoicePaymentCategory: boolean;
  tripId: string | null;
};

export type EstablishmentRecurringRule = Omit<CategoryTrendRecurringRule, "categoryId" | "type"> & {
  id?: string;
  name: string;
  transactionType: TransactionType;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  isInvoicePaymentCategory: boolean;
  occurrenceTripIds?: Record<string, string>;
};

export type EstablishmentCategoryCount = {
  categoryId: string;
  name: string;
  icon: string | null;
  count: number;
};

export type EstablishmentItem = {
  name: string;
  count: number;
  totalCents: number;
  averageCents: number;
  categories: EstablishmentCategoryCount[];
};

export type EstablishmentTopCategory = EstablishmentCategoryCount & {
  totalCents: number;
};

export type EstablishmentsReportSummary = {
  establishmentCount: number;
  transactionCount: number;
  totalCents: number;
  averageCents: number;
  mostFrequent: string | null;
  highestTotal: string | null;
};

export type EstablishmentsReport = {
  window: EstablishmentsWindow;
  establishments: EstablishmentItem[];
  topCategories: EstablishmentTopCategory[];
  summary: EstablishmentsReportSummary;
};

type EstablishmentGroup = {
  name: string;
  count: number;
  totalCents: number;
  categories: Map<string, EstablishmentCategoryCount>;
};

type CountedPurchase = EstablishmentPurchaseEntry & { amountCents: number };

export function resolveEstablishmentsWindow(
  period: string,
  months: EstablishmentsReportMonths,
): EstablishmentsWindow {
  return { startPeriod: addMonthsToPeriod(period, -(months - 1)), endPeriod: period };
}

export function isEstablishmentPurchase(
  entry: Pick<
    EstablishmentPurchaseEntry,
    "transactionType" | "origin" | "excludeFromBalance" | "isInvoicePaymentCategory"
  >,
): boolean {
  return (
    entry.transactionType === "expense" &&
    entry.origin === "regular" &&
    !entry.excludeFromBalance &&
    !entry.isInvoicePaymentCategory
  );
}

export function calculateEstablishmentsReport(input: {
  window: EstablishmentsWindow;
  tripFilter: TripFilter;
  entries: readonly EstablishmentPurchaseEntry[];
  recurringRules: readonly EstablishmentRecurringRule[];
}): EstablishmentsReport {
  const purchases = [
    ...input.entries.filter(
      (entry) => entry.period >= input.window.startPeriod && entry.period <= input.window.endPeriod,
    ),
    ...expandActiveRules(input.recurringRules, input.window),
  ]
    .filter(
      (entry) =>
        isEstablishmentPurchase(entry) && matchesTripFilter(entry.tripId, input.tripFilter),
    )
    .map((entry) => ({ ...entry, amountCents: toCents(Math.abs(Number(entry.amount))) }))
    .filter((entry) => entry.amountCents !== 0);

  const groups = groupByName(purchases);
  const ranked = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.totalCents - a.totalCents || compareNames(a.name, b.name),
  );
  const byTotal = [...groups.values()].sort(
    (a, b) => b.totalCents - a.totalCents || compareNames(a.name, b.name),
  );
  const transactionCount = purchases.length;
  const totalCents = purchases.reduce((sum, purchase) => sum + purchase.amountCents, 0);

  return {
    window: input.window,
    establishments: ranked.slice(0, establishmentsListLimit).map(toEstablishmentItem),
    topCategories: buildTopCategories(purchases),
    summary: {
      establishmentCount: ranked.length,
      transactionCount,
      totalCents,
      averageCents: transactionCount ? Math.round(totalCents / transactionCount) : 0,
      mostFrequent: ranked[0]?.name ?? null,
      highestTotal: byTotal[0]?.name ?? null,
    },
  };
}

export function expandActiveRules(
  rules: readonly EstablishmentRecurringRule[],
  window: EstablishmentsWindow,
): EstablishmentPurchaseEntry[] {
  return rules
    .filter((rule) => rule.status === "active")
    .flatMap((rule) =>
      listRuleOccurrences(rule, window.startPeriod, window.endPeriod).map((occurrence) => ({
        id: rule.id,
        name: rule.name,
        period: occurrence.period,
        purchaseDate: occurrence.purchaseDate,
        amount: occurrence.amount,
        origin: "regular" as const,
        transactionType: rule.transactionType,
        excludeFromBalance:
          rule.occurrenceAccountExclusions?.[occurrence.purchaseDate] ??
          rule.excludeFromBalance ??
          false,
        categoryId: rule.categoryId,
        categoryName: rule.categoryName,
        categoryIcon: rule.categoryIcon,
        isInvoicePaymentCategory: rule.isInvoicePaymentCategory,
        tripId: rule.occurrenceTripIds?.[occurrence.purchaseDate] ?? null,
      })),
    );
}

function groupByName(purchases: readonly CountedPurchase[]) {
  const groups = new Map<string, EstablishmentGroup>();

  for (const purchase of purchases) {
    const group = groups.get(purchase.name) ?? {
      name: purchase.name,
      count: 0,
      totalCents: 0,
      categories: new Map<string, EstablishmentCategoryCount>(),
    };
    group.count += 1;
    group.totalCents += purchase.amountCents;
    if (purchase.categoryId) {
      const category = group.categories.get(purchase.categoryId) ?? {
        categoryId: purchase.categoryId,
        name: purchase.categoryName ?? "",
        icon: purchase.categoryIcon,
        count: 0,
      };
      category.count += 1;
      group.categories.set(purchase.categoryId, category);
    }
    groups.set(purchase.name, group);
  }

  return groups;
}

function toEstablishmentItem(group: EstablishmentGroup): EstablishmentItem {
  return {
    name: group.name,
    count: group.count,
    totalCents: group.totalCents,
    averageCents: Math.round(group.totalCents / group.count),
    categories: [...group.categories.values()]
      .sort((a, b) => b.count - a.count || compareNames(a.name, b.name))
      .slice(0, establishmentCategoryLimit),
  };
}

function buildTopCategories(purchases: readonly CountedPurchase[]): EstablishmentTopCategory[] {
  const categories = new Map<string, EstablishmentTopCategory>();

  for (const purchase of purchases) {
    if (!purchase.categoryId) continue;
    const category = categories.get(purchase.categoryId) ?? {
      categoryId: purchase.categoryId,
      name: purchase.categoryName ?? "",
      icon: purchase.categoryIcon,
      count: 0,
      totalCents: 0,
    };
    category.count += 1;
    category.totalCents += purchase.amountCents;
    categories.set(purchase.categoryId, category);
  }

  return [...categories.values()]
    .sort((a, b) => b.totalCents - a.totalCents || compareNames(a.name, b.name))
    .slice(0, topCategoriesLimit);
}

function compareNames(a: string, b: string) {
  return a.localeCompare(b, "pt-BR");
}
