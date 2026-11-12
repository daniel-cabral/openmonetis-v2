import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalendarDays,
  buildCalendarMonth,
  type CalendarCardItem,
  type CalendarEvent,
  type CalendarMonth,
  type CalendarMonthInput,
  type CalendarTransactionItem,
} from "./calendar";

const gridCases = [
  { period: "2026-10", firstDate: "2026-09-28", lastDate: "2026-11-08", inMonthCount: 31 },
  { period: "2026-03", firstDate: "2026-02-23", lastDate: "2026-04-05", inMonthCount: 31 },
  { period: "2028-02", firstDate: "2028-01-31", lastDate: "2028-03-12", inMonthCount: 29 },
];

test("calendar grid spans 42 Monday-first days and marks only the given day as today", () => {
  for (const { period, firstDate, lastDate, inMonthCount } of gridCases) {
    const days = buildCalendarDays(period, "2026-10-12");
    assert.equal(days.length, 42, period);
    assert.equal(days[0]?.date, firstDate, period);
    assert.equal(days[41]?.date, lastDate, period);
    assert.equal(days.filter((day) => day.inMonth).length, inMonthCount, period);
  }

  const october = buildCalendarDays("2026-10", "2026-10-12");
  assert.deepEqual(
    october.filter((day) => day.isToday),
    [{ date: "2026-10-12", inMonth: true, isToday: true }],
  );

  const march = buildCalendarDays("2026-03", "2026-10-12");
  assert.equal(
    march.some((day) => day.isToday),
    false,
  );
});

const adminPersonId = "admin";

function item(
  fields: Pick<CalendarTransactionItem, "id" | "name" | "amount" | "purchaseDate"> &
    Partial<CalendarTransactionItem>,
): CalendarTransactionItem {
  return {
    isRecurring: false,
    type: "expense",
    paymentMethod: "pix",
    personId: adminPersonId,
    allocation: null,
    dueDate: null,
    isSettled: true,
    installmentCount: null,
    currentInstallment: null,
    categoryName: null,
    categoryIcon: null,
    cardName: null,
    ...fields,
  };
}

const internet = item({
  id: "internet",
  name: "Internet",
  amount: -120,
  purchaseDate: "2026-09-30",
  paymentMethod: "boleto",
  dueDate: "2026-10-20",
  isSettled: false,
});
const carro = item({
  id: "carro",
  name: "Carro",
  amount: -800,
  purchaseDate: "2026-09-25",
  paymentMethod: "boleto",
  installmentCount: 4,
  currentInstallment: 2,
  dueDate: "2026-10-25",
  isSettled: false,
});
const luz = item({
  id: "luz",
  name: "Luz",
  amount: -90,
  purchaseDate: "2026-09-03",
  paymentMethod: "boleto",
  dueDate: "2026-10-03",
  isSettled: false,
});
const academia = item({
  id: "academia",
  name: "Academia",
  amount: -90,
  purchaseDate: "2026-10-01",
  paymentMethod: "boleto",
  dueDate: "2026-10-20",
});

const aluguel = item({
  id: "aluguel",
  name: "Aluguel",
  amount: -1200,
  purchaseDate: "2026-09-22",
  paymentMethod: "boleto",
  isRecurring: true,
  dueDate: "2026-10-22",
});
const condominio = item({
  id: "condominio",
  name: "Condominio",
  amount: -300,
  purchaseDate: "2026-09-22",
  paymentMethod: "boleto",
  isRecurring: true,
  dueDate: "2026-10-22",
  isSettled: false,
});

const cards: CalendarCardItem[] = [
  {
    id: "nubank",
    name: "Nubank",
    brand: "mastercard",
    logo: "nubank.png",
    invoiceSummary: { amount: 1200, status: "open", dueDate: "2026-10-20", payments: [] },
  },
  {
    id: "inter",
    name: "Inter",
    brand: "visa",
    logo: null,
    invoiceSummary: {
      amount: 800,
      status: "paid",
      dueDate: "2026-10-25",
      payments: [{ paidAt: "2026-10-09" }, { paidAt: "2026-10-12" }],
    },
  },
  {
    id: "itau",
    name: "Itau",
    brand: "visa",
    logo: "itau.png",
    invoiceSummary: { amount: 300, status: "overdue", dueDate: "2026-10-08", payments: [] },
  },
  {
    id: "c6",
    name: "C6",
    brand: "mastercard",
    logo: null,
    invoiceSummary: { amount: 0, status: "closed", dueDate: "2026-10-28", payments: [] },
  },
];

const octoberInput: CalendarMonthInput = {
  period: "2026-10",
  today: "2026-10-15",
  adminPersonId,
  purchaseItems: [
    item({
      id: "mercado",
      name: "Mercado",
      amount: -150.5,
      purchaseDate: "2026-10-12",
      categoryName: "Mercado",
      categoryIcon: "shopping-cart",
    }),
    item({
      id: "reserva",
      name: "Reserva",
      type: "transfer",
      amount: -500,
      purchaseDate: "2026-10-12",
    }),
    item({
      id: "presente",
      name: "Presente",
      amount: -60,
      purchaseDate: "2026-10-05",
      personId: "other",
    }),
    item({
      id: "jantar",
      name: "Jantar",
      amount: -200,
      purchaseDate: "2026-10-05",
      personId: "other",
      allocation: { personId: adminPersonId, amount: -80 },
    }),
    item({
      id: "viagem",
      name: "Viagem",
      amount: -300,
      purchaseDate: "2026-10-06",
      allocation: { personId: "other", amount: -50 },
    }),
    item({
      id: "salario",
      name: "Salario",
      type: "income",
      amount: 1000,
      purchaseDate: "2026-10-05",
    }),
    item({ id: "assinatura", name: "Assinatura", amount: -30, purchaseDate: "2026-09-30" }),
    item({
      id: "notebook-1",
      name: "Notebook",
      amount: -400,
      purchaseDate: "2026-10-10",
      paymentMethod: "credit_card",
      installmentCount: 3,
      currentInstallment: 1,
      cardName: "Nubank",
    }),
    item({
      id: "fone",
      name: "Fone",
      amount: -150,
      purchaseDate: "2026-10-14",
      paymentMethod: "credit_card",
      installmentCount: 3,
      currentInstallment: 2,
      cardName: "Nubank",
    }),
    item({
      id: "geladeira",
      name: "Geladeira",
      amount: -250,
      purchaseDate: "2026-10-08",
      installmentCount: 10,
      currentInstallment: 3,
    }),
    item({
      id: "celular",
      name: "Celular",
      amount: -100,
      purchaseDate: "2026-10-20",
      installmentCount: 2,
      currentInstallment: 1,
    }),
    item({ id: "padaria", name: "Padaria", amount: -12.5, purchaseDate: "2026-10-20" }),
    internet,
    carro,
  ],
  boletoItems: [internet, luz, academia, carro, aluguel, condominio],
  cards,
};

const october = buildCalendarMonth(octoberInput);

function dayOf(month: CalendarMonth, date: string) {
  return month.days.find((day) => day.date === date);
}

function eventsOn(month: CalendarMonth, date: string): CalendarEvent[] {
  return dayOf(month, date)?.events ?? [];
}

function eventLabel(event: CalendarEvent) {
  return event.kind === "invoice" ? event.cardName : event.name;
}

test("month places purchases on their purchase day and drops rows outside the month", () => {
  assert.deepEqual(eventsOn(october, "2026-10-12"), [
    {
      id: "transaction:mercado:2026-10-12",
      kind: "transaction",
      date: "2026-10-12",
      transactionId: "mercado",
      name: "Mercado",
      type: "expense",
      amount: 150.5,
      categoryName: "Mercado",
      categoryIcon: "shopping-cart",
      paymentMethod: "pix",
      cardName: null,
      isSettled: true,
      dueDate: null,
    },
  ]);
  assert.deepEqual(eventsOn(october, "2026-09-30"), []);
});

test("month counts only the administrator's share of each row", () => {
  assert.deepEqual(
    eventsOn(october, "2026-10-05").map((event) => [eventLabel(event), event.amount]),
    [
      ["Jantar", 80],
      ["Salario", 1000],
    ],
  );
  assert.deepEqual(eventsOn(october, "2026-10-06"), []);
});

test("card installments keep only installment 1, account ones show their number", () => {
  assert.deepEqual(eventsOn(october, "2026-10-10"), [
    {
      id: "installment:notebook-1:2026-10-10",
      kind: "installment",
      date: "2026-10-10",
      transactionId: "notebook-1",
      name: "Notebook",
      type: "expense",
      amount: 400,
      categoryName: null,
      categoryIcon: null,
      paymentMethod: "credit_card",
      cardName: "Nubank",
      isSettled: true,
      dueDate: null,
      currentInstallment: 1,
      installmentCount: 3,
    },
  ]);
  assert.deepEqual(eventsOn(october, "2026-10-14"), []);
  assert.deepEqual(eventsOn(october, "2026-10-08")[0], {
    id: "installment:geladeira:2026-10-08",
    kind: "installment",
    date: "2026-10-08",
    transactionId: "geladeira",
    name: "Geladeira",
    type: "expense",
    amount: 250,
    categoryName: null,
    categoryIcon: null,
    paymentMethod: "pix",
    cardName: null,
    isSettled: true,
    dueDate: null,
    currentInstallment: 3,
    installmentCount: 10,
  });
});

test("boletos land once on their due date, flag overdue bills, never installments", () => {
  assert.deepEqual(eventsOn(october, "2026-10-03"), [
    {
      id: "boleto:luz:2026-10-03",
      kind: "boleto",
      date: "2026-10-03",
      transactionId: "luz",
      name: "Luz",
      type: "expense",
      amount: 90,
      categoryName: null,
      categoryIcon: null,
      paymentMethod: "boleto",
      cardName: null,
      isSettled: false,
      dueDate: "2026-10-03",
      isOverdue: true,
    },
  ]);
  assert.deepEqual(eventsOn(october, "2026-10-25")[0], {
    id: "boleto:carro:2026-10-25",
    kind: "boleto",
    date: "2026-10-25",
    transactionId: "carro",
    name: "Carro",
    type: "expense",
    amount: 800,
    categoryName: null,
    categoryIcon: null,
    paymentMethod: "boleto",
    cardName: null,
    isSettled: false,
    dueDate: "2026-10-25",
    isOverdue: false,
  });
  assert.deepEqual(
    october.days.flatMap((day) => day.events).filter((event) => eventLabel(event) === "Internet"),
    [
      {
        id: "boleto:internet:2026-10-20",
        kind: "boleto",
        date: "2026-10-20",
        transactionId: "internet",
        name: "Internet",
        type: "expense",
        amount: 120,
        categoryName: null,
        categoryIcon: null,
        paymentMethod: "boleto",
        cardName: null,
        isSettled: false,
        dueDate: "2026-10-20",
        isOverdue: false,
      },
    ],
  );
  assert.deepEqual(
    eventsOn(october, "2026-10-22").map((event) => [
      eventLabel(event),
      "transactionId" in event ? event.transactionId : undefined,
    ]),
    [
      ["Aluguel", "aluguel"],
      ["Condominio", null],
    ],
  );
});

test("invoices sit on their due date with state and payment date, zero totals dropped", () => {
  assert.deepEqual(
    eventsOn(october, "2026-10-20").find((event) => event.kind === "invoice"),
    {
      id: "invoice:nubank",
      kind: "invoice",
      date: "2026-10-20",
      cardId: "nubank",
      cardName: "Nubank",
      cardLogo: "nubank.png",
      cardBrand: "mastercard",
      amount: 1200,
      state: "pending",
      paidAt: null,
    },
  );
  assert.deepEqual(
    eventsOn(october, "2026-10-25").find((event) => event.kind === "invoice"),
    {
      id: "invoice:inter",
      kind: "invoice",
      date: "2026-10-25",
      cardId: "inter",
      cardName: "Inter",
      cardLogo: null,
      cardBrand: "visa",
      amount: 800,
      state: "paid",
      paidAt: "2026-10-12",
    },
  );
  assert.deepEqual(
    eventsOn(october, "2026-10-08").find((event) => event.kind === "invoice"),
    {
      id: "invoice:itau",
      kind: "invoice",
      date: "2026-10-08",
      cardId: "itau",
      cardName: "Itau",
      cardLogo: "itau.png",
      cardBrand: "visa",
      amount: 300,
      state: "overdue",
      paidAt: null,
    },
  );
  assert.deepEqual(eventsOn(october, "2026-10-28"), []);
});

test("day events sort by kind then name, totals sum own shares without invoices", () => {
  assert.deepEqual(eventsOn(october, "2026-10-20").map(eventLabel), [
    "Celular",
    "Padaria",
    "Academia",
    "Internet",
    "Nubank",
  ]);
  assert.deepEqual(dayOf(october, "2026-10-20")?.totals, { income: 0, expense: 322.5 });
  assert.deepEqual(eventsOn(october, "2026-10-05").map(eventLabel), ["Jantar", "Salario"]);
  assert.deepEqual(dayOf(october, "2026-10-05")?.totals, { income: 1000, expense: 80 });
  assert.deepEqual(dayOf(october, "2026-10-25")?.totals, { income: 0, expense: 800 });
});
