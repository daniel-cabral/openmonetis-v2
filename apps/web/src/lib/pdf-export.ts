import { jsPDF } from "jspdf";
import { autoTable, type CellHookData, type Styles } from "jspdf-autotable";
import type { ExportBranding } from "./export-branding";

export type BrandedPdfCell = {
  text: string;
  tone?: "expense" | "income" | null;
  trend?: "up" | "down" | null;
};

export type BrandedPdfRow = {
  cells: BrandedPdfCell[];
  emphasis?: boolean;
};

export type BrandedPdfColumn = {
  header: string;
  align?: "left" | "center" | "right";
};

export type BrandedPdfTable = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  branding: ExportBranding;
  columns: BrandedPdfColumn[];
  rows: BrandedPdfRow[];
};

type RgbColor = [number, number, number];

const PAGE_MARGIN_MM = 14;
const LOGO_HEIGHT_MM = 9;
const WORDMARK_HEIGHT_MM = 6;
const TREND_SIZE_MM = 2.2;
const TREND_GAP_MM = 1.5;
const TABLE_FONT_SIZE_PT = 8;
/** Points to millimeters, and the line spacing autoTable applies to wrapped text. */
const PT_TO_MM = 0.3528;
const LINE_HEIGHT_FACTOR = 1.15;
const TEXT_COLOR: RgbColor = [107, 114, 128];
const EMPHASIS_FILL: RgbColor = [243, 244, 246];
const TONE_COLORS: Record<"expense" | "income", RgbColor> = {
  expense: [220, 38, 38],
  income: [22, 163, 74],
};

/**
 * Builds a landscape A4 PDF with the brand header, a table repeated on every page and optional
 * trend triangles. DOM-free: branding is passed in, so it runs in node tests.
 */
export async function buildBrandedPdf(
  table: BrandedPdfTable,
): Promise<{ blob: Blob; pageCount: number }> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const [red, green, blue] = table.branding.color;
  const { logos } = table.branding;
  let cursorY = PAGE_MARGIN_MM;

  if (logos) {
    const markWidth = drawImageHeight(doc, logos.mark, PAGE_MARGIN_MM, cursorY, LOGO_HEIGHT_MM);
    drawImageHeight(
      doc,
      logos.wordmark,
      PAGE_MARGIN_MM + markWidth + 3,
      cursorY + (LOGO_HEIGHT_MM - WORDMARK_HEIGHT_MM) / 2,
      WORDMARK_HEIGHT_MM,
    );
    cursorY += LOGO_HEIGHT_MM + 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(table.title, PAGE_MARGIN_MM, cursorY + 6);
  cursorY += 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_COLOR);
  doc.text(`Período: ${table.periodLabel}`, PAGE_MARGIN_MM, cursorY);
  doc.text(`Gerado em: ${table.generatedAt}`, PAGE_MARGIN_MM, cursorY + 5);
  cursorY += 9;

  doc.setDrawColor(red, green, blue);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN_MM, cursorY, pageWidth - PAGE_MARGIN_MM, cursorY);

  autoTable(doc, {
    startY: cursorY + 4,
    margin: { left: PAGE_MARGIN_MM, right: PAGE_MARGIN_MM, bottom: PAGE_MARGIN_MM },
    head: [table.columns.map((column) => column.header)],
    body: table.rows.map((row) => row.cells.map((cell) => toBodyCell(cell, row.emphasis === true))),
    styles: {
      font: "helvetica",
      fontSize: TABLE_FONT_SIZE_PT,
      cellPadding: 1.5,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: [red, green, blue], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      table.columns.map((column, index) => [index, { halign: column.align ?? "left" }]),
    ),
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const trend = table.rows[data.row.index]?.cells[data.column.index]?.trend;
      if (trend) drawTrendTriangle(doc, data, trend);
    },
  });

  const blob = new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
  return { blob, pageCount: doc.getNumberOfPages() };
}

/** Draws a logo at the given height and returns its width, keeping the image's aspect ratio. */
function drawImageHeight(doc: jsPDF, dataUrl: string, x: number, y: number, height: number) {
  const { width, height: pixelHeight } = doc.getImageProperties(dataUrl);
  const drawnWidth = (height * width) / pixelHeight;
  doc.addImage(dataUrl, "PNG", x, y, drawnWidth, height);
  return drawnWidth;
}

function toBodyCell(
  cell: BrandedPdfCell,
  emphasis: boolean,
): { content: string; styles: Partial<Styles> } {
  return {
    content: cell.text,
    styles: {
      ...(emphasis ? { fontStyle: "bold" as const, fillColor: EMPHASIS_FILL } : {}),
      ...(cell.tone ? { textColor: TONE_COLORS[cell.tone] } : {}),
    },
  };
}

/**
 * Draws the trend triangle left of the last line of the cell (the variation), so the text
 * stays the API value and the arrow is a vector shape instead of a font glyph.
 */
function drawTrendTriangle(doc: jsPDF, data: CellHookData, trend: "up" | "down") {
  const { cell } = data;
  const lines = cell.text;
  const { fontSize, font, fontStyle, halign } = cell.styles;
  const lineHeight = fontSize * PT_TO_MM * LINE_HEIGHT_FACTOR;

  doc.setFont(font, fontStyle);
  doc.setFontSize(fontSize);
  const lastLine = lines.at(-1) ?? "";
  const lineWidth = doc.getTextWidth(lastLine);

  const lineStartX =
    halign === "right"
      ? cell.x + cell.width - cell.padding("right") - lineWidth
      : halign === "center"
        ? cell.x + (cell.width - lineWidth) / 2
        : cell.x + cell.padding("left");
  const centerX = lineStartX - TREND_GAP_MM - TREND_SIZE_MM / 2;
  const centerY = cell.y + cell.height / 2 + ((lines.length - 1) / 2) * lineHeight;
  const half = TREND_SIZE_MM / 2;
  const apexY = trend === "up" ? centerY - half : centerY + half;
  const baseY = trend === "up" ? centerY + half : centerY - half;

  const [red, green, blue] = trend === "up" ? TONE_COLORS.income : TONE_COLORS.expense;
  doc.setFillColor(red, green, blue);
  doc.triangle(centerX - half, baseY, centerX + half, baseY, centerX, apexY, "F");
}
