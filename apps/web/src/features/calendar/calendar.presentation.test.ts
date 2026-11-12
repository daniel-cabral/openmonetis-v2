import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import type { CalendarEventSchema } from "@openmonetis/validators/calendar";
import type { z } from "zod";
import {
  calendarEventGroups,
  calendarEventMarkerClassName,
  eventStateLabel,
  resolveCalendarSearch,
  splitDayPreview,
  validateCalendarSearch,
} from "./calendar.presentation";

type CalendarEvent = z.infer<typeof CalendarEventSchema>;
type EventOfKind<K extends CalendarEvent["kind"]> = Extract<CalendarEvent, { kind: K }>;

const tripId = "10000000-0000-4000-8000-000000000001";
const cardId = "20000000-0000-4000-8000-000000000001";

function transactionEvent(
  overrides: Partial<EventOfKind<"transaction">> = {},
): EventOfKind<"transaction"> {
  return {
    kind: "transaction",
    id: "transaction-1",
    date: "2026-10-12",
    transactionId: tripId,
    name: "Mercado",
    type: "expense",
    amount: 150.5,
    categoryName: "Alimentação",
    categoryIcon: null,
    paymentMethod: "pix",
    cardName: null,
    isSettled: true,
    dueDate: null,
    ...overrides,
  };
}

function boletoEvent(overrides: Partial<EventOfKind<"boleto">> = {}): EventOfKind<"boleto"> {
  return {
    ...transactionEvent({ paymentMethod: "boleto", isSettled: false, dueDate: "2026-10-20" }),
    kind: "boleto",
    isOverdue: false,
    ...overrides,
  };
}

function installmentEvent(): EventOfKind<"installment"> {
  return {
    ...transactionEvent({ paymentMethod: "credit_card", cardName: "Nubank" }),
    kind: "installment",
    currentInstallment: 1,
    installmentCount: 3,
  };
}

function invoiceEvent(overrides: Partial<EventOfKind<"invoice">> = {}): EventOfKind<"invoice"> {
  return {
    kind: "invoice",
    id: "invoice-1",
    date: "2026-10-15",
    cardId,
    cardName: "Nubank",
    cardLogo: null,
    cardBrand: "mastercard",
    amount: 1200,
    state: "pending",
    paidAt: null,
    ...overrides,
  };
}

test("event state label names the payment or overdue state in PT-BR", async (t) => {
  const cases: { name: string; event: CalendarEvent; expected: string }[] = [
    {
      name: "invoice paid on a date",
      event: invoiceEvent({ state: "paid", paidAt: "2026-10-09" }),
      expected: "Pago em 09/10/2026",
    },
    {
      name: "invoice paid without a date",
      event: invoiceEvent({ state: "paid", paidAt: null }),
      expected: "Pago",
    },
    { name: "invoice overdue", event: invoiceEvent({ state: "overdue" }), expected: "Atrasada" },
    { name: "invoice pending", event: invoiceEvent({ state: "pending" }), expected: "Pendente" },
    {
      name: "unsettled boleto past its due date",
      event: boletoEvent({ isOverdue: true }),
      expected: "Atrasado",
    },
    {
      name: "unsettled boleto before its due date",
      event: boletoEvent({ isOverdue: false }),
      expected: "Pendente",
    },
    {
      name: "settled expense",
      event: transactionEvent({ type: "expense", isSettled: true }),
      expected: "Pago",
    },
    {
      name: "settled income",
      event: transactionEvent({ type: "income", isSettled: true }),
      expected: "Recebido",
    },
    {
      name: "unsettled expense",
      event: transactionEvent({ type: "expense", isSettled: false }),
      expected: "Pendente",
    },
  ];

  for (const { name, event, expected } of cases) {
    await t.test(name, () => {
      assert.equal(eventStateLabel(event), expected);
    });
  }
});

test("calendar search keeps a valid period and falls back to the current one", async (t) => {
  const cases = [
    { name: "valid period", input: { period: "2026-10" }, expected: { period: "2026-10" } },
    {
      name: "month 13",
      input: { period: "2026-13" },
      expected: { period: getCurrentPeriodInBrazil() },
    },
    { name: "missing period", input: {}, expected: { period: getCurrentPeriodInBrazil() } },
  ];

  for (const { name, input, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(resolveCalendarSearch(validateCalendarSearch(input)), expected);
    });
  }
});

test("day preview shows the first three events and counts the rest", () => {
  const events = [1, 2, 3, 4, 5].map((index) => transactionEvent({ id: `transaction-${index}` }));

  const preview = splitDayPreview(events);

  assert.deepEqual(
    preview.visible.map((event) => event.id),
    ["transaction-1", "transaction-2", "transaction-3"],
  );
  assert.equal(preview.hiddenCount, 2);
});

test("day groups follow the legend order with PT-BR titles and skip empty kinds", () => {
  const groups = calendarEventGroups([
    invoiceEvent(),
    boletoEvent(),
    installmentEvent(),
    transactionEvent(),
  ]);

  assert.deepEqual(
    groups.map((group) => [group.key, group.title]),
    [
      ["transactions", "Lançamentos"],
      ["installments", "Parcelas"],
      ["boletos", "Boletos"],
      ["invoices", "Faturas"],
    ],
  );
  assert.deepEqual(
    calendarEventGroups([invoiceEvent(), transactionEvent()]).map((group) => group.key),
    ["transactions", "invoices"],
  );
});

test("each event kind is marked with the legend color of its group", () => {
  assert.equal(calendarEventMarkerClassName(transactionEvent()), "bg-info");
  assert.equal(calendarEventMarkerClassName(installmentEvent()), "bg-brand");
  assert.equal(calendarEventMarkerClassName(boletoEvent()), "bg-warning");
  assert.equal(calendarEventMarkerClassName(invoiceEvent()), "bg-chart-4");
});
