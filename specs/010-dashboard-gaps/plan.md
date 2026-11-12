# Implementation Plan: Dashboard Gaps (Spending Overview, Attachments, Category History, Notifications)

**Branch**: `010-dashboard-gaps` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-dashboard-gaps/spec.md` (clarified, UI option A chosen)

## Summary

Three new dashboard widgets and notification regression tests.

- **Spending overview** (`spending-overview`): new read-only endpoint `GET /dashboard/spending-overview?period=`.
  The service reuses the 005 repository reads (`listPurchaseEntriesForUser`, `listRecurringRulesForUser`)
  for a one-month window; a new pure domain function `calculateSpendingOverview` reuses
  `isEstablishmentPurchase` and `listRuleOccurrences` and returns the top 10 expenses and top 10
  establishments. The 005 purchase entry gains `id` and `purchaseDate` (additive select fields).
- **Attachments widget**: new endpoint `GET /attachments/summary?period=` on the existing attachments
  route/service; the repository reuses the existing `listLinksForPeriod` join; a new pure domain
  function `summarizePeriodAttachments` (in `packages/domain/src/attachments.ts`) dedupes by attachment,
  counts images/PDFs, sums bytes and picks the 5 most recent by purchase date.
- **Category history**: web only. Calls the existing category trends query with
  `startPeriod = period - 8`, `endPeriod = period + 1` and the selected ids; plots `totalAmount` per month.
  Selection in `sessionStorage`.
- **Registry/preferences**: 3 new ids appended to `dashboardWidgetIds`; normalization keeps saved orders
  and hidden sets, appending the new ids, and still recognises every pre-010 default order.
- **Notifications**: service tests for read then unread (readAt cleared), archive implies read, restore
  returns as read; existing tests already cover archive refusal and stale-fingerprint conflict; the web
  mutation already invalidates on settle (panel reload). No product change.

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle ORM, Zod, TanStack Start/Router/Query,
shadcn/ui (`popover`, `command`, `badge`; add via shadcn CLI only if missing), recharts (already used), lucide-react

**Storage**: PostgreSQL, no migration (reads transactions, splits, people, categories, recurring rules,
`attachments`, `transaction_attachments`)

**Testing**: `node:test` + `tsx`. Domain unit tests (`spending-overview.test.ts`, `attachments.test.ts`,
`dashboard.test.ts`), service tests (`notifications.service.test.ts`), web presentation unit tests; new integration suite
`test:spending-overview:integration` (`apps/api/src/spending-overview.integration.test.ts`) covering
spending overview exclusions, own share, isolation, and the attachments summary (attachment rows inserted
directly through `@openmonetis/db`, as `storage.integration.test.ts` does), against the lane database.

**Target Platform**: self-hosted web app

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: one request per widget render; a month has at most a few hundred rows; in-memory
domain aggregation (SC-002 under 2s)

**Constraints**: integer cents; every query filters `userId`; no new dependency; no dev server on
default ports (lane B uses 7201-7203)

**Scale/Scope**: 2 new endpoints, 3 widget ids, 3 widget components, 1 session-storage hook

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | `spending-overview` feature shape (route/service/validators/domain/web); attachments summary extends `attachments`; rules only in domain; no barrels |
| II. Upstream-compatible | PASS | Widgets are upstream-able base features; deliverables: code, tests, `docs/dashboard-widgets.md`, CHANGELOG `Unreleased` (`### Fork`) |
| III. V1 is reference | PASS | Spec lists kept/changed/dropped; V1 name-text exclusions replaced by typed origins; V1 card logos replaced by V2 establishment logos |
| IV. Financial integrity | PASS | Cents in domain; admin share via the 005 repository; all queries filter `userId`; no schema change |
| V. Behavior-verified | PASS | Domain tests for exclusions/ordering/limits/dedupe; integration tests for exclusions, own share, isolation; preference normalization tests |

Post-design re-check: PASS (Complexity Tracking empty).

## Upstream overlap check

`git log main..upstream/main` is empty (upstream at `5ea5f65`, 0.16.0, already merged). Upstream
CHANGELOG has no spending overview, attachments widget or category history widget. Shared-code touches:
additive `id`/`purchaseDate` fields on the 005 purchase entry, 3 appended widget ids with backward
compatible normalization, a new attachments sub-route. No overlap.

## Project Structure

### Documentation (this feature)

```text
specs/010-dashboard-gaps/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md
├── previews/        # UI previews (app.css ignored)
└── tasks.md
```

### Source Code

```text
packages/domain/src/
├── spending-overview.ts (+ .test.ts)        # NEW: calculateSpendingOverview, limits, ordering
├── establishments-report.ts                 # EDIT: entry type gains id, purchaseDate
├── attachments.ts (+ .test.ts)              # EDIT: summarizePeriodAttachments
└── dashboard.ts (+ .test.ts)                # EDIT: 3 widget ids, normalization keeps old defaults
packages/validators/src/
├── spending-overview.ts                     # NEW: query + output schemas
└── attachments.ts                           # EDIT: summary query/output schemas
apps/api/src/
├── routes/spending-overview.ts              # NEW: mounted at /dashboard/spending-overview in app.ts
├── services/spending-overview.service.ts  # NEW
├── repositories/establishments-report.repository.ts    # EDIT: select id, purchaseDate
├── routes/attachments.ts                    # EDIT: GET /summary
├── services/attachments.service.ts # EDIT: getPeriodSummary
├── services/notifications.service.test.ts   # EDIT: 3 regression tests
├── spending-overview.integration.test.ts    # NEW
└── app.ts                                   # EDIT: mount route
apps/web/src/features/
├── spending-overview/ spending-overview.api.ts, .queries.ts, .presentation.ts (+ test), components/spending-overview-widget.tsx
├── attachments/ attachments.api.ts, attachments.queries.ts, attachments.presentation.ts, components/attachments-widget.tsx
├── category-trends/ category-trends.presentation.ts (+ test), useCategoryHistorySelection.ts, components/category-history-widget.tsx, components/category-history-picker.tsx
└── dashboard/components/dashboard-widget-registry.tsx  # EDIT: 3 entries
docs/dashboard-widgets.md                    # NEW: contract doc
CHANGELOG.md                                 # EDIT: Unreleased ### Fork
package.json                                 # EDIT: test:spending-overview:integration script
```

**Structure Decision**: AGENTS.md section 4; `spending-overview` is its own feature across layers;
attachments summary and category history extend their existing features.

## Complexity Tracking

None.
