# API contract: Trips (004)

All routes: authenticated session, `Cache-Control: private, no-store`, Zod-validated, OpenAPI tag
`Trips`, envelope `{ data, error: null }` / `{ error: true, message, code }`. Foreign or unknown
trip ids return 404 `TRIP_NOT_FOUND`. Amounts are numbers in BRL (cents converted at the edge with
`fromCents`).

## `apps/api/src/routes/trips.ts` (mounted at `/trips`)

| Method and path | Body / query | 2xx response | Errors |
| --- | --- | --- | --- |
| `GET /trips` | | `TripListItem[]` ordered by `startDate` desc, then name pt-BR | 401 |
| `POST /trips` | `CreateTripInput` | 201 `Trip` | 400, 401, 409 `TRIP_OVERLAP` |
| `PATCH /trips/{id}` | `UpdateTripInput` | 200 `Trip` | 400, 401, 404, 409 `TRIP_OVERLAP` |
| `DELETE /trips/{id}` | | 200 `{ id }` (links cascade, transactions kept) | 401, 404 |
| `GET /trips/{id}` | | 200 `TripDetail` | 401, 404 |
| `GET /trips/{id}/suggestions` | `?page=1&origin=all` | 200 `TripSuggestionsPage` | 400, 401, 404 |
| `POST /trips/{id}/links` | `{ ids: string[] }` | 200 `{ ids: string[] }` (ids actually linked, after series propagation) | 400 `TRIP_NOT_LINKABLE`, 401, 404 (trip, transaction, rule or occurrence not found) |
| `POST /trips/{id}/links/remove` | `{ ids: string[] }` | 200 `{ ids: string[] }` (only the given rows/occurrences) | 400, 401, 404 |

Schemas (`packages/validators/src/trips.ts`):

```text
Trip            { id, name, startDate, endDate, note|null, createdAt, updatedAt }
TripListItem    Trip & { linkedCount, netCost }
TripDetail      { trip: Trip, summary: TripSummary, linked: TripLinkedEntry[] }
TripSummary     { netCost, expenses, reimbursements,
                  byCategory: Breakdown[], bySource: Breakdown[], byPerson: Breakdown[] }
Breakdown       { label, amount }            label "Sem categoria" | "Sem cartão ou conta" | "Sem pessoa" when missing
TripLinkedEntry { id (TransactionOutput id), name, purchaseDate, type, amount,
                  currentInstallment|null, installmentCount|null, isRecurring, personNames: string[] }
TripSuggestionsPage {
  items: TripSuggestion[], page, pageCount, total, from, to,
  originOptions: Array<{ value: "card:<id>"|"account:<id>", label }>,   fixed all/cards/accounts are UI
  filteredIds: string[]                                                  for "select all of filter"
}
TripSuggestion  { id, name, purchaseDate, amount, type, isRecurring, cardId|null, cardName|null,
                  accountId|null, accountName|null, categoryName|null,
                  currentInstallment|null, installmentCount|null }
```

Ordering: `linked` and suggestions by purchase date asc, then current installment asc, then name.

## Changes to `apps/api/src/routes/transactions.ts`

| Method and path | Body | Response | Errors |
| --- | --- | --- | --- |
| `POST /transactions` | adds optional `tripId: uuid \| null` | unchanged + `tripId` | 404 `TRIP_NOT_FOUND`, 400 `TRIP_NOT_LINKABLE` when `tripId` set on a transfer or system origin |
| `PATCH /transactions/{id}` (existing update) | adds optional `tripId` (R4 semantics) | unchanged | same |
| `PUT /transactions/recurring-rules/{id}?scope&occurrenceDate` | adds optional `tripId`; applies to `occurrenceDate` only | unchanged | same |
| `POST /transactions/bulk/trip` (new) | `{ ids: uuid[1..500], tripId: uuid \| null }` | `BulkTransactionsOutput { ids }` | 404 trip or transaction, 400 `BULK_ACTION_UNSUPPORTED` if any id is not linkable |
| `GET /transactions` and detail | | `Transaction.tripId: uuid \| null` | |

## Web client (`apps/web/src/features/trips/trips.api.ts`)

`getTrips`, `createTrip`, `updateTrip`, `deleteTrip`, `getTrip`, `getTripSuggestions(id, page,
origin)`, `linkTripTransactions(id, ids)`, `unlinkTripTransactions(id, ids)`; bulk trip lives in
`features/transactions/transactions.api.ts` as `setTransactionsTrip(ids, tripId)`.
Query keys: `["trips"]`, `["trips", id]`, `["trips", id, "suggestions", page, origin]`; link,
unlink, bulk and transaction writes invalidate `["trips"]` and `["transactions"]`.
