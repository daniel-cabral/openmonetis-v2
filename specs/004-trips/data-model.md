# Data model: Trips (004)

Schema in `packages/db/src/schema.ts`; migration generated with `pnpm db:generate` (next number after
`0031_person_report_schedules.sql`, expected `0032_*`), checked with `pnpm db:migrations:check`.
Never `drizzle-kit push`.

## Table `trips`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid PK, `defaultRandom()` | |
| `user_id` | uuid NOT NULL, FK `user.id` ON DELETE CASCADE | owner |
| `name` | varchar(60) NOT NULL | trimmed by validator; check `btrim(name) <> ''` |
| `start_date` | date (mode `date`) NOT NULL | inclusive |
| `end_date` | date (mode `date`) NOT NULL | inclusive; check `end_date >= start_date` |
| `note` | varchar(500) NULL | empty string stored as NULL (validator) |
| `created_at` / `updated_at` | timestamp, default now, `$onUpdate` | same as `tags` |

Indexes/constraints: `trips_id_user_id_unique` unique `(id, user_id)` (target of composite FKs);
`trips_user_start_idx` on `(user_id, start_date)`; checks `trips_name_not_blank_check`,
`trips_date_range_check`. No overlap constraint in SQL (research R2); overlap is a service rule.

## Table `transaction_trips`

| Column | Type | Rules |
| --- | --- | --- |
| `transaction_id` | uuid PK | one trip per stored transaction (FR-007) |
| `user_id` | uuid NOT NULL | |
| `trip_id` | uuid NOT NULL | |

FKs: `(transaction_id, user_id)` -> `transactions(id, user_id)` ON DELETE CASCADE;
`(trip_id, user_id)` -> `trips(id, user_id)` ON DELETE CASCADE (delete trip = unlink, FR-005).
Index `transaction_trips_user_trip_idx` on `(user_id, trip_id)`.

## Table `recurring_occurrence_trips`

| Column | Type | Rules |
| --- | --- | --- |
| `recurring_series_id` | uuid NOT NULL | series identity survives rule versions |
| `occurrence_date` | date (mode `date`) NOT NULL | the occurrence purchase date |
| `user_id` | uuid NOT NULL | |
| `trip_id` | uuid NOT NULL | |

PK `(recurring_series_id, occurrence_date)`. FKs: `(recurring_series_id, user_id)` ->
`recurring_transaction_series(id, user_id)` ON DELETE CASCADE; `(trip_id, user_id)` ->
`trips(id, user_id)` ON DELETE CASCADE. Index `recurring_occurrence_trips_user_trip_idx` on
`(user_id, trip_id)`. A row whose date no longer yields an occurrence is ignored on read (FR-012).

## Derived (never stored)

- `TransactionOutput.tripId: string | null` (stored rows via `transaction_trips`; occurrences via
  `recurring_occurrence_trips` keyed by series and date).
- `TripLedgerEntry` (domain input): `{ id, name, purchaseDate, type: "income" | "expense",
  installment: { current, count } | null, categoryName | null, sourceLabel | null (card name, else
  account name), shares: Array<{ personName | null, isAdmin, amountCents }> }` where `shares` is the
  split shares when split, else one share for the transaction's person with the whole amount.
  Amounts are absolute cents; sign comes from `type`.
- `TripSummary`: `{ netCostCents, expenseCents, reimbursementCents, byCategory, bySource, byPerson }`,
  each breakdown `Array<{ label, amountCents }>` sorted amount desc, label pt-BR asc.

## State and lifecycle

- Trip: created, edited (name, dates, note), deleted. Editing dates never touches links.
- Link: absent (no trip) or present; changed only by an explicit trip value on a transaction write,
  by trip-page link/unlink, by bulk set, or removed by cascade (trip, transaction or series deleted).

## Validation (validators `packages/validators/src/trips.ts`)

- `CreateTripInputSchema`: `name` trim 1..60; `startDate`, `endDate` real calendar dates
  (`dateSchema`); `endDate >= startDate` (issue on `endDate`); `note` trim max 500, `""` -> null.
- `UpdateTripInputSchema`: same fields, all required (the dialog always sends the full trip; `PATCH /trips/{id}` replaces name, dates and note).
- `TripLinkIdsInputSchema`: `ids` 1..500 unique, each a UUID or `uuid:YYYY-MM-DD`.
- `TripSuggestionsQuerySchema`: `page` int >= 1 default 1; `origin` = `all | cards | accounts |
  card:<uuid> | account:<uuid>`, default `all`.
- `BulkTripTransactionsInputSchema` (in `transactions.ts`, next to the other bulk schemas): `ids`
  UUID 1..500, `tripId: uuid | null`.
- Transaction inputs: `tripId: uuid | null`, optional, in `TransactionFieldsSchema`.
