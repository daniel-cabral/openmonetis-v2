# Research: 002 Reconciliation Core

## R1. Where matching runs
- Decision: server. `POST /reconciliations/preview` parses, hashes identities, loads candidates and memories, runs the domain matcher and returns buckets; the web only renders and keeps ephemeral decisions.
- Rationale: AGENTS.md section 1 and 12 (no financial rule in the UI). V1 ran the matcher in the browser.
- Alternatives: client-side matcher via a shared package (rejected: rule in UI, candidates leak).

## R2. What Apply trusts
- Decision: Apply re-sends the file, profile, target and invoice period plus sparse decisions by line index and the preview's `classificationDigest`; the server re-parses, re-classifies, compares the digest (mismatch = `RECONCILIATION_STALE`) and builds the plan. Missing decision = default (keep for matched lines, skip otherwise).
- Rationale: amounts and identities always come from the file (FR-009/FR-011), no forged identity or amount; concurrent edits surface as a different classification (`RECONCILIATION_STALE`).
- Alternatives: client sends line data (V1; trusts client values), server-side preview cache (state to expire, more moving parts).

## R3. Undo data
- Decision: `reconciliation_batches` row per apply (id = batch id, `undo` jsonb journal); undo by id, once; created entries carry the id in `import_batch_id`; pre-existing entries never do.
- Rationale: client cannot forge undo writes; V1's client-held payload would let any caller restore arbitrary amounts on owned rows bypassing settlement rules.
- Alternatives: V1 payload in the client (rejected above); per-row audit columns (migration on hot table, more columns than the journal needs).

## R4. File value wins in V2
- Decision: write to the effective amount. Pending account entry: settle with `amount = file value`, date = posted date (fallback launch date), through the settlement repository (settlement event recorded); undo un-settles (clears `settled_amount`). Already settled: `settled_amount` when not null, else `amount`. Card: `amount`. Account recurring occurrence: settle occurrence with amount, or align its `settled_amount`. Not alignable (kept with reason): person splits, transfers, generated origins, card entries of a paid invoice, card recurring occurrences.
- Rationale: matches `effectiveTransactionAmountSql` (`coalesce(settled_amount, amount)` when settled) so every screen shows the file value; keeps planned amount for pending-then-paid entries as V2 intends; no manual undo of settlements.
- Alternatives: always overwrite `amount` (breaks the planned/effective split on settled rows); per-occurrence planned amount column for cards (touches recurrence projection everywhere, out of scope).

## R5. Composing settlement writes in one transaction
- Decision: add an optional executor parameter to `settlePersistedTransactions` and `settleRecurringTransaction` (default: own `db.transaction`, unchanged behaviour), so the apply and undo run them inside the reconciliation transaction.
- Rationale: FR-020 atomicity; reuses the settlement rules (locks, events, split shares) instead of duplicating them.
- Alternatives: duplicate the settle SQL in the reconciliation repository (duplicated rule), sequential non-atomic calls (violates FR-020).

## R6. Recurring occurrence identity
- Decision: nullable `import_source_fingerprint`/`import_external_id` on `recurring_transaction_occurrences` with a partial unique index per user; a stamp-only occurrence row (`is_settled = false`) is created when none exists and deleted on undo.
- Rationale: FR-023 per-occurrence state, recurrence stays a rule (AGENTS.md section 11).
- Alternatives: materialize the occurrence as a transaction (forbidden), separate link table (second identity store to keep unique across).

## R7. Ignores and name mappings storage
- Decision: `reconciliation_ignores` PK `(user_id, source_fingerprint, external_id)`; `import_name_mappings` PK `(user_id, description_key)`, key = `getImportedDescriptionKey` (001 merchant key, same as V1 `normalizeDescriptionKey`).
- Rationale: V1 tables adapted to V2 identity (two columns) and key; composite PK gives the one-record-per-key upsert.

## R8. Card limit
- Decision: reconciliation creations skip `CARD_LIMIT_EXCEEDED`; the paid-invoice check (`INVOICE_ALREADY_PAID`) applies to creations only.
- Rationale: the bank already authorized the purchase; V1 had no limit check.

## R9. Account preselection
- Decision: `POST /reconciliations/detect` wraps the 001 detection and adds `suggestedAccountId` from domain `matchAccountByIdentification` over the user's active accounts.
- Rationale: keeps the 001 detect contract untouched and the heuristic out of the UI.

## R10. V1 oracle mapping
- Ported here: matcher (44), plan (20), origin `matchAccountOptionByNumber` (5) and profile-kind cases (6, mapped to the 001 registry / web default profile), review helpers except closure (31 of 35; closure 4 are 003), candidates `toAppTransaction` (7; `toBalanceStatus` table is 003), action (10, integration).
- Deferred to 003: `deriveReconciliationClosure` (4), `toBalanceStatus` (1 table), projection.
