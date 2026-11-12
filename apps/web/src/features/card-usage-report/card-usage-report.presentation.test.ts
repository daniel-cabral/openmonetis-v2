import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import {
  cardUsageInvoiceStateLabel,
  formatCardUsageTrend,
  formatUncategorized,
  resolveCardUsageReportSearch,
} from "./card-usage-report.presentation";

const cardId = "10000000-0000-4000-8000-000000000001";

test("report search keeps valid values and falls back to the current period and no card", async (t) => {
  const cases = [
    {
      name: "empty search",
      input: {},
      expected: { period: getCurrentPeriodInBrazil(), card: undefined },
    },
    {
      name: "invalid period and malformed card",
      input: { period: "2026-13", card: "x" },
      expected: { period: getCurrentPeriodInBrazil(), card: undefined },
    },
    {
      name: "valid period and card id",
      input: { period: "2026-06", card: cardId },
      expected: { period: "2026-06", card: cardId },
    },
  ];

  for (const { name, input, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(resolveCardUsageReportSearch(input), expected);
    });
  }
});

test("usage labels read in PT-BR for trend, invoice state and uncategorized purchases", () => {
  assert.deepEqual(formatCardUsageTrend("up", 20), { label: "Alta", value: "+20%" });
  assert.deepEqual(formatCardUsageTrend("down", -21.27), { label: "Queda", value: "-21,27%" });
  assert.deepEqual(formatCardUsageTrend("stable", 0), { label: "Estável", value: "0%" });
  assert.equal(cardUsageInvoiceStateLabel.paid, "Pago");
  assert.equal(cardUsageInvoiceStateLabel.pending, "Pendente");
  assert.equal(cardUsageInvoiceStateLabel.overdue, "Atrasado");
  assert.equal(cardUsageInvoiceStateLabel.none, "–");
  assert.equal(formatUncategorized(null), "Sem categoria");
});
