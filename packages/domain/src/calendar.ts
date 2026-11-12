import type { CardBrand, CardInvoiceStatus } from "./cards";
import { fromCents, toCents } from "./money";
import type { PaymentMethod, TransactionType } from "./transactions";

const calendarGridDayCount = 42;

const dayInMilliseconds = 86_400_000;

const eventKindOrder: Record<CalendarEvent["kind"], number> = {
  transaction: 0,
  installment: 0,
  boleto: 1,
  invoice: 2,
};

export type CalendarGridDay = { date: string; inMonth: boolean; isToday: boolean };

export type CalendarTransactionItem = {
  id: string;
  isRecurring: boolean;
  type: TransactionType;
  paymentMethod: PaymentMethod | null;
  name: string;
  amount: number;
  personId: string;
  allocation: { personId: string; amount: number } | null;
  purchaseDate: string;
  dueDate: string | null;
  isSettled: boolean | null;
  installmentCount: number | null;
  currentInstallment: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  cardName: string | null;
};

export type CalendarCardItem = {
  id: string;
  name: string;
  brand: CardBrand;
  logo: string | null;
  invoiceSummary: {
    amount: number;
    status: CardInvoiceStatus;
    dueDate: string;
    payments: { paidAt: string }[];
  };
};

export type CalendarMonthInput = {
  period: string;
  today: string;
  adminPersonId: string | null;
  purchaseItems: CalendarTransactionItem[];
  boletoItems: CalendarTransactionItem[];
  cards: CalendarCardItem[];
};

type CalendarEventBase = { id: string; date: string };

type CalendarTransactionFields = CalendarEventBase & {
  transactionId: string | null;
  name: string;
  type: "income" | "expense";
  amount: number;
  categoryName: string | null;
  categoryIcon: string | null;
  paymentMethod: PaymentMethod | null;
  cardName: string | null;
  isSettled: boolean;
  dueDate: string | null;
};

export type CalendarTransactionEvent = CalendarTransactionFields & { kind: "transaction" };

export type CalendarInstallmentEvent = CalendarTransactionFields & {
  kind: "installment";
  currentInstallment: number;
  installmentCount: number;
};

export type CalendarBoletoEvent = CalendarTransactionFields & {
  kind: "boleto";
  dueDate: string;
  isOverdue: boolean;
};

export type CalendarInvoiceEvent = CalendarEventBase & {
  kind: "invoice";
  cardId: string;
  cardName: string;
  cardLogo: string | null;
  cardBrand: CardBrand;
  amount: number;
  state: "paid" | "overdue" | "pending";
  paidAt: string | null;
};

export type CalendarEvent =
  | CalendarTransactionEvent
  | CalendarInstallmentEvent
  | CalendarBoletoEvent
  | CalendarInvoiceEvent;

export type CalendarDay = CalendarGridDay & {
  totals: { income: number; expense: number };
  events: CalendarEvent[];
};

export type CalendarMonth = { period: string; days: CalendarDay[] };

export function buildCalendarDays(period: string, today: string): CalendarGridDay[] {
  const [year, month] = period.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const leadingDayCount = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = Date.UTC(year, month - 1, 1 - leadingDayCount);

  return Array.from({ length: calendarGridDayCount }, (_, index) => {
    const date = new Date(gridStart + index * dayInMilliseconds).toISOString().slice(0, 10);
    return { date, inMonth: date.startsWith(period), isToday: date === today };
  });
}

export function buildCalendarMonth(input: CalendarMonthInput): CalendarMonth {
  const events = uniqueEventsInMonth(input);

  const days = buildCalendarDays(input.period, input.today).map((day) => {
    const dayEvents = events
      .filter((event) => event.date === day.date)
      .sort((a, b) => compareEvents(a, b));
    return { ...day, events: dayEvents, totals: sumDayTotals(dayEvents) };
  });

  return { period: input.period, days };
}

function uniqueEventsInMonth(input: CalendarMonthInput): CalendarEvent[] {
  const events = [...purchaseEvents(input), ...boletoEvents(input), ...invoiceEvents(input.cards)];
  const seenIds = new Set<string>();
  return events.filter((event) => {
    if (seenIds.has(event.id) || !event.date.startsWith(input.period)) return false;
    seenIds.add(event.id);
    return true;
  });
}

function purchaseEvents(input: CalendarMonthInput): CalendarEvent[] {
  return input.purchaseItems.flatMap((item): CalendarEvent[] => {
    const shareCents = ownShareCents(item, input.adminPersonId);
    if (shareCents === null || item.paymentMethod === "boleto") return [];

    if (item.installmentCount !== null && item.installmentCount > 1) {
      if (item.currentInstallment === null) return [];
      if (item.paymentMethod === "credit_card" && item.currentInstallment !== 1) return [];
      return [
        {
          ...toTransactionFields(item, item.purchaseDate, shareCents, "installment"),
          kind: "installment",
          currentInstallment: item.currentInstallment,
          installmentCount: item.installmentCount,
        },
      ];
    }

    return [
      {
        ...toTransactionFields(item, item.purchaseDate, shareCents, "transaction"),
        kind: "transaction",
      },
    ];
  });
}

function boletoEvents(input: CalendarMonthInput): CalendarEvent[] {
  return input.boletoItems.flatMap((item): CalendarEvent[] => {
    const shareCents = ownShareCents(item, input.adminPersonId);
    if (shareCents === null || item.paymentMethod !== "boleto" || item.dueDate === null) {
      return [];
    }

    const fields = toTransactionFields(item, item.dueDate, shareCents, "boleto");
    return [
      {
        ...fields,
        kind: "boleto",
        dueDate: item.dueDate,
        isOverdue: !fields.isSettled && item.dueDate < input.today,
      },
    ];
  });
}

function invoiceEvents(cards: CalendarCardItem[]): CalendarEvent[] {
  return cards.flatMap((card): CalendarEvent[] => {
    const { amount, status, dueDate, payments } = card.invoiceSummary;
    if (amount <= 0) return [];

    const state = invoiceState(status);
    return [
      {
        id: `invoice:${card.id}`,
        kind: "invoice",
        date: dueDate,
        cardId: card.id,
        cardName: card.name,
        cardLogo: card.logo,
        cardBrand: card.brand,
        amount: fromCents(toCents(amount)),
        state,
        paidAt: state === "paid" ? latestPaymentDate(payments) : null,
      },
    ];
  });
}

function ownShareCents(item: CalendarTransactionItem, adminPersonId: string | null) {
  if (item.type === "transfer") return null;
  if (item.allocation) {
    return item.allocation.personId === adminPersonId
      ? toCents(Math.abs(item.allocation.amount))
      : null;
  }
  return item.personId === adminPersonId ? toCents(Math.abs(item.amount)) : null;
}

function toTransactionFields(
  item: CalendarTransactionItem,
  date: string,
  shareCents: number,
  kind: "transaction" | "installment" | "boleto",
): CalendarTransactionFields {
  return {
    id: `${kind}:${item.id}:${date}`,
    date,
    transactionId: item.isRecurring && item.isSettled !== true ? null : item.id,
    name: item.name,
    type: item.type === "income" ? "income" : "expense",
    amount: fromCents(shareCents),
    categoryName: item.categoryName,
    categoryIcon: item.categoryIcon,
    paymentMethod: item.paymentMethod,
    cardName: item.cardName,
    isSettled: item.isSettled === true,
    dueDate: item.dueDate,
  };
}

function invoiceState(status: CardInvoiceStatus): "paid" | "overdue" | "pending" {
  if (status === "paid") return "paid";
  if (status === "overdue") return "overdue";
  return "pending";
}

function latestPaymentDate(payments: { paidAt: string }[]) {
  const paidDates = payments.map((payment) => payment.paidAt).sort();
  return paidDates[paidDates.length - 1] ?? null;
}

function sumDayTotals(events: CalendarEvent[]) {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const event of events) {
    if (event.kind === "invoice") continue;
    if (event.type === "income") {
      incomeCents += toCents(event.amount);
    } else {
      expenseCents += toCents(event.amount);
    }
  }
  return { income: fromCents(incomeCents), expense: fromCents(expenseCents) };
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
  return (
    eventKindOrder[a.kind] - eventKindOrder[b.kind] ||
    eventLabel(a).localeCompare(eventLabel(b), "pt-BR")
  );
}

function eventLabel(event: CalendarEvent) {
  return event.kind === "invoice" ? event.cardName : event.name;
}
