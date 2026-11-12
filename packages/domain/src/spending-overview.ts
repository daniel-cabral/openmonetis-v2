import {
  type EstablishmentPurchaseEntry,
  type EstablishmentRecurringRule,
  expandActiveRules,
  isEstablishmentPurchase,
} from "./establishments-report";
import { toCents } from "./money";

export const spendingOverviewLimit = 10;

export type SpendingOverviewExpense = {
  key: string;
  name: string;
  purchaseDate: string;
  amountCents: number;
  categoryIcon: string | null;
};

export type SpendingOverviewEstablishment = {
  name: string;
  count: number;
  totalCents: number;
  categoryIcon: string | null;
};

export type SpendingOverview = {
  topExpenses: SpendingOverviewExpense[];
  topEstablishments: SpendingOverviewEstablishment[];
};

type SpendingPurchase = SpendingOverviewExpense;

type EstablishmentGroup = {
  name: string;
  count: number;
  totalCents: number;
  icons: Map<string, number>;
};

export function calculateSpendingOverview(input: {
  period: string;
  entries: readonly EstablishmentPurchaseEntry[];
  recurringRules: readonly EstablishmentRecurringRule[];
}): SpendingOverview {
  const { period } = input;
  const entryPurchases = input.entries
    .filter((entry) => entry.period === period && isEstablishmentPurchase(entry))
    .map((entry, index) => toPurchase(entry, entry.id ?? `entry:${index}`));
  const recurringPurchases = expandActiveRules(input.recurringRules, {
    startPeriod: period,
    endPeriod: period,
  })
    .filter(isEstablishmentPurchase)
    .map((occurrence) => toPurchase(occurrence, `${occurrence.id}:${occurrence.purchaseDate}`));
  const purchases = [...entryPurchases, ...recurringPurchases].filter(
    (purchase) => purchase.amountCents !== 0,
  );

  return {
    topExpenses: [...purchases]
      .sort(
        (a, b) =>
          b.amountCents - a.amountCents ||
          b.purchaseDate.localeCompare(a.purchaseDate) ||
          a.name.localeCompare(b.name, "pt-BR"),
      )
      .slice(0, spendingOverviewLimit),
    topEstablishments: groupByName(purchases)
      .sort(
        (a, b) =>
          b.count - a.count || b.totalCents - a.totalCents || a.name.localeCompare(b.name, "pt-BR"),
      )
      .slice(0, spendingOverviewLimit)
      .map((group) => ({
        name: group.name,
        count: group.count,
        totalCents: group.totalCents,
        categoryIcon: mostFrequentIcon(group.icons),
      })),
  };
}

function toPurchase(entry: EstablishmentPurchaseEntry, key: string): SpendingPurchase {
  return {
    key,
    name: entry.name,
    purchaseDate: entry.purchaseDate ?? "",
    amountCents: toCents(Math.abs(Number(entry.amount))),
    categoryIcon: entry.categoryIcon,
  };
}

function groupByName(purchases: readonly SpendingPurchase[]): EstablishmentGroup[] {
  const groups = new Map<string, EstablishmentGroup>();

  for (const purchase of purchases) {
    const group = groups.get(purchase.name) ?? {
      name: purchase.name,
      count: 0,
      totalCents: 0,
      icons: new Map<string, number>(),
    };
    group.count += 1;
    group.totalCents += purchase.amountCents;
    if (purchase.categoryIcon) {
      group.icons.set(purchase.categoryIcon, (group.icons.get(purchase.categoryIcon) ?? 0) + 1);
    }
    groups.set(purchase.name, group);
  }

  return [...groups.values()];
}

function mostFrequentIcon(icons: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;

  for (const [icon, count] of icons) {
    if (count > bestCount) {
      best = icon;
      bestCount = count;
    }
  }

  return best;
}
