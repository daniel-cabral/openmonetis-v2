import { fromCents, toCents } from "./money";
import type { TransactionOrigin } from "./transactions";

export type InvoicePersonMovement = {
  personId: string;
  personName: string;
  personAvatarUrl: string | null;
  personRole: "admin" | "external";
  amount: number;
};

export type InvoicePersonPayment = { personId: string; amount: number };

export type InvoicePersonBalance = {
  personId: string;
  personName: string;
  personAvatarUrl: string | null;
  personRole: "admin" | "external";
  amount: number;
  paidAmount: number;
  remainingAmount: number;
};

export type InvoiceAdjustmentDraft = {
  amount: string;
  type: "expense";
};

export function calculateInvoicePersonBalances(
  movements: InvoicePersonMovement[],
  payments: InvoicePersonPayment[],
): InvoicePersonBalance[] {
  const people = new Map<string, InvoicePersonBalance>();
  for (const movement of movements) {
    const current = people.get(movement.personId) ?? {
      personId: movement.personId,
      personName: movement.personName,
      personAvatarUrl: movement.personAvatarUrl,
      personRole: movement.personRole,
      amount: 0,
      paidAmount: 0,
      remainingAmount: 0,
    };
    current.amount -= toCents(movement.amount);
    people.set(movement.personId, current);
  }
  const paidByPerson = new Map<string, number>();
  for (const payment of payments) {
    paidByPerson.set(
      payment.personId,
      (paidByPerson.get(payment.personId) ?? 0) + toCents(payment.amount),
    );
  }
  return [...people.values()]
    .map((person) => {
      const amount = Math.max(0, person.amount);
      const paidAmount = Math.min(amount, paidByPerson.get(person.personId) ?? 0);
      return {
        ...person,
        amount: fromCents(amount),
        paidAmount: fromCents(paidAmount),
        remainingAmount: fromCents(amount - paidAmount),
      };
    })
    .filter((person) => person.amount > 0)
    .sort(
      (a, b) => b.remainingAmount - a.remainingAmount || a.personName.localeCompare(b.personName),
    );
}

export function validateInvoicePaymentAllocations(
  balances: InvoicePersonBalance[],
  allocations: InvoicePersonPayment[],
) {
  const remainingByPerson = new Map(
    balances.map((item) => [item.personId, toCents(item.remainingAmount)]),
  );
  const allocated = new Set<string>();
  let totalCents = 0;
  for (const allocation of allocations) {
    if (allocated.has(allocation.personId)) throw new RangeError("duplicate_person");
    allocated.add(allocation.personId);
    const remainingCents = remainingByPerson.get(allocation.personId);
    if (remainingCents === undefined) throw new RangeError("person_without_balance");
    const amount = toCents(allocation.amount);
    if (amount <= 0 || amount > remainingCents) {
      throw new RangeError("amount_exceeds_person_balance");
    }
    totalCents += amount;
  }
  if (!totalCents) throw new RangeError("payment_amount_required");
  return { totalAmount: fromCents(totalCents) };
}

export function sumInvoiceCredits(
  movements: readonly { origin?: TransactionOrigin | null; amount: number }[],
) {
  const creditCents = movements.reduce(
    (total, movement) =>
      movement.origin === "invoiceCredit" ? total + toCents(movement.amount) : total,
    0,
  );
  return fromCents(creditCents);
}

export function describeInvoicePaymentAnnouncement(input: {
  amount: number;
  creditAmount: number;
  paidAmount: number;
  remainingAmount: number;
  recordAmount: number;
}) {
  const remainingCents = toCents(input.remainingAmount);
  const recordCents = toCents(input.recordAmount);
  return {
    invoiceAmount: fromCents(toCents(input.amount) + toCents(input.creditAmount)),
    coveredAmount: fromCents(toCents(input.creditAmount) + toCents(input.paidAmount)),
    recordAmount: input.recordAmount,
    remainingAfterAmount: fromCents(Math.max(0, remainingCents - recordCents)),
    nothingToRecord: remainingCents === 0,
  };
}

export function createInvoiceAdjustmentDraft(
  currentAmount: number,
  desiredAmount: number,
): InvoiceAdjustmentDraft | null {
  const adjustmentCents = toCents(desiredAmount) - toCents(currentAmount);
  if (adjustmentCents === 0) return null;

  return {
    amount: fromCents(-adjustmentCents).toFixed(2),
    type: "expense",
  };
}
