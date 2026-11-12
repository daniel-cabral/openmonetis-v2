# Implementation Plan: Establishments Report and Trip Filter in Reports

**Branch**: `005-establishments-report` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-establishments-report/spec.md` (clarified, UI option A chosen)

## Summary

A new read-only report `establishments-report` ranks the user's own expense share by transaction
name over a 3/6/12-month window ending at the selected period. All rules (eligibility, own share,
ranking, top categories, summaries, window, trip filtering) are pure functions in
`packages/domain/src/establishments-report.ts`; the repository returns raw candidate rows (stored
transactions and recurring rules, each with its trip links) and the service orchestrates. A shared
trip filter (`all` / `none` / trip id) lives in `packages/domain/src/trips.ts`, is parsed from the
URL parameter `trip`, and is applied by both the new report and category trends. A specific trip
turns the establishments window into the trip's period range; category trends gets a new
`GET /trips/:tripId/period-range` (capped at 24 months) that the web calls when a trip is picked.
No schema change. Details: [research.md](research.md), [data-model.md](data-model.md),
[contracts/establishments-report-api.md](contracts/establishments-report-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+, workspace `tsconfig`), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle ORM, Zod, TanStack Start/Router/Query,
shadcn/ui (`toggle-group`, `select`, `card`, `badge` already installed or added via shadcn CLI),
lucide-react

**Storage**: PostgreSQL, no migration (reads `transactions`, `transaction_splits`, `people`,
`categories`, `financial_accounts`, recurring rule tables, `transaction_trips`,
`recurring_occurrence_trips`, `trips`)

**Testing**: `node:test` + `tsx`; domain unit tests (`establishments-report.test.ts`,
`trips.test.ts`) and `apps/api/src/services/category-trends.service.test.ts` (trip filter cases), validator and web presentation unit tests; API
integration suite `test:establishments-report:integration` covering both reports and the trip
range endpoint against the lane database

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: one request per report render; per-user row counts in a 12-month window are
hundreds to a few thousand, so in-memory domain aggregation is fine

**Constraints**: integer cents; every query filters `userId`; no new dependency; no dev server on
default ports (lane B uses 7201-7203)

**Scale/Scope**: 1 new report endpoint, 1 new trip endpoint, 1 optional query param on category
trends, 1 new web route, 1 shared web select, nav entry

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Feature shape `establishments-report` across route/service/repository/domain/validators/web; rules only in domain; no barrels |
| II. Upstream-compatible | PASS | Establishments report is PR-able after stripping the optional `trip` param and trips ports; `docs/establishments-report.md` + CHANGELOG `Unreleased` (`### Fork`) are the deliverables; trip filter flagged fork-only in the spec |
| III. V1 is reference | PASS | Spec lists kept/changed/dropped; V2 typed origins replace V1 note prefixes; recurrence from V2 rules |
| IV. Financial integrity | PASS | Cents in domain; own share = admin split row (same as category trends `admin` scope); every query filters `userId`; trip id ownership checked; no schema change |
| V. Behavior-verified | PASS | Domain tests for exclusions/ranking/filter/range; integration tests assert exclusions, isolation (foreign trip id), SC-002 sum identity |

Post-design re-check: PASS (no violations; Complexity Tracking empty).

## Upstream overlap check

`upstream/main` (`5ea5f65`, 0.16.0) has no commits beyond fork `main`. Its CHANGELOG mentions
establishments only for logos (no report). Category trends files are identical between `main` and
`upstream/main` except fork features. No overlap; the only shared-code touch is extracting the
recurring occurrence walk from `calculateCategoryTrends` into an exported helper reused by the new
report (behavior unchanged, existing tests stay green).

## Project Structure

### Documentation (this feature)

```text
specs/005-establishments-report/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/establishments-report-api.md
├── previews/                 # UI previews (app.css ignored)
└── tasks.md                  # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
├── establishments-report.ts        # NEW: eligibility, own share, aggregation, window, labels
├── establishments-report.test.ts   # NEW
├── trips.ts                        # + TripFilter, parseTripFilter, matchesTripFilter, resolveTripPeriodRange
├── trips.test.ts                   # + cases
└── category-trends.ts              # + tripFilter input, entry.tripId, rule.occurrenceTripIds; extract listRuleOccurrences
packages/validators/src/
├── establishments-report.ts        # NEW: query (period, months, trip) + output schemas
├── category-trends.ts              # + optional `trip` param
└── trips.ts                        # + TripPeriodRangeOutputSchema
apps/api/src/
├── routes/establishments-report.ts             # NEW: GET /reports/establishments
├── services/establishments-report.service.ts   # NEW
├── repositories/establishments-report.repository.ts # NEW
├── routes/trips.ts / services/trips.service.ts / repositories/trips.repository.ts  # + period-range
├── services/category-trends.service.ts / repositories/category-trends.repository.ts # + trip links, ownership
├── app.ts                                      # wire + mount
└── establishments-report.integration.test.ts   # NEW (also category trends trip filter + range)
apps/web/src/
├── routes/reports/establishments.tsx           # NEW
├── features/establishments-report/{establishments-report.api.ts,.queries.ts,.presentation.ts,.presentation.test.ts}
├── features/establishments-report/components/{establishments-report-page.tsx,establishments-summary.tsx,establishments-list.tsx,establishments-top-categories.tsx}
├── features/trips/components/trip-filter-select.tsx  # NEW shared select
├── features/trips/trips.api.ts / trips.queries.ts    # + period range
├── features/category-trends/*                        # + trip search param, select, Limpar
└── components/navigation/nav-items.tsx               # + "Estabelecimentos"
docs/establishments-report.md                         # NEW contract doc
CHANGELOG.md                                          # Unreleased ### Fork entry
package.json                                          # + test:establishments-report:integration
```

**Structure Decision**: standard AGENTS.md feature shape with feature name `establishments-report`
(the existing `establishments` feature is logos; a separate name keeps one responsibility per file).
Trip filter helpers extend the `trips` feature in each layer instead of a new feature.

## Complexity Tracking

None.
