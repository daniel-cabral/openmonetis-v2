# Research: Establishments Report and Trip Filter

## R1. Where the trip filter is applied

- Decision: in the domain. Repositories return candidate rows with `tripId` (stored transactions,
  via left join on `transaction_trips`) and, per recurring rule, `occurrenceTripIds`
  (`occurrenceDate -> tripId` from `recurring_occurrence_trips` by `seriesId`). Domain
  `matchesTripFilter(tripId | null, filter)` decides.
- Rationale: FR-017 (rules in domain); one helper serves both reports; testable without a DB.
- Alternatives: SQL `WHERE` on trip join (fast but duplicates the rule for recurring projections,
  which are expanded in memory anyway).

## R2. Establishments window in trip mode

- Decision: a specific trip sets the window to the trip's period range (min..max period of its
  linked rows and linked occurrences, uncapped), then filters rows to that trip. A trip with no
  linked rows yields an empty report labeled "Viagem: {name}".
- Rationale: every linked row lies inside that range by construction, so reusing the windowed query
  plus the filter loses nothing and avoids a second query path.
- Alternatives: query by trip join without period (needs separate recurring resolution).

## R3. Trip period range

- Decision: `trips.repository.listPeriodSourcesForUser(userId, tripId)` returns linked transaction
  periods plus linked occurrences with the rule fields needed to derive their period
  (`paymentMethod`, `dueDate`, card closing rule). Domain `resolveTripPeriodRange({ periods, maxMonths? })`
  returns `{ startPeriod, endPeriod } | null`, capping `endPeriod` to `startPeriod + maxMonths - 1`.
  Category trends uses `maxMonths = 24` through `GET /trips/:tripId/period-range`; establishments
  calls the same service method without a cap.
- Rationale: FR-012; V1 `trip-range.ts` semantics (first period, capped at 24).
- Unknown or foreign trip: the endpoint answers `{ data: null }` (200), same as an empty trip, so
  existence is not revealed (FR-010).

## R4. Own share and exclusions

- Decision: reuse the category trends `admin` person scope semantics: a row counts when it has no
  split and its person is admin, or with the admin split amount. Eligible rows: `type = expense`,
  `origin = regular`, account not `excludeFromBalance` (per occurrence for recurring, via
  `occurrenceAccountExclusions`), category not the system invoice-payment category. Amount in cents
  via `toCents(Math.abs(amount))`.
- Rationale: FR-006, clarification Q3; same own-share definition already reviewed in V2.
- No admin person: repository returns no rows, report is empty (edge case).

## R5. Recurring occurrences

- Decision: extract the occurrence walk of `calculateCategoryTrends` into an exported
  `listRuleOccurrences(rule, fromPeriod, toPeriod)` in `category-trends.ts` returning
  `{ purchaseDate, period, amount }`; both reports use it. Only `active` rules.
- Rationale: zero duplication (AGENTS.md section 6); FR-007.

## R6. URL parameters

- Decision: `trip` (absent | `none` | uuid), `months` (3|6|12, default 6), `period` (`YYYY-MM`,
  default current period in Brazil). Invalid values degrade to defaults in the web presentation
  resolver and in the validator (`trip` must be `none` or a uuid; anything else is dropped by the
  web resolver before calling the API).
- Category trends: the trip pick fetches the range and navigates with `trip`, `startPeriod`,
  `endPeriod` together; "Limpar filtros" drops `trip` and categories and restores the default range.

## R7. Ranking

- Decision: count desc, total desc, name asc (`localeCompare` with `pt-BR`); top 50; top categories
  per establishment by count desc then name; top 10 categories by total desc then name.
  Grouping key is the exact transaction name (case-sensitive, V1).
