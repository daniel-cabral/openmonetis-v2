import { queryOptions } from "@tanstack/react-query";
import { getCalendarMonth } from "./calendar.api";

export function calendarQueryOptions(period: string) {
  return queryOptions({
    queryKey: ["calendar", period] as const,
    queryFn: () => getCalendarMonth(period),
  });
}
