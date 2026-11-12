import { cn } from "@/lib/utils";
import { calendarLegendItems } from "../calendar.presentation";

export function CalendarLegend() {
  return (
    <ul
      aria-label="Legenda"
      className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs"
    >
      {calendarLegendItems.map((item) => (
        <li className="flex items-center gap-1.5" key={item.key}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", item.markerClassName)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
