# Implementation Plan: Fork Leftovers (Settle Announcement, Subcategory Block, People Sharing Check)

**Branch**: `015-fork-leftovers` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-fork-leftovers/spec.md` (clarified; UI options recorded in spec)

## Summary

Three small slices, no migration:

1. **Settle announcement (US1)**: the invoice output gains `creditAmount` (sum of `invoiceCredit`
   movements); a pure domain function turns invoice numbers plus the amount a mode would record into
   the announcement (value, covered, to record, remaining after, nothing to record). The web builds
   the payment allocations with one presentation helper used by both the announcement and the submit,
   so the announced amount is the amount sent. The server keeps recomputing the open balance; an
   allocation above a person's balance now returns a typed `409 invoice_payment_balance_changed`
   (was the generic 400), and the web refetches and shows the refreshed announcement.
2. **Subcategory block (US2)**: `calculateCategoryTrends` attaches `subcategoryBreakdown` to root
   categories that have children, built by a pure domain function over the same integer-cent map
   that produces the page total (so the sum equals the total by construction). The web renders it in
   the `details` slot of `FinancialSummaryHeader`; `subcategory=<uuid>|none` in the URL filters the
   list; `none` uses a new list query option `categoryMatch=exact` that skips family expansion.
3. **People sharing (US3)**: no product change; an integration subtest proves a connection recipient
   gets 404 when mutating owner data and sees only shared items, read-only.

Details: [research.md](research.md), [data-model.md](data-model.md),
[contracts/api-changes.md](contracts/api-changes.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, Zod, TanStack Start/Router/Query/Form,
shadcn/ui. No new dependency.

**Storage**: PostgreSQL, no schema change, no migration (invoice repository select gains `origin`).

**Testing**: `node:test` + `tsx`. Unit: `packages/domain/src/invoices.test.ts` (new),
`packages/domain/src/category-trends.test.ts` (new), `apps/web/src/features/invoices/invoices.presentation.test.ts`
(new). Integration (lane database from the worktree `.env`, run from bash):
`test:financial-integrity:integration` (stale/over-balance refusal, covered invoice),
`test:connections:integration` (recipient isolation), `test:transactions:integration`
(`categoryMatch=exact`).

**Target Platform**: self-hosted web app (Docker)

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: no new query; breakdown is O(categories) over data already loaded

**Constraints**: integer cents in domain; announced == recorded to the cent; no permission level
added to connections; UI copy PT-BR

**Scale/Scope**: 2 domain functions, 3 output/query schema additions, 1 error code, 3 web touch points
(payment dialog, card invoice page action visibility, category page), 1 regression subtest

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Domain functions in `packages/domain/src/invoices.ts` and `category-trends.ts`; services only orchestrate; repository change keeps `userId` filter; web renders and uses `*.presentation.ts`; no barrels |
| II. Upstream-compatible | PASS | Additive fields (`creditAmount`, `subcategoryBreakdown`, `categoryMatch`); one new error code (documented in CHANGELOG `### Fork`). Spec flags settle announcement and block as offerable upstream separately; US3 is a test only |
| III. V1 is reference | PASS | Spec Source section lists kept/changed/dropped (no complement expense, no `permission` column) |
| IV. Financial integrity | PASS | Breakdown and announcement computed from integer cents; server-side balance check kept and typed; no write after rejection asserted in integration tests; no migration |
| V. Behavior-verified | PASS | Domain unit tests for both pure functions; integration tests for refusal without writes and recipient isolation; one web test that announced == sent allocations |

Post-design re-check: PASS (Complexity Tracking empty).

## Upstream overlap check

`git fetch upstream` done; `upstream/main` is at 0.17.1 (`4b00b83`), 9 commits ahead of fork `main`.

- **Invoice payment announcement**: none. No upstream commit or CHANGELOG entry announces the amount
  before paying. `5873935 feat(web)` touches `card-invoices-page.tsx` (36 lines, header/indicators):
  textual merge risk only in the payment action area.
- **Category subcategory breakdown**: none functionally. `5873935` touches
  `category-transactions-page.tsx` (icon classes, `titleAs="h1"`), `category-trends-list.tsx`,
  `category-trends-summary.tsx` and `categories.presentation.ts`; `566906e refactor` touches
  `packages/domain/src/category-trends.ts` (imports `roundToTwoDecimals` from `money`, drops
  nothing we use). Upstream CHANGELOG adds "Categorias mostram o gasto do mês atual" on the
  categories list page, not a per-subcategory block. Merge risk: textual in the same files; resolve
  by keeping both.
- **Person connections permissions**: none. `5873935` restyles `person-connection-panel.tsx` and
  `person-connection-accept-page.tsx`; no permission/read-only concept added upstream.

## Project Structure

### Documentation (this feature)

```text
specs/015-fork-leftovers/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/api-changes.md
└── tasks.md (next step)
```

### Source Code (touched)

```text
packages/domain/src/invoices.ts (+ invoices.test.ts)            # announcement, credits, typed allocation errors
packages/domain/src/category-trends.ts (+ category-trends.test.ts) # subcategory breakdown
packages/validators/src/invoices.ts                               # creditAmount
packages/validators/src/category-trends.ts                        # subcategoryBreakdown
packages/validators/src/transactions.ts                           # categoryMatch
apps/api/src/repositories/invoices.repository.ts                  # select origin
apps/api/src/services/invoices.service.ts                         # creditAmount, 409 mapping
apps/api/src/routes/invoices.ts                                   # 409 response doc
apps/api/src/services/transactions.service.ts                     # skip family expansion when exact
apps/api/src/financial-integrity.integration.test.ts              # stale/over-balance, covered
apps/api/src/person-connections.integration.test.ts               # recipient isolation
apps/api/src/transactions.integration.test.ts                     # categoryMatch=exact
apps/web/src/features/invoices/invoices.presentation.ts (+ test)  # allocations + announcement copy
apps/web/src/features/invoices/components/invoice-payment-dialog.tsx
apps/web/src/features/cards/components/card-invoices-page.tsx     # action visible when covered
apps/web/src/features/categories/components/category-transactions-page.tsx
apps/web/src/features/categories/components/subcategory-breakdown.tsx (new)
apps/web/src/routes/categories_.$categoryId.tsx                   # subcategory search param
apps/web/src/features/transactions/components/transactions-container.tsx, transactions.api.ts
docs/invoice-payments.md (new), docs/category-breakdown.md (new), CHANGELOG.md
```

**Structure Decision**: existing monorepo layout; extend the features `invoices`, `category-trends`,
`categories`, `transactions` in place (AGENTS.md section 4). One new component file
(`subcategory-breakdown.tsx`) under `features/categories/components/`.

## Implementation phases

1. Domain: announcement + credits + typed allocation errors; subcategory breakdown (tests first).
2. Validators + API: `creditAmount`, `subcategoryBreakdown`, `categoryMatch`, 409 mapping; integration tests.
3. Web US1: allocations helper, announcement callout, covered/loading/error/stale states, action visibility.
4. Web US2: search param, breakdown block, list filter.
5. US3 regression subtest; docs, CHANGELOG, previews cleanup, gate.

## Complexity Tracking

None.
