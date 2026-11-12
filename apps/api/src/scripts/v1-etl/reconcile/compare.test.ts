import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExpectedDifference,
  ExtractedUser,
  UserPlan,
  V1Figure,
  V1Transaction,
  V2Figure,
} from "../types";
import { buildExpectedDifferences, compareUser } from "./compare";

function tx(id: string, over: Partial<V1Transaction> = {}): V1Transaction {
  return {
    id,
    condicao: "À vista",
    nome: "Groceries",
    forma_pagamento: "Pix",
    anotacao: null,
    valor: "-10.00",
    data_compra: "2026-07-05",
    tipo_transacao: "Despesa",
    qtde_parcela: null,
    periodo: "2026-07",
    parcela_atual: null,
    qtde_recorrencia: null,
    data_vencimento: null,
    dt_pagamento_boleto: null,
    realizado: true,
    dividido: false,
    antecipado: false,
    antecipacao_id: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    user_id: "v1-user",
    cartao_id: null,
    conta_id: "acc-1",
    categoria_id: null,
    pagador_id: "payer-admin",
    series_id: null,
    split_group_id: null,
    transfer_id: null,
    ofx_fit_id: null,
    import_batch_id: null,
    ofx_import_fingerprint: null,
    viagem_id: null,
    subcategoria_id: null,
    ...over,
  };
}

const extracted = {
  user: { id: "v1-user" },
  payers: [{ id: "payer-admin", role: "admin" }],
  transactions: [
    tx("t-zero", { condicao: "Recorrente", valor: "0.00", series_id: "s-1" }),
    tx("t-split-a", { split_group_id: "g-1", dividido: true }),
    tx("t-split-b", { split_group_id: "g-1", dividido: true, pagador_id: "payer-other" }),
    tx("t-period", { periodo: "2026-03", data_compra: "2026-02-20" }),
    tx("t-boleto", {
      forma_pagamento: "Boleto",
      valor: "-123.45",
      periodo: "2026-08",
      data_compra: "2026-08-01",
      data_vencimento: "2026-08-30",
      dt_pagamento_boleto: "2026-09-02",
    }),
  ],
} as unknown as ExtractedUser;

const plan = {
  informational: [],
  counts: [
    {
      v1Table: "lancamentos",
      read: 6,
      written: 3,
      merged: 0,
      skipped: [{ reason: "zero-recurrence-skip", rows: 1 }],
      collapsed: [{ reason: "split-group", rows: 2, into: 1 }],
      detached: [{ reason: "recurrence-duplicate", rows: 1 }],
      droppedColumns: [],
    },
  ],
} as unknown as UserPlan;

test("buildExpectedDifferences lists every expected difference and keeps detached duplicates informational", () => {
  const result = buildExpectedDifferences(extracted, plan, {
    dumpFingerprint: "fp",
    resolutions: { "transaction.period-date-mismatch:lancamentos:t-period": "use-period" },
  });

  assert.deepEqual(result, {
    expected: [
      { reason: "zero-recurrence-skip", kind: "transactionCount", count: 1 },
      { reason: "split-group", kind: "transactionCount", count: 1 },
      {
        reason: "period-date-resolved",
        kind: "transactionCount",
        rows: [{ v1Id: "t-period", resolution: "use-period", period: "2026-03" }],
      },
      {
        reason: "boleto-posting-month",
        kind: "accountBalance",
        rows: [
          {
            v1Id: "t-boleto",
            period: "2026-08",
            paymentMonth: "2026-09",
            amount: "-123.45",
            differenceVsRawV1: { periodEnd: "2026-08", value: "123.45" },
          },
        ],
      },
    ],
    informational: [{ reason: "recurrence-duplicate-detached", rows: 1 }],
  });
});

const boletoExpected: ExpectedDifference = {
  reason: "boleto-posting-month",
  kind: "accountBalance",
  rows: [
    {
      v1Id: "t-boleto",
      period: "2026-08",
      paymentMonth: "2026-09",
      amount: "-123.45",
      differenceVsRawV1: { periodEnd: "2026-08", value: "123.45" },
    },
  ],
};

function balances(aug: [number, number, number], sep: [number, number, number]) {
  const v1: V1Figure[] = [
    {
      kind: "accountBalance",
      key: { account: "A", periodEnd: "2026-08" },
      value: aug[0],
      valueWithV2Posting: aug[1],
    },
    {
      kind: "accountBalance",
      key: { account: "A", periodEnd: "2026-09" },
      value: sep[0],
      valueWithV2Posting: sep[1],
    },
  ];
  const v2: V2Figure[] = [
    { kind: "accountBalance", key: { account: "A", periodEnd: "2026-08" }, value: aug[2] },
    { kind: "accountBalance", key: { account: "A", periodEnd: "2026-09" }, value: sep[2] },
  ];
  return { v1, v2 };
}

const invoiceV1: V1Figure = {
  kind: "invoiceTotal",
  key: { card: "K", period: "2026-07" },
  value: 5000,
  status: "paid",
  paidAt: "2026-07-10",
};
const countV1: V1Figure = {
  kind: "transactionCount",
  key: { period: "2026-07", type: "expense" },
  value: 4,
};
const equal = balances([10000, 10000, 10000], [20000, 20000, 20000]);

const cases: {
  name: string;
  v1: V1Figure[];
  v2: V2Figure[];
  expected: ExpectedDifference[];
  pass: boolean;
  failing: unknown[];
}[] = [
  {
    name: "all equal",
    v1: [...equal.v1, invoiceV1, countV1],
    v2: [...equal.v2, { ...invoiceV1 }, { ...countV1 }],
    expected: [],
    pass: true,
    failing: [],
  },
  {
    name: "invoice total off by 0.01",
    v1: [...equal.v1, invoiceV1, countV1],
    v2: [...equal.v2, { ...invoiceV1, value: 5001 }, { ...countV1 }],
    expected: [],
    pass: false,
    failing: [
      {
        kind: "invoiceTotal",
        key: { card: "K", period: "2026-07" },
        v1: "50.00",
        v2: "50.01",
        difference: "0.01",
      },
    ],
  },
  {
    name: "boleto paid next month, equal at the last month",
    ...balances([10000, 22345, 22345], [20000, 20000, 20000]),
    expected: [boletoExpected],
    pass: true,
    failing: [],
  },
  {
    name: "boleto paid next month, last month also different",
    ...balances([10000, 22345, 22345], [20000, 32345, 32345]),
    expected: [boletoExpected],
    pass: false,
    failing: [
      {
        kind: "accountBalance",
        key: { account: "A", periodEnd: "2026-09" },
        v1: "200.00",
        v2: "323.45",
        difference: "123.45",
      },
    ],
  },
  {
    name: "count difference without an expected difference",
    v1: [countV1],
    v2: [{ ...countV1, value: 3 }],
    expected: [],
    pass: false,
    failing: [
      {
        kind: "transactionCount",
        key: { period: "2026-07", type: "expense" },
        v1: 4,
        v2: 3,
        difference: -1,
      },
    ],
  },
];

test("compareUser passes only figures that match or are explained by expected differences", () => {
  for (const c of cases) {
    const result = compareUser("v1-user", c.v1, c.v2, [], [], c.expected);
    assert.equal(result.pass, c.pass, c.name);
    assert.deepEqual(result.expectedDifferences, c.expected, c.name);
    assert.deepEqual(
      result.figures
        .filter((figure) => !figure.pass)
        .map(({ kind, key, v1, v2, difference }) => ({ kind, key, v1, v2, difference })),
      c.failing,
      c.name,
    );
  }
});
