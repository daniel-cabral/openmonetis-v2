import type { ImportedTransaction } from "./transactions";

const ROW_IDENTITY_VERSION = "openmonetis-import-row-v1";

export type ImportRowIdentityInput = {
  kind: "statement" | "invoice";
  source: string;
  accountIdentification: string | null;
  destination: { type: "account" | "card"; id: string };
  rows: ImportedTransaction[];
};

function normalizeIdentityText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Formats the signed amount from integer cents, so the payload never depends
// on float formatting. Expenses are negative, incomes positive.
function formatSignedAmount(row: ImportedTransaction): string {
  const cents = Math.round(row.amount * 100);
  const signedCents = row.type === "expense" ? -cents : cents;
  const absoluteCents = Math.abs(signedCents);
  const sign = signedCents < 0 ? "-" : "";
  const integerPart = Math.trunc(absoluteCents / 100);
  const fractionPart = String(absoluteCents % 100).padStart(2, "0");

  return `${sign}${integerPart}.${fractionPart}`;
}

function formatInstallment(row: ImportedTransaction): string {
  return row.installment
    ? `${row.installment.current}/${row.installment.total}`
    : "";
}

function buildIdentityFields(
  input: ImportRowIdentityInput,
  row: ImportedTransaction,
): string[] {
  const common = [
    ROW_IDENTITY_VERSION,
    input.kind,
    normalizeIdentityText(input.source),
    input.destination.type,
    input.destination.id,
  ];

  if (input.kind === "statement") {
    return [
      ...common,
      normalizeIdentityText(input.accountIdentification ?? ""),
      row.purchaseDate,
      row.postedDate ?? "",
      normalizeIdentityText(row.name),
      formatSignedAmount(row),
    ];
  }

  return [
    ...common,
    normalizeIdentityText(row.cardLastDigits ?? ""),
    row.purchaseDate,
    normalizeIdentityText(row.name),
    formatInstallment(row),
    formatSignedAmount(row),
  ];
}

// Lines without an issuer identifier are identified by their content. Lines
// with identical identity fields are separated by a positional occurrence in
// file order, so the same file always yields the same payloads.
export function buildImportRowIdentityPayloads(
  input: ImportRowIdentityInput,
): string[] {
  const occurrenceCounts = new Map<string, number>();

  return input.rows.map((row) => {
    const fields = buildIdentityFields(input, row);
    const groupKey = JSON.stringify(fields);
    const occurrence = occurrenceCounts.get(groupKey) ?? 0;
    occurrenceCounts.set(groupKey, occurrence + 1);

    return JSON.stringify([...fields, occurrence]);
  });
}
