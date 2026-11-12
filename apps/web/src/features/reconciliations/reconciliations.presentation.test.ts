import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInvoiceClosureSummary,
  formatKeptAmountReason,
  formatPaidAfterEndItem,
  formatPaidAfterEndSummary,
  formatProjectionBadge,
  formatProjectionLine,
  formatStatementClosureSummary,
  formatSuspicionReason,
} from "./reconciliations.presentation";

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
      expected:
        "Lançamento gerado automaticamente (ex.: pagamento de fatura): o valor do app é mantido.",
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

// Intl's pt-BR currency puts a no-break space after "R$".
const brl = (text: string) => text.replaceAll("R$ ", "R$ ");

test("projection and closure copy states the balances and the divergences in PT-BR", () => {
  const accountLine = (target: { date: string; cents: number } | null) =>
    formatProjectionLine({
      kind: "account",
      projectedCents: 111844,
      target,
      comparison: null,
      paidAfterEnd: [],
    });
  const cardLine = (targetCents: number | null) =>
    formatProjectionLine({
      kind: "card",
      projectedCents: 16500,
      targetCents,
      comparison: null,
    });

  assert.deepEqual(formatProjectionBadge({ differenceCents: 0, matches: true }), {
    tone: "success",
    label: "Bate",
  });
  assert.deepEqual(formatProjectionBadge({ differenceCents: 27500, matches: false }), {
    tone: "warning",
    label: brl("Diferença de R$ 275,00"),
  });
  assert.equal(
    accountLine({ date: "2026-11-11", cents: 84344 }),
    brl("Saldo do app após aplicar: R$ 1.118,44 · Saldo final do extrato (11/11): R$ 843,44"),
  );
  assert.equal(
    accountLine(null),
    brl("Saldo do app após aplicar: R$ 1.118,44 · Saldo final do extrato indisponível"),
  );
  assert.equal(
    cardLine(16500),
    brl("Total da fatura no app após aplicar: R$ 165,00 · Total informado: R$ 165,00"),
  );
  assert.equal(
    cardLine(null),
    brl("Total da fatura no app após aplicar: R$ 165,00 · Informe o total da fatura para comparar"),
  );
  assert.equal(formatPaidAfterEndSummary(1), "1 lançamento(s) pago(s) depois do fim do arquivo");
  assert.deepEqual(
    formatPaidAfterEndItem({
      entryKey: "t:mensalidade",
      name: "Mensalidade Colégio Santo Agostinho",
      date: "2026-11-22",
      signedCents: -164300,
    }),
    {
      label: "Mensalidade Colégio Santo Agostinho (22/11)",
      amount: brl("-R$ 1.643,00"),
    },
  );
  assert.deepEqual(
    formatStatementClosureSummary({
      kind: "statement",
      closure: {
        kind: "statement",
        closes: true,
        days: [],
        unverifiedDays: ["2026-07-06"],
        divergences: [],
        finalBalance: null,
      },
    }),
    {
      tone: "success",
      badge: "Fecha",
      text: "Todos os dias contábeis batem com o saldo do extrato.",
      divergences: [],
      unverified: "1 dia(s) não verificável(is): 06/07",
    },
  );
  assert.deepEqual(
    formatStatementClosureSummary({
      kind: "statement",
      closure: {
        kind: "statement",
        closes: false,
        days: [],
        unverifiedDays: [],
        divergences: [
          {
            day: "2026-07-07",
            balanceCents: 0,
            previousBalanceCents: 0,
            movementCents: -32000,
            sumCents: -33000,
            differenceCents: 1000,
            closes: false,
          },
        ],
        finalBalance: null,
      },
    }),
    {
      tone: "destructive",
      badge: "Não fecha",
      text: "1 dia(s) com divergência.",
      divergences: [
        brl("07/07: movimento -R$ 320,00 · soma das linhas -R$ 330,00 · diferença de R$ 10,00"),
      ],
      unverified: null,
    },
  );
  assert.deepEqual(
    formatInvoiceClosureSummary({
      closes: true,
      netCents: 1216410,
      expectedCents: 1216410,
      differenceCents: 0,
    }),
    {
      tone: "success",
      badge: "Fecha",
      text: brl("Soma do arquivo: R$ 12.164,10 · Total informado: R$ 12.164,10"),
    },
  );
  assert.deepEqual(
    formatInvoiceClosureSummary({
      closes: false,
      netCents: 1293633,
      expectedCents: 1300000,
      differenceCents: 6367,
    }),
    {
      tone: "destructive",
      badge: "Não fecha",
      text: brl(
        "Soma do arquivo: R$ 12.936,33 · Total informado: R$ 13.000,00 · diferença de R$ 63,67",
      ),
    },
  );
});
