import assert from "node:assert/strict";
import { test } from "node:test";
import { describeInvoicePaymentAnnouncement, sumInvoiceCredits } from "./invoices";

const announcementCases = [
  {
    name: "nothing paid yet: the whole open balance is the amount to record",
    input: {
      amount: 12164.1,
      creditAmount: 0,
      paidAmount: 0,
      remainingAmount: 12164.1,
      recordAmount: 12164.1,
    },
    expected: {
      invoiceAmount: 12164.1,
      coveredAmount: 0,
      recordAmount: 12164.1,
      remainingAfterAmount: 0,
      nothingToRecord: false,
    },
  },
  {
    name: "full payment of the remaining balance leaves nothing after the record",
    input: {
      amount: 13813.54,
      creditAmount: 5250,
      paidAmount: 2070.62,
      remainingAmount: 11742.92,
      recordAmount: 11742.92,
    },
    expected: {
      invoiceAmount: 19063.54,
      coveredAmount: 7320.62,
      recordAmount: 11742.92,
      remainingAfterAmount: 0,
      nothingToRecord: false,
    },
  },
  {
    name: "partial record leaves the difference to pay",
    input: {
      amount: 13813.54,
      creditAmount: 5250,
      paidAmount: 2070.62,
      remainingAmount: 11742.92,
      recordAmount: 1000,
    },
    expected: {
      invoiceAmount: 19063.54,
      coveredAmount: 7320.62,
      recordAmount: 1000,
      remainingAfterAmount: 10742.92,
      nothingToRecord: false,
    },
  },
  {
    name: "credits and payments already cover the invoice: nothing to record",
    input: {
      amount: 13813.54,
      creditAmount: 5250,
      paidAmount: 13813.54,
      remainingAmount: 0,
      recordAmount: 0,
    },
    expected: {
      invoiceAmount: 19063.54,
      coveredAmount: 19063.54,
      recordAmount: 0,
      remainingAfterAmount: 0,
      nothingToRecord: true,
    },
  },
];

for (const { name, input, expected } of announcementCases) {
  test(`describeInvoicePaymentAnnouncement: ${name}`, () => {
    assert.deepEqual(describeInvoicePaymentAnnouncement(input), expected);
  });
}

test("sumInvoiceCredits adds only invoiceCredit movements, in cents", () => {
  const total = sumInvoiceCredits([
    { origin: "invoiceCredit", amount: 10.1 },
    { origin: "invoiceCredit", amount: 0.2 },
    { origin: "invoicePayment", amount: 99 },
    { origin: null, amount: 5 },
  ]);

  assert.equal(total, 10.3);
});
