import {
  parseBrazilianDate,
  parseDecimalToCents,
  splitCsvFields,
  splitCsvLines,
  stripByteOrderMark,
} from "./import-csv";
import type { ImportedStatement, ImportedTransaction } from "./transactions";

export type C6InvoiceLineKind = "purchase" | "credit" | "invoice-payment";

const sourceName = "C6 Bank";
const statementHeaderPrefix = "Data Lançamento,Data Contábil";
const accountPattern = /Agência:\s*(\S+)\s*\/\s*Conta:\s*(\S+)/;
const statementPeriodPattern =
  /Extrato de\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/;
const installmentPattern = /^(\d+)\/(\d+)$/;
const invoicePaymentMarker = "pag fatura";
const maxNameLength = 160;
const visibleAccountDigits = 4;
const centsPerUnit = 100;

export function readC6StatementAccountIdentification(content: string): string | null {
  const match = content.match(accountPattern);
  return match ? `${match[1]}/${match[2]}` : null;
}

function maskAccountNumber(value: string) {
  const visible = value.slice(-visibleAccountDigits);
  return visible.length === value.length ? visible : `•••• ${visible}`;
}

function readStatementPeriod(content: string) {
  const match = content.match(statementPeriodPattern);
  if (!match) return null;
  const from = parseBrazilianDate(match[1]);
  const to = parseBrazilianDate(match[2]);
  return from && to ? { from, to } : null;
}

function buildStatementName(title: string, description: string) {
  return [title.trim(), description.trim()]
    .filter((part, index, parts) => part !== "" && parts.indexOf(part) === index)
    .join(" - ")
    .slice(0, maxNameLength);
}

function readStatementAmount(
  income: string,
  expense: string,
): { type: "income" | "expense"; cents: number } | null {
  const incomeCents = income.trim() === "" ? 0 : parseDecimalToCents(income.trim());
  const expenseCents = expense.trim() === "" ? 0 : parseDecimalToCents(expense.trim());
  if (incomeCents === null || expenseCents === null) return null;
  if (incomeCents > 0) return { type: "income", cents: incomeCents };
  if (expenseCents !== 0) return { type: "expense", cents: Math.abs(expenseCents) };
  return null;
}

export function parseC6StatementCsv(content: string): ImportedStatement {
  const text = stripByteOrderMark(content);
  const lines = splitCsvLines(text);
  const headerIndex = lines.findIndex((line) => line.startsWith(statementHeaderPrefix));
  if (headerIndex < 0) throw new Error("C6 statement header not found");

  const transactions: ImportedTransaction[] = [];
  const invalidLines: ImportedStatement["invalidLines"] = [];

  for (const [index, line] of lines.entries()) {
    if (index <= headerIndex || line.trim() === "") continue;
    const lineNumber = index + 1;
    const [
      launchDate = "",
      postedDate = "",
      title = "",
      description = "",
      income = "",
      expense = "",
      balance = "",
    ] = splitCsvFields(line, ",");

    const purchaseDate = parseBrazilianDate(launchDate.trim());
    if (!purchaseDate) {
      invalidLines.push({ lineNumber, reason: "invalid_date" });
      continue;
    }
    const amount = readStatementAmount(income, expense);
    if (!amount) {
      invalidLines.push({ lineNumber, reason: "invalid_amount" });
      continue;
    }
    const balanceCents = parseDecimalToCents(balance.trim());

    transactions.push({
      externalId: null,
      purchaseDate,
      postedDate: parseBrazilianDate(postedDate.trim()),
      amount: amount.cents / centsPerUnit,
      name: buildStatementName(title, description),
      type: amount.type,
      categoryName: null,
      dayBalance: balanceCents === null ? null : balanceCents / centsPerUnit,
      installment: null,
      cardLastDigits: null,
      holderName: null,
      fx: null,
      lineKind: null,
    });
  }

  if (transactions.length === 0) {
    throw new Error("No valid transactions found in C6 statement");
  }

  const accountIdentification = readC6StatementAccountIdentification(text);
  return {
    sourceName,
    sourceReference: `account:${sourceName}:${accountIdentification ?? "unknown"}`,
    accountNumber: accountIdentification ? maskAccountNumber(accountIdentification) : null,
    period: readStatementPeriod(text),
    isCreditCard: false,
    profileId: "c6-statement",
    accountIdentification,
    transactions,
    invalidLines,
  };
}

export function classifyC6InvoiceLine(input: {
  description: string;
  signedCents: number;
}): C6InvoiceLineKind {
  if (input.signedCents >= 0) return "purchase";
  return input.description.trim().toLowerCase().includes(invoicePaymentMarker)
    ? "invoice-payment"
    : "credit";
}

function parseInstallment(raw: string) {
  const match = raw.match(installmentPattern);
  return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
}

function nullIfBlank(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseC6InvoiceCsv(content: string): ImportedStatement {
  const lines = splitCsvLines(stripByteOrderMark(content));
  const transactions: ImportedTransaction[] = [];
  const invalidLines: ImportedStatement["invalidLines"] = [];

  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === "") continue;
    const lineNumber = index + 1;
    const [
      purchaseDateText = "",
      holder = "",
      cardDigits = "",
      category = "",
      description = "",
      installment = "",
      usdText = "",
      _exchangeRate = "",
      brlText = "",
    ] = splitCsvFields(line, ";");

    const purchaseDate = parseBrazilianDate(purchaseDateText.trim());
    if (!purchaseDate) {
      invalidLines.push({ lineNumber, reason: "invalid_date" });
      continue;
    }
    const signedCents = parseDecimalToCents(brlText.trim());
    if (signedCents === null) {
      invalidLines.push({ lineNumber, reason: "invalid_amount" });
      continue;
    }
    const usdCents = parseDecimalToCents(usdText.trim());

    transactions.push({
      externalId: null,
      purchaseDate,
      postedDate: null,
      amount: Math.abs(signedCents) / centsPerUnit,
      name: description.trim(),
      type: signedCents < 0 ? "income" : "expense",
      categoryName: nullIfBlank(category),
      dayBalance: null,
      installment: parseInstallment(installment.trim()),
      cardLastDigits: nullIfBlank(cardDigits),
      holderName: nullIfBlank(holder),
      fx:
        usdCents !== null && usdCents > 0
          ? { currency: "USD", amount: usdCents / centsPerUnit }
          : null,
      lineKind: classifyC6InvoiceLine({ description, signedCents }),
    });
  }

  return {
    sourceName,
    sourceReference: `card:${sourceName}:unknown`,
    accountNumber: null,
    period: null,
    isCreditCard: true,
    profileId: "c6-invoice",
    accountIdentification: null,
    transactions,
    invalidLines,
  };
}
