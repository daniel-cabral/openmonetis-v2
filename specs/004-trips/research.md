# Research: Trips (004)

All decisions taken autonomously (user unavailable). Format: Decision, Rationale, Alternatives.

## R1. Where the transaction-to-trip link lives

- **Decision**: two link tables. `transaction_trips` (one row per linked stored transaction, PK
  `transaction_id`) and `recurring_occurrence_trips` (one row per linked recurring occurrence, PK
  `(recurring_series_id, occurrence_date)`). Both carry `user_id` and use composite foreign keys
  `(x_id, user_id)` with `ON DELETE CASCADE` toward `transactions`, `recurring_transaction_series`
  and `trips`.
- **Rationale**: composite FKs give database-level ownership (same pattern as `transaction_tags`).
  Deleting a trip cascades only the link rows, so transactions survive (FR-005, SC-006) without a
  `SET NULL` on a composite FK (which would also null `user_id`). The 87K transactions table and its
  check constraints stay untouched; the link is read through one subquery column.
- **Alternatives**: `transactions.trip_id` column (needs `ON DELETE SET NULL (trip_id)` column list or
  a single-column FK without ownership; rejected); storing the occurrence link in
  `recurring_transaction_occurrences` (its rows mean settlement/due-date state and `is_settled` is
  NOT NULL; creating one for a trip link would materialize state; rejected, FR-012).

## R2. Overlap enforcement

- **Decision**: pure domain function `findOverlappingTrip(candidate, trips, excludeId)` called by the
  service before insert/update; inclusive ranges compared as `YYYY-MM-DD` strings.
- **Rationale**: matches V1; message needs the conflicting trip, which a DB error cannot give.
- **Alternatives**: Postgres `EXCLUDE USING gist (daterange)` (needs `btree_gist` extension in every
  install and still needs the domain check for the message; concurrency race between two creates by
  the same user is negligible). Rejected for now, noted as a hardening option.

## R3. Atomic link writes from the transaction form

- **Decision**: `tripId` is a field of create/update transaction inputs. The transactions repository
  writes the link inside its existing `db.transaction` through helpers exported by
  `trips.repository.ts` (`linkTransactionsToTrip`, `unlinkTransactions`, `setOccurrenceTrip`), the
  same way it calls `replaceTransactionTags` from `tags.repository.ts`.
- **Rationale**: one request, one database transaction; small hook in the shared hotspot.
- **Alternatives**: second request from the web after saving (non-atomic, rejected).

## R4. Propagation rule

- **Decision**: domain `planTripLinkChange({ storedTripId, requestedTripId, condition, seriesId })`
  returns `none | linkRow | linkSeries | unlinkRow`. `requestedTripId === undefined` or equal to the
  stored value gives `none`; `null` gives `unlinkRow`; a different id gives `linkSeries` when the
  row is an installment with a series, else `linkRow`. Applied to the edited row only, whatever the
  edit scope (`single`, `future`, `series`).
- **Rationale**: V1 `setTripForTransactions` + "present and different" check (clarification Q2);
  keeps 7/10 unlinked when 3/10 is re-saved.

## R5. Eligibility

- **Decision**: domain `isTripLinkable({ type, origin })` = `type !== "transfer"` and origin in
  `regular | refund`. Excludes `invoicePayment`, `invoiceAdjustment`, `accountBalanceAdjustment`,
  `personSettlement`. A new `"trip"` case in `canApplyBulkTransactionAction` delegates to it (OCP:
  new case, existing cases untouched).
- **Rationale**: typed origins replace the V1 `AUTO_FATURA:` note prefix (spec Assumptions).

## R6. Trip summary and linked list

- **Decision**: domain `summarizeTrip(entries)` over `TripLedgerEntry` values in integer cents.
  Entries come from (a) stored linked transactions read by `trips.repository.ts` with category,
  card, account, person (name, role) and split shares; (b) linked recurring occurrences resolved
  through an injected port `getRecurringOccurrence(ruleId, date, userId)` bound to
  `transactionsService.getRecurringRuleOccurrence`; the repository maps
  `(series, date)` to the rule version active on that date. A port error
  `INVALID_RECURRING_OCCURRENCE` or `RECURRING_RULE_NOT_FOUND` drops the entry (orphan link,
  clarification Q4).
- **Own share**: admin split share when split, else whole amount when the person is admin, else 0.
  Expense = own expense shares; reimbursement = own income shares; net = expense - reimbursement;
  person breakdown = every person's expense share (missing name "Sem pessoa"); category and source
  breakdowns use only own expense shares ("Sem categoria", "Sem cartão ou conta"); ordering amount
  desc, tie by label `localeCompare(.., "pt-BR")`.
- **Rationale**: reuses the occurrence visibility and amount rules already in the transactions
  service (no duplication of recurrence expansion); V1 formula (summary.ts).
- **Trips list**: the service summarizes every trip from one batched read of links
  (`listTripLedgerRowsForUser(userId)`); trips per user are few, no SQL aggregate needed.

## R7. Suggestions

- **Decision**: injected port `listTransactionsByPurchaseDate(userId, start, end)` bound to
  `transactionsService.listTransactions(userId, ListTransactionsQuerySchema.parse({ dateStart,
  dateEnd, pageSize: 100 }), false)` (same reuse pattern as the tags report). The service keeps
  rows with `tripId === null` and `isTripLinkable`, then domain functions:
  `dedupeTripSuggestions` (one per installment series, first by purchase date / installment),
  `buildTripSuggestionOriginOptions`, `filterTripSuggestionsByOrigin`, `paginateTripSuggestions`
  (20 per page, clamp). Response also returns `filteredIds` (all ids of the filtered list) for
  "select all".
- **Rationale**: `listTransactions` with `dateStart/dateEnd` filters stored rows by purchase date
  (`listTransactionsByPurchaseDateRange`) and expands recurring occurrences, so one source covers
  both kinds. Implementation must confirm in the integration test that a recurring occurrence inside
  the range appears (risk noted in plan).
- **Alternatives**: a dedicated SQL query plus own recurrence expansion (duplicates rules; rejected).

## R8. Link targets in the API

- **Decision**: link/unlink bodies take `ids: string[]` (1 to 500) where each id is a
  `TransactionOutput.id`: a UUID (stored transaction) or `"{recurringRuleId}:{YYYY-MM-DD}"`
  (recurring occurrence, the id format already produced by `toRecurringOccurrenceOutput`). Domain
  `parseTripLinkTarget` splits them. Bulk bar uses `POST /transactions/bulk/trip` with UUIDs only.
- **Rationale**: the web already holds these ids for every row; no new identity scheme.

## R9. Output field

- **Decision**: `TransactionOutput.tripId: uuid | null` (optional in the schema). Stored rows: subquery
  column in `transactionColumns`. Occurrences: jsonb map subquery `recurringOccurrenceTripIdsSql`
  (date -> tripId per series) added to the rule selects in `transactions.repository.ts`, read in
  `toRecurringOccurrenceOutput`.
- **Rationale**: form edit needs the stored value; suggestions need "unlinked".

## R10. Errors and PT-BR messages

- **Decision**: API codes `TRIP_NOT_FOUND` (404), `TRIP_OVERLAP` (409), `TRIP_NOT_LINKABLE` (400).
  English messages in the API; `trips.presentation.ts` maps codes to PT-BR. The overlap message
  `As datas se sobrepõem à viagem "Lisboa" (12/05/2026 a 22/05/2026).` is built on the web with the
  same domain `findOverlappingTrip` over the cached trips list (no rule duplication).
- **Rationale**: AGENTS.md section 12 (never show API text); error envelope has no details field.

## R11. Prefill

- **Decision**: domain `findTripForDate(trips, date)`; the form uses it only in create mode while the
  field is untouched. Copies of a transaction (`copyTransaction`) are created without a trip.
- **Rationale**: V1 `resolveAutoTripId`; copy is a new purchase, usually outside the trip.

## R12. Out of scope

- Trip filter in the transactions list and reports (005), ETL (016), mobile, person selector on the
  trip page, Postgres exclusion constraint, "min/max period of linked rows" read (005).
