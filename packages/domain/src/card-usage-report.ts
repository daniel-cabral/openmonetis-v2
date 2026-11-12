import type { CardBrand, CardInvoiceStatus } from "./cards";
import { type CategoryTrendRecurringRule, listRuleOccurrences } from "./category-trends";
import { toCents } from "./money";
import {
  addMonthsToPeriod,
  calculateExpenseImpact,
  type TransactionOrigin,
  type TransactionType,
} from "./transactions";

export const cardUsageHistoryMonths = 12;
export const cardUsageCategoryLimit = 10;
export const cardUsageTopExpenseLimit = 10;
export const cardUsageWarningPercentage = 50;
export const cardUsageDangerPercentage = 80;
export const cardUsageTrendThreshold = 5;

export const cardUsageTones = ["success", "warning", "danger"] as const;
export type CardUsageTone = (typeof cardUsageTones)[number];

export const cardUsageTrends = ["up", "down", "stable"] as const;
export type CardUsageTrend = (typeof cardUsageTrends)[number];

export const cardUsageInvoiceStates = ["paid", "pending", "overdue", "none"] as const;
export type CardUsageInvoiceState = (typeof cardUsageInvoiceStates)[number];

export function calculateUsagePercentage(usedCents: number, limitCents: number): number {
  return limitCents > 0 ? Math.round((usedCents / limitCents) * 10_000) / 100 : 0;
}

export function resolveUsageTone(percentage: number): CardUsageTone {
  if (percentage < cardUsageWarningPercentage) return "success";
  if (percentage < cardUsageDangerPercentage) return "warning";
  return "danger";
}

export function calculateUsageTrend(
  currentCents: number,
  previousCents: number,
): { changePercentage: number; trend: CardUsageTrend } {
  if (previousCents === 0) {
    return currentCents > 0
      ? { changePercentage: 100, trend: "up" }
      : { changePercentage: 0, trend: "stable" };
  }

  const changePercentage =
    Math.round(((currentCents - previousCents) / previousCents) * 10_000) / 100;
  if (changePercentage > cardUsageTrendThreshold) return { changePercentage, trend: "up" };
  if (changePercentage < -cardUsageTrendThreshold) return { changePercentage, trend: "down" };
  return { changePercentage, trend: "stable" };
}

export function resolveCardUsageInvoiceState(input: {
  status: CardInvoiceStatus;
  amount: number;
  hasRecord: boolean;
}): CardUsageInvoiceState {
  if (input.status === "paid") return "paid";
  if (input.amount === 0 && !input.hasRecord) return "none";
  if (input.status === "overdue") return "overdue";
  return "pending";
}

export type CardUsageCard = {
  id: string;
  name: string;
  brand: CardBrand;
  logo: string | null;
  limit: string | number;
};

export type CardUsageEntry = {
  cardId: string;
  name: string;
  period: string;
  purchaseDate: string;
  amount: string | number;
  origin: TransactionOrigin;
  transactionType: TransactionType;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  isInvoicePaymentCategory: boolean;
};

export type CardUsageRecurringRule = Omit<CategoryTrendRecurringRule, "categoryId" | "type"> & {
  cardId: string;
  name: string;
  transactionType: TransactionType;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  isInvoicePaymentCategory: boolean;
};

export type CountedCardRow = {
  cardId: string;
  name: string;
  period: string;
  purchaseDate: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  impactCents: number;
};

export type CardUsageOverviewCard = {
  id: string;
  name: string;
  brand: CardBrand;
  logo: string | null;
  limitCents: number;
  usedCents: number;
  availableCents: number;
  usagePercentage: number;
  tone: CardUsageTone;
  previousUsedCents: number;
  changePercentage: number;
  trend: CardUsageTrend;
};

export type CardUsageOverview = {
  summary: {
    totalLimitCents: number;
    totalUsedCents: number;
    totalAvailableCents: number;
    usagePercentage: number;
    tone: CardUsageTone;
  };
  cards: CardUsageOverviewCard[];
  selectedCardId: string | null;
  countedRows: CountedCardRow[];
};

const uncountedOrigins: readonly TransactionOrigin[] = [
  "invoicePayment",
  "invoiceCredit",
  "accountBalanceAdjustment",
  "personSettlement",
];

export function listCountedCardRows(input: {
  entries: readonly CardUsageEntry[];
  recurringRules: readonly CardUsageRecurringRule[];
  startPeriod: string;
  endPeriod: string;
  today: string;
}): CountedCardRow[] {
  const storedRows = input.entries.filter(
    (entry) => entry.period >= input.startPeriod && entry.period <= input.endPeriod,
  );
  const recurringRows = input.recurringRules
    .filter((rule) => rule.status === "active")
    .flatMap((rule) =>
      listRuleOccurrences(rule, input.startPeriod, input.endPeriod)
        .filter((occurrence) => occurrence.purchaseDate <= input.today)
        .map(
          (occurrence): CardUsageEntry => ({
            cardId: rule.cardId,
            name: rule.name,
            period: occurrence.period,
            purchaseDate: occurrence.purchaseDate,
            amount: occurrence.amount,
            origin: "regular",
            transactionType: rule.transactionType,
            categoryId: rule.categoryId,
            categoryName: rule.categoryName,
            categoryIcon: rule.categoryIcon,
            isInvoicePaymentCategory: rule.isInvoicePaymentCategory,
          }),
        ),
    );

  return [...storedRows, ...recurringRows].flatMap((row) => {
    if (
      row.transactionType === "transfer" ||
      row.isInvoicePaymentCategory ||
      uncountedOrigins.includes(row.origin)
    )
      return [];
    const impactCents = toCents(
      calculateExpenseImpact({ amount: row.amount, origin: row.origin, type: row.transactionType }),
    );
    if (impactCents === 0) return [];
    return [
      {
        cardId: row.cardId,
        name: row.name,
        period: row.period,
        purchaseDate: row.purchaseDate,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categoryIcon: row.categoryIcon,
        impactCents,
      },
    ];
  });
}

export function calculateCardUsageOverview(input: {
  period: string;
  today: string;
  cards: CardUsageCard[];
  entries: readonly CardUsageEntry[];
  recurringRules: readonly CardUsageRecurringRule[];
  requestedCardId?: string;
}): CardUsageOverview {
  const countedRows = listCountedCardRows({
    entries: input.entries,
    recurringRules: input.recurringRules,
    startPeriod: addMonthsToPeriod(input.period, -(cardUsageHistoryMonths - 1)),
    endPeriod: input.period,
    today: input.today,
  });
  const previousPeriod = addMonthsToPeriod(input.period, -1);
  const usageCents = (cardId: string, period: string) =>
    Math.max(
      0,
      countedRows.reduce(
        (sum, row) => (row.cardId === cardId && row.period === period ? sum + row.impactCents : sum),
        0,
      ),
    );

  const cards = input.cards
    .map((card): CardUsageOverviewCard => {
      const limitCents = toCents(Number(card.limit));
      const usedCents = usageCents(card.id, input.period);
      const previousUsedCents = usageCents(card.id, previousPeriod);
      const usagePercentage = calculateUsagePercentage(usedCents, limitCents);
      const trend = calculateUsageTrend(usedCents, previousUsedCents);
      return {
        id: card.id,
        name: card.name,
        brand: card.brand,
        logo: card.logo,
        limitCents,
        usedCents,
        availableCents: Math.max(0, limitCents - usedCents),
        usagePercentage,
        tone: resolveUsageTone(usagePercentage),
        previousUsedCents,
        changePercentage: trend.changePercentage,
        trend: trend.trend,
      };
    })
    .sort(compareOverviewCards);

  const totalLimitCents = cards.reduce((sum, card) => sum + card.limitCents, 0);
  const totalUsedCents = cards.reduce((sum, card) => sum + card.usedCents, 0);
  const totalUsagePercentage = calculateUsagePercentage(totalUsedCents, totalLimitCents);

  return {
    summary: {
      totalLimitCents,
      totalUsedCents,
      totalAvailableCents: Math.max(0, totalLimitCents - totalUsedCents),
      usagePercentage: totalUsagePercentage,
      tone: resolveUsageTone(totalUsagePercentage),
    },
    cards,
    selectedCardId:
      cards.find((card) => card.id === input.requestedCardId)?.id ?? cards[0]?.id ?? null,
    countedRows,
  };
}

function compareOverviewCards(a: CardUsageOverviewCard, b: CardUsageOverviewCard) {
  return (
    b.usedCents - a.usedCents ||
    a.name.localeCompare(b.name, "pt-BR") ||
    a.id.localeCompare(b.id)
  );
}

export type CardUsageHistoryItem = {
  period: string;
  usedCents: number;
  usagePercentage: number;
};

export type CardUsageCategory = {
  categoryId: string | null;
  name: string | null;
  icon: string | null;
  amountCents: number;
  percentage: number;
};

export type CardUsageTopExpense = {
  name: string;
  purchaseDate: string;
  categoryName: string | null;
  amountCents: number;
};

export type CardUsageDetail = {
  cardId: string;
  history: CardUsageHistoryItem[];
  categories: CardUsageCategory[];
  topExpenses: CardUsageTopExpense[];
};

export function calculateCardUsageDetail(input: {
  period: string;
  card: CardUsageCard;
  countedRows: readonly CountedCardRow[];
}): CardUsageDetail {
  const limitCents = toCents(Number(input.card.limit));
  const cardRows = input.countedRows.filter((row) => row.cardId === input.card.id);
  const rowsInPeriod = (period: string) => cardRows.filter((row) => row.period === period);
  const usedCentsIn = (period: string) =>
    Math.max(
      0,
      rowsInPeriod(period).reduce((sum, row) => sum + row.impactCents, 0),
    );
  const monthRows = rowsInPeriod(input.period);
  const monthUsedCents = usedCentsIn(input.period);

  const history = Array.from({ length: cardUsageHistoryMonths }, (_, index): CardUsageHistoryItem => {
    const period = addMonthsToPeriod(input.period, index - (cardUsageHistoryMonths - 1));
    const usedCents = usedCentsIn(period);
    return {
      period,
      usedCents,
      usagePercentage: calculateUsagePercentage(usedCents, limitCents),
    };
  });

  const categoryGroups = new Map<string, Omit<CardUsageCategory, "percentage">>();
  for (const row of monthRows) {
    const key = row.categoryId ?? "uncategorized";
    const group = categoryGroups.get(key) ?? {
      categoryId: row.categoryId,
      name: row.categoryName,
      icon: row.categoryIcon,
      amountCents: 0,
    };
    group.amountCents += row.impactCents;
    categoryGroups.set(key, group);
  }
  const categories = [...categoryGroups.values()]
    .filter((group) => group.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents || compareNullableNames(a.name, b.name))
    .slice(0, cardUsageCategoryLimit)
    .map((group) => ({
      ...group,
      percentage: calculateUsagePercentage(group.amountCents, monthUsedCents),
    }));

  const topExpenses = monthRows
    .filter((row) => row.impactCents > 0)
    .sort(
      (a, b) =>
        b.impactCents - a.impactCents ||
        b.purchaseDate.localeCompare(a.purchaseDate) ||
        a.name.localeCompare(b.name, "pt-BR"),
    )
    .slice(0, cardUsageTopExpenseLimit)
    .map((row) => ({
      name: row.name,
      purchaseDate: row.purchaseDate,
      categoryName: row.categoryName,
      amountCents: row.impactCents,
    }));

  return { cardId: input.card.id, history, categories, topExpenses };
}

function compareNullableNames(a: string | null, b: string | null) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a.localeCompare(b, "pt-BR");
}
