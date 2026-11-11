import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyC6InvoiceLine,
  parseC6InvoiceCsv,
  parseC6StatementCsv,
} from "./import-c6";

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

test("parseC6StatementCsv reads account identification, masked number and period from the preamble", () => {
  const statement = parseC6StatementCsv(statementFixture);

  assert.equal(statement.profileId, "c6-statement");
  assert.equal(statement.sourceName, "C6 Bank");
  assert.equal(statement.isCreditCard, false);
  assert.equal(statement.accountIdentification, "1/99999999");
  assert.equal(statement.accountNumber, "•••• 9999");
  assert.deepEqual(statement.period, { from: "2026-07-04", to: "2026-09-02" });
});

test("parseC6StatementCsv maps every fixture row to dates, day balance and expense amount", () => {
  const statement = parseC6StatementCsv(statementFixture);
  const first = statement.transactions[0];

  assert.equal(statement.transactions.length, 113);
  assert.deepEqual(statement.invalidLines, []);
  assert.equal(first.purchaseDate, "2026-07-05");
  assert.equal(first.postedDate, "2026-07-06");
  assert.equal(first.amount, 120);
  assert.equal(first.type, "expense");
  assert.equal(first.dayBalance, 1007.11);
});

test("parseC6StatementCsv types a positive Entrada as income", () => {
  const received = parseC6StatementCsv(statementFixture).transactions.find(
    (transaction) =>
      transaction.name === "Pix recebido c6 de Empresa Teste 1 LTDA",
  );

  assert.ok(received);
  assert.equal(received.type, "income");
  assert.equal(received.amount, 2990.4);
});

test("parseC6StatementCsv joins Title and Description without repeating equal or empty parts", () => {
  const statement = parseC6StatementCsv(
    [
      "Agência: 1 / Conta: 2",
      statementHeader,
      "05/07/2026,05/07/2026,Pix enviado para Pessoa Teste 1,observacao de teste,0.00,120.00,100.00",
      "06/07/2026,06/07/2026,Pix recebido de Empresa Teste 1,Pix recebido de Empresa Teste 1,10.00,0.00,110.00",
      "07/07/2026,07/07/2026,IOF CHEQUE ESPECIAL,,0.00,2.50,107.50",
      `08/07/2026,08/07/2026,${"A".repeat(100)},${"B".repeat(100)},0.00,1.00,106.50`,
    ].join("\n"),
  );

  assert.deepEqual(
    statement.transactions.slice(0, 3).map((transaction) => transaction.name),
    [
      "Pix enviado para Pessoa Teste 1 - observacao de teste",
      "Pix recebido de Empresa Teste 1",
      "IOF CHEQUE ESPECIAL",
    ],
  );
  assert.equal(statement.transactions[3].name.length, 160);
});

test("parseC6StatementCsv leaves the period null when the preamble has no Extrato line", () => {
  const statement = parseC6StatementCsv(
    [
      "Agência: 1 / Conta: 2",
      statementHeader,
      "05/07/2026,05/07/2026,IOF CHEQUE ESPECIAL,,0.00,2.50,107.50",
    ].join("\n"),
  );

  assert.equal(statement.period, null);
  assert.equal(statement.transactions.length, 1);
});

test("parseC6StatementCsv keeps commas inside quoted fields", () => {
  const statement = parseC6StatementCsv(
    [
      statementHeader,
      '05/07/2026,05/07/2026,"Pix enviado para Pessoa Teste 1, Empresa",observacao,0.00,120.00,100.00',
    ].join("\n"),
  );

  assert.equal(
    statement.transactions[0].name,
    "Pix enviado para Pessoa Teste 1, Empresa - observacao",
  );
  assert.equal(statement.transactions[0].amount, 120);
});

test("parseC6StatementCsv skips invalid lines and reports their file line numbers", () => {
  const statement = parseC6StatementCsv(
    [
      "Agência: 1 / Conta: 2",
      statementHeader,
      "05/07/2026,05/07/2026,Pix,,0.00,120.00,100.00",
      "31/02/2026,31/02/2026,Pix,,0.00,120.00,100.00",
      "06/07/2026,06/07/2026,Pix,,0.00,abc,100.00",
      "07/07/2026,07/07/2026,Pix,,0.00,50.00,50.00",
    ].join("\n"),
  );

  assert.equal(statement.transactions.length, 2);
  assert.deepEqual(statement.invalidLines, [
    { lineNumber: 4, reason: "invalid_date" },
    { lineNumber: 5, reason: "invalid_amount" },
  ]);
});

test("parseC6StatementCsv accepts a leading byte order mark before the header", () => {
  const statement = parseC6StatementCsv(
    `﻿${statementHeader}\n05/07/2026,05/07/2026,Pix,,0.00,120.00,100.00\n`,
  );

  assert.equal(statement.transactions.length, 1);
});

test("parseC6StatementCsv throws when the header or every data line is missing", () => {
  assert.throws(
    () => parseC6StatementCsv("Agência: 1 / Conta: 2\n05/07/2026,05/07/2026,Pix,,0.00,120.00,100.00"),
    Error,
  );
  assert.throws(() => parseC6StatementCsv(statementHeader), Error);
});

test("parseC6InvoiceCsv maps purchase date, card, holder, category and description", () => {
  const invoice = parseC6InvoiceCsv(invoiceFixture);
  const first = invoice.transactions[0];

  assert.equal(invoice.profileId, "c6-invoice");
  assert.equal(invoice.isCreditCard, true);
  assert.equal(first.purchaseDate, "2025-01-14");
  assert.equal(first.postedDate, null);
  assert.equal(first.cardLastDigits, "1000");
  assert.equal(first.holderName, "Titular Teste 1");
  assert.equal(first.categoryName, "Casa / Escritório Mobiliário");
  assert.equal(first.name, "LOJA DE FERRAGENS TESTE");
  assert.equal(first.type, "expense");
  assert.equal(first.amount, 640);
});

test("parseC6InvoiceCsv reads installment N/M and treats Única as no installment", () => {
  const transactions = parseC6InvoiceCsv(invoiceFixture).transactions;
  const parcelada = transactions[0];
  const unica = transactions.find(
    (transaction) => transaction.name === "ASSINATURA NUVEM TESTE",
  );

  assert.deepEqual(parcelada.installment, { current: 7, total: 8 });
  assert.ok(unica);
  assert.equal(unica.installment, null);
});

test("parseC6InvoiceCsv keeps FX only when the USD value is non-zero", () => {
  const transactions = parseC6InvoiceCsv(invoiceFixture).transactions;
  const emDolar = transactions.find(
    (transaction) =>
      transaction.name === "PLATAFORMA IA TESTE  SA" &&
      transaction.amount === 270,
  );
  const semFx = transactions.find(
    (transaction) => transaction.name === "ASSINATURA NUVEM TESTE",
  );

  assert.ok(emDolar);
  assert.deepEqual(emDolar.fx, { currency: "USD", amount: 50 });
  assert.ok(semFx);
  assert.equal(semFx.fx, null);
});

test("parseC6InvoiceCsv keeps every fixture line, typing negatives as income", () => {
  const invoice = parseC6InvoiceCsv(invoiceFixture);
  const { transactions } = invoice;
  const signedCents = (transaction: (typeof transactions)[number]) =>
    Math.round(transaction.amount * 100) * (transaction.type === "income" ? -1 : 1);
  const totalOf = (kinds: string[]) =>
    transactions
      .filter((transaction) => kinds.includes(transaction.lineKind ?? ""))
      .reduce((total, transaction) => total + signedCents(transaction), 0);
  const pagamento = transactions.find(
    (transaction) => transaction.name === "Pag Fatura Boleto",
  );
  const estorno = transactions.find(
    (transaction) => transaction.name === "Estorno Tarifa",
  );

  assert.equal(transactions.length, 98);
  assert.deepEqual(invoice.invalidLines, []);
  assert.equal(totalOf(["purchase"]), 2344050);
  assert.equal(totalOf(["purchase", "credit"]), 2336550);
  assert.ok(pagamento);
  assert.equal(pagamento.type, "income");
  assert.equal(pagamento.amount, 9500);
  assert.ok(estorno);
  assert.equal(estorno.type, "income");
  assert.equal(estorno.amount, 75);
  const countOf = (lineKind: string) =>
    transactions.filter((transaction) => transaction.lineKind === lineKind).length;
  assert.equal(countOf("purchase"), 96);
  assert.equal(countOf("credit"), 1);
  assert.equal(countOf("invoice-payment"), 1);
  assert.equal(pagamento.lineKind, "invoice-payment");
  assert.equal(estorno.lineKind, "credit");
});

test("parseC6InvoiceCsv skips invalid lines and reports their file line numbers", () => {
  const invoice = parseC6InvoiceCsv(
    [
      invoiceHeader,
      "14/01/2025;Titular Teste 1;1000;Recreativo;LOJA A;Única;0;0;10.00",
      "31/02/2025;Titular Teste 1;1000;Recreativo;LOJA B;Única;0;0;10.00",
      "14/01/2025;Titular Teste 1;1000;Recreativo;LOJA C;Única;0;0;abc",
    ].join("\n"),
  );

  assert.deepEqual(
    invoice.transactions.map((transaction) => transaction.name),
    ["LOJA A"],
  );
  assert.deepEqual(invoice.invalidLines, [
    { lineNumber: 3, reason: "invalid_date" },
    { lineNumber: 4, reason: "invalid_amount" },
  ]);
});

test("classifyC6InvoiceLine separates purchases, invoice payments and credits", () => {
  assert.equal(
    classifyC6InvoiceLine({ description: "ASSINATURA NUVEM TESTE", signedCents: 1990 }),
    "purchase",
  );
  assert.equal(
    classifyC6InvoiceLine({ description: "Pag Fatura Boleto", signedCents: -950000 }),
    "invoice-payment",
  );
  assert.equal(
    classifyC6InvoiceLine({ description: "  PAG FATURA BOLETO", signedCents: -950000 }),
    "invoice-payment",
  );
  assert.equal(
    classifyC6InvoiceLine({ description: "Estorno Tarifa", signedCents: -7500 }),
    "credit",
  );
});
