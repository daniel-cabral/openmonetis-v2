import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS, { type CellValue } from "exceljs";
import { buildXlsx } from "./xlsx-export";

test("workbook keeps sheet, header, numbers and formula-like text literal", async () => {
  const blob = await buildXlsx({
    sheetName: "Relatório de Categorias",
    columns: [
      { header: "Categoria", width: 30 },
      { header: "Total", width: 14, numFmt: "#,##0.00" },
    ],
    rows: [
      ["Mercado", 1234.5],
      ['=HYPERLINK("x")', 0],
    ],
  });

  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.from(await blob.arrayBuffer());
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];

  assert.equal(sheet.name, "Relatório de Categorias");
  const header = sheet.getRow(1).values as CellValue[];
  assert.deepEqual(header.slice(1), ["Categoria", "Total"]);
  assert.equal(sheet.getCell("B2").value, 1234.5);
  assert.equal(sheet.getCell("A3").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("A3").value, '=HYPERLINK("x")');
});
