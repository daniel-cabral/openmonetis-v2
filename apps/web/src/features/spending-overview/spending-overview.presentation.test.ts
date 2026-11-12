import assert from "node:assert/strict";
import test from "node:test";
import { formatEstablishmentPurchases } from "./spending-overview.presentation";

test("establishment summary pluralises the purchase count", () => {
  assert.equal(formatEstablishmentPurchases(1), "1 lançamento · total acumulado");
  assert.equal(formatEstablishmentPurchases(4), "4 lançamentos · total acumulado");
});
