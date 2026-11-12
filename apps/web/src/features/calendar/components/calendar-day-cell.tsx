import { MoneyValue } from "@/components/money-value";
import { cn } from "@/lib/utils";
import type { CalendarOutput } from "../calendar.api";
import { calendarEventMarkerClassName, splitDayPreview } from "../calendar.presentation";

export type CalendarDay = CalendarOutput["days"][number];
export type CalendarEvent = CalendarDay["events"][number];

export function calendarEventTitle(event: CalendarEvent) {
  return event.kind === "invoice" ? event.cardName : event.name;
}

export function calendarEventAmountClassName(event: CalendarEvent) {
  if (event.kind === "invoice") return "text-destructive";
  return event.type === "income" ? "text-success" : "text-destructive";
}

type CalendarDayCellProps = {
  day: CalendarDay;
  onOpen: () => void;
};

export function CalendarDayCell({ day, onOpen }: CalendarDayCellProps) {
  const dayNumber = (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-xs",
        day.isToday && "ring-2 ring-brand",
      )}
    >
      {Number(day.date.slice(8))}
    </span>
  );

  if (!day.inMonth) {
    return (
      <span className="flex h-full min-h-28 w-full flex-col gap-1 bg-muted/40 p-1.5 text-muted-foreground opacity-60">
        {dayNumber}
      </span>
    );
  }

  const { visible, hiddenCount } = splitDayPreview(day.events);

  return (
    <button
      className="flex h-full min-h-28 w-full min-w-0 flex-col gap-1 bg-card p-1.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      onClick={onOpen}
      type="button"
    >
      {dayNumber}
      <span className="hidden min-w-0 flex-col gap-1 sm:flex">
        {visible.map((event) => (
          <span
            className="flex min-w-0 items-center gap-1 rounded-sm bg-muted px-1 py-0.5 text-2xs leading-tight"
            key={`${event.kind}-${event.id}`}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                calendarEventMarkerClassName(event),
              )}
            />
            <span className="truncate">{calendarEventTitle(event)}</span>
            <MoneyValue
              amount={event.amount}
              className={cn("ml-auto shrink-0", calendarEventAmountClassName(event))}
            />
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="text-2xs text-muted-foreground">+{hiddenCount} mais</span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-1 sm:hidden">
        {day.events.map((event) => (
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", calendarEventMarkerClassName(event))}
            key={`${event.kind}-${event.id}`}
          />
        ))}
      </span>
    </button>
  );
}
