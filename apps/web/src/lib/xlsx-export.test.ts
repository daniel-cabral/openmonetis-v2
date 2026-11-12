import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
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
  await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const sheet = workbook.worksheets[0];

  assert.equal(sheet.name, "Relatório de Categorias");
  assert.deepEqual(sheet.getRow(1).values.slice(1), ["Categoria", "Total"]);
  assert.equal(sheet.getCell("B2").value, 1234.5);
  assert.equal(sheet.getCell("A3").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("A3").value, '=HYPERLINK("x")');
});
