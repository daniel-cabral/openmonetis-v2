import assert from "node:assert/strict";
import { test } from "node:test";
import type { V1Transaction } from "../types";
import type { CatalogRefs } from "./catalog";
import { buildInvoicePayment, type Marker, parseMarker } from "./markers";

const refs: CatalogRefs = {
  userId: "00000000-0000-4000-8000-000000000001",
  adminPersonId: "00000000-0000-4000-8000-000000000002",
  personByPayer: new Map([["v1-payer-admin", "00000000-0000-4000-8000-000000000002"]]),
  categoryByV1: new Map(),
  childBySubcategory: new Map(),
  accountByV1: new Map([["v1-account", "00000000-0000-4000-8000-000000000003"]]),
  cardByV1: new Map([
    ["v1-card", { id: "00000000-0000-4000-8000-000000000004", closingDay: 8, dueDay: 15 }],
  ]),
  tripByV1: new Map(),
  systemCategory: (name, type) =>
    name === "Pagamentos" && type === "expense"
      ? "00000000-0000-4000-8000-000000000005"
      : "unexpected",
};

function paymentRow(id: string, note: string, valor: string): V1Transaction {
  return {
    id,
    condicao: "À vista",
    nome: "Pagamento fatura",
    forma_pagamento: "Pix",
    anotacao: note,
    valor,
    data_compra: "2025-03-12",
    tipo_transacao: "Despesa",
    qtde_parcela: null,
    periodo: "2025-03",
    parcela_atual: null,
    qtde_recorrencia: null,
    data_vencimento: null,
    dt_pagamento_boleto: null,
    realizado: true,
    dividido: false,
    antecipado: false,
    antecipacao_id: null,
    created_at: new Date("2025-03-12T10:00:00.000Z"),
    user_id: "v1-user",
    cartao_id: null,
    conta_id: "v1-account",
    categoria_id: "v1-category",
    pagador_id: "v1-payer-admin",
    series_id: null,
    split_group_id: null,
    transfer_id: null,
    ofx_fit_id: null,
    import_batch_id: null,
    ofx_import_fingerprint: null,
    viagem_id: null,
    subcategoria_id: null,
  };
}

function expectedPayment(
  ids: { tx: string; payment: string; allocation: string },
  v1Id: string,
  amount: string,
) {
  return {
    batches: [
      {
        table: "transactions",
        rows: [
          {
            id: ids.tx,
            userId: refs.userId,
            personId: "00000000-0000-4000-8000-000000000002",
            type: "expense",
            origin: "invoicePayment",
            condition: "single",
            paymentMethod: "pix",
            name: "Pagamento fatura",
            amount: `-${amount}`,
            purchaseDate: new Date("2025-03-12T00:00:00.000Z"),
            period: "2025-03",
            accountId: "00000000-0000-4000-8000-000000000003",
            cardId: null,
            categoryId: "00000000-0000-4000-8000-000000000005",
            sourceAccountId: null,
            destinationAccountId: null,
            dueDate: null,
            boletoPaymentDate: null,
            installmentCount: null,
            currentInstallment: null,
            seriesId: null,
            transferId: null,
            recurringRuleId: null,
            isSettled: true,
            note: null,
            createdAt: new Date("2025-03-12T10:00:00.000Z"),
          },
        ],
      },
      {
        table: "invoicePayments",
        rows: [
          {
            id: ids.payment,
            userId: refs.userId,
            cardId: "00000000-0000-4000-8000-000000000004",
            period: "2025-02",
            accountId: "00000000-0000-4000-8000-000000000003",
            transactionId: ids.tx,
            amount,
            paidAt: new Date("2025-03-12T00:00:00.000Z"),
            createdAt: new Date("2025-03-12T10:00:00.000Z"),
          },
        ],
      },
      {
        table: "invoicePaymentAllocations",
        rows: [
          {
            id: ids.allocation,
            userId: refs.userId,
            paymentId: ids.payment,
            personId: "00000000-0000-4000-8000-000000000002",
            amount,
            createdAt: new Date("2025-03-12T10:00:00.000Z"),
          },
        ],
      },
    ],
    idMap: [
      {
        v1Table: "lancamentos",
        v1Id,
        role: "",
        v2Table: "transactions",
        v2Id: ids.tx,
        v1UserId: "v1-user",
      },
      {
        v1Table: "lancamentos",
        v1Id,
        role: "payment",
        v2Table: "invoicePayments",
        v2Id: ids.payment,
        v1UserId: "v1-user",
      },
      {
        v1Table: "lancamentos",
        v1Id,
        role: "allocation",
        v2Table: "invoicePaymentAllocations",
        v2Id: ids.allocation,
        v1UserId: "v1-user",
      },
    ],
  };
}

test("parseMarker recognises V1 markers and buildInvoicePayment builds the V2 payment records", () => {
  const cases: Array<
    | { note: string; marker: Marker | null; payment?: undefined }
    | {
        note: string;
        marker: Marker | null;
        payment: ReturnType<typeof expectedPayment>;
        v1Id: string;
        valor: string;
      }
  > = [
    {
      note: "AUTO_FATURA:v1-card:2025-02",
      marker: { kind: "invoicePayment", cardId: "v1-card", period: "2025-02", partialId: null },
      payment: expectedPayment(
        {
          tx: "ebacb076-0e87-5ccf-a9fe-a7e6020af73c",
          payment: "e851e68f-7946-5887-881e-efc7d88af1aa",
          allocation: "1d60287a-0076-5971-b222-f2382f4ef56f",
        },
        "v1-tx-full",
        "1250.40",
      ),
      v1Id: "v1-tx-full",
      valor: "-1250.40",
    },
    {
      note: "AUTO_FATURA:v1-card:2025-02:v1-partial-1",
      marker: {
        kind: "invoicePayment",
        cardId: "v1-card",
        period: "2025-02",
        partialId: "v1-partial-1",
      },
      payment: expectedPayment(
        {
          tx: "525b033c-dec7-5935-9ca8-f3ddececc02a",
          payment: "a1ab1630-5f8f-5d48-b55b-a3c66634b582",
          allocation: "c4eef7e0-58f5-52c3-beb4-01467afd680d",
        },
        "v1-tx-partial",
        "300.00",
      ),
      v1Id: "v1-tx-partial",
      valor: "-300.00",
    },
    {
      note: 'AUTO_FATURA:CREDITO:v1-card:2025-04:["fp-a","fp-b"]',
      marker: { kind: "invoiceCredit", cardId: "v1-card", period: "2025-04" },
    },
    { note: "AUTO_REEMBOLSO:v1-source-tx", marker: { kind: "refund", sourceId: "v1-source-tx" } },
    { note: "dinner with friends", marker: null },
  ];

  for (const c of cases) {
    const marker = parseMarker(c.note);
    assert.deepEqual<Marker | null>(marker, c.marker, c.note);
    if (c.payment && marker?.kind === "invoicePayment") {
      assert.deepEqual(
        buildInvoicePayment(paymentRow(c.v1Id, c.note, c.valor), marker, refs),
        c.payment,
        c.note,
      );
    }
  }
});
