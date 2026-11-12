import type { CalendarOutput } from "@openmonetis/validators/calendar";
import { requestApi } from "@/lib/api-client";

export function getCalendarMonth(period: string) {
  const params = new URLSearchParams({ period });

  return requestApi<CalendarOutput>(`/calendar?${params.toString()}`);
}
