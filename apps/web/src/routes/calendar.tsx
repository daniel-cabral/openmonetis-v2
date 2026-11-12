import { createFileRoute } from "@tanstack/react-router";
import {
  resolveCalendarSearch,
  validateCalendarSearch,
} from "@/features/calendar/calendar.presentation";
import { CalendarPage } from "@/features/calendar/components/calendar-page";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendário · OpenMonetis" }] }),
  component: CalendarRoute,
  validateSearch: validateCalendarSearch,
});

function CalendarRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { period } = resolveCalendarSearch(search);

  return (
    <CalendarPage
      onPeriodChange={(nextPeriod) =>
        navigate({
          replace: true,
          search: { period: nextPeriod },
        })
      }
      period={period}
    />
  );
}
