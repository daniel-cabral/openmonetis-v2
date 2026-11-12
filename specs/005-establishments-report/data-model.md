# Data Model: Establishments Report and Trip Filter

No new tables or columns. Derived types only.

## TripFilter (domain, `trips.ts`)

`{ mode: "all" } | { mode: "none" } | { mode: "trip"; tripId: string }`

- `parseTripFilter(raw?: string | null)`: absent/empty/invalid -> all; `"none"` -> none; uuid -> trip.
- `matchesTripFilter(tripId: string | null, filter)`: all -> true; none -> `tripId === null`;
  trip -> `tripId === filter.tripId`.
- The service downgrades `trip` to `all` when the id is not owned by the user.

## TripPeriodRange (domain, `trips.ts`)

`{ startPeriod: string; endPeriod: string } | null` from `resolveTripPeriodRange({ periods, maxMonths? })`.

## Establishment candidate rows (repository -> domain)

Stored row: `{ name, period, amount, origin, transactionType, excludeFromBalance, categoryId | null,
categoryName | null, categoryIcon | null, isInvoicePaymentCategory, tripId | null }`
(amount = admin share).

Recurring rule: category trends rule shape plus `name`, `categoryName`, `categoryIcon`, `origin`,
`occurrenceTripIds: Record<occurrenceDate, tripId>`; amount = admin share.

## EstablishmentsReport (domain output, cents)

- `window`: `{ startPeriod, endPeriod }`
- `establishments[]` (max 50): `{ name, count, totalCents, averageCents, categories[]: { categoryId, name, icon, count } (max 3) }`
- `topCategories[]` (max 10): `{ categoryId, name, icon, totalCents, count }`
- `summary`: `{ establishmentCount, transactionCount, totalCents, averageCents, mostFrequent: name | null, highestTotal: name | null }`

Service converts cents to decimal numbers (`fromCents`) for the DTO and adds
`tripFilter: { mode, tripId?, tripName? }` and `months`.

## Category trends changes

- `CategoryTrendActualEntry.tripId?: string | null`
- `CategoryTrendRecurringRule.occurrenceTripIds?: Record<string, string>`
- `calculateCategoryTrends` input `tripFilter?: TripFilter` (default all; unchanged behavior)
