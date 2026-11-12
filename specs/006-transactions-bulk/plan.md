# Implementation Plan: Transactions Mass-Add and Full Bulk Edit

**Branch**: `006-transactions-bulk` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-transactions-bulk/spec.md` (clarified, UI option A
chosen for both dialogs)

## Summary

Two new endpoints on the existing `transactions` feature. `POST /transactions/bulk/create` creates
up to 500 single-condition rows that share type, payment method, account or card and an optional
invoice period, all or nothing (row-level shape errors are named by the dialog; the error
envelope is unchanged). `PATCH
/transactions/bulk/update` applies a strict partial `changes` object (purchase date, invoice
period, due date, person, account, card, category, note, amount) to up to 500 selected stored
transactions, with one installment `scope`, all or nothing. Eligibility (protected, recurring,
field applicability per payment method, split person change, settlement lock), series anchor
selection and month-offset shifting are pure functions in `packages/domain/src/transactions.ts`;
the service reuses the create helpers (`buildBaseRecord`, `derivePeriod`) and the edit helpers
(`resolveEditedTransactionPeriod`, `allocateAmountProportionally`), validates the whole selection
first and writes once through existing repository functions that already run in one
`db.transaction`. No migration. Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/transactions-bulk-api.md](contracts/transactions-bulk-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+, workspace `tsconfig`), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle ORM (node-postgres), Zod, TanStack
Start/Router/Query/Form, shadcn/ui, lucide-react

**Storage**: PostgreSQL; no schema change, no migration (data-model.md "Persistence")

**Testing**: `node:test` + `tsx`; domain pure tests, web presentation tests, PostgreSQL
integration through the assembled app (`pnpm test:transactions:integration`, bash)

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo: `apps/api`, `apps/web`, `packages/*`)

**Performance Goals**: SC-003, 500 selected items updated within 5 s. Reads are batched (one
target query, one splits query, one series query per distinct series, one card query per distinct
card, one paid-invoice query per card); writes are one database transaction

**Constraints**: integer cents for allocations (domain); every query filters `userId`; no new
dependency; all-or-nothing per request; existing bulk actions unchanged

**Scale/Scope**: 2 endpoints, 2 validator schemas, ~6 domain functions, 2 service use cases, 1
repository select widened, 1 repository write made all-or-nothing, 2 dialogs, 1 dock action,
1 create menu item

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| I. AGENTS.md authority | Pass | Feature name `transactions` in every layer; new rules only in `packages/domain/src/transactions.ts`; routes thin (`c.req.valid` -> service); repositories filter `userId`; web via `transactions.api/mutations/presentation`, TanStack Form + validators schemas, shadcn dialogs |
| II. Upstream-compatible | Pass | Deliverables: product code, tests, `CHANGELOG.md` (`### Fork` in `Unreleased`), `docs/transaction-bulk-actions.md`. Error envelope `{ error, message, code }` unchanged; no shared file outside the transactions feature is touched |
| III. V1 is reference | Pass | Spec Assumptions/Clarifications list kept (field list, offsets, mass-add flow), changed (multi-select + one scope, category and amount > 0 required, splits edited whole) and dropped (condition change, V1 "period" scope, recurring bulk edit) |
| IV. Financial integrity | Pass | Amounts normalized by `normalizeTransactionAmount`; split reallocation with `allocateAmountProportionally` (cents, sum preserved); every referenced person/category/account/card ownership-checked once per request; paid-invoice guard on source and destination invoices and settlement guard before any write; repository re-checks settlement under row locks and rolls back if any planned row is missing; no migration |
| V. Behavior-verified | Pass | Domain table tests for eligibility/anchors/shift; integration asserts created counts, untouched fields, offsets with month-end clamp, proportional shares, no writes after each rejection, stranger isolation |

Post-design re-check: Pass (no violations; Complexity Tracking empty).

## Upstream overlap check

- `CHANGELOG.md` (fork `Unreleased` and released sections) and `upstream/main:CHANGELOG.md`
  (fetched 2026-11-07): searched `massa|mass|bulk|em lote`, case-insensitive. Only hits are the
  existing bulk bar entry (`/bulk/category`, `/bulk/names`, `/bulk/tags`, `/bulk/delete`, settle)
  and the 004 **Definir viagem** bulk action. No mass-add, no bulk edit of dates, person, account,
  card, amount or note.
- Code: `apps/`, `packages/`, `docs/` searched for `em massa|mass-?add|massAdd|bulk/create|
  bulk/update|bulkCreate|bulkUpdate`: no hits. The nearest capability is the import flow
  (`POST /transactions/imports`, `importTransactions`), which creates many single rows but is
  bound to a parsed file (fingerprint, external ids, batch undo, category memory, settled rows).
- Verdict: no overlap. Mass-add is a separate use case that reuses the create helpers, not the
  import path (research R2). Merge risk is limited to shared transaction files
  (`transactions.service.ts`, `transactions.repository.ts`, `validators/src/transactions.ts`,
  `domain/src/transactions.ts`, bulk dock, create actions).

## Design

### Domain (`packages/domain/src/transactions.ts`, existing `./transactions` export)

- `bulkTransactionUpdateFields` (`purchaseDate`, `invoicePeriod`, `dueDate`, `personId`,
  `accountId`, `cardId`, `categoryId`, `note`, `amount`) and `BulkTransactionUpdateField`.
- `settlementLockedTransactionFields`: the list now inlined in `updateTransaction` single path,
  moved here and imported back by `updateTransaction` (same values, no behavior change).
- `listInapplicableBulkUpdateFields({ type, paymentMethod }, fields)` -> fields that do not apply
  (card: `accountId`, `dueDate`; non-card: `cardId`, `invoicePeriod`; `dueDate` only for expenses,
  as in the transaction form). Used by the API and by the dialog notice.
- `getBulkTransactionUpdateRejection(target, fields)` -> `null | "protected" | "recurring" |
  "notApplicable" | "splitPersonChange" | "settled"` (R5 order). `target` extends
  `BulkTransactionTarget` with `condition`, `isRecurring`, `isSplit`, `isSettledLocked`.
- `selectBulkSeriesAnchors(items)` -> one anchor per `seriesId` (lowest selected
  `currentInstallment`); covered items of the same series are dropped (R6).
- `shiftInstallmentSeriesValues({ purchaseDate, dueDate, boletoPaymentDate, period }, offset)` ->
  each value shifted by `offset` months with month-end clamp (`addMonthsToDate`,
  `addMonthsToPeriod`); `updateTransaction` series path switches to it (R7).

### Validators (`packages/validators/src/transactions.ts`)

`BulkCreateTransactionsInputSchema`, `BulkUpdateTransactionsInputSchema`, types; output reuses
`BulkTransactionsOutputSchema`. Shapes in [data-model.md](data-model.md).

### API

- `apps/api/src/routes/transactions.ts`: `POST /bulk/create` (201) and `PATCH /bulk/update` (200),
  next to the other bulk routes, with `bulkTransactionsErrorResponses`.
- `apps/api/src/services/transactions.service.ts`:
  - `createTransactions(input, userId)` (R2-R4): batch ownership reads, any foreign or unusable
    row category -> `CATEGORY_NOT_FOUND`, inactive or foreign row person -> `PERSON_NOT_FOUND`
    (no row number), `buildBaseRecord` + `derivePeriod` per row, card paid-invoice and limit
    checks, one `insertTransactionsWithSplits(records, [])`.
  - `updateTransactions(input, userId)` (R5-R10): `listBulkTargets`, shared reference checks,
    domain rejection per target, anchors and series expansion, source and destination
    paid-invoice check, one `updateTransactionSeriesRangeWithSplitsForUser(userId, updates)`.
  - small extraction: `isCategoryUsableForType(category, type)` shared by `assertOwnership` and
    `createTransactions` (same predicate, no rule change).
- `apps/api/src/repositories/transactions.repository.ts`:
  - `listBulkTransactionTargetsForUser` selects the extra columns the edit needs (data-model.md).
  - `updateTransactionSeriesRangeWithSplitsForUser`: all-or-nothing (R9). If fewer rows are locked
    than requested, or an update returns no row, it throws `TransactionTargetMissingError` inside
    the `db.transaction` (rollback) instead of `continue`. The service translates it to 404
    `TRANSACTION_NOT_FOUND`. No new write function.
- Error envelope unchanged (`{ error, message, code }`).

### Web (option A, see spec "UI decisions")

- `transactions.api.ts`: `createTransactionsBulk`, `updateTransactionsBulk`.
- `transactions.mutations.ts`: `useCreateTransactionsBulkMutation`,
  `useUpdateTransactionsBulkMutation` (both `refreshTransactionQueries`, FR-024).
- `transactions.presentation.ts`: new codes in `transactionMutationErrorMessages`;
  `getMassAddErrorMessage(error)` ("... em uma das transações" for `CATEGORY_NOT_FOUND` /
  `PERSON_NOT_FOUND`), `getBulkUpdateErrorMessage(error)` (bulk-edit copy
  for `BULK_ACTION_UNSUPPORTED`, `INVOICE_ALREADY_PAID`, `SETTLEMENT_REQUIRES_UNDO`), created and
  updated count copy (singular/plural); `"update"` in `BulkTransactionActionKey`.
- Components: `transaction-mass-add-dialog.tsx` (shared settings + rows table, dirty-close
  confirmation, per-row required-field and amount errors naming the row), `transaction-mass-add-row.tsx`, `transaction-bulk-edit-dialog.tsx` ("Alterar"
  checkbox per field, scope radio only with installment items, inapplicable-field notice from
  `listInapplicableBulkUpdateFields`).
- Wiring: `transactions-create-actions.tsx` ("Adicionar em massa"), `useTransactionsDialogs.ts` +
  `transactions-dialogs.tsx` (open state, card locked from `createDefaults.cardId`),
  `transaction-bulk-action-dock.tsx` + `useTransactionBulkActions.ts` ("Editar" sends every selected
  `recordId`; blocks locally when any selected item has no `recordId`, i.e. a recurring occurrence).

## Project Structure

### Documentation (this feature)

```text
specs/006-transactions-bulk/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/transactions-bulk-api.md
└── tasks.md            (/speckit-tasks)
```

### Source Code (AGENTS.md section 4 shape, feature name `transactions`)

```text
packages/domain/src/transactions.ts            + transactions.test.ts
packages/validators/src/transactions.ts
apps/api/src/routes/transactions.ts
apps/api/src/services/transactions.service.ts
apps/api/src/repositories/transactions.repository.ts
apps/api/src/transactions.integration.test.ts
apps/web/src/features/transactions/transactions.api.ts
apps/web/src/features/transactions/transactions.mutations.ts
apps/web/src/features/transactions/transactions.presentation.ts + transactions.presentation.test.ts
apps/web/src/features/transactions/useTransactionBulkActions.ts
apps/web/src/features/transactions/useTransactionsDialogs.ts
apps/web/src/features/transactions/components/transaction-mass-add-dialog.tsx      (new)
apps/web/src/features/transactions/components/transaction-mass-add-row.tsx         (new)
apps/web/src/features/transactions/components/transaction-bulk-edit-dialog.tsx     (new)
apps/web/src/features/transactions/components/transaction-bulk-action-dock.tsx
apps/web/src/features/transactions/components/transactions-create-actions.tsx
apps/web/src/features/transactions/components/transactions-dialogs.tsx
docs/transaction-bulk-actions.md (new), CHANGELOG.md
```

**Structure Decision**: existing monorepo layout; everything lives in the `transactions` feature,
next to the existing bulk actions. No new package, route file or service file.

## Test plan (test-slop-guard declarations)

- `packages/domain/src/transactions.test.ts` (extend; one parametrised test per contract):
  - Test: new, because distinct contract - `getBulkTransactionUpdateRejection` table: refund ->
    protected; transfer -> protected; recurring -> recurring; card + `accountId` -> notApplicable;
    pix + `cardId` -> notApplicable; income + `dueDate` -> notApplicable; split + `personId` ->
    splitPersonChange; settled + `amount` -> settled; settled + `categoryId`,`note` -> null; pix +
    `personId`,`purchaseDate` -> null.
  - Test: new, because distinct contract - `selectBulkSeriesAnchors`: installments 5 and 3 of A
    plus 2 of B plus a single -> anchors A3, B2, single kept; A5 dropped.
  - Test: new, because distinct contract - `shiftInstallmentSeriesValues`: 2026-01-31 +1 ->
    2026-02-28, +2 -> 2026-03-31; period 2026-12 +2 -> 2027-02; null due date stays null.
- `apps/web/src/features/transactions/transactions.presentation.test.ts` (extend): one test,
  mass-add copy ("Categoria não encontrada em uma das transações.", person variant) and bulk-edit
  overrides for the three reused codes.
- Mass-add form row messages: Test: none, because they come from the validators schema mapped by
  the dialog; checked manually (quickstart step 2).
- `apps/api/src/transactions.integration.test.ts` (extend, two `t.test` workflows):
  - mass-add: 3 rows on a card with invoice period -> 3 single rows, same period, `isSettled` null;
    account rows -> pending; row 2 with stranger category -> 404 `CATEGORY_NOT_FOUND`, count
    unchanged; inactive person row -> `PERSON_NOT_FOUND`; paid invoice ->
    `INVOICE_ALREADY_PAID`, count unchanged; stranger account -> `ACCOUNT_NOT_FOUND`.
  - bulk edit: person + purchase date on 3 singles (other fields equal); refund in selection ->
    `BULK_ACTION_UNSUPPORTED`, nothing changed; 10x installment, select 3/10 with `future` and a due
    date on the 31st -> 1-2 untouched, 3-10 shifted with clamp; `condition` in `changes` -> 400
    `validation_error`; split amount -> shares reallocated and summing; split person ->
    `BULK_UPDATE_SPLIT_PERSON`; settled + amount -> `SETTLEMENT_REQUIRES_UNDO`, nothing changed;
    card move into a paid invoice and amount change of an item in a paid invoice ->
    `INVOICE_ALREADY_PAID`, nothing changed; stranger ids -> `TRANSACTION_NOT_FOUND`.
  - Atomic write: Test: none in integration, because a concurrent delete between planning and
    writing cannot be staged deterministically through `app.request`; the rollback is covered by
    the repository change being a plain throw inside `db.transaction` and reviewed in the diff.
- `transactions.service.test.ts`: Test: none, because the rules are locked by the domain tests and
  persistence/atomicity by the integration suite; a mocked service test would duplicate both.
- Validators: Test: none, because the strict schemas are exercised by the integration requests
  (unknown key, 501 ids/rows boundary covered by Zod `max(500)` already used by the other bulk
  schemas).
- E2E: none; UI verified manually per [quickstart.md](quickstart.md).

## Risks

- The all-or-nothing change in `updateTransactionSeriesRangeWithSplitsForUser` also applies to
  the existing single scoped series edit: a sibling deleted concurrently now aborts that edit
  instead of being skipped. Stricter and consistent with FR-020; noted in the CHANGELOG entry.
- The source paid-invoice guard exists only in bulk edit; single edit still allows moving an item
  out of a paid invoice (out of scope, candidate follow-up).
- `insertTransactionsWithSplits` re-reads every inserted row; 500 rows mean 500 reads after the
  commit. Acceptable for a manual dialog; revisit only if measured slow.
- Hotspot files are shared with other lane A features; keep the `updateTransaction` refactor to
  the two extractions (locked fields list, shift helper).

## Complexity Tracking

No violations.
