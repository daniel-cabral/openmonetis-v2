import type {
  CardUsageInvoiceState,
  CardUsageTone,
  CardUsageTrend,
} from "@openmonetis/domain/card-usage-report";
import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";

export type CardUsageReportSearch = {
  period?: string;
  card?: string;
};

export type ResolvedCardUsageReportSearch = {
  period: string;
  card: string | undefined;
};

const periodPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

const trendLabel: Record<CardUsageTrend, string> = {
  up: "Alta",
  down: "Queda",
  stable: "Estável",
};

export const cardUsageToneClassName: Record<CardUsageTone, { bar: string; text: string }> = {
  success: { bar: "bg-success", text: "text-success" },
  warning: { bar: "bg-warning", text: "text-warning" },
  danger: { bar: "bg-destructive", text: "text-destructive" },
};

export const cardUsageInvoiceStateLabel: Record<CardUsageInvoiceState, string> = {
  paid: "Pago",
  pending: "Pendente",
  overdue: "Atrasado",
  none: "–",
};

export function validateCardUsageReportSearch(
  search: Record<string, unknown>,
): CardUsageReportSearch {
  return {
    period: validPeriod(search.period),
    card: validCard(search.card),
  };
}

export function resolveCardUsageReportSearch(
  search: Record<string, unknown>,
): ResolvedCardUsageReportSearch {
  const valid = validateCardUsageReportSearch(search);

  return {
    period: valid.period ?? getCurrentPeriodInBrazil(),
    card: valid.card,
  };
}

export function formatCardUsageTrend(trend: CardUsageTrend, changePercentage: number) {
  return {
    label: trendLabel[trend],
    value: `${percentFormatter.format(changePercentage)}%`,
  };
}

export function formatUncategorized(name: string | null) {
  return name ?? "Sem categoria";
}

function validPeriod(value: unknown) {
  return typeof value === "string" && periodPattern.test(value) ? value : undefined;
}

function validCard(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : undefined;
}
