import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { weekdayLabels } from "../calendar.presentation";
import { CalendarDayCell, type CalendarDay } from "./calendar-day-cell";

type CalendarGridProps = {
  days: CalendarDay[];
  onCreate: (date: string) => void;
  onOpenDay: (date: string) => void;
};

function formatShortDate(date: string) {
  return `${date.slice(8)}/${date.slice(5, 7)}`;
}

export function CalendarGrid({ days, onCreate, onOpenDay }: CalendarGridProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {weekdayLabels.map((label) => (
          <div
            className="px-2 py-2 text-center font-medium text-muted-foreground text-xs"
            key={label}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <div
            className="group/cell relative flex min-w-0 border-r border-b [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0"
            key={day.date}
          >
            <CalendarDayCell day={day} onOpen={() => onOpenDay(day.date)} />
            {day.inMonth ? (
              <Button
                aria-label={`Novo lançamento em ${formatShortDate(day.date)}`}
                className="absolute top-1.5 right-1.5 text-muted-foreground opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/cell:opacity-100"
                onClick={() => onCreate(day.date)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Plus aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
