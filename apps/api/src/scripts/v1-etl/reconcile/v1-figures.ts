import type { PoolClient } from "pg";
import { convertCatalog } from "../conversions/catalog";
import { v2Id } from "../ids";
import type { FigureKey, Resolutions, V1Figure, V1Index } from "../types";
import { extractUser } from "../v1-source";

// V1 semantics ported from openmonetis V1: src/features/accounts/queries.ts (balance),
// src/features/invoices/queries.ts (invoice total, status, payment date) and
// src/features/dashboard/lib/transaction-filters.ts (category totals).
const PERIOD_DATE_RULE = "transaction.period-date-mismatch";
const TRANSACTIONS_TABLE = "lancamentos";
const INVOICE_PAID_STATUS = "pago";

// Effective period of each V1 row: `use-date` moves the row to its purchase month, every other row
// (including `use-period`) keeps `periodo`.
const TX_CTE = `
  tx AS (
    SELECT l.id, l.valor, l.conta_id, l.cartao_id, l.pagador_id, l.categoria_id, l.anotacao,
           l.realizado, l.transfer_id, l.tipo_transacao, l.forma_pagamento, l.dt_pagamento_boleto,
           CASE WHEN l.id = ANY($2::uuid[]) THEN to_char(l.data_compra, 'YYYY-MM') ELSE l.periodo END
             AS period
      FROM public.lancamentos l
     WHERE l.user_id = $1
  )`;

// Balance at each month end, twice: V1 posting (`periodo`) and V2 posting (a boleto posts in the
// month of `dt_pagamento_boleto`, deriveTransactionPostingPeriod).
const BALANCE_SQL = `
  WITH ${TX_CTE},
  bounds AS (SELECT min(periodo) AS lo, max(periodo) AS hi FROM public.lancamentos WHERE user_id = $1),
  months AS (
    SELECT to_char(m, 'YYYY-MM') AS period
      FROM bounds, generate_series(to_date(lo, 'YYYY-MM'), to_date(hi, 'YYYY-MM'), interval '1 month') m
  ),
  moves AS (
    SELECT conta_id, valor, period,
           CASE WHEN forma_pagamento = 'Boleto' AND dt_pagamento_boleto IS NOT NULL
                THEN to_char(dt_pagamento_boleto, 'YYYY-MM') ELSE period END AS posting
      FROM tx
     WHERE realizado IS TRUE AND pagador_id = $3 AND conta_id IS NOT NULL
       AND anotacao IS DISTINCT FROM 'saldo inicial'
  )
  SELECT c.id::text AS account, m.period,
         round((c.saldo_inicial + coalesce(sum(mv.valor) FILTER (WHERE mv.period <= m.period), 0)) * 100)::bigint::text AS v1,
         round((c.saldo_inicial + coalesce(sum(mv.valor) FILTER (WHERE mv.posting <= m.period), 0)) * 100)::bigint::text AS v1_v2_posting
    FROM public.contas c
    CROSS JOIN months m
    LEFT JOIN moves mv ON mv.conta_id = c.id
   WHERE c.user_id = $1
   GROUP BY c.id, c.saldo_inicial, m.period
   ORDER BY c.id, m.period`;

// Invoice total = payable amount (V2 sign: the negated sum of the card rows of the period, all
// payers); paid date = latest
// `AUTO_FATURA:<card>:<period>[:<partial>]` row, only for a paid invoice.
const INVOICE_SQL = `
  WITH keys AS (
    SELECT cartao_id, periodo FROM public.lancamentos WHERE user_id = $1 AND cartao_id IS NOT NULL
    UNION
    SELECT cartao_id, periodo FROM public.faturas
     WHERE user_id = $1 AND cartao_id IS NOT NULL AND periodo IS NOT NULL
  )
  SELECT k.cartao_id::text AS card, k.periodo AS period,
         (SELECT round(-coalesce(sum(l.valor), 0) * 100)::bigint::text
            FROM public.lancamentos l
           WHERE l.user_id = $1 AND l.cartao_id = k.cartao_id AND l.periodo = k.periodo) AS total,
         (SELECT f.status_pagamento
            FROM public.faturas f
           WHERE f.user_id = $1 AND f.cartao_id = k.cartao_id AND f.periodo = k.periodo
           ORDER BY f.created_at, f.id
           LIMIT 1) AS status,
         (SELECT to_char(max(l.data_compra), 'YYYY-MM-DD')
            FROM public.lancamentos l
           WHERE l.user_id = $1
             AND starts_with(l.anotacao, 'AUTO_FATURA:' || k.cartao_id::text || ':' || k.periodo)) AS paid_at
    FROM keys k
   ORDER BY 1, 2`;

// Dashboard category totals: admin payer, no invoice auto-payment rows, expense rows on expense
// categories and income rows on income categories; the "saldo inicial" income row is left out when
// its account sets `excluir_saldo_inicial_receitas`. Subcategories roll up into `categoria_id`.
// V2 sign: expense categories report the spent amount (negated sum), income categories the sum.
const CATEGORY_SQL = `
  WITH ${TX_CTE}
  SELECT tx.categoria_id::text AS category, tx.period, cat.tipo AS category_type,
         round(CASE WHEN cat.tipo = 'despesa' THEN -sum(tx.valor) ELSE sum(tx.valor) END * 100)::bigint::text AS total
    FROM tx
    JOIN public.categorias cat ON cat.id = tx.categoria_id
    LEFT JOIN public.contas c ON c.id = tx.conta_id
   WHERE tx.pagador_id = $3
     AND (tx.anotacao IS NULL OR NOT starts_with(tx.anotacao, 'AUTO_FATURA:'))
     AND (
       (tx.tipo_transacao = 'Despesa' AND cat.tipo = 'despesa')
       OR (tx.tipo_transacao = 'Receita' AND cat.tipo = 'receita'
           AND (tx.anotacao IS DISTINCT FROM 'saldo inicial' OR c.excluir_saldo_inicial_receitas IS NOT TRUE))
     )
   GROUP BY tx.categoria_id, tx.period, cat.tipo
   ORDER BY 1, 2, 3`;

// Person expense impact, as the V2 person summary reads the loaded rows: transfers, invoice
// payments and credits (`AUTO_FATURA:`) and the excluded "saldo inicial" row do not count; a refund
// (`AUTO_REEMBOLSO:`) reduces it; any other negative row adds its magnitude, positive rows add 0.
const PERSON_SQL = `
  WITH ${TX_CTE}
  SELECT tx.pagador_id::text AS payer, tx.period,
         round(sum(CASE WHEN starts_with(tx.anotacao, 'AUTO_REEMBOLSO:') THEN -abs(tx.valor)
                        WHEN tx.valor < 0 THEN -tx.valor
                        ELSE 0 END) * 100)::bigint::text AS total
    FROM tx
    LEFT JOIN public.contas c ON c.id = tx.conta_id
   WHERE tx.transfer_id IS NULL
     AND (tx.anotacao IS NULL OR NOT starts_with(tx.anotacao, 'AUTO_FATURA:'))
     AND (tx.anotacao IS DISTINCT FROM 'saldo inicial' OR c.excluir_saldo_inicial_receitas IS NOT TRUE)
   GROUP BY tx.pagador_id, tx.period
   ORDER BY 1, 2`;

// Count type as V2 stores it: transfer pairs are `transfer`, other rows follow the amount sign;
// a zero amount (skipped by the load) keeps the V1 type.
const COUNT_SQL = `
  WITH ${TX_CTE}
  SELECT period,
         CASE WHEN transfer_id IS NOT NULL THEN 'transfer'
              WHEN valor < 0 THEN 'expense'
              WHEN valor > 0 THEN 'income'
              WHEN tipo_transacao = 'Receita' THEN 'income'
              ELSE 'expense' END AS type,
         count(*)::int AS rows
    FROM tx
   GROUP BY 1, 2
   ORDER BY 1, 2`;

const EMPTY_INDEX: V1Index = { users: [], emailByUser: new Map(), ownerOf: new Map() };

function useDateRows(r: Resolutions | null): string[] {
  const prefix = `${PERIOD_DATE_RULE}:${TRANSACTIONS_TABLE}:`;
  return Object.entries(r?.resolutions ?? {})
    .filter(([key, value]) => key.startsWith(prefix) && value === "use-date")
    .map(([key]) => key.slice(prefix.length));
}

function addTo(totals: Map<string, { key: FigureKey; cents: number }>, key: FigureKey, cents: number) {
  const id = JSON.stringify(key);
  const current = totals.get(id);
  if (current) current.cents += cents;
  else totals.set(id, { key, cents });
}

export async function computeV1Figures(
  c: PoolClient,
  v1UserId: string,
  r: Resolutions | null,
): Promise<V1Figure[]> {
  // Same id mapping as the load: categories may merge into V2 defaults, people follow the admin rule.
  const x = await extractUser(c, v1UserId, EMPTY_INDEX);
  const { refs } = convertCatalog(x, r?.resolutions ?? {});
  const adminPayerId =
    x.payers.find((payer) => v2Id("pagadores", payer.id) === refs.adminPersonId)?.id ?? null;
  const txParams = [v1UserId, useDateRows(r)];
  const params = [...txParams, adminPayerId];
  const figures: V1Figure[] = [];

  const balances = await c.query<{ account: string; period: string; v1: string; v1_v2_posting: string }>(
    BALANCE_SQL,
    params,
  );
  for (const row of balances.rows) {
    figures.push({
      kind: "accountBalance",
      key: { account: v2Id("contas", row.account), periodEnd: row.period },
      value: Number(row.v1),
      valueWithV2Posting: Number(row.v1_v2_posting),
    });
  }

  const invoices = await c.query<{ card: string; period: string; total: string; status: string | null; paid_at: string | null }>(
    INVOICE_SQL,
    [v1UserId],
  );
  for (const row of invoices.rows) {
    const paid = row.status === INVOICE_PAID_STATUS;
    figures.push({
      kind: "invoiceTotal",
      key: { card: v2Id("cartoes", row.card), period: row.period },
      value: Number(row.total),
      status: paid ? "paid" : "pending",
      paidAt: paid ? row.paid_at : null,
    });
  }

  const categoryTotals = new Map<string, { key: FigureKey; cents: number }>();
  const categories = await c.query<{ category: string; period: string; category_type: string; total: string }>(
    CATEGORY_SQL,
    params,
  );
  for (const row of categories.rows) {
    const rootCategory = refs.categoryByV1.get(row.category);
    if (rootCategory === undefined) throw new Error("v1-etl: unmapped category");
    const type = row.category_type === "despesa" ? "expense" : "income";
    addTo(categoryTotals, { period: row.period, rootCategory, type }, Number(row.total));
  }
  for (const { key, cents } of categoryTotals.values()) {
    figures.push({ kind: "categoryTotal", key, value: cents });
  }

  const personTotals = new Map<string, { key: FigureKey; cents: number }>();
  const people = await c.query<{ payer: string | null; period: string; total: string }>(PERSON_SQL, txParams);
  for (const row of people.rows) {
    const person = row.payer === null ? refs.adminPersonId : v2Id("pagadores", row.payer);
    addTo(personTotals, { person, period: row.period }, Number(row.total));
  }
  // V2 clamps a period's expenses at 0 and lists only positive periods.
  for (const { key, cents } of personTotals.values()) {
    if (cents > 0) figures.push({ kind: "personTotal", key, value: cents });
  }

  const counts = await c.query<{ period: string; type: string; rows: number }>(COUNT_SQL, txParams);
  for (const row of counts.rows) {
    figures.push({ kind: "transactionCount", key: { period: row.period, type: row.type }, value: row.rows });
  }

  return figures;
}
