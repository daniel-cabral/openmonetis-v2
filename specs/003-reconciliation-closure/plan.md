# Implementation Plan: Reconciliation Closure

**Branch**: `003-reconciliation-closure` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

## Summary

Extends the 002 `reconciliations` feature. Pure domain closure (`reconciliations-closure.ts`: statement day-balance proof, final balance, invoice net sum, typed-total parser) and projection (`reconciliations-projection.ts`: balance status, account balance and invoice total projections, comparison) computed partly in the API preview (decision-independent inputs) and re-run in the web on every decision through `@openmonetis/domain`. New typed transaction origin `invoiceCredit` (migration `0034`) for invoice credit lines, which now go through matching; credit entries are excluded from income/expense aggregates by adding the origin to the existing denylists. Account statement rows get `isPaidUnreconciled`. UI option A (spec "UI decisions"). The fork skill `auditar-conciliacao` is rewritten for V2.

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19
**Primary Dependencies**: Hono + zod-openapi, Drizzle, TanStack Start/Router/Query/Form, shadcn/ui (Badge, Popover, Tooltip present), lucide-react (all present; no new dependency)
**Storage**: PostgreSQL; `transaction_origin` enum gains `invoiceCredit`; no new table or column
**Testing**: `node:test` via tsx; domain tests next to source; `apps/api/src/reconciliations.integration.test.ts` (`RECONCILIATIONS_INTEGRATION_TEST=1`); web pure helpers tests
**Target Platform**: web client + API
**Project Type**: web application (pnpm monorepo)
**Performance Goals**: preview adds one balance query (account) and O(lines + entries) domain work; projection in the web is O(decisions + entries) per change (~100 entries)
**Constraints**: integer cents in domain; every query filters `userId`; shared upstream files get one-token edits (origin denylists) or additive optional fields
**Scale/Scope**: ~120 lines and ~100 candidates per file; ~30 source files touched

## Constitution Check

| Principle | Status |
|---|---|
| I. AGENTS.md authority | Closure, projection, status, alignability, icon rule and amount parsing in `packages/domain`; service orchestrates (baseline via accounts service, statuses); repository adds columns to selects with `userId` filters; routes unchanged; web calls domain functions, renders, keeps ephemeral decisions and typed total. Feature name `reconciliations` in every layer (new domain files `reconciliations-closure.ts`, `reconciliations-projection.ts`, as 002's `reconciliations-plan.ts`). Pass. |
| II. Upstream-compatible | Fork-only flagged; deliverables = code, migration `0034`, tests, `docs/reconciliations.md` update, `CHANGELOG.md` `### Fork`; the skill lives in `.claude/` (never in PR branches). Upstream touches: one-token origin denylist additions, `canEditTransactionOrigin`, optional `isPaidUnreconciled` output field, `getBalanceThroughDate` wrapper, two selected columns. Pass (see Complexity Tracking). |
| III. V1 reference only | Note prefix replaced by typed origin; V1 client-side projection replaced by domain functions shared by API and web; balance rule is V2's; status uses posting date. Spec table kept/changed/dropped. Pass. |
| IV. Financial integrity | Cents everywhere; credit counted once in the invoice and never as payment; credits survive payment undo and die with batch undo; forward-only migration via `drizzle-kit generate`; ownership unchanged (credits created through the 002 apply checks). Pass. |
| V. Behavior-verified | Ported V1 oracle in domain tests (closure 11, projection 10, status 5, icon 5); integration asserts SC-004/SC-005, re-upload identity, shape lock, statement flag; 002 tests updated only where credit lines leave the informational bucket. Pass. |

Post-design re-check: unchanged, pass.

## Upstream overlap check

- `CHANGELOG.md` `Unreleased`: no upstream entry about invoice credits, estornos on cards or dashboard origin exclusion. The fork entry for 001 ("Linhas de crédito e pagamento de fatura aparecem na revisão como informativas") becomes partially outdated; the 003 bullet states that credits are now creatable in the reconciliation (import review stays informational: the 001 import path is unchanged). `main..upstream/main` is empty at planning time.
- Dashboard code (`packages/domain/src/dashboard.ts`, `apps/api/src/services/dashboard.service.ts`): origin exclusions are inline per function; no shared helper upstream. 003 adds `invoiceCredit` next to `invoicePayment` in each (one token per site). `dashboard.service.ts:489` (`invoiceAdjustment` as non-transfer) is unrelated.
- Invoice code (`invoices.repository.ts`, `invoices.service.ts`, `packages/domain/src/invoices.ts`): totals sum every card movement of the period (credits lower it, per person clamped at 0); payments live in `invoice_payments`; payment undo (`deletePayment`) and `reopenInvoice` delete only the payment's `transaction_id`; positive `invoiceAdjustment` already reduces expenses via `isExpenseReduction` and is a different concept (manual adjustment, blocked after payments). No code change in invoices.
- "Compromissos futuros" (`packages/domain/src/commitments.ts` `calculateCommitments`, `apps/api/src/repositories/commitments.repository.ts` `listSingleEntriesForUser`): origin allowlist `regular | refund | invoiceAdjustment`, so `invoiceCredit` is excluded with no change; the card's future invoice in commitments comes from invoices, which include the credit (desired: it lowers what is due).
- Account balance (`accounts.repository.ts` `listSettledAccountPostingsThroughPeriod`): only settled account entries; credits are card entries with `is_settled null`, never counted.
- Collision risk: `packages/domain/src/transactions.ts` origin list and `packages/db/src/schema.ts` enum are shared with upstream; additions are at the end of the lists; migration stays at the tail (`0034`), regenerated at merge if upstream adds one.

## Aggregate exclusion list (FR-007, SC-004)

Add `invoiceCredit` exactly where `invoicePayment` is already excluded (same expression style, one more `||` / `&&` term):

| # | File | Function | Feeds |
|---|---|---|---|
| 1 | `packages/domain/src/dashboard.ts` | `contributesToProjected` | dashboard projected balance |
| 2 | `packages/domain/src/dashboard.ts` | `calculatePeriod` | dashboard income, expenses, balance, history charts, AI context metrics |
| 3 | `packages/domain/src/dashboard.ts` | `hasPeriodData` | dashboard metric availability |
| 4 | `packages/domain/src/dashboard.ts` | `calculateDashboardPaymentStatus` | confirmed/pending income and expenses |
| 5 | `packages/domain/src/dashboard.ts` | `calculateDashboardExpenseDistribution` | expense distribution |
| 6 | `packages/domain/src/dashboard.ts` | `calculateDashboardPeopleExpenses` | people widget |
| 7 | `packages/domain/src/dashboard.ts` | `groupCategoryBreakdown` | category breakdown (income and expense categories) |
| 8 | `packages/domain/src/budgets.ts` | `calculateBudgetSpending` | budgets |
| 9 | `packages/domain/src/category-trends.ts` | `calculateCategoryTrends` | category trends report |
| 10 | `packages/domain/src/people.ts` | `isExcludedFromPersonExpenses` | person totals |
| 11 | `packages/domain/src/tags.ts` | `summarizeTags` | tag totals |
| 12 | `packages/domain/src/transactions.ts` | `isNeutralTransactionSelectionItem` | selection sums in the transactions list |
| 13 | `apps/api/src/repositories/financial-distribution.repository.ts` | `financialDistributionRepository.listActualEntriesForUser` (SQL `ne(transactions.origin, "invoiceCredit")` in the `where`) | financial distribution report (domain has no origin check) |

Already excluded by allowlists (no change, verified): `apps/api/src/repositories/commitments.repository.ts` `listSingleEntriesForUser` (Compromissos futuros); `packages/domain/src/establishments-report.ts` (origin `regular`); `packages/domain/src/person-reports.ts` `isPersonReportEntry`; `packages/domain/src/trips.ts` (regular/refund); `packages/domain/src/bills.ts` (regular); `apps/api/src/repositories/person-settlements.repository.ts` (regular expense, refund, invoiceAdjustment); `transactions.repository.ts` name suggestions and bulk edits (`regular`). AI insights read the dashboard metrics (items 1-7). Invoice settlement payment sums use `invoice_payments` rows (credits never there): no change.

Allowlists that must include it: `packages/domain/src/transactions.ts` `canDeleteTransactionOrigin` (add) and new `canEditTransactionOrigin`.

## Design

### Domain (`packages/domain/src`)

| File | Responsibility |
|---|---|
| `reconciliations-closure.ts` (new) | `checkStatementClosure`, `statementFinalBalance`, `invoiceNetCents`, `checkInvoiceClosure`, `parseAmountInputToCents` (signatures in tasks.md "Fixed interfaces"). |
| `reconciliations-projection.ts` (new) | `toBalanceStatus`, `projectAccountBalance`, `projectInvoiceTotal`, `compareProjection`. |
| `reconciliations.ts` | `AmountKeptReason`, `amountKeptReason` (extracted; `resolveAmountAlignment` uses it), `isInformationalLine` limited to `invoice-payment`, `isPaidButUnreconciled`. |
| `reconciliations-plan.ts` | creation `origin` (`invoiceCredit` for card credit lines). |
| `transactions.ts` | `invoiceCredit` in `transactionOrigins`; `canDeleteTransactionOrigin` + new `canEditTransactionOrigin`; item 12. |
| `dashboard.ts`, `budgets.ts`, `category-trends.ts`, `people.ts`, `tags.ts` | items 1-11. |

### API

- `packages/db/src/schema.ts` enum + `packages/db/drizzle/0034_*.sql` (+ meta) via `pnpm db:generate`.
- `packages/validators/src/reconciliations.ts`: preview `lines[].signedCents`, `closure`, `projection` (contract); `packages/validators/src/transactions.ts`: optional `isPaidUnreconciled` in `TransactionOutputSchema`.
- `apps/api/src/repositories/reconciliations.repository.ts`: `personIsAdmin`, `settledDate` in candidate rows; `settledDate` in occurrence rows; creation insert uses `creation.origin`.
- `apps/api/src/services/reconciliations.service.ts`: closure lines from CSV rows; closure (statement or invoice); projection base (baseline via new dependency `getAccountBalanceThroughDate`, statuses, alignability); `signedCents` on lines.
- `apps/api/src/services/accounts.service.ts`: `getBalanceThroughDate(id, userId, date)`; wired in `apps/api/src/app.ts`.
- `apps/api/src/repositories/transactions.repository.ts`: `findFirstReconciledDateForAccount`; `importExternalId` in `listRecurringOccurrencesForUser` and `listSettledRecurringBoletoOccurrencesByPaymentDateForUser` selects.
- `apps/api/src/services/transactions.service.ts`: `isPaidUnreconciled` in the account-statement branch of `listTransactions`; `updateTransaction` guard via `canEditTransactionOrigin` and the credit shape lock.
- `apps/api/src/repositories/financial-distribution.repository.ts`: item 13.

### Web

- `apps/web/src/features/reconciliations/components/reconciliation-review.ts`: `projectionEffects`, `buildProjectionView`, `buildClosureView` (call domain).
- `apps/web/src/features/reconciliations/reconciliations.presentation.ts`: PT-BR copy and cents formatting for the panel, bar, paid-after-end list; informational title "Pagamento da fatura anterior"; credit meta "Crédito da fatura".
- `useReconciliationReview.ts`: `invoiceTotalText` state (not reset by origin changes after preview; reset on new file).
- Components: `reconciliation-origin-step.tsx` (total input), `reconciliation-summary.tsx` (closure panel), `reconciliation-apply-bar.tsx` (projection line + paid-after-end Popover), `reconciliation-buckets.tsx` (credit meta suffix, informational title), `reconciliation-screen.tsx` (wiring).
- Statement icon: `apps/web/src/features/transactions/components/transaction-row-description.tsx` and `transactions-mobile-list.tsx`.
- Origin label and editability: `transactions.presentation.ts` (`transactionOriginLabels`), `transaction-details-sheet.tsx`, `transaction-row.tsx` (`canEditTransactionOrigin`).

### Fork tooling (not product)

- `.claude/skills/auditar-conciliacao/SKILL.md` rewritten for V2; `confronto.py` adapted to the V2 transactions CSV export (`GET /transactions/export`) or dropped if the export lacks the needed columns.

## Project Structure

### Documentation (this feature)

```text
specs/003-reconciliation-closure/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/reconciliation-closure-api.md
└── tasks.md
```

### Source Code

```text
packages/db/src/schema.ts, packages/db/drizzle/0034_*.sql (+ meta)
packages/domain/src/{reconciliations-closure,reconciliations-projection}.ts (+ .test.ts)
packages/domain/src/{reconciliations,reconciliations-plan,transactions,dashboard,budgets,category-trends,people,tags}.ts (+ touched tests)
packages/validators/src/{reconciliations,transactions}.ts
apps/api/src/{app.ts, reconciliations.integration.test.ts}
apps/api/src/services/{reconciliations,accounts,transactions}.service.ts
apps/api/src/repositories/{reconciliations,transactions,financial-distribution}.repository.ts
apps/web/src/features/reconciliations/**
apps/web/src/features/transactions/{transactions.presentation.ts, components/transaction-row-description.tsx, components/transactions-mobile-list.tsx, components/transaction-details-sheet.tsx, components/transaction-row.tsx}
docs/reconciliations.md, CHANGELOG.md
.claude/skills/auditar-conciliacao/** (fork-only)
```

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| One-token origin additions in 12 upstream domain functions + 1 SQL | Credits must be neutral in every report (SC-004) and V2 has no shared exclusion helper | A shared helper refactors upstream code beyond the feature; a note prefix is forbidden by the inventory |
| Optional `isPaidUnreconciled` on the shared transaction output | The statement is the generic transactions list | A separate endpoint plus prop drilling through five list components touches more upstream code |
| `canEditTransactionOrigin` + shape lock in `updateTransaction` | FR-007 editable credits without turning them into expenses | Allowing all edits lets a neutral entry become an uncounted expense |
