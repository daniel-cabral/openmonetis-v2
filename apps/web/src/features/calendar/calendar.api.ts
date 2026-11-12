import type { CalendarOutputSchema } from "@openmonetis/validators/calendar";
import type { z } from "zod";
import { requestApi } from "@/lib/api-client";

export type CalendarOutput = z.infer<typeof CalendarOutputSchema>;

export function getCalendarMonth(period: string) {
  const params = new URLSearchParams({ period });

  return requestApi<CalendarOutput>(`/calendar?${params.toString()}`);
}
