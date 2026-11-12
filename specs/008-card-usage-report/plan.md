# Implementation Plan: Cross-Card Usage Report

**Branch**: `008-card-usage-report` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-card-usage-report/spec.md` (clarified, UI option A chosen)

## Summary

A new read-only report `card-usage-report` compares the user's active credit cards for one month
and drills into one card. All rules (own-share usage with the existing expense-impact rule,
recurring occurrences up to today, percentages, tones, trend, ordering, default selection, 12-month
series, categories, top expenses, invoice state mapping) are pure functions in
`packages/domain/src/card-usage-report.ts`. The repository returns raw rows (active cards, card
transaction rows with the admin share, recurring card rules) and the service orchestrates. Invoice
states reuse the V2 invoice summary through a small port implemented by the cards service
(`listInvoiceTimeline`), so invoice dates, due-date rules and payments stay identical to the card
page. One endpoint `GET /reports/card-usage` returns overview and detail; the web page renders it
at `/reports/card-usage` with `period` and `card` search params. No schema change. Details:
[research.md](research.md), [data-model.md](data-model.md),
[contracts/card-usage-report-api.md](contracts/card-usage-report-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+, workspace `tsconfig`), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle ORM, Zod, TanStack Start/Router/Query,
shadcn/ui (`card`, `progress`, `badge`, `chart`, `skeleton` already installed), recharts, lucide-react

**Storage**: PostgreSQL, no migration (reads `cards`, `transactions`, `transaction_splits`,
`people`, `categories`, `recurring_transaction_rules`, `recurring_transaction_splits`,
`recurring_transaction_occurrences`, `invoices`, `invoice_payments`)

**Testing**: `node:test` + `tsx`; domain unit tests (`card-usage-report.test.ts`) for thresholds,
trend boundaries, limit 0, no previous usage, recurring-up-to-today, ordering and default
selection; web presentation unit test for search resolution and invoice labels; API integration
suite `test:card-usage-report:integration` against the lane A database

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: one request per render (SC-001 < 2 s, SC-004 < 1 s); rows for 12 months of
card activity are hundreds to a few thousand per user, aggregated in memory

**Constraints**: integer cents; every query filters `userId`; no new dependency; no dev server on
default ports (lane A uses 7101-7103)

**Scale/Scope**: 1 new report endpoint, 1 new cards-service method (internal port, no endpoint),
1 new web route, nav entry, docs page

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Feature shape `card-usage-report` across route/service/repository/domain/validators/web; rules only in domain; service depends on repository and invoice port types (DIP); no barrels |
| II. Upstream-compatible | PASS | Self-contained report plus one behavior-neutral extraction in `cards.service.ts`; `docs/card-usage-report.md` + CHANGELOG `Unreleased` (`### Fork`) |
| III. V1 is reference | PASS | Spec "V1 disposition" lists kept/changed/dropped; V2 typed origins and own share replace V1 admin-only/name filters; invoice states from V2 summary |
| IV. Financial integrity | PASS | Cents in domain; reuses `calculateExpenseImpact`, `listRuleOccurrences`, `calculateCardInvoiceSummary`; every query filters `userId`; card id resolved only among the user's active cards; no schema change |
| V. Behavior-verified | PASS | Domain boundary tests; integration test asserts sums (SC-002), exclusions, invoice states, isolation and fallback |

Post-design re-check: PASS (no violations; Complexity Tracking empty).

## Upstream overlap check

Fetched `upstream/main` (`4b00b83`, 0.17.1): 9 commits beyond fork `main`. None adds a card usage
report (CHANGELOG 0.17.0/0.17.1: installment simulations, unified indicators, rounding helpers,
AI diagnosis speed-up). Overlapping files this feature touches:

- `apps/api/src/services/cards.service.ts`: upstream rewrites the tail of `summarizeCards` (cycle
  comparison, `compareCardCycleSpending`). This feature extracts the `summarizeInvoice` closure
  above that block into a module-level helper and adds `listInvoiceTimeline` at the end of the
  returned object. Expect a small textual conflict at the next upstream merge; resolve by keeping
  upstream's cycle code and calling the extracted helper.
- `apps/web/src/components/navigation/nav-items.tsx` (+10/-10 upstream): one added entry; trivial.
- `packages/domain/src/category-trends.ts` (upstream centralizes rounding): read-only reuse of
  `listRuleOccurrences`; no edit here.
- `apps/web/src/components/ui/progress.tsx` (upstream changes): consumed as-is, no edit.

No feature-level overlap; no upstream code is needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-card-usage-report/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/card-usage-report-api.md
├── previews/                 # UI previews (app.css ignored)
└── tasks.md                  # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
├── card-usage-report.ts              # NEW: usage, percentages, tone, trend, ordering, detail, invoice state
└── card-usage-report.test.ts         # NEW
packages/domain/package.json          # + export
packages/validators/src/card-usage-report.ts   # NEW: query + output schemas
packages/validators/package.json      # + export
apps/api/src/
├── routes/card-usage-report.ts                # NEW: GET /reports/card-usage
├── services/card-usage-report.service.ts      # NEW
├── repositories/card-usage-report.repository.ts # NEW
├── services/cards.service.ts                  # extract invoice summarizer + listInvoiceTimeline
├── app.ts                                     # wire + mount
└── card-usage-report.integration.test.ts      # NEW
apps/web/src/
├── routes/reports/card-usage.tsx              # NEW
├── features/card-usage-report/{card-usage-report.api.ts,.queries.ts,.presentation.ts,.presentation.test.ts}
├── features/card-usage-report/components/{card-usage-report-page.tsx,card-usage-summary.tsx,card-usage-list.tsx,card-usage-history-chart.tsx,card-usage-invoices.tsx,card-usage-categories.tsx,card-usage-top-expenses.tsx}
└── components/navigation/nav-items.tsx        # + "Uso de cartões"
docs/card-usage-report.md                      # NEW contract doc
docs/testing.md                                # + integration suite
CHANGELOG.md                                   # Unreleased ### Fork entry
package.json                                   # + test:card-usage-report:integration
```

**Structure Decision**: standard AGENTS.md feature shape with feature name `card-usage-report`
(no `*.mutations.ts`: read-only report). Web search params: `period`, `card`.

## Complexity Tracking

None.
