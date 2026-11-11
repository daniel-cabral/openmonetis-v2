# Implementation Plan: Reconciliation Core

**Branch**: `002-reconciliation-core` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

## Summary

New `reconciliations` feature on top of the 001 import pipeline: a pure domain matcher (five ordered rules, one-to-one consumption, iterate until stable, suspicions, buckets, amount alignment) and apply planner in `packages/domain`; a server-side preview that re-uses the 001 parsing and row identity; an atomic apply that creates entries, stamps identities, aligns amounts through the effective-amount field, settles pending account entries through the existing settlement repository, records ignores, name pairings and category memory, and stores a server-side undo journal keyed by the batch id; a sibling web route `/transactions/reconciliation` (UI option A). One migration (`0032`).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19
**Primary Dependencies**: Hono + zod-openapi, Drizzle, TanStack Start/Router/Query/Form, shadcn/ui, sonner (all present; no new dependency)
**Storage**: PostgreSQL; new `reconciliation_ignores`, `import_name_mappings`, `reconciliation_batches`; identity columns on `recurring_transaction_occurrences`; reuses `transactions.import_*`, `import_category_mappings`, `settlement_events`
**Testing**: `node:test` via tsx; domain tests next to source; `apps/api/src/reconciliations.integration.test.ts` (`RECONCILIATIONS_INTEGRATION_TEST=1`, dedicated DB per docs/testing.md)
**Target Platform**: web client + API
**Project Type**: web application (pnpm monorepo)
**Performance Goals**: preview and apply of 1000 lines are single requests (001 limits 5 MB / 1000 lines); candidates loaded in one query per kind (transactions, recurring occurrences)
**Constraints**: domain pure and in integer cents (DB `numeric(12,2)` converted at the repository edge); every query filters `userId`; apply and undo each one DB transaction
**Scale/Scope**: ~113 lines and ~100 candidates per month; ~25 source files

## Constitution Check

| Principle | Status |
|---|---|
| I. AGENTS.md authority | Matcher, buckets, suspicions, alignment and plan in `packages/domain`; service orchestrates and hashes; repository owns SQL with `userId`; routes thin; web renders server buckets. Shape of section 4 with feature name `reconciliations` in every layer. Pass. |
| II. Upstream-compatible | Fork-only flagged; deliverables = code, migration, tests, `docs/reconciliations.md`, `CHANGELOG.md` (`### Fork`). Touches to upstream code are minimal and behaviour-preserving (optional executor on two settlement functions, an extracted CSV reading helper, two links). Pass. |
| III. V1 reference only | Spec table kept/changed/dropped; V2 identity (two columns), merchant key, server matching, server-side undo journal, settlement model. Pass. |
| IV. Financial integrity | Cents in domain; ownership of every id (person, category, account, card, entry); atomic apply/undo; forward-only migration via `drizzle-kit generate`. Pass. |
| V. Behavior-verified | Ported V1 oracle in domain tests; integration test asserts no writes on preview/rejection, exact undo restore, idempotent re-apply, isolation. Pass. |

Post-design re-check: unchanged, pass.

## Upstream overlap check

- `CHANGELOG.md`: no statement reconciliation entry; "reconcil" appears only for recurring external periods and invoice reductions (unrelated). `main..upstream/main` is empty.
- Existing V2 import review (`features/transactions/components/transaction-import-*`): left unchanged; the reconciliation screen reuses `transaction-import-upload.tsx` and the 001 detect service, not the review table (different per-row decisions).
- Category memory: reuses `import_category_mappings` and `getImportedDescriptionKey` (lookup merchant key then legacy key, write merchant key), no second memory table.
- Settlement code: reused through `settlePersistedTransactions` / `settleRecurringTransaction` (new optional executor), not reimplemented. 001 import undo (`DELETE /transactions/imports/{batchId}`) keeps deleting by batch id; only created entries carry the reconciliation batch id.

## Design

### Domain (`packages/domain/src`)

| File | Responsibility |
|---|---|
| `reconciliations.ts` | Types (data-model.md), constants `RECONCILIATION_DATE_WINDOW_DAYS = 2`, `RECONCILIATION_CENTS_TOLERANCE = 5`; `find{Identity,Installment,Exact,Cents,NamePeriod}Candidates`; `matchReconciliationLines`; `detectMatchSuspicions`; `filterAppOnlyByScope`; `resolveAmountAlignment`; `assignReconciliationBuckets` (FR-007, incl. ignored and informational); `reclassifyPreviousInvoicePayments`; `matchAccountByIdentification`; `suggestLineName`. |
| `reconciliations-plan.ts` | `buildReconciliationPlan({ lines, classification, entries, decisions, target, invoicePeriod, nameKey })` -> `ReconciliationPlan` or a typed `ReconciliationPlanError` (`STALE`, `NOTHING_TO_APPLY`, `EMPTY_NAME`); implements release-before-create/link, amount authority per alignment, settle-on-match for account targets, name learning (FR-012), category memory (FR-019), defaults for missing decisions. |

### API

- `packages/validators/src/reconciliations.ts`: schemas of contracts/reconciliation-api.md.
- `apps/api/src/services/transactions.service.ts`: extract exported `readCsvImportLines(input, userId)` from `previewTransactionImport` (decode, resolve profile and destination ownership, parse, identities, source fingerprint); import behaviour unchanged.
- `apps/api/src/repositories/settlements.repository.ts`: optional executor parameter on `settlePersistedTransactions` and `settleRecurringTransaction`.
- `apps/api/src/repositories/reconciliations.repository.ts`: candidate transactions of the target (account: date window = file range +/-3 days or period in line periods; card: invoice period only; excludes `accountBalanceAdjustment`), flags (splits, transfer, generated, paid invoice), recurring rule versions of the target for expansion, occurrence identities; ignores, name mappings, category mappings by keys; `applyReconciliationPlan(tx-scoped)` writing in order releases, creations (`onConflictDoNothing`, batch id), stamps (identity uniqueness checked across transactions and occurrences), alignments, settlements, ignores, mappings, journal; `undoReconciliationBatch`.
- `apps/api/src/services/reconciliations.service.ts`: `detectReconciliation`, `previewReconciliation`, `applyReconciliation`, `undoReconciliation` (one use case each); ownership checks as in `importTransactions`; recurring expansion with the same domain functions `listTransactions` uses; no card limit check; paid-invoice check on creations.
- `apps/api/src/routes/reconciliations.ts` + mount in `apps/api/src/app.ts`.

### Web (`apps/web/src/features/reconciliations`)

- `reconciliations.api.ts`, `reconciliations.mutations.ts` (detect, preview, apply, undo; invalidate transactions queries on apply/undo), `reconciliations.presentation.ts` (PT-BR bucket titles, rule labels, suspicion and kept-amount reasons, error codes, result and skipped warnings).
- `useReconciliationReview.ts`: file, origin, preview and decision state (ephemeral).
- `components/`: `reconciliation-screen.tsx`, `reconciliation-origin-step.tsx`, `reconciliation-summary.tsx`, `reconciliation-bucket.tsx`, `reconciliation-matched-row.tsx`, `reconciliation-bank-only-row.tsx`, `reconciliation-ambiguous-row.tsx`, `reconciliation-apply-bar.tsx`, `reconciliation-review.ts` (pure UI helpers: default decisions, "Marcar todas como Criar", consumed entries, link options, apply block, has-applicable-decision, sparse payload) + test.
- Route `apps/web/src/routes/transactions_.reconciliation.tsx`; entry links in `transactions-screen.tsx` and `transactions-mobile-actions-menu.tsx`.

## Project Structure

### Documentation (this feature)

```text
specs/002-reconciliation-core/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/reconciliation-api.md
└── tasks.md
```

### Source Code

```text
packages/db/src/schema.ts, packages/db/drizzle/0032_*.sql (+ meta)
packages/domain/src/{reconciliations,reconciliations-plan}.ts (+ .test.ts)
packages/validators/src/reconciliations.ts
apps/api/src/{app.ts, routes/reconciliations.ts, services/reconciliations.service.ts, repositories/reconciliations.repository.ts, reconciliations.integration.test.ts}
apps/api/src/services/transactions.service.ts, apps/api/src/repositories/settlements.repository.ts (small extractions)
apps/web/src/features/reconciliations/**, apps/web/src/routes/transactions_.reconciliation.tsx
apps/web/src/features/transactions/components/{transactions-screen,transactions-mobile-actions-menu}.tsx
docs/reconciliations.md, CHANGELOG.md, package.json (integration script)
```

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Optional executor on two settlement repository functions (upstream code) | Apply/undo must be atomic and reuse settlement rules | Duplicating settle SQL duplicates a financial rule; separate transactions break FR-020 |
| Identity columns on recurring occurrences | FR-023 per-occurrence identity without materializing | Link table = second identity store and cross-table uniqueness anyway |
