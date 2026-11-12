import {
  dateOnlyToSafeInstant,
  formatDateInBrazil,
  getCurrentPeriodInBrazil,
} from "@openmonetis/shared/date-time";
import type { CalendarEventSchema } from "@openmonetis/validators/calendar";
import type { z } from "zod";

type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export type CalendarSearch = {
  period: string;
};

const periodPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;

export const weekdayLabels: readonly string[] = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type CalendarEventGroupKey = "transactions" | "installments" | "boletos" | "invoices";

export type CalendarLegendItem = {
  key: CalendarEventGroupKey;
  label: string;
  markerClassName: string;
};

export const calendarLegendItems: readonly CalendarLegendItem[] = [
  { key: "transactions", label: "Lançamentos", markerClassName: "bg-info" },
  { key: "installments", label: "Parcelas", markerClassName: "bg-brand" },
  { key: "boletos", label: "Boletos", markerClassName: "bg-warning" },
  { key: "invoices", label: "Fatura de Cartão", markerClassName: "bg-chart-4" },
];

const groupKeyByKind: Record<CalendarEvent["kind"], CalendarEventGroupKey> = {
  transaction: "transactions",
  installment: "installments",
  boleto: "boletos",
  invoice: "invoices",
};

const groupTitles: Record<CalendarEventGroupKey, string> = {
  transactions: "Lançamentos",
  installments: "Parcelas",
  boletos: "Boletos",
  invoices: "Faturas",
};

const groupOrder: readonly CalendarEventGroupKey[] = [
  "transactions",
  "installments",
  "boletos",
  "invoices",
];

export type CalendarEventGroup = {
  key: CalendarEventGroupKey;
  title: string;
  events: CalendarEvent[];
};

export function validateCalendarSearch(search: Record<string, unknown>): Partial<CalendarSearch> {
  const period = search.period;
  return typeof period === "string" && periodPattern.test(period) ? { period } : {};
}

export function resolveCalendarSearch(search: Partial<CalendarSearch>): CalendarSearch {
  return { period: search.period ?? getCurrentPeriodInBrazil() };
}

export function calendarEventMarkerClassName(event: CalendarEvent): string {
  const key = groupKeyByKind[event.kind];
  return calendarLegendItems.find((item) => item.key === key)?.markerClassName ?? "";
}

export function splitDayPreview(
  events: CalendarEvent[],
  limit = 3,
): { visible: CalendarEvent[]; hiddenCount: number } {
  return {
    visible: events.slice(0, limit),
    hiddenCount: Math.max(events.length - limit, 0),
  };
}

export function eventStateLabel(event: CalendarEvent): string {
  if (event.kind === "invoice") {
    if (event.state === "paid") {
      return event.paidAt
        ? `Pago em ${formatDateInBrazil(dateOnlyToSafeInstant(event.paidAt), {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}`
        : "Pago";
    }
    if (event.state === "overdue") return "Atrasada";
    return "Pendente";
  }

  if (event.kind === "boleto" && !event.isSettled && event.isOverdue) return "Atrasado";
  if (event.isSettled) return event.type === "income" ? "Recebido" : "Pago";
  return "Pendente";
}

export function calendarEventGroups(events: CalendarEvent[]): CalendarEventGroup[] {
  return groupOrder
    .map((key) => ({
      key,
      title: groupTitles[key],
      events: events.filter((event) => groupKeyByKind[event.kind] === key),
    }))
    .filter((group) => group.events.length > 0);
}
