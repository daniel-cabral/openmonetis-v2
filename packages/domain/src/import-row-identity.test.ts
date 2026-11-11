import assert from "node:assert/strict";
import test from "node:test";
import { buildImportRowIdentityPayloads } from "./import-row-identity";
import type { ImportedTransaction } from "./transactions";

type RowIdentityInput = Parameters<typeof buildImportRowIdentityPayloads>[0];

function statementRow(
  overrides: Partial<ImportedTransaction> = {},
): ImportedTransaction {
  return {
    externalId: null,
    purchaseDate: "2026-07-10",
    postedDate: "2026-07-11",
    amount: 25.9,
    name: "PIX ENVIADO - LOJA TESTE",
    type: "expense",
    categoryName: null,
    dayBalance: 100,
    installment: null,
    cardLastDigits: null,
    holderName: null,
    fx: null,
    lineKind: null,
    ...overrides,
  };
}

function invoiceRow(
  overrides: Partial<ImportedTransaction> = {},
): ImportedTransaction {
  return {
    externalId: null,
    purchaseDate: "2026-07-10",
    postedDate: null,
    amount: 86.59,
    name: "LOJA TESTE",
    type: "expense",
    categoryName: "Lazer",
    dayBalance: null,
    installment: { current: 1, total: 3 },
    cardLastDigits: "1000",
    holderName: "Titular Teste 1",
    fx: null,
    lineKind: "purchase",
    ...overrides,
  };
}

function statementInput(
  rows: ImportedTransaction[],
  overrides: Partial<RowIdentityInput> = {},
): RowIdentityInput {
  return {
    kind: "statement",
    source: "C6 Bank",
    accountIdentification: "1/99999999",
    destination: { type: "account", id: "account-1" },
    rows,
    ...overrides,
  };
}

function invoiceInput(
  rows: ImportedTransaction[],
  overrides: Partial<RowIdentityInput> = {},
): RowIdentityInput {
  return {
    kind: "invoice",
    source: "C6 Bank",
    accountIdentification: null,
    destination: { type: "card", id: "card-1" },
    rows,
    ...overrides,
  };
}

function occurrenceOf(payload: string): number {
  const fields = JSON.parse(payload) as unknown[];
  return fields[fields.length - 1] as number;
}

test("statement payloads keep the persisted identity format, one per row in file order", () => {
  const payloads = buildImportRowIdentityPayloads(
    statementInput([
      statementRow(),
      statementRow({
        name: "PIX RECEBIDO - LOJA TESTE",
        type: "income",
        amount: 100,
      }),
    ]),
  );

  assert.deepEqual(payloads, [
    '["openmonetis-import-row-v1","statement","c6 bank","account","account-1","1/99999999","2026-07-10","2026-07-11","pix enviado - loja teste","-25.90",0]',
    '["openmonetis-import-row-v1","statement","c6 bank","account","account-1","1/99999999","2026-07-10","2026-07-11","pix recebido - loja teste","100.00",0]',
  ]);
});

test("invoice payloads keep the persisted identity format, with empty installment for single purchases", () => {
  const payloads = buildImportRowIdentityPayloads(
    invoiceInput([
      invoiceRow(),
      invoiceRow({ installment: null, type: "income", amount: 75 }),
    ]),
  );

  assert.deepEqual(payloads, [
    '["openmonetis-import-row-v1","invoice","c6 bank","card","card-1","1000","2026-07-10","loja teste","1/3","-86.59",0]',
    '["openmonetis-import-row-v1","invoice","c6 bank","card","card-1","1000","2026-07-10","loja teste","","75.00",0]',
  ]);
});

test("occurrence counts identical identity groups in file order, independently per group", () => {
  const payloads = buildImportRowIdentityPayloads(
    statementInput([
      statementRow({ name: "A" }),
      statementRow({ name: "A" }),
      statementRow({ name: "B" }),
      statementRow({ name: "A" }),
    ]),
  );

  assert.deepEqual(payloads.map(occurrenceOf), [0, 1, 0, 2]);
});

test("case and spacing in the description do not split an identity group", () => {
  const payloads = buildImportRowIdentityPayloads(
    statementInput([
      statementRow(),
      statementRow({ name: "  pix  enviado -  Loja Teste " }),
    ]),
  );

  assert.deepEqual(payloads.map(occurrenceOf), [0, 1]);
});

test("rows differing in any identity field of their kind get distinct payloads", () => {
  const cases = [
    {
      label: "statement posted date",
      input: statementInput([
        statementRow(),
        statementRow({ postedDate: "2026-07-12" }),
      ]),
    },
    {
      label: "statement sign",
      input: statementInput([statementRow(), statementRow({ type: "income" })]),
    },
    {
      label: "invoice installment",
      input: invoiceInput([
        invoiceRow(),
        invoiceRow({ installment: { current: 2, total: 3 } }),
      ]),
    },
    {
      label: "invoice card last four",
      input: invoiceInput([
        invoiceRow(),
        invoiceRow({ cardLastDigits: "2000" }),
      ]),
    },
  ];

  for (const { label, input } of cases) {
    const payloads = buildImportRowIdentityPayloads(input);
    assert.equal(new Set(payloads).size, 2, label);
    assert.deepEqual(payloads.map(occurrenceOf), [0, 0], label);
  }
});

test("destination, account identification and source are part of the statement identity", () => {
  const rows = [statementRow()];
  const [baseline] = buildImportRowIdentityPayloads(statementInput(rows));
  const scopeChanges = [
    statementInput(rows, { destination: { type: "account", id: "account-2" } }),
    statementInput(rows, { destination: { type: "card", id: "account-1" } }),
    statementInput(rows, { accountIdentification: "2/88888888" }),
    statementInput(rows, { source: "Outro banco" }),
  ];

  for (const input of scopeChanges) {
    const [payload] = buildImportRowIdentityPayloads(input);
    assert.notEqual(payload, baseline);
  }
});

test("metadata outside the identity inputs does not change the payload", () => {
  const [statementBaseline] = buildImportRowIdentityPayloads(
    statementInput([statementRow()]),
  );
  const [statementWithMetadata] = buildImportRowIdentityPayloads(
    statementInput([statementRow({ dayBalance: 999, categoryName: "Lazer" })]),
  );
  const [invoiceBaseline] = buildImportRowIdentityPayloads(
    invoiceInput([invoiceRow()]),
  );
  const [invoiceWithMetadata] = buildImportRowIdentityPayloads(
    invoiceInput([
      invoiceRow({
        holderName: "Titular Teste 2",
        categoryName: "Mercado",
        lineKind: "credit",
        fx: { currency: "USD", amount: 10 },
      }),
    ]),
  );

  assert.equal(statementWithMetadata, statementBaseline);
  assert.equal(invoiceWithMetadata, invoiceBaseline);
});
