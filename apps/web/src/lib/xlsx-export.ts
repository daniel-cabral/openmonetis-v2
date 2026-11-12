import ExcelJS from "exceljs";

export type XlsxColumn = {
  header: string;
  width: number;
  numFmt?: string;
};

/** Strings are stored as plain text, never as formulas, so spreadsheet apps show them literally. */
export type XlsxCell = string | number | null;

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** DOM-free: builds a single-sheet workbook with a bold, frozen header row. */
export async function buildXlsx({
  sheetName,
  columns,
  rows,
}: {
  sheetName: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
}): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width,
    style: column.numFmt ? { numFmt: column.numFmt } : {},
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRows(rows);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME_TYPE });
}
