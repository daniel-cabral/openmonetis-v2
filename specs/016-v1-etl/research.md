# Research: V1 to V2 Data Migration (016)

Inputs: spec (Clarifications 2026-11-12 are settled and not revisited), V2 code at `main`
(`835374e`), V1 code at `D:\Repos\daniel-cabral\openmonetis`, and the restored production dump
(`openmonetis-v1-source`, PG 18, read-only role). Evidence below is counts and value shapes only.

## Real dump profile (evidence used by the decisions)

| Fact | Value |
|---|---|
| Tables | 29, all in the inventory mapping; V1 ids are `uuid` except Better Auth tables (`text`) and every `user_id` (`text`) |
| `lancamentos` | 1625: 798 "À vista", 78 "Parcelado" (25 series), 749 "Recorrente" (21 series); all rows for the admin payer; no row has both or neither of account and card |
| Signs | every Despesa negative, every Receita positive; 3 zero rows, all "Recorrente" |
| Recurrence shape | every series monthly (V1 only generates monthly, `src/features/transactions/actions/core.ts:798`); name, category, target and payer constant inside every series; amount varies in 15, purchase day in 11, due day in 1; gaps (deleted occurrences) in 2; one series has 2 rows in the same period; 4 series end before `qtde_recorrencia` |
| Recurrence periods | non-card: `periodo` = month of purchase date = month of due date (459 boleto rows); card: `periodo` follows closing day 8 with closing-day purchases on the next invoice (15 of 15) |
| Card singles | 504 of 542 follow the same closing rule; 38 carry a manually chosen invoice period |
| Boleto payment date | 49 rows; 2 recurring rows paid in a month different from `periodo` |
| Markers | 6 `AUTO_FATURA:<card>:<period>[:<id>]` payments (one partial, 4th segment), 7 `AUTO_FATURA:CREDITO:<card>:<period>:[fingerprints]` credit lines, 0 `AUTO_REEMBOLSO:` |
| Initial balance | 1 account with `saldo_inicial`; a matching "saldo inicial" Receita row exists with the same value; `excluir_saldo_inicial_receitas = false` |
| Invoices | 6 `faturas` (5 `pago`, 1 `pendente` with a partial payment); V1 stores no paid date |
| Reconciliation stamps | 713 rows carry `ofx_import_fingerprint` (JSON list of V1 fingerprints), 348 `import_batch_id` |
| Inbox | 384 `pre_lancamentos` (274 discarded, 110 processed); every processed item has `lancamento_id` null |
| Credentials | 1 `credential` account, hash shape `<32 hex>:<128 hex>` (Better Auth scrypt); 1 passkey; V1 Better Auth 1.6.22, V2 1.7.16 |
| Empty tables | transfers, splits, anticipations, refunds, subcategories, attachments, note attachments, notes, budgets, preferences, shares, logos, notification states, insights, reconciliation ignores |

## R1. Where the tool lives and how it runs

- **Decision**: operator CLI under `apps/api/src/scripts/v1-etl/`, entry `cli.ts`, exposed as
  `etl:v1` in `apps/api/package.json` (root alias `etl:v1`). Commands: `validate`, `load`,
  `reconcile`, `rehearse` (validate, load, reconcile in sequence). Full contract:
  [contracts/cli.md](contracts/cli.md).
- **Rationale**: `apps/api/src/scripts/` already hosts operator scripts that import
  `@openmonetis/db` and domain directly (`mock-data.ts`, `recurring-external-expenses.worker.ts`).
  Living inside `apps/api` lets reconciliation construct the real V2 services and repositories
  (`createAccountsService`, `createInvoicesService`, ...) in-process, and lets the integration test
  reuse `test-support/integration-database.ts`. It adds only a new folder, so upstream merges never
  conflict. The tool is fork-only (spec Assumptions) and is excluded from any upstream PR branch.
- **Alternatives**: a new `apps/v1-etl` workspace (rejected: an app shape not listed in AGENTS.md
  section 4, and it would need to import services/repositories from `apps/api`, which has no export
  surface); a standalone SQL script (rejected: cannot reuse V2 domain rules or prove reconciliation
  through V2 services).

## R2. Where conversion rules live

- **Decision**: V1-to-V2 translation rules are pure functions in
  `apps/api/src/scripts/v1-etl/conversions/*.ts` (no I/O, unit tested). Every V2 financial rule
  they need comes from `@openmonetis/domain`: cents (`money.ts`), periods
  (`deriveTransactionPeriod`, `addMonthsToPeriod`), recurrence expansion
  (`listRecurrenceDatesInPeriod`, `getEffectiveRecurringEndDate`, `resolveRecurringDueDate`),
  invoice dates (`getInvoiceDates`), installment split (`splitAmountIntoInstallments`), default
  categories (`createDefaultCategoryDrafts`).
- **Rationale**: the translation knows the V1 model (Portuguese enums, note markers, materialized
  recurrences), which constitution III and II keep out of the upstream domain package. The
  conversions never compute a V2 financial result on their own; they choose a V2 representation and
  then verify it with V2 domain functions (R8). Recorded in plan Complexity Tracking.
- **Alternatives**: `packages/domain/src/v1-migration.ts` (rejected: fork-only V1 knowledge in the
  upstream domain, dead code after cutover).

## R3. Writing to V2: direct inserts, not services

- **Decision**: a writer module (`load/v2-writer.ts`) inserts with Drizzle and the
  `@openmonetis/db` schema, one database transaction per user, in FK order. All checks and composite
  owner FKs of the V2 schema stay active as the safety net; the reconciliation (R15) is the proof.
- **Rationale**: V2 services are request use cases: they mint random ids, stamp "today"
  (`getCurrentPeriodInBrazil`, settled-date "no future" rules, transfer balance snapshots), require
  ownership round-trips, cannot set historical `created_at`, and some trigger side effects (FR-017
  forbids emails, notifications, Companion or S3 calls). Deterministic ids (R4) and historical
  settled states are impossible through them. `mock-data.ts` sets the precedent of seeding through
  the schema.
- **Constraints the writer reproduces from V2 code** (otherwise only the services know them): user
  provisioning normally done by Better Auth hooks (`apps/api/src/auth.ts:269`: admin person +
  `categoriesService.seedDefaults`), invoice payment rows (`invoice_payments` + allocations + an
  `invoicePayment` transaction), transfer pairs (`transactions.service.ts:1245`), payload
  fingerprints of inbox items (`inbox.service.ts:361`).
- **Alternatives**: HTTP API or in-process services (rejected for the reasons above).

## R4. Identifiers and the id map

- **Decision**: every V2 id is a UUIDv5 of a fixed ETL namespace and a stable key
  (`<v1 table>:<v1 id>[:<role>]`, e.g. `lancamentos:<id>`, `installment_series:<series_id>`,
  `recurring_rule:<series_id>:<run index>`). The map is also persisted in a tool-owned schema
  `v1_etl` in the target database: `v1_etl.id_map`, `v1_etl.runs`, `v1_etl.user_loads`
  ([data-model.md](data-model.md)). `node:crypto` provides SHA-1 for v5; no new dependency.
- **Rationale**: FR-004 asks for new identifiers plus a persisted global mapping. Deterministic ids
  make every re-run produce the same rows, make checksums comparable across scratch databases
  (US2 independent test), and let reconciliation join V1 and V2 without guessing. A separate schema
  keeps the state out of the application schema and out of Drizzle snapshots.
- **Note**: `v1_etl` is created by the tool with idempotent `CREATE ... IF NOT EXISTS`, not by a
  Drizzle migration, because it is not application schema and never exists outside a rehearsal or
  the cutover database (Complexity Tracking).
- **Alternatives**: random ids + map lookups (rejected: re-runs on a fresh scratch would differ);
  a JSON map file (rejected: not transactional with the per-user load); a table in `public`
  through a migration (rejected: ships ETL state to every V2 installation).

## R5. Idempotency, resume and per-user atomicity

- **Decision**: the run starts by computing a dump fingerprint (per table: row count and
  `md5(string_agg(row::text ORDER BY pk))`, then SHA-256 of the list). `v1_etl.runs` holds one
  fingerprint per target; a different fingerprint is refused (spec edge case: different dump into
  the same scratch). Users load sequentially; each user is one transaction that writes all rows, its
  `id_map` rows and a `user_loads` row (`status = loaded`, content checksum). A user already
  `loaded` for the same fingerprint is skipped with zero writes (SC-002). A killed process rolls
  back the open user transaction, so a re-run resumes at that user (SC-004). A failure inside a user
  rolls that user back, is recorded in the report (user, table, constraint/cause) and the run
  continues with the next user, then exits non-zero (US2.6).
- **Content checksum**: per user, computed from the **database rows**, never from the plan: for each
  loaded table, the rows owned by the user ordered by primary key, restricted to a fixed per-table
  column list (the columns the plan writes; database defaults such as `updated_at` and any
  `defaultNow()` column the plan does not set are excluded), normalized (dates `YYYY-MM-DD`,
  numerics with 2 decimals, timestamps ISO UTC, jsonb with sorted keys, nulls explicit), then
  SHA-256 of the sequence. The writer computes it inside the user's transaction after the inserts;
  `reconcile` and the integration test recompute it the same way and compare.
- **Alternatives**: upsert per row (rejected: harder to prove "no row changes" and leaves partial
  users on kill); one global transaction (rejected: one bad user would block all).

## R6. Safety guards

- **V1 is read-only by three layers**: the operator uses a read-only role (quickstart), the pool
  sets `default_transaction_read_only = on`, and extraction runs inside one
  `REPEATABLE READ READ ONLY` transaction per command so all tables come from one snapshot.
- **Target guard** (`load/guards.ts`), checked before any write:
  1. target URL differs from the V1 URL;
  2. all Drizzle migrations in `packages/db/drizzle/meta/_journal.json` are applied;
  3. `--scratch` flag present; otherwise refuse (US2.5);
  4. every `public.user` row in the target is in `v1_etl.id_map` for the same fingerprint, else
     refuse ("target holds non-migrated data");
  5. production-marked target (`NODE_ENV=production`, database name matching `prod`, or a
     non-loopback host) is refused unless `--confirm-production=<database name>` matches exactly.
     This path exists for the future cutover but is out of scope and only tested for refusal.
- **Explicit target client**: the writer and the state module build their own `pg` Pool and
  Drizzle client from `--target-url`; they never use the `@openmonetis/db` singleton, because
  `resolveDatabaseUrl` ignores `EXTERNAL_DATABASE_URL` under `NODE_ENV=production`
  (`packages/db/src/database-url.ts`). Reconciliation needs the V2 repositories, which import that
  singleton, so the CLI also sets `DATABASE_URL` and `EXTERNAL_DATABASE_URL` to the target before
  importing them and refuses to reconcile when `resolveDatabaseUrl()` differs from `--target-url`.
- **Single worker**: users load sequentially; both pools use `max: 1` (FR-017). No S3, mail or HTTP
  client is constructed; the optional bucket check (`--check-bucket`) only issues HEAD requests.

## R7. Restoring a PG 18 dump next to a PG 16 V2

- **Decision**: restore the dump into a dedicated `postgres:18` container (`openmonetis-v1-source`,
  `127.0.0.1:7001`) with `pg_restore --no-owner --no-privileges`, create a read-only role, and point
  `--v1-url` at it. The scratch V2 database is a new database (`openmonetis_v1_rehearsal`) inside
  the existing V2 container (PG 16), migrated with `pnpm db:migrate`. Steps in
  [quickstart.md](quickstart.md).
- **Rationale**: `pg_restore` cannot downgrade a custom-format archive across major versions; the
  ETL reads V1 over a normal connection, so versions do not need to match.
- **Tests** do not need PG 18: the fixture V1 database is created from a committed, sanitized
  schema-only SQL (`__fixtures__/v1-schema.sql`, from `pg_dump --schema-only` of the source with
  PG 17+ only `SET` lines removed) inside the PG 16 test server.

## R8. Recurrence conversion against the V2 model as it exists

V2 has no per-occurrence exception table. In code (`recurring-expenses.repository.ts`,
`packages/domain/src/recurring-transactions.ts`):

- a series is `recurring_transaction_series` plus versions in `recurring_transaction_rules`, each
  with `anchorDate`, `startDate`, `endDate` (version limit) and `recurrenceEndDate` (series deadline);
- an edit of one occurrence ("editSingle") is a version whose `startDate = endDate =` that date;
- `skip` ends the version the day before and clones it from the day after: a gap between versions;
- settlement state lives per occurrence in `recurring_transaction_occurrences`
  (`isSettled`, `settledAmount`, `settledDate`, `accountId`, `boletoPaymentDate`), unique per
  series and date.

So the spec's "versions" and "per-occurrence exceptions" map to these V2 primitives:

| Spec term | V2 representation |
|---|---|
| change that holds to the end | version from that occurrence to the series end |
| isolated deviation | one-occurrence version (`startDate = endDate`) |
| skip (gap, zero amount) | no version covers that date |
| settled row | `recurring_transaction_occurrences` row with `isSettled = true` |

- **Decision (algorithm, pure, `conversions/recurrence.ts`)**:
  1. Group a series' rows by `periodo`; rows of the same period that share `split_group_id` form one
     occurrence (owner row plus splits). More than one occurrence in a period is `fixable`
     (`recurrence.duplicate-occurrence`, 1 series in the real dump): the documented rule is `detach`
     (the row whose date is farther from the series day becomes a single transaction, same values,
     totals unchanged); the operator may override with `drop`.
  2. Frequency is `monthly`: V1 can only generate monthly series. A gap is a deleted occurrence,
     not a different frequency, so inferring bimonthly from gaps would be a guess.
  3. Zero-amount occurrences are treated as gaps (Clarification 2) and listed as `fixable`.
  4. The occurrence attributes are: type, absolute amount in cents, name, category (child category
     if `subcategoria_id`), account or card, payment method, person/splits, purchase day, due day.
     Consecutive occurrences (no gap) with equal attributes form a **run**. Each run becomes one
     version: `anchorDate = startDate =` first date of the run, `endDate =` last date of the run,
     `dueDate =` first due date of the run, `status = active`. A run of length 1 between runs is
     the isolated-deviation case; a run that reaches the last occurrence is the holding change.
  5. Every version of the series gets the same `recurrenceEndDate`: the last V1 occurrence's date as
     V2 compares it, i.e. `resolveRecurringDueDate(lastDate, dueDate) ?? lastDate` (V2 tests the
     resolved due date against the deadline, `transactions.ts:1250`), so a boleto due after its
     purchase date is not cut off.
  6. Each settled occurrence (`realizado = true`) becomes an occurrence row with `isSettled = true`,
     `accountId` from V1, `boletoPaymentDate` from `dt_pagamento_boleto`, `settledAmount` and
     `settledDate` null (V2 does not invent effective data for legacy settlements,
     `docs/settlements.md`). `realizado` null or false needs no row. Every version has
     `recurring_transaction_rules.is_settled = null`, because V2 reads
     `occurrence?.isSettled ?? rule.isSettled` (`accounts.service.ts:535`): a non-null rule value
     would settle every occurrence without a row.
  7. **Round-trip verification**: for every month from the series' first to last period, expand the
     versions with `listRecurrenceDatesInPeriod` and derive each date's period with
     `deriveTransactionPeriod` (card closing rule from R12, due date for non-card). The expansion
     must equal the V1 occurrences of that period in count, date, amount and due date. Any mismatch
     is a blocker (`recurrence.not-reproducible`) and the series is never loaded wrong.
- **Real dump check**: card recurrences reproduce `periodo` only with
  `closingDayPurchasesNextInvoice = true` (purchases on day 8 go to the next invoice), which R12
  sets from V1 behavior.
- **Alternatives**: one version per V1 row (rejected: hundreds of versions per series, unusable in
  the V2 report and edit flows); plain single transactions (rejected by the inventory decision);
  a new exception table (rejected: V2 schema change for the ETL only).

## R9. Installments and anticipations

- **Decision**: one `installment_series` per V1 `series_id` of "Parcelado" rows:
  `totalInstallments = qtde_parcela`, `trackedFromInstallment = min(parcela_atual)`,
  `originalAmount` = sum of present installments plus the modal installment amount for each
  missing number. A gap is a number missing between `trackedFromInstallment` and
  `totalInstallments` inclusive; numbers below `trackedFromInstallment` are untracked, not gaps.
  Gap series are `fixable`, reported with their missing numbers (1 in the real dump). Each row keeps `currentInstallment`, `period`, `isSettled`. Rows must agree on name, card
  or account, category and total count, else blocker.
- Anticipations (0 in the real dump, fixture only): `installment_anticipations`
  (`targetPeriod = periodo_antecipacao`, `discount = desconto`) plus one item per id in
  `parcelas_antecipadas` with `originalPeriod` = that installment's V1 period. The V1
  `lancamento_id` adjustment row maps to `adjustmentTransactionId`. Lost columns (`valor_total`,
  `qtde_parcelas`, `data_antecipacao`, `anotacao`, `pagador_id`, `categoria_id`) are listed per row
  in the load report as dropped or derived.

## R10. Markers: invoice payments, credit lines, refunds

- **Invoice payment** (`AUTO_FATURA:<card>:<period>` full, `...:<id>` partial): one
  `invoice_payments` row (card, period, account, `amount = |valor|`, `paidAt = data_compra`), one
  allocation to the admin person (or per split person), and the payment transaction
  (`origin = invoicePayment`, expense, category "Pagamentos", account) linked by `transactionId`,
  matching `invoices.service.ts`. Excluded from income and expense in both systems.
- **Invoice row**: `paymentStatus` from `status_pagamento` (`pago`/`pendente`). Only for `pago`:
  `paidAt` = date of the latest payment of that card and period (V1 stores none) and
  `paymentAccountId` = that payment's account. For `pendente` both stay null, as
  `invoices_payment_status_metadata_check` requires, even when partial payments exist (the real
  dump has one pending invoice with a partial payment; its payment rows still load). A `pago`
  invoice with no payment row is a blocker (`invoice.paid-without-date`). Reconciliation uses the
  same rule as the V1 payment date (US3.2).
- **Credit line** (`AUTO_FATURA:CREDITO:<card>:<period>:...`): income transaction,
  `origin = invoiceCredit`, `credit_card`, card, period from the marker.
- **Refund** (`AUTO_REEMBOLSO:<id>`): refund transaction `origin = refund` plus a
  `transaction_refunds` row to the mapped source; a missing source is a blocker.

## R11. Transfers, splits and the initial balance

- **Transfers (V2 transfer pair, spec amended)**: V2 does not store a transfer as one row. It stores **two rows**
  of type `transfer`, signed amounts (negative on the source), sharing one `transferId`
  (`transactions.service.ts:1245`, `buildTransferPostings`). The load therefore maps the V1 pair to
  the V2 pair with a new shared `transferId`; both rows carry `sourceAccountId` and
  `destinationAccountId` and each row's `accountId` is its own side, as
  `transactions.service.ts:734` sets them; there is no count collapse. US4.2 and FR-011 were
  amended accordingly (inventory risk 5 assumed a single row).
- **Splits**: rows sharing `split_group_id` become one transaction for the group's owner person with
  one `transaction_splits` row per person; the amounts are the V1 row amounts, so the sum is exact
  without reallocation. Counts collapse n to 1 (documented expected difference).
- **Initial balance**: V1 balance = `saldo_inicial` + settled admin rows excluding the
  "saldo inicial" note (`src/features/accounts/queries.ts`), and that row also counts as income
  unless `excluir_saldo_inicial_receitas`. Decision: the V1 "saldo inicial" row is the source (no
  second row is synthesized); flag `true` -> `origin = accountBalanceAdjustment` (category
  "Ajuste de saldo", no payment method); flag `false` -> regular settled income on the account in
  its V1 category, so income totals keep V1's effect. An account with `saldo_inicial <> 0` and no
  matching row gets a synthesized row dated at the account creation. Confirmed (Resolved decision 1).
- V1 rows named "Ajuste de saldo" are ordinary income/expense in V1 (`accounts/actions.ts:593`) and
  load as regular transactions.

## R12. Catalog and enum mappings

- **Users and people**: V2 user from V1 user (email kept; case-duplicates are blockers); the V1
  admin payer becomes the V2 admin person (exactly one per user, else blocker); other payers become
  `external`. Status `Ativo`/`Inativo` -> `active`/`inactive`.
- **Categories**: seed the V2 defaults with `createDefaultCategoryDrafts` (what signup does), then
  map each V1 category to the default with the same name and type or create it. Merges are listed.
  Subcategories become children (`parentId`, same type). V2 forbids a system category as parent
  (`packages/domain/src/categories.ts`, `category_invalid_parent`): a V1 category with
  subcategories that merges onto a V2 system category (e.g. "Pagamentos") is a blocker
  (`category.system-parent`, resolution `separate-root`: create a non-system root named
  `<name> (V1)` for that parent and its children). V1 "despesa"/"receita" ->
  `expense`/`income`.
- **Accounts**: `tipo_conta` text -> `account_type` over the V1 list
  (`src/features/accounts/components/account-dialog.tsx`): `Conta Corrente` -> `checking`,
  `Conta Poupança` -> `savings`, `Carteira Digital` -> `checking` (V2 has no wallet type; a digital
  wallet holds spendable balance like a checking account), `Conta Investimento` -> `investment`,
  `Dinheiro` -> `cash`, `Pré-Pago | VR/VA` -> `benefits`, `Outros` -> `other`; any other value ->
  `other` (`account.unknown-type`, fixable); `status` `Inativa` -> `isArchived`; `excluir_do_saldo` -> `excludeFromBalance`.
- **Cards**: `closingRuleType = fixedDay`, `closingDay = int(dt_fechamento)`,
  `dueDay = int(dt_vencimento)` (1 to 31 else blocker), `closingDayPurchasesNextInvoice = true`
  (V1 behavior, verified on 519 of 557 card rows; the rest carry manual periods that singles keep
  verbatim), `bandeira` -> brand case-insensitively, unknown -> `other` (warning).
- **Payment methods**: Cartão de crédito -> `credit_card`, Cartão de débito -> `debit_card`,
  Pix -> `pix`, Dinheiro -> `cash`, Boleto -> `boleto`, Pré-Pago | VR/VA -> `benefits`,
  Transferência bancária -> `bank_transfer`.
- **Trips**: `viagens` -> `trips` (name over 60 or note over 500 characters is a blocker, never
  truncated); `viagem_id` on singles/installments -> `transaction_trips`; on recurring rows ->
  `recurring_occurrence_trips` (series, occurrence date).
- **Notes**: V1 `tipo` is `nota` or `tarefa` and V1 has no due date
  (`src/features/notes/actions.ts`); V2 `notes_content_matches_kind_check` requires `text` with
  non-blank content, `checklist` with null content, `task` with a due date. Mapping: `nota` ->
  `text` with `content = descricao`; a `nota` with blank `descricao` is a blocker
  (`note.blank-content`, resolutions `as-checklist` or `drop`). `tarefa` -> `checklist` with null
  content, `tasks` JSON -> `note_items` (position order, `isCompleted` kept); a non-blank `tarefa`
  `descricao` becomes the first unchecked item at position 0 (fixable,
  `note.task-description-as-item`). No V1 note becomes `task`. Missing title -> blocker
  (`note.missing-title`, resolution `title-from-content` or `drop`).
- **Inbox**: all statuses load; `clientId = "v1:" + id`; `payloadFingerprint` built like
  `inbox.service.ts`; status timestamps kept; processed items link to the mapped transaction when
  `lancamento_id` is set (0 in the real dump).
- **Budgets**: `orcamentos` -> `budgets` with `categoryId` = mapped category (null category ->
  `budget.without-category` blocker), `amount = valor` (must be > 0, else blocker
  `budget.non-positive-amount`), `period = periodo` (must match `^[1-9][0-9]{3}-(0[1-9]|1[0-2])$`).
- **Preferences**: `preferencias_usuario` -> `user_preferences` (feature 012 columns) and
  `dashboard_preferences` (order and hidden widgets); no row -> V2 defaults.
- Logos, notification states, attachments and transaction attachments: 1:1 with owner checks; S3
  keys referenced, not copied.

## R13. Credentials and passkeys

- **Password hashes**: V1 (Better Auth 1.6.22) and V2 (1.7.16, `pnpm-lock.yaml`) both use the
  default scrypt hash `salt:key` in hex; V2 `apps/api/src/auth.ts` sets no custom hasher. The
  validator accepts the shape `^[0-9a-f]{32}:[0-9a-f]{128}$` and reports any other as
  `credential.incompatible-hash` (user flagged to reset). The V2 `account` row remaps
  `accountId` to the V2 user id for `credential` (Better Auth convention) and keeps the provider
  subject for `google`. Proof: a fixture hash produced once with Better Auth 1.6.22 for a known
  test password signs in through the V2 auth endpoint in the integration test; the real password is
  checked manually in the rehearsal.
- **Passkeys**: copied 1:1 (`credentialID` unique, duplicates are blockers). V2 sets `rpID` to the
  hostname of `WEB_URL` (`auth.ts:100`). The operator passes `--v1-rp-id`; passkeys load only when
  it equals the target's configured hostname, otherwise they are reported as not usable and not
  loaded (US5.3).
- Sessions, verifications, `tokens_api` and `compartilhamentos_pagador` are skipped by decision;
  the report lists users to re-pair and shares to re-invite (FR-014).

## R13b. Import mappings and reconciliation stamps

- **Import mappings load** (Resolved decision 6, overrides the original skip): V1
  `import_category_mappings` (256 rows) -> V2 `import_category_mappings` (`userId`,
  `descriptionKey`, `categoryId` remapped; `subcategory_id` set -> the child category);
  `import_name_mappings` (91) -> V2 `import_name_mappings` (`descriptionKey`, `name`). Keys are
  copied verbatim (real max length 111, V2 limit 160; names max 130, limit 160). A key that V2's
  `getImportedDescriptionKey` would not produce from itself is counted as informational
  (`mapping.key-not-normalized`): it loads but may never match. A mapping whose category does not
  map is a blocker (`reference.dangling`, resolution `drop`).
- **Reconciliation stamps dropped** (Resolved decision 5): `ofx_import_fingerprint` (713) and
  `import_batch_id` (348) cannot be converted, because the V2 identity
  (`openmonetis-import-row-v1`) hashes the V2 card or account id and file fields. They are dropped
  and counted (`stamp.dropped`). Consequence: an old statement re-read in V2 matches by amount and
  date instead of identity, and old rows may show the "paid but not reconciled" icon.
- Still skipped by decision: sessions, verifications, saved AI insights, reconciliation ignores,
  API tokens, payer shares.

## R14. Validator

- **Decision**: a rule catalog (`validate/rules.ts`) where each rule has an id, table, severity
  (`blocker`, `fixable`, `informational`) and allowed resolutions; rules run over the extracted
  per-user data (the same extraction the load uses), plus schema rules over `information_schema`
  compared with a manifest of expected V1 tables and columns (`v1-schema-manifest.ts`). Unknown
  table or column -> `schema.unmapped` blocker (FR-003, US6.2). The full catalog is in
  [contracts/output-formats.md](contracts/output-formats.md).
- **Text lengths** (`text.too-long`, blocker): V1 text columns have no limit while V2 uses
  `varchar(n)`. The limit for each mapped target column is read from the Drizzle schema
  (`getTableConfig(table).columns[].length`), so the rule follows the schema instead of a copied
  list (e.g. `transactions.name` 160, inbox `parsed_name` 160, `source_app` 255, `original_title`
  500, account, card and category names 120, recurring rule name 160). Resolutions: `truncate`,
  `drop`. Validation reports it instead of the load rolling the user back.
- **Period and date** (`transaction.period-date-mismatch`, blocker, Clarification 2026-11-12): a
  non-card row whose purchase month differs from `periodo`, boletos excluded (their period follows
  the due date). Resolutions: `use-date` (keep `data_compra`, period becomes its month) or
  `use-period` (move the date into the `periodo` month, same day clamped to the month end). 1 row
  in the real dump. Reconciliation computes the V1 figures for that row on the chosen side and lists
  it under `period-date-resolved`.
- **References** (`reference.dangling`): V1 has real FKs, so plain dangling ids cannot occur in a
  consistent dump; the rule also covers cross-user owner mismatch (a row referencing an account,
  card, category, payer, trip or series of another user), which V2 rejects through its composite
  owner FKs, and non-FK references (installment ids in `parcelas_antecipadas`, marker ids, import
  mapping categories).
- The validator imports no writer and opens no target connection.

## R15. Reconciliation

- **V1 side** (`reconcile/v1-figures.ts`): SQL that re-implements V1 semantics, ported from the V1
  queries: account balance at a period end = `saldo_inicial` + settled admin rows with
  `periodo <= P` excluding the "saldo inicial" note (`src/features/accounts/queries.ts`,
  `statement-queries.ts`); invoice total per card and period (`src/features/invoices/queries.ts`);
  income/expense per root category excluding `AUTO_FATURA` rows
  (`src/features/dashboard/lib/transaction-filters.ts`); per-person totals; counts per period and
  type.
- **V2 side** (`reconcile/v2-figures.ts`): V2 services built in-process with their repositories:
  `accountsService.getBalanceThroughDate` at each month end, `invoicesService` for invoice totals
  and status, `categoryTrendsService` for per-category totals; counts from transactions plus
  recurrence expansion through the domain.
- **Compare** (`reconcile/compare.ts`, pure): exact cents. Expected differences are computed, not
  waived: split groups (n -> 1), zero-amount recurrence occurrences (skips), dropped rows by
  resolution, rows resolved by `transaction.period-date-mismatch`, and the boleto posting shift
  below. Each is listed with counts. A detached recurrence duplicate changes no count or total
  (the V1 row becomes one V2 single), so it is listed as informational, not as a difference.
- **Boleto posting shift**: V2 posts a boleto in the month of `boletoPaymentDate`
  (`deriveTransactionPostingPeriod`), V1 in `periodo`. Two real rows are paid in another month, so
  their month-end balances differ for one month and agree afterwards. Decision: the V1 figure is
  computed twice, with V1 posting and with V2 posting; pass requires V2 = V1-with-V2-posting at every
  month end and V2 = V1 at the last month end; the shifted rows are listed as expected timing
  differences, each with month, amount and difference vs raw V1. Any other difference fails.
  Accepted (Resolved decision 2) and recorded in spec FR-015 and Assumptions.
- Output: per-user figures, difference, pass/fail; exit non-zero on any failure; "rehearsal-ready"
  plus global totals when all pass (US3.6).

## R16. Reports

- **Decision**: every command writes `<out>/<command>.json` (machine) and `<out>/<command>.txt`
  (human) and prints the text summary. `<out>` defaults to `.v1-etl/<fingerprint prefix>/` at the
  repository root (added to `.gitignore`). Content is deterministic for the same inputs (sorted
  keys and rows, no wall-clock values except a single `generatedAt`). Redaction: no password hash,
  token, file content or note text; emails appear only in findings that need them (email
  uniqueness) and in the re-pairing list. Schemas: [contracts/output-formats.md](contracts/output-formats.md).

## R17. Test strategy

Per `test-slop-guard`: few tests, each tied to a requirement and an observable outcome.

- **Unit (pure, `node:test`)**:
  - `conversions/recurrence.test.ts`: one table-driven test over the real-dump shapes (holding
    amount change, isolated amount and day deviation, gap, zero amount, card closing day, boleto due
    day, early end) asserting the round-trip equality; one test that a duplicate period
    detaches the extra row as a single.
  - `conversions/markers.test.ts`: payment full/partial, credit line and refund parsing.
  - `reconcile/compare.test.ts`: a one-cent difference fails and names the figure; documented
    differences pass only with their counts.
- **Integration (`apps/api/src/v1-etl.integration.test.ts`, script `test:v1-etl:integration`)**:
  creates a V1 fixture database from `v1-schema.sql` plus `v1-fixture.sql` (one case per rule and
  per conversion, two users) and a migrated V2 database via `withIntegrationDatabase`, and runs
  every command by spawning `tsx apps/api/src/scripts/v1-etl/cli.ts` as a child process
  (`@openmonetis/db` reads its environment once per process, and the child gives the real exit
  codes):
  1. validator on the violation fixture reports exactly the seeded findings (SC-001); on the clean
     fixture, none;
  2. load then reconcile passes for every user; altering one V2 amount by one cent fails naming it;
  3. second load writes nothing and checksums match (SC-002);
  4. a conflicting row pre-inserted for user B makes B roll back while A loads; after removing it a
     re-run ends equal to an uninterrupted run (US2.6, SC-004);
  4b. import category and name mappings are present in V2 with remapped categories (a fixture
      mapping points to a subcategory and lands on the child category);
  5. guards refuse a non-scratch target and a target with foreign users;
  6. the fixture V1 password signs in through V2 auth.
- **Rehearsal** (manual, [quickstart.md](quickstart.md)): the real dump, timed (SC-005).

## Resolved decisions (Daniel, 2026-11-12)

1. **Initial balance, flag false**: regular settled income on the account in its V1 category, so
   income totals match V1; flag true: `accountBalanceAdjustment` (R11).
2. **Boleto posting shift**: accepted. V1 balances computed twice; every month end must satisfy
   V2 = V1-with-V2-posting and the last month end must equal raw V1; the output lists the 2 shifted
   rows with month, amount and difference vs raw V1; any other difference fails (R15).
3. **Duplicate occurrence in a recurring series**: `detach` is the documented automatic rule; the
   row farther from the series day becomes a single transaction (rule now `fixable`, R8).
4. **Transfers**: V2 transfer pair; spec US4.2 and FR-011 amended (R11).
5. **Reconciliation stamps**: dropped and counted (R13b).
6. **Import mappings**: loaded with category remap, subcategory -> child (R13b); FR-014 and US6.1
   amended.
7. **Passkeys**: informational; they load only when `--v1-rp-id` equals the target host, so the
   real passkey cannot be proven on a localhost rehearsal (R13).
8. **Period and date mismatch** (non-card rows, 1 in the dump): new blocker
   `transaction.period-date-mismatch` with operator resolutions `use-date` or `use-period`;
   reconciliation counts the row on the chosen side (R14).
