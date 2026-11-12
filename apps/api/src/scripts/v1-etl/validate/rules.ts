// Validator rule catalog (contracts/output-formats.md "Rule catalog"). Pure: every rule reads the
// extracted user only. Rules owned by a conversion reuse its findings, so the validator and the
// load agree on every resolution key.
import {
  cards,
  categories,
  financialAccounts,
  importCategoryMappings,
  importNameMappings,
  people,
  transactions,
} from "@openmonetis/db/schema";
import { getImportedDescriptionKey, getPeriodFromDate } from "@openmonetis/domain/transactions";
import { getTableConfig, type PgTable, PgVarchar } from "drizzle-orm/pg-core";
import { CONDITION_MAP, PAYMENT_METHOD_MAP, toTypedAmount } from "../conversions/amounts";
import { convertCatalog } from "../conversions/catalog";
import { convertInstallments } from "../conversions/installments";
import { convertInvoices, parseMarker } from "../conversions/markers";
import { convertRecurrence } from "../conversions/recurrence";
import { convertSideData } from "../conversions/side-data";
import { v2Id } from "../ids";
import type { ExtractedUser, Finding, Severity, V1Passkey, V1Transaction } from "../types";

type RuleSpec = { id: string; severity: Severity; resolutions: string[] };

export const RULES: RuleSpec[] = [
  { id: "schema.unmapped", severity: "blocker", resolutions: [] },
  // Resolutions list only what the load applies; a blocker the load cannot resolve offers none.
  { id: "user.email-case-duplicate", severity: "blocker", resolutions: [] },
  { id: "passkey.duplicate-credential", severity: "blocker", resolutions: [] },
  { id: "credential.incompatible-hash", severity: "fixable", resolutions: [] },
  { id: "people.admin-cardinality", severity: "blocker", resolutions: ["admin:<v1 payer id>"] },
  { id: "people.blank-name", severity: "blocker", resolutions: ["rename:<text>"] },
  { id: "amount.zero", severity: "blocker", resolutions: ["drop"] },
  { id: "amount.zero-recurrence", severity: "fixable", resolutions: [] },
  { id: "amount.precision", severity: "blocker", resolutions: [] },
  { id: "reference.dangling", severity: "blocker", resolutions: ["drop"] },
  { id: "text.too-long", severity: "blocker", resolutions: ["truncate", "drop"] },
  {
    id: "transaction.period-date-mismatch",
    severity: "blocker",
    resolutions: ["use-date", "use-period"],
  },
  { id: "invoice.without-card", severity: "blocker", resolutions: ["drop"] },
  { id: "invoice.paid-without-date", severity: "blocker", resolutions: [] },
  { id: "budget.without-category", severity: "blocker", resolutions: ["drop"] },
  { id: "budget.non-positive-amount", severity: "blocker", resolutions: ["drop"] },
  { id: "note.missing-title", severity: "blocker", resolutions: ["title-from-content", "drop"] },
  { id: "note.blank-content", severity: "blocker", resolutions: ["as-checklist", "drop"] },
  { id: "note.task-description-as-item", severity: "fixable", resolutions: [] },
  { id: "inbox.missing-identity", severity: "blocker", resolutions: ["drop", "null-amount"] },
  { id: "inbox.non-positive-amount", severity: "blocker", resolutions: ["drop", "null-amount"] },
  { id: "card.day-out-of-range", severity: "blocker", resolutions: [] },
  { id: "card.unknown-brand", severity: "fixable", resolutions: [] },
  { id: "account.unknown-type", severity: "fixable", resolutions: [] },
  { id: "category.subcategory-type-mismatch", severity: "blocker", resolutions: [] },
  { id: "category.system-parent", severity: "blocker", resolutions: ["separate-root"] },
  { id: "category.name-collision", severity: "fixable", resolutions: [] },
  { id: "installment.count-out-of-range", severity: "blocker", resolutions: [] },
  { id: "installment.duplicate-number", severity: "blocker", resolutions: [] },
  { id: "installment.inconsistent-members", severity: "blocker", resolutions: [] },
  { id: "installment.gap", severity: "fixable", resolutions: [] },
  { id: "recurrence.duplicate-occurrence", severity: "fixable", resolutions: ["detach", "drop"] },
  { id: "recurrence.not-reproducible", severity: "blocker", resolutions: ["as-singles"] },
  { id: "marker.missing-target", severity: "blocker", resolutions: [] },
  { id: "trip.length", severity: "blocker", resolutions: [] },
  { id: "table.skipped-by-decision", severity: "informational", resolutions: [] },
  { id: "stamp.dropped", severity: "informational", resolutions: [] },
  { id: "mapping.key-not-normalized", severity: "informational", resolutions: [] },
  { id: "passkey.rp-id-mismatch", severity: "informational", resolutions: [] },
];

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

const T = {
  user: "user",
  account: "account",
  passkey: "passkey",
  payers: "pagadores",
  categories: "categorias",
  subcategories: "subcategorias",
  accounts: "contas",
  cards: "cartoes",
  invoices: "faturas",
  transactions: "lancamentos",
  anticipations: "antecipacoes_parcelas",
  trips: "viagens",
  inbox: "pre_lancamentos",
  categoryMappings: "import_category_mappings",
  nameMappings: "import_name_mappings",
} as const;

const SCRYPT_HASH = /^[0-9a-f]{32}:[0-9a-f]{128}$/;
const CREDENTIAL_PROVIDER = "credential";
const SERIES_OWNER_PREFIX = "series";
const DROPPED_STAMPS = ["ofx_import_fingerprint", "import_batch_id"] as const;
const SIDE_DATA_TEXT_TABLES = new Set<string>([T.categoryMappings, T.nameMappings]);

export function finding(
  rule: string,
  table: string,
  v1Id: string,
  v1UserId: string | null,
  reason: string,
  context: Finding["context"] = {},
  resolutions?: string[],
): Finding {
  const spec = RULE_BY_ID.get(rule);
  if (spec === undefined) throw new Error(`v1-etl: rule outside the catalog: ${rule}`);
  return {
    rule,
    severity: spec.severity,
    table,
    v1Id,
    v1UserId,
    reason,
    context,
    resolutions: resolutions ?? spec.resolutions,
    resolutionKey: `${rule}:${table}:${v1Id}`,
  };
}

export function runRules(x: ExtractedUser): Finding[] {
  const all = [
    ...emailCaseDuplicate(x),
    ...incompatibleHash(x),
    ...amountRules(x),
    ...danglingReferences(x),
    ...textTooLong(x),
    ...periodDateMismatch(x),
    ...invoiceWithoutCard(x),
    ...subcategoryTypeMismatch(x),
    ...markerMissingTarget(x),
    ...stampDropped(x),
    ...mappingKeyNotNormalized(x),
    ...passkeyRpIdMismatch(x),
    ...conversionFindings(x),
  ];
  // A row reported by both a rule here and a conversion (same key) is listed once.
  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.resolutionKey)) return false;
    seen.add(item.resolutionKey);
    return true;
  });
}

// Credential ids must be unique across the whole dump, so the validator runs this over every
// user's passkeys at once instead of inside `runRules`.
export function duplicateCredentialFindings(passkeys: V1Passkey[]): Finding[] {
  const byCredential = new Map<string, V1Passkey[]>();
  for (const passkey of passkeys) {
    byCredential.set(passkey.credentialID, [
      ...(byCredential.get(passkey.credentialID) ?? []),
      passkey,
    ]);
  }
  return [...byCredential.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      group.map((passkey) =>
        finding(
          "passkey.duplicate-credential",
          T.passkey,
          passkey.id,
          passkey.userId,
          "passkey credential id shared by more than one passkey",
          { passkeys: group.map((item) => item.id).sort() },
        ),
      ),
    );
}

function emailCaseDuplicate(x: ExtractedUser): Finding[] {
  const email = x.user.email.toLowerCase();
  const others = x.index.users
    .filter((user) => user.id !== x.user.id && user.email.toLowerCase() === email)
    .map((user) => user.id);
  if (others.length === 0) return [];
  return [
    finding(
      "user.email-case-duplicate",
      T.user,
      x.user.id,
      x.user.id,
      "email differs from another user's only by case",
      { users: others },
    ),
  ];
}

function incompatibleHash(x: ExtractedUser): Finding[] {
  return x.accounts
    .filter(
      (account) =>
        account.providerId === CREDENTIAL_PROVIDER &&
        account.password !== null &&
        !SCRYPT_HASH.test(account.password),
    )
    .map((account) =>
      finding(
        "credential.incompatible-hash",
        T.account,
        account.id,
        x.user.id,
        "password hash is not the scrypt shape V2 verifies, user flagged for password reset",
      ),
    );
}

function amountRules(x: ExtractedUser): Finding[] {
  const findings: Finding[] = [];
  for (const row of x.transactions) {
    const typed = toTypedAmount(row.valor);
    if (typed.ok) continue;
    if (typed.reason === "precision") {
      findings.push(
        finding(
          "amount.precision",
          T.transactions,
          row.id,
          x.user.id,
          "amount has more than 2 decimals",
        ),
      );
    } else if (CONDITION_MAP[row.condicao] === "recurring") {
      findings.push(
        finding(
          "amount.zero-recurrence",
          T.transactions,
          row.id,
          x.user.id,
          "zero recurrence occurrence, loaded as skip",
        ),
      );
    } else {
      findings.push(
        finding(
          "amount.zero",
          T.transactions,
          row.id,
          x.user.id,
          "zero amount outside a recurrence",
        ),
      );
    }
  }
  return findings;
}

function danglingReferences(x: ExtractedUser): Finding[] {
  const own = {
    [T.payers]: new Set(x.payers.map((row) => row.id)),
    [T.categories]: new Set(x.categories.map((row) => row.id)),
    [T.subcategories]: new Set(x.subcategories.map((row) => row.id)),
    [T.accounts]: new Set(x.financialAccounts.map((row) => row.id)),
    [T.cards]: new Set(x.cards.map((row) => row.id)),
    [T.transactions]: new Set(x.transactions.map((row) => row.id)),
    [T.anticipations]: new Set(x.anticipations.map((row) => row.id)),
    [T.trips]: new Set(x.trips.map((row) => row.id)),
  };
  const ownSeries = new Set(
    x.transactions.flatMap((row) => (row.series_id ? [row.series_id] : [])),
  );
  const isDangling = (table: keyof typeof own, id: string | null) =>
    id !== null && !own[table].has(id);
  const isForeignSeries = (id: string | null) => {
    if (id === null) return false;
    const owner = x.index.ownerOf.get(`${SERIES_OWNER_PREFIX}:${id}`);
    return owner !== undefined && owner !== x.user.id;
  };
  const report = (table: string, v1Id: string, columns: string[], resolutions: string[]) =>
    finding(
      "reference.dangling",
      table,
      v1Id,
      x.user.id,
      "reference to a missing row or a row of another user",
      { columns },
      resolutions,
    );

  const findings: Finding[] = [];
  for (const row of x.transactions) {
    const columns = [
      isDangling(T.accounts, row.conta_id) && "conta_id",
      isDangling(T.cards, row.cartao_id) && "cartao_id",
      isDangling(T.categories, row.categoria_id) && "categoria_id",
      isDangling(T.subcategories, row.subcategoria_id) && "subcategoria_id",
      isDangling(T.payers, row.pagador_id) && "pagador_id",
      isDangling(T.trips, row.viagem_id) && "viagem_id",
      isDangling(T.anticipations, row.antecipacao_id) && "antecipacao_id",
      isForeignSeries(row.series_id) && "series_id",
    ].filter((column): column is string => column !== false);
    if (columns.length > 0) findings.push(report(T.transactions, row.id, columns, []));
  }
  for (const card of x.cards) {
    if (isDangling(T.accounts, card.conta_id)) {
      findings.push(report(T.cards, card.id, ["conta_id"], []));
    }
  }
  for (const sub of x.subcategories) {
    if (isDangling(T.categories, sub.categoria_id)) {
      findings.push(report(T.subcategories, sub.id, ["categoria_id"], ["drop"]));
    }
  }
  for (const invoice of x.invoices) {
    if (isDangling(T.cards, invoice.cartao_id)) {
      findings.push(report(T.invoices, invoice.id, ["cartao_id"], []));
    }
  }
  for (const anticipation of x.anticipations) {
    const columns = [
      (!ownSeries.has(anticipation.series_id) || isForeignSeries(anticipation.series_id)) &&
        "series_id",
      isDangling(T.transactions, anticipation.lancamento_id) && "lancamento_id",
      anticipation.parcelas_antecipadas.some((id) => isDangling(T.transactions, id)) &&
        "parcelas_antecipadas",
    ].filter((column): column is string => column !== false);
    if (columns.length > 0) findings.push(report(T.anticipations, anticipation.id, columns, []));
  }
  for (const item of x.inboxItems) {
    if (isDangling(T.transactions, item.lancamento_id)) {
      findings.push(report(T.inbox, item.id, ["lancamento_id"], []));
    }
  }
  for (const mapping of x.categoryMappings) {
    const columns = [
      isDangling(T.categories, mapping.category_id) && "category_id",
      isDangling(T.subcategories, mapping.subcategory_id) && "subcategory_id",
    ].filter((column): column is string => column !== false);
    if (columns.length > 0) {
      findings.push(report(T.categoryMappings, mapping.description_key, columns, ["drop"]));
    }
  }
  return findings;
}

// Limit read from the Drizzle schema, so the rule follows the V2 column instead of a copied number.
function varcharLimit(table: PgTable, columnName: string): number {
  const column = getTableConfig(table).columns.find((item) => item.name === columnName);
  if (!(column instanceof PgVarchar) || column.length === undefined) {
    throw new Error(`v1-etl: not a bounded varchar column: ${columnName}`);
  }
  return column.length;
}

function textTooLong(x: ExtractedUser): Finding[] {
  const checks: {
    table: string;
    column: string;
    limit: number;
    rows: { id: string; value: string }[];
  }[] = [
    {
      table: T.transactions,
      column: "nome",
      limit: varcharLimit(transactions, "name"),
      rows: x.transactions.map((row) => ({ id: row.id, value: row.nome })),
    },
    {
      table: T.payers,
      column: "nome",
      limit: varcharLimit(people, "name"),
      rows: x.payers.map((row) => ({ id: row.id, value: row.nome })),
    },
    {
      table: T.categories,
      column: "nome",
      limit: varcharLimit(categories, "name"),
      rows: x.categories.map((row) => ({ id: row.id, value: row.nome })),
    },
    {
      table: T.subcategories,
      column: "nome",
      limit: varcharLimit(categories, "name"),
      rows: x.subcategories.map((row) => ({ id: row.id, value: row.nome })),
    },
    {
      table: T.accounts,
      column: "nome",
      limit: varcharLimit(financialAccounts, "name"),
      rows: x.financialAccounts.map((row) => ({ id: row.id, value: row.nome })),
    },
    {
      table: T.cards,
      column: "nome",
      limit: varcharLimit(cards, "name"),
      rows: x.cards.map((row) => ({ id: row.id, value: row.nome })),
    },
    {
      table: T.categoryMappings,
      column: "description_key",
      limit: varcharLimit(importCategoryMappings, "description_key"),
      rows: x.categoryMappings.map((row) => ({
        id: row.description_key,
        value: row.description_key,
      })),
    },
    {
      table: T.nameMappings,
      column: "description_key",
      limit: varcharLimit(importNameMappings, "description_key"),
      rows: x.nameMappings.map((row) => ({ id: row.description_key, value: row.description_key })),
    },
    {
      table: T.nameMappings,
      column: "name",
      limit: varcharLimit(importNameMappings, "name"),
      rows: x.nameMappings.map((row) => ({ id: row.description_key, value: row.name })),
    },
  ];
  return checks.flatMap(({ table, column, limit, rows }) =>
    rows
      .filter((row) => [...row.value].length > limit)
      .map((row) =>
        finding(
          "text.too-long",
          table,
          row.id,
          x.user.id,
          "value longer than the V2 column",
          { column, length: [...row.value].length, limit },
          // Only the side-data conversion truncates or drops; other tables offer no resolution.
          SIDE_DATA_TEXT_TABLES.has(table) ? undefined : [],
        ),
      ),
  );
}

function isSingle(row: V1Transaction): boolean {
  const condition = CONDITION_MAP[row.condicao];
  return condition !== "installment" && condition !== "recurring";
}

// Boletos are excluded: their period follows the due date. Marker rows take their period from the marker.
function periodDateMismatch(x: ExtractedUser): Finding[] {
  return x.transactions
    .filter(
      (row) =>
        isSingle(row) &&
        row.cartao_id === null &&
        PAYMENT_METHOD_MAP[row.forma_pagamento] !== "boleto" &&
        parseMarker(row.anotacao) === null &&
        getPeriodFromDate(row.data_compra) !== row.periodo,
    )
    .map((row) =>
      finding(
        "transaction.period-date-mismatch",
        T.transactions,
        row.id,
        x.user.id,
        "purchase month differs from the period",
        { period: row.periodo, purchaseMonth: getPeriodFromDate(row.data_compra) },
      ),
    );
}

function invoiceWithoutCard(x: ExtractedUser): Finding[] {
  return x.invoices
    .filter((invoice) => invoice.cartao_id === null)
    .map((invoice) =>
      finding("invoice.without-card", T.invoices, invoice.id, x.user.id, "invoice without a card"),
    );
}

// V1 subcategories carry no type: a row whose subcategory sits under a parent of another type
// than the row's own category would become a child category of the wrong type.
function subcategoryTypeMismatch(x: ExtractedUser): Finding[] {
  const typeByCategory = new Map(x.categories.map((category) => [category.id, category.tipo]));
  const parentBySub = new Map(x.subcategories.map((sub) => [sub.id, sub.categoria_id]));
  return x.transactions
    .filter((row) => {
      if (row.categoria_id === null || row.subcategoria_id === null) return false;
      const parent = parentBySub.get(row.subcategoria_id);
      const parentType = parent === undefined ? undefined : typeByCategory.get(parent);
      const ownType = typeByCategory.get(row.categoria_id);
      return parentType !== undefined && ownType !== undefined && parentType !== ownType;
    })
    .map((row) =>
      finding(
        "category.subcategory-type-mismatch",
        T.transactions,
        row.id,
        x.user.id,
        "subcategory parent type differs from the row's category type",
      ),
    );
}

function markerMissingTarget(x: ExtractedUser): Finding[] {
  const ownCards = new Set(x.cards.map((card) => card.id));
  const ownTransactions = new Set(x.transactions.map((row) => row.id));
  const findings: Finding[] = [];
  for (const row of x.transactions) {
    const marker = parseMarker(row.anotacao);
    if (marker === null) continue;
    const missing =
      marker.kind === "refund"
        ? !ownTransactions.has(marker.sourceId)
        : !ownCards.has(marker.cardId);
    if (!missing) continue;
    findings.push(
      finding(
        "marker.missing-target",
        T.transactions,
        row.id,
        x.user.id,
        marker.kind === "refund"
          ? "refund marker source is missing or owned by another user"
          : "invoice marker card is missing or owned by another user",
        { marker: marker.kind },
      ),
    );
  }
  return findings;
}

function stampDropped(x: ExtractedUser): Finding[] {
  return DROPPED_STAMPS.flatMap((column) => {
    const rows = x.transactions.filter((row) => row[column] !== null).length;
    return rows === 0
      ? []
      : [
          finding(
            "stamp.dropped",
            T.transactions,
            `${x.user.id}:${column}`,
            x.user.id,
            "reconciliation stamp V2 cannot reproduce, dropped",
            { column, rows },
          ),
        ];
  });
}

function mappingKeyNotNormalized(x: ExtractedUser): Finding[] {
  const keys = [
    ...x.categoryMappings.map((row) => ({ table: T.categoryMappings, key: row.description_key })),
    ...x.nameMappings.map((row) => ({ table: T.nameMappings, key: row.description_key })),
  ];
  return keys
    .filter(({ key }) => getImportedDescriptionKey(key) !== key)
    .map(({ table, key }) =>
      finding(
        "mapping.key-not-normalized",
        table,
        key,
        x.user.id,
        "key V2 would not produce from a description, loaded but may never match",
      ),
    );
}

// `validate` has no relying-party host, so every passkey is listed; `load` decides with --v1-rp-id.
function passkeyRpIdMismatch(x: ExtractedUser): Finding[] {
  return x.passkeys.map((passkey) =>
    finding(
      "passkey.rp-id-mismatch",
      T.passkey,
      passkey.id,
      x.user.id,
      "passkey loads only when --v1-rp-id equals the target host",
    ),
  );
}

// Rules whose logic lives in a conversion: the conversion runs without resolutions and its
// findings are reported as-is (same keys the load checks).
function conversionFindings(x: ExtractedUser): Finding[] {
  const catalog = convertCatalog(x, {});
  const refs = catalog.refs;
  const recurringRows: V1Transaction[] = [];
  const installmentRows: V1Transaction[] = [];
  const singleRows: V1Transaction[] = [];
  for (const row of x.transactions) {
    const condition = CONDITION_MAP[row.condicao];
    if (condition === "recurring") recurringRows.push(row);
    else if (condition === "installment") installmentRows.push(row);
    else singleRows.push(row);
  }
  const recurrence = convertRecurrence(recurringRows, refs, {});
  const installments = convertInstallments(installmentRows, x.anticipations, refs);
  // Unmapped cards and accounts are already reported (reference.dangling, card.day-out-of-range).
  const invoices = convertInvoices(
    x.invoices.filter(
      (invoice) => invoice.cartao_id === null || refs.cardByV1.has(invoice.cartao_id),
    ),
    [...singleRows, ...recurrence.detached].filter(
      (row) => row.conta_id === null || refs.accountByV1.has(row.conta_id),
    ),
    refs,
  );
  const txByV1 = new Map(
    [...singleRows, ...installmentRows].map((row) => [row.id, v2Id(T.transactions, row.id)]),
  );
  const sideData = convertSideData(x, refs, txByV1, {});
  return [
    ...catalog.findings,
    ...recurrence.findings,
    ...installments.findings,
    ...invoices.findings,
    ...sideData.findings,
  ];
}
