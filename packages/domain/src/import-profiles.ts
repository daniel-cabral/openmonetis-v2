import {
  parseC6InvoiceCsv,
  parseC6StatementCsv,
  readC6StatementAccountIdentification,
} from "./import-c6";
import type { ImportedStatement } from "./transactions";

export type ImportProfileId = "c6-statement" | "c6-invoice";
export type ImportProfileKind = "statement" | "invoice";
export type ImportProfileSummary = {
  id: ImportProfileId;
  label: string;
  kind: ImportProfileKind;
  destinationType: "account" | "card";
};
export type ImportProfile = ImportProfileSummary & {
  headerSignature: readonly string[];
  readAccountIdentification: ((content: string) => string | null) | null;
  parse: (content: string) => ImportedStatement;
};

export const importProfiles: readonly ImportProfile[] = [
  {
    id: "c6-statement",
    label: "C6 Bank - Extrato de conta corrente",
    kind: "statement",
    destinationType: "account",
    headerSignature: ["Data Lançamento", "Data Contábil"],
    readAccountIdentification: readC6StatementAccountIdentification,
    parse: parseC6StatementCsv,
  },
  {
    id: "c6-invoice",
    label: "C6 Bank - Fatura de cartão",
    kind: "invoice",
    destinationType: "card",
    headerSignature: ["Data de Compra", "Parcela"],
    readAccountIdentification: null,
    parse: parseC6InvoiceCsv,
  },
];

export function findImportProfile(id: string): ImportProfile | null {
  return importProfiles.find((profile) => profile.id === id) ?? null;
}

function toSummary(profile: ImportProfile): ImportProfileSummary {
  return {
    id: profile.id,
    label: profile.label,
    kind: profile.kind,
    destinationType: profile.destinationType,
  };
}

// A profile claims the file when one of its lines contains every signature fragment.
function claimsContent(profile: ImportProfile, content: string) {
  return content
    .split(/\r?\n/)
    .some((line) => profile.headerSignature.every((fragment) => line.includes(fragment)));
}

// Detection is a suggestion, never a decision: it never throws and always lists every profile.
export function detectImportProfile(content: string): {
  detectedProfileId: ImportProfileId | null;
  profiles: ImportProfileSummary[];
  accountIdentification: string | null;
} {
  const detected = importProfiles.find((profile) => claimsContent(profile, content)) ?? null;
  return {
    detectedProfileId: detected?.id ?? null,
    profiles: importProfiles.map(toSummary),
    accountIdentification: detected?.readAccountIdentification?.(content) ?? null,
  };
}
