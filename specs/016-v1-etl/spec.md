# Feature Specification: V1 to V2 Data Migration (ETL)

**Feature Branch**: `016-v1-etl`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "One-off V1 -> V2 data migration: pre-flight validator over a V1 production dump, load with global id remap and model conversions, idempotent re-runnable rehearsal, and per-user totals reconciliation. Production cutover itself is out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pre-flight validation of a V1 dump (Priority: P1)

The operator (Daniel) points the validator at a restored copy of the V1 production database and gets one report listing every row that would violate a V2 constraint, grouped by table and rule, with enough identification to fix or decide each case. The validator never writes to V1 or to V2.

**Why this priority**: The inventory has not read real V1 data; nothing else can be planned or trusted until the violations are known. It is also the cheapest, safest slice and is useful on its own.

**Independent Test**: Run the validator on a dump seeded with one known violation per rule; the report lists exactly those rows. Run it on a clean dump; the report is empty and the exit status is success.

**Acceptance Scenarios**:

1. **Given** a V1 dump with two users whose emails differ only by letter case, **When** the validator runs, **Then** both users are reported under the email-uniqueness rule with their ids and emails.
2. **Given** a V1 `lancamento` with value zero, **When** the validator runs, **Then** it is reported (V2 forbids zero amounts) with its id, user, date and name.
3. **Given** an invoice with no card, a budget with no category, a note without a title, a task without a due date, a pre-launch inbox item missing identity fields, or a paid invoice without a payment date, **When** the validator runs, **Then** each is reported under its own rule.
4. **Given** a card closing or due day outside 1 to 31, a card brand outside the V2 brand list, or a subcategory whose type differs from its parent, **When** the validator runs, **Then** each is reported; unrecognized brands are reported as "will map to other" (warning), not as blockers.
5. **Given** an installment series with fewer than 2 or more than 60 installments, duplicate installment numbers within a series, or a series whose rows disagree on name, total or card, **When** the validator runs, **Then** the series is reported with all its rows.
6. **Given** a `compartilhamentos_pagador` or any other table flagged "recreate or drop", **When** the validator runs, **Then** the report lists counts as informational (not violations) with the decision to be applied.
7. **Given** a violation, **When** the report is produced, **Then** each entry carries a severity: blocker (load cannot represent it), fixable (the load has a documented automatic rule), or informational.
8. **Given** the dump contains zero violations of blocker severity, **When** the validator ends, **Then** it prints per-table V1 row counts and exits successfully; otherwise it exits with a failure status.

---

### User Story 2 - Rehearsal load into a scratch V2 (Priority: P1)

The operator restores a V1 dump, runs the load into an empty, migrated V2 scratch database, and gets a finished V2 dataset for every user plus a load report. The same command can be run again on the same dump and ends in the same state.

**Why this priority**: This is the migration itself; the roadmap's done criterion is a rehearsal on a production dump that reconciles.

**Independent Test**: Load a dump twice into the same scratch database; compare row counts and checksums after each run; they are identical. Load into a fresh scratch database; the result equals the first.

**Acceptance Scenarios**:

1. **Given** a clean dump and an empty V2 scratch database, **When** the load runs, **Then** every V1 user appears in V2 with a new identifier, each V1 foreign key points to the matching V2 record, and the load report states per table: read, written, skipped (with reason), merged.
2. **Given** a completed load, **When** the load runs again on the same dump, **Then** no row is duplicated, no row changes, and the report shows zero new writes.
3. **Given** a load interrupted halfway (process killed), **When** it is run again, **Then** it completes and the final state equals an uninterrupted run (no partial user, no orphan rows).
4. **Given** blocker violations exist, **When** the load starts, **Then** it refuses to run and prints the pre-flight report, unless the operator supplies an explicit resolution for each blocker.
5. **Given** a rehearsal against a database that contains non-migrated data, **When** the load starts, **Then** it refuses unless told it is a scratch target, and it never runs against a database whose name or configuration marks it as production without an explicit, separate confirmation.
6. **Given** the load fails inside one user's data, **When** it stops, **Then** that user's data is rolled back entirely and the report names the user and the cause; other users' data is unaffected.

---

### User Story 3 - Per-user totals reconcile with V1 (Priority: P1)

After a load, a reconciliation report compares V1 and V2 per user, and states pass or fail for each comparison. This is the acceptance gate for the whole migration.

**Why this priority**: The constitution requires that the migration reconcile balances and invoice totals before any production run.

**Independent Test**: Load a dump, run the reconciliation; all comparisons pass. Alter one V2 amount by one cent; the reconciliation fails and names the user and figure.

**Acceptance Scenarios**:

1. **Given** a loaded user, **When** reconciliation runs, **Then** each account balance in V2 equals the V1 balance for the same cutoff, to the cent.
2. **Given** a loaded user, **When** reconciliation runs, **Then** each card invoice total per period in V2 equals the V1 total, and paid/pending status and payment dates agree.
3. **Given** a loaded user, **When** reconciliation runs, **Then** the number of transactions per month (and per type: income, expense, transfer) in V2 equals V1, after accounting for documented collapses (transfer pairs, split groups, anticipated installments), which the report lists explicitly as expected differences with their counts.
4. **Given** a loaded user, **When** reconciliation runs, **Then** per-month income and expense totals per category (child categories rolled up to their parent) agree, and per-person totals agree.
5. **Given** any mismatch, **When** the report is produced, **Then** it names the user, figure, V1 value, V2 value and difference, and exits with a failure status.
6. **Given** the whole dump, **When** all users reconcile, **Then** the report states the migration is rehearsal-ready and prints global totals.

---

### User Story 4 - Financial model conversions are correct (Priority: P1)

The load converts V1's model into V2's without changing any financial result. This story is the checklist the load must satisfy, tested on seeded fixtures.

**Why this priority**: These are the "top data risks" of the inventory; each one, if wrong, silently corrupts balances.

**Independent Test**: A fixture dump with one case of each conversion below; after load, each V2 record is as described.

**Acceptance Scenarios**:

1. **Given** V1 signed amounts (negative expenses), **When** loaded, **Then** V2 holds a positive amount plus the right type (income, expense), and the balance effect is identical.
2. **Given** a V1 transfer stored as two rows sharing a transfer id, **When** loaded, **Then** V2 holds a single transfer transaction; the balances of both accounts equal V1.
3. **Given** a V1 split group (rows with the same split group id for different people), **When** loaded, **Then** V2 holds one transaction with splits for each person whose amounts add up to the original total with no cent lost.
4. **Given** V1 installment rows grouped by series id, **When** loaded, **Then** each series gets an installment series (count 2 to 60) and every installment keeps its number, period and settled state; a series with a gap is reported and still loaded with its existing numbers.
5. **Given** V1 anticipated installments with anticipation records, **When** loaded, **Then** V2 holds anticipation records with an item per original installment including its original period; lost V1 columns (total, count, date, note, payer, category) are derived from the items or dropped as listed in the report.
6. **Given** V1 recurring ("Recorrente") rows, **When** loaded, **Then** V2 holds a recurrence rule per series with frequency inferred from the data, and occurrences; every V1 row that was settled or edited (amount, name, category, date different from the series baseline) becomes a per-occurrence exception, and the occurrence list for every month V1 had equals V1's.
7. **Given** a V1 note beginning with the invoice auto-payment marker, **When** loaded, **Then** it becomes an invoice payment against the right card and period (full or partial) and is not counted as income or expense.
8. **Given** a V1 note beginning with the refund marker pointing at another transaction, **When** loaded, **Then** it becomes a refund record linked to the original transaction, with the refund origin; the net effect on balances and category totals equals V1.
9. **Given** a V1 invoice credit line (credit marker with card, period and fingerprint), **When** loaded, **Then** it becomes a transaction with the new typed invoice-credit origin from feature 003 and is excluded from income and expense exactly as V1 excluded it.
10. **Given** a V1 account with an initial balance, **When** loaded, **Then** V2 holds an account-balance-adjustment transaction dated at the account creation so the balance equals V1; accounts flagged to exclude the initial balance from income keep that effect.
11. **Given** V1 categories and subcategories, **When** loaded, **Then** each subcategory becomes a child category of its parent (same type), transactions that pointed to a subcategory point to the child, and parent totals are unchanged.
12. **Given** V1 trips and trip links, **When** loaded, **Then** V2 holds trips (feature 004) and every transaction keeps its trip.
13. **Given** V1 note attachments, **When** loaded, **Then** V2 holds note attachments (feature 011) pointing to the same stored files; transaction attachments and the attachment library carry over with owner checks.
14. **Given** V1 accounts, cards, payers, budgets, notes with tasks, pre-launch inbox items, dashboard notification states, establishment logos and passkeys, **When** loaded, **Then** each lands in its V2 target per the inventory table mapping, with text values converted to V2 enumerations and unrecognized values mapped to the documented fallback.
15. **Given** V1 preferences, **When** loaded, **Then** user preferences (including the six from feature 012) and dashboard layout (order and hidden widgets) are split into their V2 homes.

---

### User Story 5 - Credentials, sessions and Companion (Priority: P2)

People can sign in to V2 after cutover, and disposable or non-transferable data is handled explicitly.

**Why this priority**: Without this, nobody can use their migrated data; but it is verified separately from the money.

**Independent Test**: After a rehearsal load, sign in with a V1 password and with a passkey; verify Companion tokens are absent.

**Acceptance Scenarios**:

1. **Given** a V1 credential account whose password hash format V2 accepts, **When** loaded, **Then** the person signs in with the same password; **Given** a hash the validator found incompatible, **Then** the account is reported and the person is flagged to reset the password.
2. **Given** a Google-linked account, **When** loaded, **Then** the person signs in with Google on V2 with the same email.
3. **Given** V1 passkeys, **When** loaded, **Then** they work if the installation's relying-party identity is unchanged; otherwise they are reported as not usable and not loaded as broken.
4. **Given** V1 sessions and verifications, **When** the load runs, **Then** they are not migrated; people sign in again.
5. **Given** V1 API tokens, **When** the load runs, **Then** they are not migrated, and the report lists each affected user who must re-pair the Companion on V2 (device token).
6. **Given** V1 payer shares (read/write permissions), **When** the load runs, **Then** they are not migrated; the report lists each share so the people can be re-invited in V2.

---

### User Story 6 - Disposable data is skipped on purpose (Priority: P3)

Tables with no V2 target are skipped, counted and listed so nothing disappears silently.

**Why this priority**: Safety net for reports; low effort.

**Independent Test**: Load a dump containing rows in disposable tables; report shows them as skipped with the reason.

**Acceptance Scenarios**:

1. **Given** rows in sessions, verifications, saved AI insights, import category mappings, reconciliation ignores and import name mappings, **When** the load runs, **Then** each table is reported as skipped by decision (disposable, re-learnable, or re-doable) with its row count.
2. **Given** a table that is not in the inventory mapping (a V1 table added later), **When** the validator runs, **Then** it fails with "unmapped table" instead of ignoring it.

### Edge Cases

- User with no data, or with only an admin payer and nothing else: loads as a valid empty user.
- V1 `lancamentos` referencing a deleted account, card, category or payer (dangling references): reported by the validator as a blocker.
- Case-duplicate emails or duplicate passkey credential ids: blocker with a required operator decision.
- Name collisions after merging subcategories into categories (same name under different parents, or a subcategory that shares a name with a root category of the same type): handled by parent scoping and reported when a rename is needed.
- Amount rounding: V1 numeric(12,2) to integer cents; any value with more than 2 decimals is reported.
- Dates and periods: V1 text periods and dates convert without timezone shifts; a transaction near a month boundary stays in the same month.
- Very large users (tens of thousands of transactions): load completes without exhausting memory; progress is reported per user.
- The V1 dump has newer columns or tables than the inventory: validator fails with the list of unknown schema elements.
- Re-running with a different dump into the same scratch database: refused unless the scratch database is reset.
- Stored files (S3 keys) are referenced, not copied; the report lists attachments whose file is missing from the bucket if a bucket check is requested.
- No outbound email, notification or Companion call is triggered by the load.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a read-only pre-flight validator that takes a V1 database (a restored dump) and reports every row that would violate a V2 constraint, with table, row id, user, rule, severity (blocker, fixable, informational) and a human-readable reason.
- **FR-002**: The validator MUST cover at least: case-insensitive email duplicates; duplicate passkey credential ids; zero amounts and amounts with more than two decimals; dangling references; invoices without a card; budgets without a category; notes without a title or beyond length limits; tasks without due date; inbox items missing identity fields or with non-positive amounts; paid invoices without payment date; card day and brand rules; subcategory type mismatches and name collisions; installment series count, duplicate numbers and inconsistent members; recurrence series that cannot be reduced to a rule; markers that point to a missing target; admin payer cardinality (exactly one per user) and blank payer names; password hash compatibility; unknown tables or columns.
- **FR-003**: The validator MUST also print per-table V1 row counts and the list of tables skipped by decision, and MUST fail on any V1 table not present in the inventory mapping.
- **FR-004**: System MUST load V1 data into an empty, migrated V2 scratch database, creating a new identifier for every record and keeping one global mapping from every V1 id to its V2 id, persisted so re-runs and reconciliation can use it.
- **FR-005**: The load MUST be idempotent and resumable: running it again on the same dump yields the same V2 state with no duplicate rows; an interrupted run can be resumed; each user is loaded atomically.
- **FR-006**: The load MUST refuse to start when blockers exist without an explicit operator resolution recorded per blocker, and MUST refuse to target a non-scratch or production-marked database without a separate explicit confirmation. Running against production is NOT part of this feature.
- **FR-007**: The load MUST convert signed V1 amounts into positive integer cents with a type, preserving every balance effect.
- **FR-008**: The load MUST synthesize an installment series for every V1 installment group and preserve installment numbers, periods, settled state and anticipation records (with an item per original installment and its original period).
- **FR-009**: The load MUST rebuild recurrence as V2 rules with occurrences; settled or edited V1 rows MUST become per-occurrence exceptions; the occurrences generated for every month V1 contained MUST equal V1's rows for that month (count and amount).
- **FR-010**: The load MUST convert invoice auto-payment notes into invoice payments (full and partial), refund notes into refund records with their origin, and invoice credit lines into transactions with the typed credit origin from feature 003; none of them may count as income or expense unless V1 counted them.
- **FR-011**: The load MUST collapse transfer row pairs into single transfers, split groups into one transaction with splits, and move initial account balances into balance-adjustment transactions, all without changing any balance or any per-person total.
- **FR-012**: The load MUST convert subcategories into child categories, trips into the trips entity (feature 004), and note attachments into note attachments (feature 011), and MUST carry transaction attachments, the attachment library, budgets, notes and tasks, pre-launch inbox items (with synthesized identity fields), notification states, logos, passkeys and credentials per the inventory mapping.
- **FR-013**: The load MUST split V1 user preferences into V2 user preferences (including the preferences of feature 012) and dashboard preferences.
- **FR-014**: The load MUST NOT migrate sessions, verifications, saved AI insights, import category mappings, reconciliation ignores, import name mappings, API tokens or payer shares, and MUST list per user the Companion re-pairing and share re-invitations required.
- **FR-015**: System MUST provide a reconciliation report per user comparing V1 and V2: account balances, invoice totals and status per card and period, transaction counts per month and type (with documented collapses listed), per-month totals per root category, and per-person totals; any difference fails the run.
- **FR-016**: Every report (validation, load, reconciliation) MUST be reproducible from the same inputs, machine-readable and human-readable, and MUST NOT contain password hashes, tokens or file contents; identifiers and emails appear only where needed to act.
- **FR-017**: The tool MUST connect to V1 read-only, MUST never write to V1, MUST use a single worker thread against any shared database by default, and MUST NOT trigger emails, notifications or external calls.
- **FR-018**: The migration MUST run only through documented commands and MUST include a runbook describing validate, rehearse, reconcile, and the information the operator needs to decide the cutover.
- **FR-019**: Feature 016 MUST be implemented only after every other `port` / `adapt` feature it loads into exists (see Dependencies); missing target features MUST cause the validator to report their data as blockers rather than dropping it.

### Key Entities *(include if feature involves data)*

- **V1 dump / source**: a restored copy of the V1 production database, treated as read-only input.
- **Pre-flight report**: findings (table, row, rule, severity, reason) plus counts per table.
- **Operator resolution**: an explicit recorded decision for a blocker (rename, drop, merge, skip) so a load can proceed.
- **Id map**: persistent mapping of every V1 identifier to its V2 identifier, per table.
- **Load report**: per table and per user, rows read, written, merged, skipped (with reason) and expected collapses.
- **Reconciliation report**: per user figures from V1 and V2, difference and pass/fail.
- **Re-pairing list**: users who must re-pair the Companion or re-invite shared people.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The validator reports 100% of seeded violations in the test dump and produces no finding on a clean dump.
- **SC-002**: Running the load twice on the same dump produces identical row counts and content checksums in the second run, with zero new writes.
- **SC-003**: After a rehearsal on the production dump, for every user, 100% of account balances, invoice totals and monthly transaction counts reconcile with V1 to the cent (expected collapses listed).
- **SC-004**: An interrupted and resumed load ends in a state equal to an uninterrupted load.
- **SC-005**: A full rehearsal (validate, load, reconcile) on the production dump finishes unattended in under 60 minutes.
- **SC-006**: 0 V1 rows disappear silently: every row of every V1 table is accounted for as loaded, merged, or skipped by documented decision, in the load report.
- **SC-007**: Passwords, tokens and file contents appear in 0 reports or log lines.
- **SC-008**: The operator can decide the cutover from the reconciliation report alone, without opening the database.

## Assumptions

- Production cutover, V1 shutdown, DNS and the final production run are out of scope; Daniel decides them after a passing rehearsal.
- The rehearsal runs on a restored production dump on the operator's machine, never against live V1 or live V2.
- Features 001 to 015 are merged first (016 depends on all), in particular 003 (typed invoice-credit origin), 004 (trips), 011 (note attachments) and 012 (preferences); the V2 schema at the time of implementation is the load target.
- Recurrence decision (inventory): V2 rules plus occurrences; settled or edited V1 rows become per-occurrence exceptions. Frequency is inferred from V1 dates; a series whose pattern cannot be inferred is reported as a blocker for operator decision rather than guessed.
- Blockers default to "stop and report"; the operator may resolve each explicitly (the report states available choices); no automatic data deletion.
- Password hashes are portable if both sides use the same hash format; the validator tests this on real data and falls back to forced password reset.
- Passkeys survive only if the relying-party domain is unchanged; otherwise users re-register them.
- Stored attachment files stay in place; only database references are migrated.
- The tool is operator tooling (not a user feature) and lives outside the web UI; it is fork-only and not intended for the upstream PR.
- Expected differences between V1 and V2 counts come only from documented collapses (transfer pairs, split groups, anticipated installments); any other difference is a failure.

## Source

V1 evidence: `src/db/schema.ts` (29 tables; `lancamentos` at about line 690 with `valor`, `condicao`, `tipo_transacao`, `qtde_parcela`, `parcela_atual`, `qtde_recorrencia`, `realizado`, `dividido`, `antecipado`, `series_id`, `split_group_id`, `transfer_id`, `ofx_fit_id`, `viagem_id`, `subcategoria_id`); `src/shared/lib/accounts/constants.ts` (`AUTO_FATURA:`, `AUTO_FATURA:CREDITO:`, `AUTO_REEMBOLSO:` markers).

V2 evidence: `packages/db/src/schema.ts` (transactions with amount-nonzero check and `transaction_origin`; installment series; recurring rules; refunds; invoice payments), `docs/recurring-transactions.md`, `docs/settlements.md`.

Inventory rows covered: section 3 in full (all 29 V1 tables, "Top data risks" 1 to 8, and "Not verified yet"), the Decisions (cutover gate, recurrence in the ETL, trips as own entity, subcategories as child categories, invoice credit as typed origin), and section 1 rows that define targets: Update email and preferences (012), Note attachments (011), Trips (004), Invoice credit line (003), API tokens (re-pair), Payer sharing (recreate).

Kept / changed / dropped vs V1: kept every financial fact and per-user ownership; changed the model (positive amounts, rules and occurrences, typed origins, child categories); dropped sessions, verifications, tokens, shares, regenerable insights and re-learnable mappings, each reported.

## Dependencies

- Depends on all other features (001 to 015): load targets, in particular 003 (invoice-credit origin), 004 (trips), 011 (note attachments), 012 (preferences), and the V2 recurrence, installment and invoice models already on `main`.
- Roadmap lane: orchestrator; runs last.
- Constitution principle IV: the migration must be repeatable on a production dump and reconcile totals before any production run.
