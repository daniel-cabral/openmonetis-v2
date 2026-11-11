import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { Dispatch, SetStateAction } from "react";
import { getCategoryLabel } from "../../categories/categories.presentation";
import type { PreviewRow, ReviewRow } from "./transaction-import-screen.types";

// Credit and invoice-payment lines stay visible but cannot be imported (FR-014); duplicates are already imported.
export function isSelectableImportRow(row: Pick<PreviewRow, "isDuplicate" | "importable">) {
  return !row.isDuplicate && row.importable;
}

export function getCommonRowValue(rows: ReviewRow[], selectValue: (row: ReviewRow) => string) {
  const firstValue = rows[0] ? selectValue(rows[0]) : "";
  return firstValue && rows.every((row) => selectValue(row) === firstValue) ? firstValue : "";
}

export function haveDifferentRowValues(rows: ReviewRow[], selectValue: (row: ReviewRow) => string) {
  return new Set(rows.map(selectValue)).size > 1;
}

export function updateRow(
  setRows: Dispatch<SetStateAction<ReviewRow[]>>,
  index: number,
  update: Partial<ReviewRow>,
) {
  setRows((current) =>
    current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...update } : row)),
  );
}

export function findCategoryByImportedName(
  categories: CategoryOutput[],
  transaction: Pick<PreviewRow, "suggestedCategoryId" | "categoryName" | "type">,
) {
  if (transaction.suggestedCategoryId) return transaction.suggestedCategoryId;
  if (!transaction.categoryName) return "";
  const normalized = normalizeCategoryPath(transaction.categoryName);
  const candidates = categories.filter((category) => category.type === transaction.type);
  const matches = candidates.filter(
    (category) => normalizeCategoryPath(getCategoryLabel(category)) === normalized,
  );
  if (matches.length === 1) return matches[0]?.id ?? "";
  const byName = candidates.filter(
    (category) => normalizeCategoryPath(category.name) === normalized,
  );
  return byName.length === 1 ? (byName[0]?.id ?? "") : "";
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeCategoryPath(value: string) {
  return normalizeText(value).replace(/\s*[›>]\s*/g, ">");
}
