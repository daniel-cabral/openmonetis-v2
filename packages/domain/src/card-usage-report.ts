import type { CardInvoiceStatus } from "./cards";

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
