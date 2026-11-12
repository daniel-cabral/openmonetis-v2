import { useCallback, useEffect, useState } from "react";
import {
  addCategoryToHistory,
  parseCategoryHistorySelection,
  pruneCategoryHistory,
} from "./category-trends.presentation";

const categoryHistoryStorageKey = "openmonetis.dashboard.category-history";

function readStoredSelection(): string[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(categoryHistoryStorageKey) ?? "[]");
    return parseCategoryHistorySelection(stored);
  } catch {
    return [];
  }
}

function writeStoredSelection(selectedIds: readonly string[]) {
  try {
    sessionStorage.setItem(categoryHistoryStorageKey, JSON.stringify(selectedIds));
  } catch {
    // Storage can be unavailable in private contexts; the selection still works until reload.
  }
}

/** Category ids chosen for the history widget, kept for the browser session only. */
export function useCategoryHistorySelection() {
  const [selectedIds, setSelectedIds] = useState(readStoredSelection);

  useEffect(() => {
    writeStoredSelection(selectedIds);
  }, [selectedIds]);

  const add = useCallback((categoryId: string) => {
    setSelectedIds((current) => addCategoryToHistory(current, categoryId));
  }, []);

  const remove = useCallback((categoryId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== categoryId));
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);

  const prune = useCallback((availableIds: readonly string[]) => {
    setSelectedIds((current) => pruneCategoryHistory(current, availableIds));
  }, []);

  return { selectedIds, add, remove, clear, prune };
}
