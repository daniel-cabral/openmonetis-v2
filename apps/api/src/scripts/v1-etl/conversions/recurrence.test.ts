import assert from "node:assert/strict";
import test from "node:test";
import type { V1Transaction } from "../types";
import type { CatalogRefs } from "./catalog";
import { convertRecurrence, type RecurrenceVersion } from "./recurrence";

const refs: CatalogRefs = {
  userId: "U1",
  adminPersonId: "P1",
  personByPayer: new Map([["payer-1", "P1"]]),
  categoryByV1: new Map([["cat-1", "C1"]]),
  childBySubcategory: new Map(),
  accountByV1: new Map([["acc-1", "A1"]]),
  cardByV1: new Map([["card-1", { id: "K1", closingDay: 8, dueDay: 15 }]]),
  tripByV1: new Map(),
  systemCategory: () => "SYS",
};

function row(id: string, date: string, over: Partial<V1Transaction> = {}): V1Transaction {
  return {
    id,
    condicao: "Recorrente",
    nome: "Rent",
    forma_pagamento: "Pix",
    anotacao: null,
    valor: "-100.00",
    data_compra: date,
    tipo_transacao: "Despesa",
    qtde_parcela: null,
    periodo: date.slice(0, 7),
    parcela_atual: null,
    qtde_recorrencia: null,
    data_vencimento: null,
    dt_pagamento_boleto: null,
    realizado: false,
    dividido: false,
    antecipado: false,
    antecipacao_id: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    user_id: "v1-user",
    cartao_id: null,
    conta_id: "acc-1",
    categoria_id: "cat-1",
    pagador_id: "payer-1",
    series_id: "series-1",
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

function version(
  start: string,
  end: string,
  amountCents: number,
  dueDate: string | null = null,
): RecurrenceVersion {
  return {
    anchorDate: start,
    startDate: start,
    endDate: end,
    dueDate,
    amountCents,
    name: "Rent",
    categoryId: "C1",
    isSettled: null,
  };
}

const card = { forma_pagamento: "Cartão de crédito", cartao_id: "card-1", conta_id: null };

const cases: {
  name: string;
  rows: V1Transaction[];
  versions: RecurrenceVersion[];
  recurrenceEndDate: string;
  occurrences: {
    date: string;
    isSettled: true;
    accountId: string | null;
    boletoPaymentDate: string | null;
  }[];
  detached?: string[];
}[] = [
  {
    name: "(a) amount change holding to the end",
    rows: [
      row("a1", "2026-01-15", { realizado: true }),
      row("a2", "2026-02-15", { realizado: true }),
      row("a3", "2026-03-15"),
      row("a4", "2026-04-15", { valor: "-120.00" }),
      row("a5", "2026-05-15", { valor: "-120.00" }),
    ],
    versions: [
      version("2026-01-15", "2026-03-15", 10000),
      version("2026-04-15", "2026-05-15", 12000),
    ],
    recurrenceEndDate: "2026-05-15",
    occurrences: [
      { date: "2026-01-15", isSettled: true, accountId: "A1", boletoPaymentDate: null },
      { date: "2026-02-15", isSettled: true, accountId: "A1", boletoPaymentDate: null },
    ],
  },
  {
    name: "(b) isolated amount and day deviations",
    rows: [
      row("b1", "2026-01-15"),
      row("b2", "2026-02-15", { valor: "-150.00" }),
      row("b3", "2026-03-15"),
      row("b4", "2026-04-10"),
      row("b5", "2026-05-15"),
      row("b6", "2026-06-15"),
    ],
    versions: [
      version("2026-01-15", "2026-01-15", 10000),
      version("2026-02-15", "2026-02-15", 15000),
      version("2026-03-15", "2026-03-15", 10000),
      version("2026-04-10", "2026-04-10", 10000),
      version("2026-05-15", "2026-06-15", 10000),
    ],
    recurrenceEndDate: "2026-06-15",
    occurrences: [],
  },
  {
    name: "(c) two gaps",
    rows: [
      row("c1", "2026-01-15"),
      row("c2", "2026-02-15"),
      row("c4", "2026-04-15"),
      row("c6", "2026-06-15"),
    ],
    versions: [
      version("2026-01-15", "2026-02-15", 10000),
      version("2026-04-15", "2026-04-15", 10000),
      version("2026-06-15", "2026-06-15", 10000),
    ],
    recurrenceEndDate: "2026-06-15",
    occurrences: [],
  },
  {
    name: "(d) zero-amount occurrence becomes a gap",
    rows: [
      row("d1", "2026-01-15"),
      row("d2", "2026-02-15"),
      row("d3", "2026-03-15", { valor: "0.00" }),
      row("d4", "2026-04-15"),
    ],
    versions: [
      version("2026-01-15", "2026-02-15", 10000),
      version("2026-04-15", "2026-04-15", 10000),
    ],
    recurrenceEndDate: "2026-04-15",
    occurrences: [],
  },
  {
    name: "(e) card series on the closing day goes to the next invoice",
    rows: [
      row("e1", "2026-01-08", { ...card, periodo: "2026-02", realizado: true }),
      row("e2", "2026-02-08", { ...card, periodo: "2026-03" }),
      row("e3", "2026-03-08", { ...card, periodo: "2026-04" }),
    ],
    versions: [version("2026-01-08", "2026-03-08", 10000)],
    recurrenceEndDate: "2026-03-08",
    occurrences: [
      { date: "2026-01-08", isSettled: true, accountId: null, boletoPaymentDate: null },
    ],
  },
  {
    name: "(f) boleto deadline is the last due date",
    rows: [
      row("f1", "2026-01-10", {
        forma_pagamento: "Boleto",
        data_vencimento: "2026-01-15",
        realizado: true,
        dt_pagamento_boleto: "2026-01-14",
      }),
      row("f2", "2026-02-10", { forma_pagamento: "Boleto", data_vencimento: "2026-02-15" }),
      row("f3", "2026-03-10", { forma_pagamento: "Boleto", data_vencimento: "2026-03-15" }),
    ],
    versions: [version("2026-01-10", "2026-03-10", 10000, "2026-01-15")],
    recurrenceEndDate: "2026-03-15",
    occurrences: [
      { date: "2026-01-10", isSettled: true, accountId: "A1", boletoPaymentDate: "2026-01-14" },
    ],
  },
  {
    name: "(g) series ending before qtde_recorrencia",
    rows: [
      row("g1", "2026-01-15", { qtde_recorrencia: 12 }),
      row("g2", "2026-02-15", { qtde_recorrencia: 12 }),
      row("g3", "2026-03-15", { qtde_recorrencia: 12 }),
    ],
    versions: [version("2026-01-15", "2026-03-15", 10000)],
    recurrenceEndDate: "2026-03-15",
    occurrences: [],
  },
  {
    name: "(h) two rows in one period detach the farther one",
    rows: [
      row("h1", "2026-01-15"),
      row("h2", "2026-02-15"),
      row("h-extra", "2026-02-20"),
      row("h3", "2026-03-15"),
    ],
    versions: [version("2026-01-15", "2026-03-15", 10000)],
    recurrenceEndDate: "2026-03-15",
    occurrences: [],
    detached: ["h-extra"],
  },
];

test("convertRecurrence turns V1 series into reproducible V2 versions", () => {
  for (const c of cases) {
    const result = convertRecurrence(c.rows, refs, {});
    assert.deepEqual(
      result.series.map(({ versions, recurrenceEndDate, occurrences }) => ({
        versions,
        recurrenceEndDate,
        occurrences,
      })),
      [
        {
          versions: c.versions,
          recurrenceEndDate: c.recurrenceEndDate,
          occurrences: c.occurrences,
        },
      ],
      c.name,
    );
    assert.deepEqual(
      result.findings.filter((f) => f.rule === "recurrence.not-reproducible"),
      [],
      c.name,
    );
    assert.deepEqual(
      result.detached.map((r) => r.id),
      c.detached ?? [],
      c.name,
    );
  }

  const broken = convertRecurrence(
    [row("x1", "2026-01-08", { ...card }), row("x2", "2026-02-08", { ...card })],
    refs,
    {},
  );
  assert.deepEqual(
    broken.findings.map((f) => [f.rule, f.severity, f.v1Id]),
    [["recurrence.not-reproducible", "blocker", "series-1"]],
  );
  assert.deepEqual(broken.series, []);
  assert.deepEqual(
    broken.batches.flatMap((b) => b.rows),
    [],
  );
});
