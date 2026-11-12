# Implementation Plan: Trips

**Branch**: `004-trips` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-trips/spec.md` (clarified, UI option A chosen)

## Summary

Trips become their own entity (`trips`) with two link tables: `transaction_trips` for stored
transactions and `recurring_occurrence_trips` for single recurring occurrences keyed by
(series, date). All rules (overlap, eligibility, propagation, net cost and breakdowns in integer
cents, suggestion dedupe, origin filter, pagination) are pure functions in
`packages/domain/src/trips.ts`. A thin `trips` route/service/repository serves CRUD, the trip page,
suggestions and link/unlink. The transaction form, transaction writes and the bulk bar get a small
`tripId` hook that writes links inside the existing transaction repository transactions. Details:
[research.md](research.md), [data-model.md](data-model.md), [contracts/trips-api.md](contracts/trips-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+, workspace `tsconfig`), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle ORM (node-postgres), Zod, TanStack
Start/Router/Query/Form, shadcn/ui, lucide-react

**Storage**: PostgreSQL; versioned Drizzle migration `0032_*` via `pnpm db:generate`

**Testing**: `node:test` + `tsx`; domain/validators/web presentation unit tests; repository
integration suite `test:trips:integration` against the lane database

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo: `apps/api`, `apps/web`, `packages/*`)

**Performance Goals**: trip page and list in one request each; trips per user and links per trip
are small (tens to a few hundred rows), so in-memory domain aggregation is fine

**Constraints**: integer cents; every query filters `userId`; no new dependency; no dev server on
default ports (lane B uses 7201-7203)

**Scale/Scope**: 3 tables, 8 trip endpoints + 1 bulk endpoint + `tripId` on 3 transaction writes,
2 web routes, 1 form field, 1 bulk action

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| I. AGENTS.md authority | Pass | Section 4 shape below; rules only in `packages/domain/src/trips.ts`; routes thin; repositories filter `userId`; web uses `*.api/queries/mutations/presentation` and TanStack Form + Zod |
| II. Upstream-compatible | Pass | Deliverables: product code, migration, tests, `CHANGELOG.md` (`### Fork` in `Unreleased`, fork convention), `docs/trips.md`. Fork-only flag already in the spec. Transaction hotspot changes are limited to a `tripId` field and calls into `trips.repository.ts` |
| III. V1 is reference | Pass | Spec Source section lists kept/changed/dropped; redesign: link tables, typed origins, per-occurrence link, split shares |
| IV. Financial integrity | Pass | Cents in domain (`toCents`), composite FKs for ownership, every trip/transaction/rule id ownership-checked, versioned migration, delete never removes transactions |
| V. Behavior-verified | Pass | Domain tests port the V1 cases (SC-005); integration suite asserts conserved counts, no writes after rejection, user isolation |

Post-design re-check: Pass (no violations; Complexity Tracking empty).

## Upstream overlap check

- `CHANGELOG.md`: no entry mentions trips, viagens or travel (searched `trip|viage|travel`,
  case-insensitive, on 2026-11-11).
- Code: `apps/`, `packages/` have no trips entity; the only hits are the sample tag name "Viagem
  Japão"/"Viagem" in `tags.service.test.ts` and `tags.repository.integration.test.ts`, mock data and
  e2e fixtures. Upstream models a trip, at most, as a tag.
- Verdict: no overlap. Tags cannot carry a non-overlapping date range, propagation or a net cost page
  (spec Assumptions). Feature stays fork-only; merge risk is limited to the shared transaction
  files (`transactions.service.ts`, `transactions.repository.ts`, `validators/src/transactions.ts`,
  form and bulk dock).

## Design

### Domain (`packages/domain/src/trips.ts`, export `./trips` in `packages/domain/package.json`)

- `tripNameMaxLength = 60`, `tripNoteMaxLength = 500`, `tripSuggestionsPageSize = 20`.
- `findOverlappingTrip(candidate: {id?, startDate, endDate}, trips)` -> first conflicting trip
  (inclusive ranges, ignores same id) or `undefined`.
- `findTripForDate(trips, date)` -> trip whose inclusive range contains `date`, else `undefined`.
- `isTripLinkable({ type, origin })` -> `type !== "transfer"` and origin `regular | refund`.
- `planTripLinkChange({ storedTripId, requestedTripId, condition, seriesId })` ->
  `{ kind: "none" } | { kind: "linkRow" | "linkSeries", tripId } | { kind: "unlinkRow" }` (R4).
- `parseTripLinkTarget(id)` -> `{ kind: "transaction", id } | { kind: "occurrence", recurringRuleId, occurrenceDate }`.
- `summarizeTrip(entries: TripLedgerEntry[])` -> `TripSummary` in cents (R6 own-share rule,
  labels, ordering); `linkedCount` = `entries.length`.
- `dedupeTripSuggestions(rows)` -> one row per installment series (`seriesId` with
  `condition === "installment"`), recurring occurrences and singles kept; input order preserved.
- `buildTripSuggestionOriginOptions(rows)`, `filterTripSuggestionsByOrigin(rows, origin)`,
  `paginateTripSuggestions(rows, page)` -> `{ items, page, pageCount, total, from, to }`.
- `canApplyBulkTransactionAction` in `packages/domain/src/transactions.ts` gains a `"trip"` case
  delegating to `isTripLinkable` (`BulkTransactionAction` union extended).

### Data (`packages/db/src/schema.ts`)

`trips`, `transactionTrips`, `recurringOccurrenceTrips` as in [data-model.md](data-model.md);
`pnpm db:generate` produces `packages/db/drizzle/0032_*.sql` + meta snapshot/journal.

### API

- `apps/api/src/repositories/trips.repository.ts`: `tripsRepository` (`listForUser`,
  `findByIdForUser`, `createForUser`, `updateForUser`, `deleteForUser`), `listTripLedgerRowsForUser(userId, tripId?)`
  (stored linked rows with category/card/account/person names, admin flag and split shares, plus
  occurrence links resolved to the rule version id active on the date), link helpers usable inside
  an outer Drizzle transaction: `linkTransactionsToTrip(tx, { userId, tripId, transactionIds, seriesIds })`,
  `unlinkTransactions(tx, userId, transactionIds)`, `setOccurrenceTrip(tx, { userId, seriesId, date, tripId | null })`,
  plus `findTripByIdForUser(id, userId)` for the transactions service port. Every query filters
  `userId`.
- `apps/api/src/services/trips.service.ts`: `createTripsService(repository, ports)` where ports are
  `getRecurringOccurrence` and `listTransactionsByPurchaseDate` bound in `app.ts` to the
  transactions service (R6, R7); use cases `list`, `create`, `update`, `remove`, `getDetail`,
  `listSuggestions`, `link`, `unlink`. Errors `TRIP_NOT_FOUND`, `TRIP_OVERLAP`, `TRIP_NOT_LINKABLE`.
- `apps/api/src/routes/trips.ts`: `createTripsRoute(service)`, mounted in `app.ts` at `/trips` with
  `privateCache` + `requireAuth` like `/tags`.
- Transactions hook (shared hotspot, keep minimal):
  - `packages/validators/src/transactions.ts`: `tripId` in `TransactionFieldsSchema` and
    `TransactionOutputSchema`; `BulkTripTransactionsInputSchema`.
  - `transactions.repository.ts`: `tripId` subquery in `transactionColumns`;
    `recurringOccurrenceTripIdsSql` on rule selects; insert/update functions accept `tripId` and call
    the trip link helpers inside their transaction; new `setTransactionsTripForUser(ids, userId, tripId)`.
  - `transactions.service.ts`: dependency `findTripByIdForUser`; validate ownership and
    `isTripLinkable` before writes; apply `planTripLinkChange` on update; recurring create links the
    anchor occurrence, recurring update links `occurrenceDate`; `setTransactionsTrip` bulk use case;
    `toRecurringOccurrenceOutput` reads `tripId` from the occurrence map.
  - `routes/transactions.ts`: `POST /bulk/trip`.

### Web (option A, see spec "UI decisions")

- `apps/web/src/features/trips/`: `trips.api.ts`, `trips.queries.ts`, `trips.mutations.ts`,
  `trips.presentation.ts` (PT-BR error mapping incl. overlap message, period label, origin option
  labels, link button label) and `components/`: `trips-page.tsx`, `trip-card.tsx`,
  `trip-dialog.tsx`, `trip-form.tsx`, `trip-detail-page.tsx`, `trip-breakdown-card.tsx`,
  `trip-linked-list.tsx`, `trip-suggestions.tsx`, `trip-select-field.tsx` (form field),
  `transaction-bulk-trip-picker.tsx` lives in `features/transactions/components/` next to the other
  bulk pickers.
- Routes: `apps/web/src/routes/trips.tsx`, `apps/web/src/routes/trips_.$tripId.tsx`.
- Nav: `components/navigation/nav-items.tsx` "Viagens" in Organização (`Plane`).
- Form: `transaction-advanced-fields.tsx` renders the trip field (hidden for transfers and system
  origins); `useTransactionForm.ts`/form types carry `tripId` with create-mode prefill via
  `findTripForDate` until touched; submission sends `tripId` only when changed in edit mode.
- Bulk: `useTransactionBulkActions.ts` + `transaction-bulk-action-dock.tsx` add the trip action
  (selection with `canApplyBulkTransactionAction(target, "trip")`).

## Project Structure

### Documentation (this feature)

```text
specs/004-trips/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── contracts/trips-api.md
├── previews/ (option-a-single-page.html, option-b-tabs.html, form-and-bulk.html, preview.css)
└── checklists/requirements.md
```

### Source Code (AGENTS.md section 4 shape, feature name `trips`)

```text
packages/domain/src/trips.ts                 + trips.test.ts
packages/validators/src/trips.ts             + trips.test.ts
packages/db/src/schema.ts                    (3 tables)
packages/db/drizzle/0032_*.sql               (generated) + meta/
apps/api/src/routes/trips.ts
apps/api/src/services/trips.service.ts
apps/api/src/repositories/trips.repository.ts + trips.repository.integration.test.ts
apps/api/src/app.ts                          (wiring)
apps/web/src/features/trips/trips.api.ts
apps/web/src/features/trips/trips.queries.ts
apps/web/src/features/trips/trips.mutations.ts
apps/web/src/features/trips/trips.presentation.ts + trips.presentation.test.ts
apps/web/src/features/trips/components/*.tsx
apps/web/src/routes/trips.tsx, trips_.$tripId.tsx
docs/trips.md, docs/testing.md (suite list), CHANGELOG.md, package.json (test:trips:integration)
```

Shared files touched: `packages/domain/src/transactions.ts`, `packages/validators/src/transactions.ts`,
`apps/api/src/repositories/transactions.repository.ts`, `apps/api/src/services/transactions.service.ts`,
`apps/api/src/routes/transactions.ts`, web transaction form/bulk files listed above, both
`package.json` export maps (`packages/domain`, `packages/validators`).

**Structure Decision**: existing monorepo layout; one feature name `trips` across every layer.

## Test plan (test-slop-guard declarations)

- `packages/domain/src/trips.test.ts` (new, because no test covers the new module; one parametrised
  test per contract):
  - Test: new, because distinct contract - `findOverlappingTrip` table (Porto cruza Lisboa; começa no
    dia em que Lisboa termina; termina no dia em que Lisboa começa; contém Lisboa; começa no dia
    seguinte -> none; termina na véspera -> none) plus editing self does not conflict.
  - Test: new, because distinct contract - `findTripForDate` table (14/05, 12/05, 22/05 -> Lisboa;
    one-day Santiago; 11/05, 23/05 -> none).
  - Test: new, because distinct contract - `isTripLinkable` table (expense regular, income refund ->
    true; transfer, invoicePayment, invoiceAdjustment, accountBalanceAdjustment, personSettlement -> false).
  - Test: new, because distinct contract - `planTripLinkChange` table (link 1/10 -> linkSeries;
    unlink 7/10 -> unlinkRow; omitted -> none; same value -> none; recurring/single -> linkRow).
  - Test: new, because distinct contract - `summarizeTrip`: 9.212,30 - 800,00 = 8.412,30 with
    category/source breakdowns; split 150/150 (own 150, person breakdown Ana 150 / Eu 150 tie by
    label); 0.1 + 0.2 = 0.3 cents; no admin -> zero totals, person breakdown kept; missing labels.
  - Test: new, because distinct contract - suggestions view: `dedupeTripSuggestions` (series once,
    recurring per occurrence), `filterTripSuggestionsByOrigin` table, origin options order,
    `paginateTripSuggestions` (57 items -> 3 pages, clamp 9 -> 3 and 0 -> 1, empty list).
- `packages/validators/src/trips.test.ts` (new, because distinct contract: input schema) - one
  parametrised test: accepts a one-day trip and normalizes name/empty note; rejects end before
  start, 2026-02-31, "22/05/2026", blank name, name > 60, note > 500.
- `apps/web/src/features/trips/trips.presentation.test.ts` (new, because distinct contract: PT-BR
  messages) - overlap message names the conflicting trip and dates; unknown codes map to a generic
  PT-BR message.
- `apps/api/src/repositories/trips.repository.integration.test.ts` (new, because distinct setup: real
  PostgreSQL, pattern of `tags.repository.integration.test.ts`, gated by `TRIPS_INTEGRATION_TEST=1`,
  script `test:trips:integration` in root `package.json`). One workflow test, many assertions:
  CRUD + overlap 409 with nothing saved; 10-installment create with trip -> 10 links; unlink 7/10
  -> 9; re-save 3/10 without trip -> 7/10 stays unlinked; split dinner -> own 150 in summary;
  recurring May occurrence linked alone (no occurrence row created in
  `recurring_transaction_occurrences`); suggestions exclude linked, out-of-range and transfers and
  include an in-range recurring occurrence; transfer link rejected; stranger cannot read/link/delete
  (SC-004); delete trip keeps transaction count (SC-006); SC-001 figures through `getDetail`.
- No new tests in `transactions.service.test.ts`: Test: none, because locked by
  `trips.repository.integration.test.ts` (same rules through real SQL; a service mock test would
  duplicate the layer).
- E2E: none, because no critical cross-process flow beyond what the integration suite sees; UI is
  checked manually per [quickstart.md](quickstart.md).

## Risks

- `listTransactions` with `dateStart/dateEnd` must expand recurring occurrences inside the range;
  the integration test asserts it. If it does not, the suggestions port must add a period loop.
- Rule version resolution for `(series, date)` must pick the version whose `[start_date, end_date]`
  contains the date; wrong pick drops a valid occurrence (asserted in the integration test).
- Shared hotspot files (`transactions.service.ts` 112K, `transactions.repository.ts` 87K) are also
  touched by lane A features; keep the diff to `tripId` plumbing.

## Complexity Tracking

No violations.
