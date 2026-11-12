import assert from "node:assert/strict";
import test from "node:test";
import { formatKeptAmountReason, formatSuspicionReason } from "./reconciliations.presentation";

test("suspicion reasons state the dates and amounts in the review copy", () => {
  const cases = [
    {
      suspicion: {
        reason: "before-file-start" as const,
        entryDate: "2026-10-11",
        fileStartDate: "2026-10-12",
      },
      entryName: "Terapia - Fernanda",
      expected:
        "Casou com “Terapia - Fernanda” de 11/10, antes do início do arquivo (12/10). O débito desse lançamento pode ter sido outro.",
    },
    {
      suspicion: {
        reason: "amount-divergence" as const,
        appAmount: 1643,
        fileAmount: 1560.85,
      },
      entryName: "Mensalidade Colégio Santo Agostinho",
      expected:
        "Valor diferente: o lançamento “Mensalidade Colégio Santo Agostinho” tem R$ 1.643,00. Manter alinha o valor ao do arquivo.",
    },
  ];

  for (const { suspicion, entryName, expected } of cases) {
    assert.equal(formatSuspicionReason(suspicion, entryName), expected);
  }
});

test("kept amount reasons explain why the app value stays", () => {
  const cases = [
    {
      reason: "splits" as const,
      expected: "Lançamento dividido entre pessoas: o valor do app é mantido.",
    },
    {
      reason: "transfer" as const,
      expected: "Transferência entre contas: o valor do app é mantido.",
    },
    {
      reason: "generated" as const,
      expected: "Lançamento de recorrência: o valor do app é mantido.",
    },
    {
      reason: "paid-invoice" as const,
      expected: "Fatura já paga: o valor do app é mantido.",
    },
    {
      reason: "card-recurring" as const,
      expected: "Recorrência de cartão: o valor do app é mantido.",
    },
  ];

  for (const { reason, expected } of cases) {
    assert.equal(formatKeptAmountReason(reason), expected);
  }
});
