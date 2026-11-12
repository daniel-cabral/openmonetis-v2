import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import { Link } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { Plus } from "lucide-react";
import { MoneyValue } from "@/components/money-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCardBrandAsset } from "@/features/cards/card-brand-assets";
import { cardBrandLabels } from "@/features/cards/cards.presentation";
import { formatCurrency } from "@/lib/money-presentation";
import { cn } from "@/lib/utils";
import { calendarEventGroups, eventStateLabel } from "../calendar.presentation";
import {
  type CalendarDay,
  type CalendarEvent,
  calendarEventAmountClassName,
  calendarEventTitle,
} from "./calendar-day-cell";

function formatLongDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

function eventDetails(event: CalendarEvent): string[] {
  if (event.kind === "invoice") return [];

  const details: string[] = [];
  if (event.kind === "installment") {
    details.push(
      `${event.installmentCount} parcelas · ${formatCurrency(event.amount)} por parcela`,
    );
    if (event.paymentMethod !== "credit_card") {
      details.push(`Parcela ${event.currentInstallment}/${event.installmentCount}`);
    }
  }
  if (event.categoryName) details.push(event.categoryName);
  if (event.cardName) details.push(event.cardName);
  return details;
}

function CalendarEventRow({ event, period }: { event: CalendarEvent; period: string }) {
  const brandAsset = event.kind === "invoice" ? getCardBrandAsset(event.cardBrand) : null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-start gap-3">
        {event.kind === "invoice" && event.cardLogo ? (
          <Image
            alt={`Logo de ${event.cardName}`}
            className="size-9 shrink-0 rounded-full object-contain"
            height={36}
            layout="fixed"
            src={event.cardLogo}
            width={36}
          />
        ) : null}
        {event.kind === "invoice" && !event.cardLogo && brandAsset ? (
          <Image
            alt={cardBrandLabels[event.cardBrand]}
            className="h-5 w-auto shrink-0 object-contain"
            height={20}
            src={brandAsset}
            width={32}
          />
        ) : null}
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate font-medium text-sm">{calendarEventTitle(event)}</p>
          {eventDetails(event).map((line) => (
            <p className="text-muted-foreground text-xs" key={line}>
              {line}
            </p>
          ))}
          {event.kind === "invoice" ? (
            <Link
              className="w-fit rounded-sm font-medium text-brand-strong text-xs hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
              params={{ cardId: event.cardId }}
              search={{ period }}
              to="/cards/$cardId"
            >
              Ver fatura
            </Link>
          ) : null}
        </div>
      </div>
      <div className="grid shrink-0 justify-items-end gap-1">
        <MoneyValue
          amount={event.amount}
          className={cn("font-medium text-sm", calendarEventAmountClassName(event))}
        />
        <Badge variant="outline">{eventStateLabel(event)}</Badge>
      </div>
    </div>
  );
}

type CalendarDayDialogProps = {
  day: CalendarDay | null;
  onCreate: (date: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function CalendarDayDialog({ day, onCreate, onOpenChange }: CalendarDayDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={day !== null}>
      {day ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formatLongDate(day.date)}</DialogTitle>
            <DialogDescription>
              {day.events.length > 0
                ? "Lançamentos e vencimentos cadastrados para este dia."
                : "Nenhum lançamento encontrado para este dia."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            {calendarEventGroups(day.events).map((group) => (
              <section aria-label={group.title} className="grid gap-2" key={group.key}>
                <h3 className="font-medium text-muted-foreground text-xs">{group.title}</h3>
                <ul className="grid gap-2">
                  {group.events.map((event) => (
                    <li key={`${event.kind}-${event.id}`}>
                      <CalendarEventRow event={event} period={day.date.slice(0, 7)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => onCreate(day.date)} type="button">
              <Plus aria-hidden="true" />
              Novo lançamento
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
