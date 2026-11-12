import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseC6InvoiceCsv, parseC6StatementCsv } from "./import-c6";
import {
  type ClosureLine,
  checkInvoiceClosure,
  checkStatementClosure,
  invoiceNetCents,
  parseAmountInputToCents,
  statementFinalBalance,
} from "./reconciliations-closure";
import { type ImportedStatement, type ImportedTransaction } from "./transactions";

const statementFixture = readFileSync(
  new URL("./__fixtures__/c6-extrato.csv", import.meta.url),
  "utf8",
);
const invoiceFixture = readFileSync(new URL("./__fixtures__/c6-fatura.csv", import.meta.url), "utf8");

function signedCentsOf(transaction: ImportedTransaction) {
  const cents = Math.round(transaction.amount * 100);
  return transaction.type === "income" ? cents : -cents;
}

function toStatementLines(statement: ImportedStatement): ClosureLine[] {
  return statement.transactions.map((transaction) => ({
    accountingDate: transaction.postedDate ?? transaction.purchaseDate,
    signedCents: signedCentsOf(transaction),
    dayBalanceCents:
      transaction.dayBalance === null ? null : Math.round(transaction.dayBalance * 100),
  }));
}

function toInvoiceLines(statement: ImportedStatement) {
  return statement.transactions.map((transaction) => ({
    signedCents: signedCentsOf(transaction),
    lineKind: transaction.lineKind,
  }));
}

test("C6 statement fixture closes day by day, leaving only the first day unverified", () => {
  const closure = checkStatementClosure(toStatementLines(parseC6StatementCsv(statementFixture)));

  assert.equal(closure.closes, true);
  assert.deepEqual(closure.divergences, []);
  assert.equal(closure.days.length, 34);
  assert.deepEqual(closure.unverifiedDays, ["2026-07-06"]);
  assert.equal(closure.days[0]?.day, "2026-07-07");
  assert.deepEqual(closure.days.find((day) => day.day === "2026-08-31"), {
    day: "2026-08-31",
    balanceCents: -36273,
    previousBalanceCents: 9827,
    movementCents: -46100,
    sumCents: -46100,
    differenceCents: 0,
    closes: true,
  });
});

test("a line made 1000 cents more negative surfaces as one divergence on its day", () => {
  const lines = toStatementLines(parseC6StatementCsv(statementFixture));
  const tamperedIndex = lines.findIndex((line) => line.accountingDate === "2026-07-07");
  const tampered = lines.map((line, index) =>
    index === tamperedIndex ? { ...line, signedCents: line.signedCents - 1000 } : line,
  );

  const closure = checkStatementClosure(tampered);

  assert.equal(closure.closes, false);
  assert.deepEqual(closure.divergences, [
    {
      day: "2026-07-07",
      balanceCents: 68711,
      previousBalanceCents: 100711,
      movementCents: -32000,
      sumCents: -33000,
      differenceCents: 1000,
      closes: false,
    },
  ]);
});

test("days without a balance or without a previous balance are unverified, never divergent", () => {
  const withNullBalance = checkStatementClosure([
    { accountingDate: "2026-07-06", signedCents: -1000, dayBalanceCents: 10000 },
    { accountingDate: "2026-07-07", signedCents: -1000, dayBalanceCents: null },
  ]);
  assert.deepEqual(withNullBalance.unverifiedDays, ["2026-07-06", "2026-07-07"]);
  assert.deepEqual(withNullBalance.days, []);
  assert.equal(withNullBalance.closes, true);

  const singleDay = checkStatementClosure([
    { accountingDate: "2026-07-06", signedCents: -1000, dayBalanceCents: 10000 },
  ]);
  assert.deepEqual(singleDay.unverifiedDays, ["2026-07-06"]);
  assert.deepEqual(singleDay.days, []);
  assert.equal(singleDay.closes, true);
});

test("statement final balance is the first balance of the last accounting day, or null", () => {
  const sameDayBalances = statementFinalBalance([
    { accountingDate: "2026-11-10", signedCents: 0, dayBalanceCents: 100000 },
    { accountingDate: "2026-11-11", signedCents: 0, dayBalanceCents: 84344 },
    { accountingDate: "2026-11-11", signedCents: 0, dayBalanceCents: 84344 },
  ]);
  assert.deepEqual(sameDayBalances, { date: "2026-11-11", cents: 84344 });

  const lastDayWithoutBalance = statementFinalBalance([
    { accountingDate: "2026-11-10", signedCents: 0, dayBalanceCents: 100000 },
    { accountingDate: "2026-11-11", signedCents: 0, dayBalanceCents: null },
  ]);
  assert.equal(lastDayWithoutBalance, null);

  const fixtureFinal = statementFinalBalance(toStatementLines(parseC6StatementCsv(statementFixture)));
  assert.deepEqual(fixtureFinal, { date: "2026-09-01", cents: -58023 });
});

test("invoice closure sums purchases and credits, skips previous-invoice payments", () => {
  const cases = [
    {
      name: "purchase, credit and payment, typed total matches",
      lines: [
        { signedCents: -1303433, lineKind: "purchase" as const },
        { signedCents: 9800, lineKind: "credit" as const },
        { signedCents: 1216410, lineKind: "invoice-payment" as const },
      ],
      expectedCents: 1293633,
      netCents: 1293633,
      closes: true,
      differenceCents: 0,
    },
    {
      name: "typed total 6367 cents above the file",
      lines: [
        { signedCents: -1303433, lineKind: "purchase" as const },
        { signedCents: 9800, lineKind: "credit" as const },
      ],
      expectedCents: 1300000,
      netCents: 1293633,
      closes: false,
      differenceCents: 6367,
    },
    {
      name: "typed total far from the file",
      lines: [
        { signedCents: -1303433, lineKind: "purchase" as const },
        { signedCents: 9800, lineKind: "credit" as const },
      ],
      expectedCents: 77223,
      netCents: 1293633,
      closes: false,
      differenceCents: -1216410,
    },
    {
      name: "several credits reduce the purchases",
      lines: [
        { signedCents: -1948472, lineKind: "purchase" as const },
        { signedCents: 9800, lineKind: "credit" as const },
        { signedCents: 522262, lineKind: "credit" as const },
        { signedCents: 200000, lineKind: "credit" as const },
        { signedCents: 1216410, lineKind: "invoice-payment" as const },
      ],
      expectedCents: 1216410,
      netCents: 1216410,
      closes: true,
      differenceCents: 0,
    },
    {
      name: "only a previous-invoice payment nets to zero",
      lines: [{ signedCents: 1216410, lineKind: "invoice-payment" as const }],
      expectedCents: 0,
      netCents: 0,
      closes: true,
      differenceCents: 0,
    },
  ];

  for (const { name, lines, expectedCents, netCents, closes, differenceCents } of cases) {
    assert.equal(invoiceNetCents(lines), netCents, name);
    assert.deepEqual(checkInvoiceClosure(invoiceNetCents(lines), expectedCents), {
      closes,
      netCents,
      expectedCents,
      differenceCents,
    });
  }
});

test("C6 invoice fixture nets to 2336550 cents and closes against that total", () => {
  const lines = toInvoiceLines(parseC6InvoiceCsv(invoiceFixture));

  assert.equal(invoiceNetCents(lines), 2336550);
  assert.deepEqual(checkInvoiceClosure(invoiceNetCents(lines), 2336550), {
    closes: true,
    netCents: 2336550,
    expectedCents: 2336550,
    differenceCents: 0,
  });
});

test("amount input accepts pt-BR and dot decimals and rejects malformed text", () => {
  const cases: Array<[string, number | null]> = [
    ["12.936,33", 1293633],
    ["12936,33", 1293633],
    ["12936.33", 1293633],
    ["R$ 25,90", 2590],
    ["0,00", 0],
    ["", null],
    ["abc", null],
    ["1.2.3", null],
  ];

  for (const [text, cents] of cases) {
    assert.equal(parseAmountInputToCents(text), cents, text);
  }
});
