import assert from "node:assert/strict";
import test from "node:test";
import { resolveTransactionColumnOrder } from "./preferences";

test("transaction column order keeps saved known ids first, drops unknown and duplicate ids, appends missing ids in default order and removes note unless enabled", () => {
  const defaultWithoutNote = ["name", "amount", "condition", "paymentMethod", "account"];
  const defaultWithNote = ["name", "amount", "condition", "paymentMethod", "note", "account"];
  const cases = [
    [null, { noteAsColumn: false }, defaultWithoutNote],
    [null, { noteAsColumn: true }, defaultWithNote],
    [
      ["amount", "type", "amount", "category", "name"],
      { noteAsColumn: false },
      ["amount", "name", "condition", "paymentMethod", "account"],
    ],
    [
      ["account", "note"],
      { noteAsColumn: true },
      ["account", "note", "name", "amount", "condition", "paymentMethod"],
    ],
    [[], { noteAsColumn: false }, defaultWithoutNote],
  ] as const;

  for (const [saved, options, expected] of cases) {
    assert.deepEqual(resolveTransactionColumnOrder(saved, options), expected);
  }
});
