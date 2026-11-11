import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  detectImportProfile,
  findImportProfile,
} from "./import-profiles";

const statementFixture = readFileSync(
  new URL("./__fixtures__/c6-extrato.csv", import.meta.url),
  "utf8",
);
const invoiceFixture = readFileSync(
  new URL("./__fixtures__/c6-fatura.csv", import.meta.url),
  "utf8",
);

const statementHeader =
  "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)";
const invoiceHeader =
  "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)";

test("findImportProfile returns each C6 profile with its kind and destination type, and null for unknown ids", () => {
  const statement = findImportProfile("c6-statement");
  const invoice = findImportProfile("c6-invoice");

  assert.equal(statement?.label, "C6 Bank - Extrato de conta corrente");
  assert.equal(statement?.kind, "statement");
  assert.equal(statement?.destinationType, "account");
  assert.equal(invoice?.label, "C6 Bank - Fatura de cartão");
  assert.equal(invoice?.kind, "invoice");
  assert.equal(invoice?.destinationType, "card");
  assert.equal(findImportProfile("c6-desconhecido"), null);
});

test("each profile signature claims its own header and not the other profile's header", () => {
  assert.equal(detectImportProfile(statementHeader).detectedProfileId, "c6-statement");
  assert.equal(detectImportProfile(invoiceHeader).detectedProfileId, "c6-invoice");

  const statementSignature = findImportProfile("c6-statement")?.headerSignature ?? [];
  const invoiceSignature = findImportProfile("c6-invoice")?.headerSignature ?? [];
  assert.equal(
    invoiceSignature.every((fragment) => statementHeader.includes(fragment)),
    false,
  );
  assert.equal(
    statementSignature.every((fragment) => invoiceHeader.includes(fragment)),
    false,
  );
});

test("detectImportProfile suggests the C6 profile of each fixture and reads the statement account from its preamble", () => {
  const cases = [
    {
      content: statementFixture,
      detectedProfileId: "c6-statement",
      accountIdentification: "1/99999999",
    },
    {
      content: invoiceFixture,
      detectedProfileId: "c6-invoice",
      accountIdentification: null,
    },
  ];

  for (const { content, detectedProfileId, accountIdentification } of cases) {
    const result = detectImportProfile(content);
    assert.equal(result.detectedProfileId, detectedProfileId);
    assert.equal(result.accountIdentification, accountIdentification);
  }
});

test("detectImportProfile returns no profile and no error for unknown text, still listing every profile", () => {
  const result = detectImportProfile(
    "conteudo completamente desconhecido\nsem cabecalho reconhecido",
  );

  assert.equal(result.detectedProfileId, null);
  assert.equal(result.accountIdentification, null);
  assert.deepEqual(result.profiles, [
    {
      id: "c6-statement",
      label: "C6 Bank - Extrato de conta corrente",
      kind: "statement",
      destinationType: "account",
    },
    {
      id: "c6-invoice",
      label: "C6 Bank - Fatura de cartão",
      kind: "invoice",
      destinationType: "card",
    },
  ]);
});
