# Research: Cross-Card Usage Report

## R1. What counts as usage

- **Decision**: own share (admin person row or admin split row, `effectiveSplitAmountSql` /
  `effectiveTransactionAmountSql`, same SQL as `establishments-report.repository.ts`) of card rows,
  valued with `calculateExpenseImpact` from `packages/domain/src/transactions.ts`; skip
  `transfer`, `invoicePayment`, `invoiceCredit`, `accountBalanceAdjustment`, `personSettlement`
  and the system invoice-payment category (same skip list as category trends plus
  `personSettlement`). Card month total floored at 0.
- **Rationale**: one existing rule for "expense impact" (budgets, category trends, dashboard);
  refunds net as on the card's spending flow; V1 counted only the admin person.
- **Alternatives**: invoice amount from `calculateCardInvoiceSummary` (rejected: includes other
  people's shares, contradicts spec assumption); `isEstablishmentPurchase` (rejected: ignores
  refunds, which the card flow nets).

## R2. Period attribution and recurrence

- **Decision**: stored `transactions.period`; recurring card rules expanded with
  `listRuleOccurrences(rule, startPeriod, endPeriod)` from `category-trends.ts`, keeping
  occurrences with `purchaseDate <= today` (Brasília, `getCurrentDateInBrazil`) and `status ===
  "active"`.
- **Rationale**: same attribution as every V2 report; the today cut is the V1 rule stated in FR-003.
- **Alternatives**: `expandRecurringInvoiceMovements` in `cards.service.ts` (rejected: module-private,
  whole-bill amounts, no split share).

## R3. Invoice states

- **Decision**: new `cardsService.listInvoiceTimeline(cardId, userId, periods)` returning
  `{ period, status, amount, hasRecord }[]` built with the same `calculateCardInvoiceSummary`
  inputs as `summarizeCards` (extracted into a module helper, behavior-neutral); domain
  `resolveCardUsageInvoiceState({ status, amount, hasRecord })` maps to
  `paid | pending | overdue | none`.
- **Rationale**: invoice dates, due-date rules and payments must equal the card page; no second
  implementation of invoice summary orchestration.
- **Alternatives**: calling `cardsService.get` 12 times (rejected: 12× the queries); duplicating
  the orchestration in the report service (rejected: duplication of invoice inputs).

## R4. One endpoint vs two

- **Decision**: one `GET /reports/card-usage?period&cardId` returning overview + detail of the
  resolved card.
- **Rationale**: the default card depends on the overview ordering; one round trip meets SC-004;
  same shape as other reports (one request per render).
- **Alternatives**: separate detail endpoint (rejected: double request on first load).

## R5. Ordering, ties and fallback

- **Decision**: usage desc, then `localeCompare(name, "pt-BR")`, then id; default = first card;
  requested `cardId` used only if it is in the active list, else default; no cards → `selectedCardId`
  null and `detail` null.
- **Rationale**: deterministic, no existence leak (FR-013).

## R6. UI

- **Decision**: option A preview (see spec "UI decisions"); chart built like
  `card-invoice-history-chart.tsx` (recharts `BarChart` in `ChartContainer`) plus `ReferenceLine`
  at the limit (already used in `card-spending-flow.tsx`).
