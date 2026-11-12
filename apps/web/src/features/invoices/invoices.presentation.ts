import {
  describeInvoicePaymentAnnouncement,
  type InvoicePersonPayment,
} from "@openmonetis/domain/invoices";
import { fromCents, toCents } from "@openmonetis/domain/money";
import {
  dateOnlyToSafeInstant,
  differenceInCalendarDaysFromTodayInBrazil,
  formatDateInBrazil,
} from "@openmonetis/shared/date-time";
import type { DashboardInvoice } from "@openmonetis/validators/invoices";
import { formatRecordedPaymentDate } from "../../lib/payment-presentation";
import { formatCurrency, parseCurrencyInput } from "../../lib/money-presentation";

export type InvoicePaymentMode = "invoice" | "person" | "manual";

export function invoiceDueLabel(value: string) {
  const days = differenceInCalendarDaysFromTodayInBrazil(value);
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days > 1) return `Vence em ${days} dias`;
  if (days === -1) return "Venceu ontem";
  return `Venceu há ${Math.abs(days)} dias`;
}

export function invoicePaidLabel(value: string) {
  return formatRecordedPaymentDate(value);
}

export function formatInvoicePaymentOption(amount: number, paidAt: string) {
  const formattedAmount = amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const formattedDate = formatDateInBrazil(dateOnlyToSafeInstant(paidAt), {});

  return `${formattedAmount} · ${formattedDate}`;
}

export function buildInvoicePaymentAllocations(
  invoice: DashboardInvoice,
  mode: InvoicePaymentMode,
  personId: string,
  amount: string,
): InvoicePersonPayment[] {
  if (mode === "invoice") {
    return invoice.people
      .filter((person) => person.remainingAmount > 0)
      .map((person) => ({ personId: person.personId, amount: person.remainingAmount }));
  }
  const person = invoice.people.find((item) => item.personId === personId);
  if (!person) return [];
  return [
    {
      personId: person.personId,
      amount: mode === "person" ? person.remainingAmount : parseCurrencyInput(amount),
    },
  ];
}

export function getInvoicePaymentAnnouncement(
  invoice: DashboardInvoice,
  mode: InvoicePaymentMode,
  allocations: readonly InvoicePersonPayment[],
) {
  const announcement = describeInvoicePaymentAnnouncement({
    amount: invoice.amount,
    creditAmount: invoice.creditAmount,
    paidAmount: invoice.paidAmount,
    remainingAmount: invoice.remainingAmount,
    recordAmount: fromCents(
      allocations.reduce((total, allocation) => total + toCents(allocation.amount), 0),
    ),
  });
  if (announcement.nothingToRecord) {
    return "Os pagamentos e créditos do período já cobrem esta fatura. Nada será lançado.";
  }
  const sentence = `Fatura de ${formatCurrency(announcement.invoiceAmount)}, ${formatCurrency(announcement.coveredAmount)} já abatidos. Confirmar vai registrar ${formatCurrency(announcement.recordAmount)}.`;
  if (mode === "manual") {
    return `${sentence} Restará ${formatCurrency(announcement.remainingAfterAmount)}.`;
  }
  if (mode === "person") {
    const usesAccount = allocations.some((allocation) =>
      invoice.people.some(
        (person) => person.personId === allocation.personId && person.personRole === "admin",
      ),
    );
    return `${sentence} ${
      usesAccount
        ? "A conta escolhida será debitada."
        : "O pagamento da pessoa externa não movimenta suas contas."
    }`;
  }
  return sentence;
}
