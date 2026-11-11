import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  TransactionImportDetection,
  TransactionImportPreview,
  TransactionImportResult,
} from "@openmonetis/validators/transactions";
import ExcelJS from "exceljs";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const ofx = `OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Test Bank</ORG><FID>123</FID></FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>123</BANKID><ACCTID>456</ACCTID></BANKACCTFROM><BANKTRANLIST><DTSTART>20200101000000</DTSTART><DTEND>20200131000000</DTEND><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20200110120000[-3:BRT]</DTPOSTED><TRNAMT>-10.01</TRNAMT><FITID>purchase-1</FITID><MEMO>Mercado &amp; Cia</MEMO></STMTTRN><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20200111</DTPOSTED><TRNAMT>100.35</TRNAMT><FITID>income-1</FITID><MEMO>Income</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("OFX and spreadsheet imports persist reviewed data, deduplicate and undo owned batches", {
  skip: process.env.IMPORTS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const { db, transactions, importCategoryMappings } = await import("@openmonetis/db");
    const { eq } = await import("drizzle-orm");
    async function apiResponse() {
      return api.request("/transactions/imports/preview", owner, "POST", {
        fileName: "statement.ofx",
        contentBase64: Buffer.from(ofx).toString("base64"),
      });
    }
    async function readPreview() {
      return api.data<TransactionImportPreview>(await apiResponse());
    }
    const account = await api.account(owner);
    const foreign = await api.account(stranger);
    const parsed = await readPreview();
    const input = {
      sourceFingerprint: parsed.sourceFingerprint,
      destinationType: "account",
      destinationId: account.id,
      paymentMethod: "pix",
      rows: parsed.transactions.map((row) => ({
        externalId: row.externalId,
        name: row.name,
        amount: row.amount,
        type: row.type,
        purchaseDate: row.purchaseDate,
        personId: owner.personId,
        categoryId: row.type === "expense" ? owner.expenseCategoryId : owner.incomeCategoryId,
      })),
    };
    await t.test(
      "OFX preview preserves identifiers, signed transaction types, decoded text and calendar dates",
      async () => {
        assert.equal(parsed.sourceName, "Test Bank");
        assert.equal(parsed.accountNumber, "456");
        assert.deepEqual(
          parsed.transactions.map((row) => [
            row.externalId,
            row.type,
            row.amount,
            row.purchaseDate,
          ]),
          [
            ["purchase-1", "expense", 10.01, "2020-01-10"],
            ["income-1", "income", 100.35, "2020-01-11"],
          ],
        );
        assert.equal(parsed.transactions[0].name, "Mercado & Cia");
        assert.ok(parsed.transactions.every((row) => !row.isDuplicate));
      },
    );
    await t.test(
      "real Excel bytes support Brazilian amounts, Date cells and valid rows beside invalid rows",
      async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Extrato");
        sheet.addRow(["Data", "Descrição", "Valor", "Tipo", "Categoria"]);
        sheet.addRow([
          new Date("2020-01-10T00:00:00Z"),
          "Compra",
          "-1.234,56",
          "despesa",
          "Mercado",
        ]);
        sheet.addRow(["11/01/2020", "Receita", "100,35", "receita", "Salário"]);
        sheet.addRow(["invalid", "Broken", 10, "despesa", ""]);
        const output = await api.data<TransactionImportPreview>(
          await api.request("/transactions/imports/preview", owner, "POST", {
            fileName: "statement.xlsx",
            contentBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
          }),
        );
        assert.deepEqual(
          output.transactions.map((row) => [row.purchaseDate, row.type, row.amount]),
          [
            ["2020-01-10", "expense", 1234.56],
            ["2020-01-11", "income", 100.35],
          ],
        );
      },
    );
    await t.test(
      "repeated and concurrent imports deduplicate per user and update the preview",
      async () => {
        const responses = await Promise.all([
          api.request("/transactions/imports", owner, "POST", input),
          api.request("/transactions/imports", owner, "POST", input),
        ]);
        const results = await Promise.all(
          responses.map((response) => api.data<TransactionImportResult>(response, 201)),
        );
        assert.equal(
          results.reduce((total, row) => total + row.imported, 0),
          2,
        );
        assert.equal(
          results.reduce((total, row) => total + row.skipped, 0),
          2,
        );
        assert.ok((await readPreview()).transactions.every((row) => row.isDuplicate));
        const rows = await db
          .select()
          .from(transactions)
          .where(eq(transactions.accountId, account.id));
        assert.deepEqual(rows.map((row) => row.amount).sort(), ["-10.01", "100.35"]);
        const other = {
          ...input,
          destinationId: foreign.id,
          rows: input.rows.map((row) => ({
            ...row,
            personId: stranger.personId,
            categoryId:
              row.type === "expense" ? stranger.expenseCategoryId : stranger.incomeCategoryId,
          })),
        };
        assert.equal(
          (
            await api.data<TransactionImportResult>(
              await api.request("/transactions/imports", stranger, "POST", other),
              201,
            )
          ).imported,
          2,
        );
      },
    );
    await t.test(
      "foreign destination, person and category reject the whole batch before writing",
      async () => {
        const before = await db.select().from(transactions);
        for (const patch of [
          { destinationId: foreign.id },
          { rows: [{ ...input.rows[0], externalId: randomUUID(), personId: stranger.personId }] },
          {
            rows: [
              {
                ...input.rows[0],
                externalId: randomUUID(),
                categoryId: stranger.expenseCategoryId,
              },
            ],
          },
        ])
          await api.error(
            await api.request("/transactions/imports", owner, "POST", { ...input, ...patch }),
            404,
          );
        assert.deepEqual(await db.select().from(transactions), before);
      },
    );
    await t.test(
      "undo cannot remove a foreign batch and removes only the requested owned batch",
      async () => {
        const result = await api.data<TransactionImportResult>(
          await api.request("/transactions/imports", owner, "POST", {
            ...input,
            rows: input.rows.map((row) => ({ ...row, externalId: randomUUID() })),
          }),
          201,
        );
        await api.error(
          await api.request(`/transactions/imports/${result.batchId}`, stranger, "DELETE"),
          404,
          "IMPORT_BATCH_NOT_FOUND",
        );
        assert.equal(
          (
            await db
              .select()
              .from(transactions)
              .where(eq(transactions.importBatchId, result.batchId))
          ).length,
          2,
        );
        const undo = await api.data<{ deleted: number }>(
          await api.request(`/transactions/imports/${result.batchId}`, owner, "DELETE"),
        );
        assert.equal(undo.deleted, 2);
        assert.equal(
          (await db.select().from(transactions).where(eq(transactions.accountId, account.id)))
            .length,
          2,
        );
        assert.equal(
          (await db.select().from(transactions).where(eq(transactions.accountId, foreign.id)))
            .length,
          2,
        );
      },
    );
    await t.test(
      "unsupported, corrupt and empty files return controlled errors without writes",
      async () => {
        const before = await db.select().from(transactions);
        for (const fileName of ["statement.exe", "statement.ofx", "statement.xlsx"])
          await api.error(
            await api.request("/transactions/imports/preview", owner, "POST", {
              fileName,
              contentBase64: Buffer.from("not a statement").toString("base64"),
            }),
            400,
          );
        await api.error(
          await api.request("/transactions/imports", owner, "POST", { ...input, rows: [] }),
          400,
        );
        assert.deepEqual(await db.select().from(transactions), before);
      },
    );
    const secondAccount = await api.account(owner);
    const card = await api.data<{ id: string }>(
      await api.request("/cards", owner, "POST", {
        name: "C6 card",
        accountId: account.id,
        brand: "visa",
        closingDay: 20,
        dueDay: 25,
        limit: 1000000,
      }),
      201,
    );
    type Destination = { type: "account" | "card"; id: string };
    const csvBase64 = (content: string | Buffer) => Buffer.from(content).toString("base64");
    function previewCsv(
      content: string | Buffer,
      fileName: string,
      profileId: string,
      destination: Destination,
    ) {
      return api.request("/transactions/imports/preview", owner, "POST", {
        fileName,
        contentBase64: csvBase64(content),
        profileId,
        destinationType: destination.type,
        destinationId: destination.id,
      });
    }
    async function readCsvPreview(
      content: string | Buffer,
      fileName: string,
      profileId: string,
      destination: Destination,
    ) {
      return api.data<TransactionImportPreview>(
        await previewCsv(content, fileName, profileId, destination),
      );
    }
    function importInput(preview: TransactionImportPreview, destination: Destination) {
      return {
        sourceFingerprint: preview.sourceFingerprint,
        destinationType: destination.type,
        destinationId: destination.id,
        paymentMethod: destination.type === "card" ? "credit_card" : "pix",
        ...(destination.type === "card" ? { invoicePeriod: "2026-08" } : {}),
        rows: preview.transactions.map((row) => ({
          externalId: row.externalId,
          name: row.name,
          amount: row.amount,
          type: row.type,
          purchaseDate: row.purchaseDate,
          lineKind: row.lineKind,
          personId: owner.personId,
          categoryId: row.type === "expense" ? owner.expenseCategoryId : owner.incomeCategoryId,
        })),
      };
    }

    await t.test(
      "detect suggests the profile and account identification, or none for an unknown CSV",
      async () => {
        const detect = async (content: string | Buffer) =>
          api.data<TransactionImportDetection>(
            await api.request("/transactions/imports/detect", owner, "POST", {
              fileName: "arquivo.csv",
              contentBase64: csvBase64(content),
            }),
          );

        const statement = await detect(c6StatementFixture);
        assert.equal(statement.detectedProfileId, "c6-statement");
        assert.equal(statement.accountIdentification, "1/99999999");
        const invoice = await detect(c6InvoiceFixture);
        assert.equal(invoice.detectedProfileId, "c6-invoice");
        assert.equal(invoice.accountIdentification, null);
        const unknown = await detect("nome,valor\nLoja,10");
        assert.equal(unknown.detectedProfileId, null);
        assert.equal(unknown.accountIdentification, null);
      },
    );

    await t.test(
      "CSV preview needs a profile, rejects a profile for another destination type and never reads foreign accounts",
      async () => {
        await api.error(
          await api.request("/transactions/imports/preview", owner, "POST", {
            fileName: "extrato.csv",
            contentBase64: csvBase64(c6StatementFixture),
          }),
          400,
          "IMPORT_PROFILE_REQUIRED",
        );
        await api.error(
          await previewCsv(c6StatementFixture, "extrato.csv", "c6-statement", {
            type: "account",
            id: foreign.id,
          }),
          404,
          "ACCOUNT_NOT_FOUND",
        );
        await api.error(
          await previewCsv(c6StatementFixture, "extrato.csv", "c6-invoice", {
            type: "account",
            id: account.id,
          }),
          400,
          "IMPORT_DESTINATION_MISMATCH",
        );
      },
    );

    await t.test(
      "statement CSV imports 113 rows once, duplicates re-imports and accepts the same file on another account",
      async () => {
        const destination: Destination = { type: "account", id: account.id };
        const first = await readCsvPreview(
          c6StatementFixture,
          "extrato.csv",
          "c6-statement",
          destination,
        );
        assert.equal(first.transactions.length, 113);
        assert.equal(first.profileId, "c6-statement");
        assert.deepEqual(first.invalidLines, []);
        assert.ok(first.transactions.every((row) => !row.isDuplicate && row.importable));

        const imported = await api.data<TransactionImportResult>(
          await api.request("/transactions/imports", owner, "POST", importInput(first, destination)),
          201,
        );
        assert.equal(imported.imported, 113);
        assert.equal(imported.skipped, 0);

        const again = await readCsvPreview(
          c6StatementFixture,
          "extrato.csv",
          "c6-statement",
          destination,
        );
        assert.ok(again.transactions.every((row) => row.isDuplicate));
        const reimport = await api.data<TransactionImportResult>(
          await api.request("/transactions/imports", owner, "POST", importInput(again, destination)),
          201,
        );
        assert.equal(reimport.imported, 0);
        assert.equal(reimport.skipped, 113);

        const elsewhere = await readCsvPreview(
          c6StatementFixture,
          "extrato.csv",
          "c6-statement",
          { type: "account", id: secondAccount.id },
        );
        assert.ok(elsewhere.transactions.every((row) => !row.isDuplicate));

        await api.data<{ deleted: number }>(
          await api.request(`/transactions/imports/${imported.batchId}`, owner, "DELETE"),
        );
        const remaining = await db
          .select()
          .from(transactions)
          .where(eq(transactions.importBatchId, imported.batchId));
        assert.equal(remaining.length, 0);
      },
    );

    await t.test(
      "invoice import with a credit line is rejected before any transaction is written",
      async () => {
        const destination: Destination = { type: "card", id: card.id };
        const invoice = await readCsvPreview(c6InvoiceFixture, "fatura.csv", "c6-invoice", destination);
        const credit = invoice.transactions.find((row) => row.lineKind === "credit");
        assert.ok(credit);
        assert.equal(credit.importable, false);

        await api.error(
          await api.request(
            "/transactions/imports",
            owner,
            "POST",
            importInput({ ...invoice, transactions: [credit] }, destination),
          ),
          400,
          "IMPORT_ROW_NOT_IMPORTABLE",
        );
        const written = await db.select().from(transactions).where(eq(transactions.cardId, card.id));
        assert.equal(written.length, 0);
      },
    );

    await t.test(
      "a .xls file with Excel 97-2003 bytes is rejected, while .xls holding xlsx content is read",
      async () => {
        await api.error(
          await api.request("/transactions/imports/preview", owner, "POST", {
            fileName: "antigo.xls",
            contentBase64: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).toString(
              "base64",
            ),
          }),
          400,
          "IMPORT_XLS_BINARY_NOT_SUPPORTED",
        );
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Extrato");
        sheet.addRow(["Data", "Descrição", "Valor", "Tipo", "Categoria"]);
        sheet.addRow(["11/01/2020", "Receita", "100,35", "receita", "Salário"]);
        const output = await api.data<TransactionImportPreview>(
          await api.request("/transactions/imports/preview", owner, "POST", {
            fileName: "extrato.xls",
            contentBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
          }),
        );
        assert.deepEqual(
          output.transactions.map((row) => [row.purchaseDate, row.type, row.amount]),
          [["2020-01-11", "income", 100.35]],
        );
      },
    );

    await t.test(
      "learned categories survive the key change: legacy keys still match and merchant variants share one memory",
      async () => {
        const destination: Destination = { type: "account", id: account.id };
        await db.insert(importCategoryMappings).values({
          userId: owner.id,
          descriptionKey: "pg *loja antiga betim bra",
          categoryId: owner.expenseCategoryId,
        });
        const legacy = await readCsvPreview(
          `${c6StatementHeader}\n05/07/2026,05/07/2026,PG *LOJA ANTIGA   BETIM   BRA,,0.00,10.00,90.00`,
          "extrato.csv",
          "c6-statement",
          destination,
        );
        assert.equal(legacy.transactions[0].suggestedCategoryId, owner.expenseCategoryId);

        const contagem = await readCsvPreview(
          `Agência: 1 / Conta: 2\n${c6StatementHeader}\n05/07/2026,05/07/2026,PG *LOJA TESTE   CONTAGEM   BRA,,0.00,10.00,90.00`,
          "extrato.csv",
          "c6-statement",
          destination,
        );
        assert.equal(contagem.transactions[0].suggestedCategoryId, null);
        await api.data<TransactionImportResult>(
          await api.request("/transactions/imports", owner, "POST", importInput(contagem, destination)),
          201,
        );

        const betim = await readCsvPreview(
          `Agência: 1 / Conta: 2\n${c6StatementHeader}\n09/07/2026,09/07/2026,PG *LOJA TESTE   BETIM   BRA,,0.00,12.00,88.00`,
          "extrato.csv",
          "c6-statement",
          destination,
        );
        assert.equal(betim.transactions[0].suggestedCategoryId, owner.expenseCategoryId);
      },
    );
  });
});

const c6StatementFixture = readFileSync(
  new URL("../../../packages/domain/src/__fixtures__/c6-extrato.csv", import.meta.url),
);
const c6InvoiceFixture = readFileSync(
  new URL("../../../packages/domain/src/__fixtures__/c6-fatura.csv", import.meta.url),
);
const c6StatementHeader =
  "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)";
