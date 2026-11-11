import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import { findCategoryByImportedName, isSelectableImportRow } from "./transaction-import-review";

test("import selection leaves out duplicates and lines that are not importable", () => {
  assert.equal(isSelectableImportRow({ isDuplicate: false, importable: true }), true);
  assert.equal(isSelectableImportRow({ isDuplicate: true, importable: true }), false);
  assert.equal(isSelectableImportRow({ isDuplicate: false, importable: false }), false);
});

test("import matches full category paths and leaves duplicate leaf names for review", () => {
  const root: CategoryOutput = {
    id: "home",
    name: "Casa",
    icon: null,
    type: "expense",
    isSystem: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const categories = [
    root,
    { ...root, id: "home-light", name: "Luz", parentId: "home", parentName: "Casa" },
    { ...root, id: "travel-light", name: "Luz", parentId: "travel", parentName: "Viagem" },
  ];
  const transaction = {
    type: "expense" as const,
    categoryName: "Casa > Luz",
    suggestedCategoryId: null,
  };
  assert.equal(findCategoryByImportedName(categories, transaction), "home-light");
  assert.equal(
    findCategoryByImportedName(categories, { ...transaction, categoryName: "Viagem › Luz" }),
    "travel-light",
  );
  assert.equal(findCategoryByImportedName(categories, { ...transaction, categoryName: "Luz" }), "");
  assert.equal(
    findCategoryByImportedName(categories, { ...transaction, categoryName: "Casa" }),
    "home",
  );
});
