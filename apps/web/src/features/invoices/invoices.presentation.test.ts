import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardInvoice } from "@openmonetis/validators/invoices";
import {
  buildInvoicePaymentAllocations,
  getInvoicePaymentAnnouncement,
  type InvoicePaymentMode,
} from "./invoices.presentation";

const admin = "10000000-0000-4000-8000-000000000001";
const ana = "10000000-0000-4000-8000-000000000002";

const invoice: DashboardInvoice = {
  cardId: "20000000-0000-4000-8000-000000000001",
  accountId: "30000000-0000-4000-8000-000000000001",
  cardName: "Cartão",
  logo: null,
  period: "2026-10",
  amount: 13813.54,
  creditAmount: 5250,
  paidAmount: 2070.62,
  remainingAmount: 11742.92,
  status: "open",
  closingDate: "2026-10-05",
  dueDate: "2026-10-15",
  paymentCount: 1,
  latestPayment: null,
  payments: [],
  people: [
    {
      personId: admin,
      personName: "Daniel",
      personAvatarUrl: null,
      personRole: "admin",
      amount: 9070.62,
      paidAmount: 2070.62,
      remainingAmount: 7000,
    },
    {
      personId: ana,
      personName: "Ana",
      personAvatarUrl: null,
      personRole: "external",
      amount: 4742.92,
      paidAmount: 0,
      remainingAmount: 4742.92,
    },
  ],
};

const cases: {
  name: string;
  mode: InvoicePaymentMode;
  personId: string;
  amount: string;
  allocations: { personId: string; amount: number }[];
  sentence: string;
}[] = [
  {
    name: "invoice: every open person pays its remaining",
    mode: "invoice",
    personId: "",
    amount: "",
    allocations: [
      { personId: admin, amount: 7000 },
      { personId: ana, amount: 4742.92 },
    ],
    sentence:
      "Fatura de R$ 19.063,54, R$ 7.320,62 já abatidos. Confirmar vai registrar R$ 11.742,92.",
  },
  {
    name: "person: the admin's part debits the chosen account",
    mode: "person",
    personId: admin,
    amount: "",
    allocations: [{ personId: admin, amount: 7000 }],
    sentence:
      "Fatura de R$ 19.063,54, R$ 7.320,62 já abatidos. Confirmar vai registrar R$ 7.000,00. A conta escolhida será debitada.",
  },
  {
    name: "person: an external person's part moves no account",
    mode: "person",
    personId: ana,
    amount: "",
    allocations: [{ personId: ana, amount: 4742.92 }],
    sentence:
      "Fatura de R$ 19.063,54, R$ 7.320,62 já abatidos. Confirmar vai registrar R$ 4.742,92. O pagamento da pessoa externa não movimenta suas contas.",
  },
  {
    name: "manual: a partial amount states what remains",
    mode: "manual",
    personId: ana,
    amount: "1000,00",
    allocations: [{ personId: ana, amount: 1000 }],
    sentence:
      "Fatura de R$ 19.063,54, R$ 7.320,62 já abatidos. Confirmar vai registrar R$ 1.000,00. Restará R$ 10.742,92.",
  },
];

test("the announced amount matches the allocations sent for every payment mode", () => {
  for (const item of cases) {
    const allocations = buildInvoicePaymentAllocations(
      invoice,
      item.mode,
      item.personId,
      item.amount,
    );
    assert.deepEqual(allocations, item.allocations, item.name);
    assert.equal(
      getInvoicePaymentAnnouncement(invoice, item.mode, allocations),
      item.sentence,
      item.name,
    );
  }
});

test("a fully covered invoice announces that nothing will be recorded", () => {
  const covered: DashboardInvoice = {
    ...invoice,
    remainingAmount: 0,
    people: invoice.people.map((person) => ({ ...person, remainingAmount: 0 })),
  };

  assert.equal(
    getInvoicePaymentAnnouncement(covered, "invoice", []),
    "Os pagamentos e créditos do período já cobrem esta fatura. Nada será lançado.",
  );
});
