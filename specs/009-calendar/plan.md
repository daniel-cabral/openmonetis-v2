# Implementation Plan: Monthly Calendar

**Branch**: `009-calendar` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-calendar/spec.md` (clarified, UI option A chosen)

## Summary

A read-only `GET /calendar?period=YYYY-MM` returns the 42 Monday-first days of the month, each with
its ordered events (transaction, installment, boleto, card invoice) and own-share day totals. The
service composes existing use cases: `transactionsService.listTransactions` (purchase-date range,
and payables by due date filtered to boletos; recurrence expansion, settlement, adjusted due dates
and split allocations come from there), `cardsService.list` (invoice summary per card) and the
admin person. All event rules (exclusions, own share, installment collapsing, placement, ordering,
grid, totals in cents) are pure functions in `packages/domain/src/calendar.ts`. The web adds a
`/calendar` route rendering the grid, legend, day dialog and the existing `TransactionDialog`
prefilled with the day. No schema change. Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/calendar-api.md](contracts/calendar-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod, TanStack Start/Router/Query/Form,
shadcn/ui (`dialog`, `button`, `badge`, `card` already installed), lucide-react

**Storage**: PostgreSQL, no migration (reads through existing transactions and cards services)

**Testing**: `node:test` + `tsx`; domain unit tests `packages/domain/src/calendar.test.ts`,
web presentation test; API integration suite `test:calendar:integration`
(`apps/api/src/calendar.integration.test.ts`) against the lane database

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: one API request per month render (SC-001 < 2 s); the service makes 3
parallel calls (2 transaction listings, cards list) plus the admin person lookup

**Constraints**: integer cents in domain; every query filters `userId` (inherited from the reused
services); no new dependency; lane B ports 7201-7203 only

**Scale/Scope**: 1 endpoint, 1 domain module, 1 validator module, 1 web route, 1 nav entry,
1 query root

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Feature `calendar` across route/service/domain/validators/web; no repository needed (service reuses other services via injected functions, like `tripsService`); rules only in domain; no barrels |
| II. Upstream-compatible | PASS | Pure addition; `docs/calendar.md` + CHANGELOG `Unreleased` `### Fork`; not fork-only |
| III. V1 is reference | PASS | Spec Clarifications list kept (placement, grouping, legend, dialog), changed (installments per V2 rows, typed invoice state, own share via splits) and dropped (payment-by-name lookup) |
| IV. Financial integrity | PASS | Cents in domain; own share = admin allocation; data only through user-filtered services; no schema change |
| V. Behavior-verified | PASS | Domain tests for placement/exclusions/collapse/order/grid/totals; integration tests for isolation, boleto by due date, invoice event, recurrence occurrence, 401 |

Post-design re-check: PASS (Complexity Tracking empty).

## Upstream overlap check

`upstream/main` (`5ea5f65`, 0.16.0) has no commits beyond fork `main`. Its CHANGELOG mentions
"calendário" only for business calendars of due-date rules and date pickers; no calendar page.
No overlap. Shared-code touches: `apps/api/src/app.ts` (wiring), `nav-items.tsx` (entry),
`financial-query-invalidation.ts` (`"calendar"` root).

## Project Structure

### Documentation (this feature)

```text
specs/009-calendar/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/calendar-api.md
├── previews/                 # UI previews (app.css ignored)
└── tasks.md
```

### Source Code (repository root)

```text
packages/domain/src/
├── calendar.ts                 # NEW: buildCalendarDays, buildCalendarMonth (events, own share, collapse, order, totals)
└── calendar.test.ts            # NEW
packages/validators/src/
└── calendar.ts                 # NEW: CalendarQuerySchema, CalendarEventSchema, CalendarDaySchema, CalendarOutputSchema
apps/api/src/
├── routes/calendar.ts          # NEW: GET /calendar
├── services/calendar.service.ts  # NEW: createCalendarService(deps)
├── app.ts                      # wire service with listTransactions/cards.list/findAdminPersonByUserId, mount
└── calendar.integration.test.ts  # NEW
apps/web/src/
├── routes/calendar.tsx         # NEW (period search param, invalid -> current month)
├── features/calendar/calendar.api.ts
├── features/calendar/calendar.queries.ts       # key root "calendar"
├── features/calendar/calendar.presentation.ts  # search validation, labels, formatting, preview slicing (+N mais)
├── features/calendar/calendar.presentation.test.ts
├── features/calendar/components/{calendar-page.tsx,calendar-grid.tsx,calendar-day-cell.tsx,calendar-day-dialog.tsx,calendar-legend.tsx}
├── components/navigation/nav-items.tsx         # + "Calendário"
└── lib/financial-query-invalidation.ts         # + "calendar"
docs/calendar.md                # NEW contract doc
CHANGELOG.md                    # Unreleased ### Fork entry
package.json                    # + test:calendar:integration
```

**Structure Decision**: standard AGENTS.md feature shape, feature name `calendar`. No repository
layer: every read goes through existing services that already filter by `userId`, injected as
functions in `app.ts` (same pattern as `tripsService.listTransactionsByPurchaseDate`).

## Complexity Tracking

None.
