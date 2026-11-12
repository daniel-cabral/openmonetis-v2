import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";

export type EstablishmentsReportSearch = {
  period?: string;
  months?: 3 | 6 | 12;
  trip?: string;
};

export type ResolvedEstablishmentsReportSearch = {
  period: string;
  months: 3 | 6 | 12;
  trip: string | undefined;
};

const defaultMonths = 6;
const monthOptions = [3, 6, 12] as const;
const periodPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateEstablishmentsReportSearch(
  search: Record<string, unknown>,
): EstablishmentsReportSearch {
  return {
    period: validPeriod(search.period),
    months: validMonths(search.months),
    trip: validTrip(search.trip),
  };
}

export function resolveEstablishmentsReportSearch(
  search: Record<string, unknown>,
): ResolvedEstablishmentsReportSearch {
  const valid = validateEstablishmentsReportSearch(search);

  return {
    period: valid.period ?? getCurrentPeriodInBrazil(),
    months: valid.months ?? defaultMonths,
    trip: valid.trip,
  };
}

export function formatEstablishmentsPeriodLabel(
  report: Pick<EstablishmentsReportOutput, "months" | "tripFilter">,
) {
  const { tripFilter } = report;

  if (tripFilter.mode === "trip" && tripFilter.tripName) {
    return `Viagem: ${tripFilter.tripName}`;
  }

  return `Últimos ${report.months} meses`;
}

export function formatPurchaseCount(count: number) {
  return count === 1 ? "1 compra" : `${Intl.NumberFormat("pt-BR").format(count)} compras`;
}

function validPeriod(value: unknown) {
  return typeof value === "string" && periodPattern.test(value) ? value : undefined;
}

function validMonths(value: unknown) {
  const months = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return monthOptions.find((option) => option === months);
}

function validTrip(value: unknown) {
  return typeof value === "string" && (value === "none" || uuidPattern.test(value))
    ? value
    : undefined;
}
