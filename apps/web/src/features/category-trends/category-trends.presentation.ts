import type { CategoryTrendType } from "@openmonetis/domain/category-trends";
import { addMonthsToPeriod } from "@openmonetis/domain/transactions";
import { getCurrentPeriodInBrazil, periodToSafeInstant } from "@openmonetis/shared/date-time";
import type { CategoryTrendsOutput } from "@openmonetis/validators/category-trends";
import { csvCell } from "../../lib/csv";
import type { ExportBranding } from "../../lib/export-branding";
import { formatCurrency } from "../../lib/money-presentation";
import type { BrandedPdfTable } from "../../lib/pdf-export";
import { formatPeriod } from "../../lib/period-presentation";
import type { XlsxCell, XlsxColumn } from "../../lib/xlsx-export";
import { getCategoryLabel } from "../categories/categories.presentation";

type CategoryTrendsSearch = {
  period?: string;
  startPeriod?: string;
  endPeriod?: string;
  categoryIds?: string;
  trip?: string;
};

const categoryTrendsPeriodOffset = 6;
const periodPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCategoryTrendsSearch(
  search: Record<string, unknown>,
): CategoryTrendsSearch {
  const categoryIds = normalizeCategoryIds(search.categoryIds);

  return {
    period: validPeriod(search.period),
    startPeriod: validPeriod(search.startPeriod),
    endPeriod: validPeriod(search.endPeriod),
    categoryIds: categoryIds.length ? categoryIds.join(",") : undefined,
    trip: validTrip(search.trip),
  };
}

export function resolveCategoryTrendsSearch(search: CategoryTrendsSearch) {
  const categoryIds = normalizeCategoryIds(search.categoryIds);
  const trip = validTrip(search.trip);
  const endPeriod = search.endPeriod ?? search.period;

  if (search.startPeriod && endPeriod) {
    const start = new Date(periodToSafeInstant(search.startPeriod));
    const end = new Date(periodToSafeInstant(endPeriod));
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth() +
      1;
    if (months >= 1 && months <= 24) {
      return { startPeriod: search.startPeriod, endPeriod, categoryIds, trip };
    }
  }

  if (endPeriod) {
    return { ...getCategoryTrendsPeriodRange("end", endPeriod), categoryIds, trip };
  }

  if (search.startPeriod) {
    return { ...getCategoryTrendsPeriodRange("start", search.startPeriod), categoryIds, trip };
  }

  return {
    ...getCategoryTrendsPeriodRange("end", getCurrentPeriodInBrazil()),
    categoryIds,
    trip,
  };
}

export function getCategoryTrendsPeriodRange(anchor: "start" | "end", period: string) {
  return anchor === "start"
    ? { startPeriod: period, endPeriod: addMonthsToPeriod(period, categoryTrendsPeriodOffset) }
    : { startPeriod: addMonthsToPeriod(period, -categoryTrendsPeriodOffset), endPeriod: period };
}

export const categoryHistoryMaxSelection = 5;

export function categoryHistoryWindow(period: string) {
  return {
    startPeriod: addMonthsToPeriod(period, -8),
    endPeriod: addMonthsToPeriod(period, 1),
  };
}

export type CategoryHistoryRow = Record<string, number | string> & { period: string };

/** One row per response period; a selected category missing a month counts as 0. */
export function buildCategoryHistorySeries(
  trends: CategoryTrendsOutput,
  selectedIds: readonly string[],
): CategoryHistoryRow[] {
  const nodes = trends.categories.flatMap((category) => [
    category,
    ...(category.subcategories ?? []),
  ]);

  return trends.periods.map(({ period }) => {
    const row: CategoryHistoryRow = { period };
    for (const categoryId of selectedIds) {
      const node = nodes.find((candidate) => candidate.categoryId === categoryId);
      row[categoryId] = node?.values.find((value) => value.period === period)?.totalAmount ?? 0;
    }
    return row;
  });
}

/** Keeps the stored selection to valid string ids, capped at the widget limit. */
export function parseCategoryHistorySelection(stored: unknown): string[] {
  return Array.isArray(stored)
    ? stored
        .filter((id): id is string => typeof id === "string")
        .slice(0, categoryHistoryMaxSelection)
    : [];
}

/** Appends a category unless it is already selected or the selection is full. */
export function addCategoryToHistory(selectedIds: string[], categoryId: string): string[] {
  return selectedIds.includes(categoryId) || selectedIds.length >= categoryHistoryMaxSelection
    ? selectedIds
    : [...selectedIds, categoryId];
}

/** Drops ids that are no longer in the catalog; returns the same array when nothing changes. */
export function pruneCategoryHistory(selectedIds: string[], availableIds: readonly string[]) {
  const next = selectedIds.filter((id) => availableIds.includes(id));
  return next.length === selectedIds.length ? selectedIds : next;
}

export function formatTrendPercentage(value: number | null, kind: string) {
  if (kind === "started") return "Novo";
  if (value === null) return "Sem base";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function getCategoryTrendWidgetItems(
  categories: CategoryTrendsOutput["categories"],
  period: string,
  limit?: number,
) {
  const items = categories
    .filter((category) => category.type === "expense")
    .flatMap((category) => {
      const value = category.values.find((entry) => entry.period === period);
      return value && value.previousAmount > 0 && value.changePercentage !== null
        ? [{ category, value }]
        : [];
    })
    .sort(
      (left, right) =>
        Math.abs(right.value.changeAmount) - Math.abs(left.value.changeAmount) ||
        Math.abs(right.value.changePercentage ?? 0) - Math.abs(left.value.changePercentage ?? 0) ||
        left.category.name.localeCompare(right.category.name, "pt-BR"),
    );

  return limit === undefined ? items : items.slice(0, limit);
}

export function getCategoryTrendsSummary(report: CategoryTrendsOutput) {
  const latestPeriod = report.periods.at(-1)?.period;
  const sumByType = (type: "expense" | "income") =>
    report.categories
      .filter((category) => category.type === type)
      .reduce((total, category) => total + category.totalAmount, 0);

  return {
    expenseAmount: sumByType("expense"),
    incomeAmount: sumByType("income"),
    latestPeriod,
    biggestIncrease: latestPeriod
      ? (getCategoryTrendWidgetItems(report.categories, latestPeriod).find(
          ({ value }) => value.changeKind === "increase",
        ) ?? null)
      : null,
  };
}

/** One row per category and month, ready for a PT-BR spreadsheet. */
export function categoryTrendsCsv(report: CategoryTrendsOutput) {
  const rows = [
    ["Tipo", "Categoria", "Período", "Registrado", "Recorrente", "Total", "Variação"],
    ...report.categories.flatMap((category) =>
      category.values.map((value) => [
        category.type === "expense" ? "Despesa" : "Receita",
        getCategoryLabel(category),
        value.period,
        formatCsvNumber(value.actualAmount),
        formatCsvNumber(value.recurringAmount),
        formatCsvNumber(value.totalAmount),
        value.changePercentage === null ? "" : String(value.changePercentage).replace(".", ","),
      ]),
    ),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
}

export function downloadCategoryTrendsCsv(report: CategoryTrendsOutput) {
  const blob = new Blob([categoryTrendsCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tendencias-${report.periods[0]?.period ?? "inicio"}-${report.periods.at(-1)?.period ?? "fim"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type CategoryTrendValue = CategoryTrendsOutput["categories"][number]["values"][number];

type CategoryTrendsExportCell = {
  amount: number;
  variation: string | null;
  trend: "up" | "down" | null;
};

type CategoryTrendsExportRow = {
  label: string;
  type: CategoryTrendType;
  emphasis: boolean;
  cells: CategoryTrendsExportCell[];
  total: number;
};

type CategoryTrendsExportTable = {
  periodLabel: string;
  columns: string[];
  rows: CategoryTrendsExportRow[];
};

const categoryTrendsBrlNumFmt = '"R$" #,##0.00';

/**
 * Top-level categories per type, each type closed by its "Total Geral" row. Amounts, totals and
 * variations come from the response; nothing is summed on the client.
 */
export function buildCategoryTrendsExportTable(
  report: CategoryTrendsOutput,
): CategoryTrendsExportTable {
  const columns = [
    "Categoria",
    ...report.periods.map(({ period }) => formatPeriod(period, true)),
    "Total",
  ];
  const rows = (["expense", "income"] as const).flatMap((type) => {
    const categories = report.categories.filter((category) => category.type === type);
    if (categories.length === 0) return [];

    const isExpense = type === "expense";
    const categoryRows = categories.map((category) => ({
      label: category.name,
      type,
      emphasis: false,
      cells: report.periods.map(({ period }, index) =>
        toCategoryTrendsExportCell(
          category.values.find((value) => value.period === period),
          index === 0,
        ),
      ),
      total: category.totalAmount,
    }));
    const totalRow: CategoryTrendsExportRow = {
      label: isExpense ? "Total Geral - Despesas" : "Total Geral - Receitas",
      type,
      emphasis: true,
      cells: report.periods.map((period) => ({
        amount: isExpense ? period.expenseAmount : period.incomeAmount,
        variation: null,
        trend: null,
      })),
      total: isExpense ? report.summary.expenseAmount : report.summary.incomeAmount,
    };
    return [...categoryRows, totalRow];
  });

  return { periodLabel: getCategoryTrendsExportPeriodLabel(report), columns, rows };
}

export function getCategoryTrendsExportPeriodLabel(report: CategoryTrendsOutput) {
  const months = report.periods.map(({ period }) => formatPeriod(period).replace(" de ", " "));
  return `${months[0]} - ${months.at(-1)}`;
}

export function getCategoryTrendsExportFileName(
  report: CategoryTrendsOutput,
  extension: "pdf" | "xlsx",
) {
  const start = report.periods[0]?.period ?? "inicio";
  const end = report.periods.at(-1)?.period ?? "fim";
  return `relatorio-categorias-${start}-${end}.${extension}`;
}

/** One sheet: amounts stay numeric, each month also carries its variation text with an arrow. */
export function toCategoryTrendsXlsxSheet(table: CategoryTrendsExportTable): {
  sheetName: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
} {
  const months = table.columns.slice(1, -1);
  return {
    sheetName: "Relatório de Categorias",
    columns: [
      { header: "Categoria", width: 30 },
      { header: "Tipo", width: 12 },
      ...months.flatMap((month) => [
        { header: month, width: 14, numFmt: categoryTrendsBrlNumFmt },
        { header: `${month} var.`, width: 16 },
      ]),
      { header: "Total", width: 14, numFmt: categoryTrendsBrlNumFmt },
    ],
    rows: table.rows.map((row) => [
      row.label,
      row.type === "expense" ? "Despesa" : "Receita",
      ...row.cells.flatMap((cell) => [cell.amount, toXlsxVariation(cell)]),
      row.total,
    ]),
  };
}

/** Amount line plus variation line; the trend triangle is drawn by the PDF builder. */
export function toCategoryTrendsPdfTable(
  table: CategoryTrendsExportTable,
  branding: ExportBranding,
  generatedAt: string,
): BrandedPdfTable {
  return {
    title: "Relatório de Categorias por Período",
    periodLabel: table.periodLabel,
    generatedAt,
    branding,
    columns: table.columns.map((header, index) => ({
      header,
      align: index === 0 ? "left" : "right",
    })),
    rows: table.rows.map((row) => ({
      emphasis: row.emphasis,
      cells: [
        { text: row.label },
        ...row.cells.map((cell) => toCategoryTrendsPdfCell(cell, row.type)),
        { text: formatCurrency(row.total), tone: row.type },
      ],
    })),
  };
}

function toCategoryTrendsExportCell(
  value: CategoryTrendValue | undefined,
  isFirstPeriod: boolean,
): CategoryTrendsExportCell {
  const amount = value?.totalAmount ?? 0;
  if (!value || isFirstPeriod) return { amount, variation: null, trend: null };
  return {
    amount,
    variation: formatTrendPercentage(value.changePercentage, value.changeKind),
    trend: toTrendDirection(value),
  };
}

/** "Novo" and "Sem base" have no direction, so they get no arrow. */
function toTrendDirection({ changeAmount, changePercentage, changeKind }: CategoryTrendValue) {
  if (changePercentage === null || changeKind === "started" || changeAmount === 0) return null;
  return changeAmount > 0 ? "up" : "down";
}

function toXlsxVariation({ variation, trend }: CategoryTrendsExportCell) {
  if (variation === null || trend === null) return variation;
  return `${trend === "up" ? "↑" : "↓"} ${variation.replace(/^[+-]/, "")}`;
}

function toCategoryTrendsPdfCell(cell: CategoryTrendsExportCell, tone: CategoryTrendType) {
  const amount = formatCurrency(cell.amount);
  return {
    text: cell.variation === null ? amount : `${amount}\n${cell.variation}`,
    tone,
    trend: cell.trend,
  };
}

function validPeriod(value: unknown) {
  return typeof value === "string" && periodPattern.test(value) ? value : undefined;
}

function validTrip(value: unknown) {
  return typeof value === "string" && (value === "none" || uuidPattern.test(value))
    ? value
    : undefined;
}

function normalizeCategoryIds(value: unknown) {
  if (typeof value !== "string") return [];
  const ids = [...new Set(value.split(",").filter((item) => uuidPattern.test(item)))];
  return ids.slice(0, 100);
}

function formatCsvNumber(value: number) {
  return value.toFixed(2).replace(".", ",");
}
