# V1 to V2 migration runbook

Operator guide for `pnpm etl:v1`, the fork-only tool that moves one OpenMonetis V1 dump into V2.
The tool is not part of the upstream product and must not be offered in an upstream PR.

This runbook covers validation, a rehearsal load into a scratch database, reconciliation, and the
information needed for the cutover decision. The production run, the V1 shutdown and the cutover
itself are out of scope: Daniel decides them after a passing rehearsal.

Contracts behind this guide: [CLI](../specs/016-v1-etl/contracts/cli.md),
[output formats](../specs/016-v1-etl/contracts/output-formats.md),
[quickstart](../specs/016-v1-etl/quickstart.md).

## Prerequisites

- Local V2 Postgres running: `pnpm docker:db` (container `openmonetis-v2-db-1`, `127.0.0.1:7000`).
- A V1 dump in custom format (`pg_dump -Fc`) taken from a PostgreSQL 18 server.
- Git Bash, with `export MSYS_NO_PATHCONV=1` before any `docker` command.
- Free disk space for the report folder `.v1-etl/` (git-ignored).

> [!WARNING]
> The `.v1-etl/` outputs contain personal data (emails and names in the repair list). Keep them on
> the operator machine, do not commit them, and delete them when the rehearsal is closed.

## 1. Restore the V1 dump read-only

Use a separate PostgreSQL 18 container, never the V2 container (which is PG 16 and cannot restore a
PG 18 archive). The ETL reads V1 over a connection.

```bash
export MSYS_NO_PATHCONV=1
docker run -d --name openmonetis-v1-source -e POSTGRES_PASSWORD=<local admin password> \
  -p 127.0.0.1:7011:5432 postgres:18
docker cp <path to dump> openmonetis-v1-source:/tmp/v1.dump
docker exec openmonetis-v1-source createdb -U postgres openmonetis_v1
docker exec openmonetis-v1-source pg_restore -U postgres -d openmonetis_v1 \
  --no-owner --no-privileges /tmp/v1.dump
```

Create a read-only role with `SELECT` only, then point the tool at it:

```bash
docker exec openmonetis-v1-source psql -U postgres -d openmonetis_v1 -c "
  create role v1_reader login password '<reader password>';
  grant connect on database openmonetis_v1 to v1_reader;
  grant usage on schema public to v1_reader;
  grant select on all tables in schema public to v1_reader;
  alter role v1_reader set default_transaction_read_only = on;"
export V1_DATABASE_URL=postgres://v1_reader:<reader password>@127.0.0.1:7011/openmonetis_v1
```

The tool opens V1 in one `REPEATABLE READ READ ONLY` transaction per command. It has no write
statement against V1. If a V1 write were ever attempted, the read-only role would refuse it.

## 2. Create and migrate the scratch V2 database

```bash
docker exec openmonetis-v2-db-1 createdb -U postgres openmonetis_v1_rehearsal
export TARGET_URL=postgres://<user>:<password>@127.0.0.1:7000/openmonetis_v1_rehearsal
EXTERNAL_DATABASE_URL=$TARGET_URL pnpm db:migrate
```

The tool never migrates a database and never runs `drizzle-kit push`. It creates its own state
schema `v1_etl` with idempotent DDL. `load` refuses a target that is not migrated (exit 2).

## 3. Validate

```bash
pnpm etl:v1 validate
```

Writes `.v1-etl/<fingerprint 12 chars>/validate.json` and `validate.txt`. Exit 0 means no blocker is
left unresolved; exit 1 means at least one is.

Finding severity:

| Severity | Meaning | Action |
| --- | --- | --- |
| blocker | Load is refused until resolved | Choose one allowed resolution |
| fixable | Loads with the documented handling | Review the handling in the report |
| informational | Counted, no effect on the result | None |

### Resolution file

`validate.json` contains a `resolutionTemplate` with one key per blocker. Copy it to
`.v1-etl/resolutions.json`, choose one allowed value per key, and keep `dumpFingerprint` from the
report. A resolution file for another fingerprint is refused.

```json
{
  "dumpFingerprint": "<fingerprint from validate.json>",
  "resolutions": {
    "transaction.period-date-mismatch:lancamentos:<v1 id>": "use-period",
    "recurrence.duplicate-occurrence:lancamentos:<v1 id>": "drop"
  }
}
```

Allowed resolutions per rule (complete list in the output-formats contract):

| Rule | Severity | Resolutions (default first) |
| --- | --- | --- |
| `transaction.period-date-mismatch` (non-card row, purchase month differs from its period) | blocker | `use-date` (keep the date, period follows it), `use-period` (move the date into the period month, same day clamped) |
| `recurrence.duplicate-occurrence` (two occurrences in one period) | fixable | `detach` (extra row loads as a single), `drop` |
| `recurrence.not-reproducible` | blocker | `as-singles` |
| `installment.gap` | fixable | loads with existing numbers, total derived |
| `installment.count-out-of-range`, `trip.length`, `installment.duplicate-number`, `installment.inconsistent-members`, `marker.missing-target`, `invoice.paid-without-date`, `user.email-case-duplicate`, `passkey.duplicate-credential` | blocker | none: fix the source data or stop |
| zero-amount recurrence occurrence | fixable | loads as a `skip` exception, balance effect zero |

Informational rules (`table.skipped-by-decision`, `stamp.dropped`, `mapping.key-not-normalized`,
`passkey.rp-id-mismatch`) need no resolution. They are counted in the reports.

## 4. Load into the scratch database

```bash
pnpm etl:v1 load --target-url $TARGET_URL --scratch --resolutions .v1-etl/resolutions.json
```

- One transaction per user, users processed one at a time, pool size 1.
- A failing user is rolled back and reported with its table and cause; the command exits 1 and the
  other users stay loaded.
- A re-run skips users already loaded (`skipped-already-loaded`) and writes nothing for them.
- Interrupting the run (Ctrl+C) and running it again completes it with the same checksums as an
  uninterrupted run.

Guards (exit 2, nothing written):

- `--scratch` is missing.
- `--target-url` equals the V1 URL, or points to a database that holds other users.
- The target is not migrated.
- The dump fingerprint differs from an earlier load into the same scratch. Reset the scratch first.
- The resolution file belongs to another fingerprint.
- `--confirm-production=<db name>` is the only way past the production guard. It is out of scope
  for this runbook; do not use it here.

## 5. Reconcile

```bash
pnpm etl:v1 reconcile --target-url $TARGET_URL --resolutions .v1-etl/resolutions.json
```

Pass the same `--resolutions` and `--v1-rp-id` as the load: reconcile re-plans each user with them.
Without the load's resolutions a resolved blocker fails the user (`plan-unresolved-blocker`); a
different `--v1-rp-id` changes the checksummed tables (`checksum-mismatch`).

Compares V1 and V2 figures per user and writes `reconcile.json` and `reconcile.txt`. It writes
nothing to V1 or to the target. Exit 1 on any `pass: false`.

What is compared:

- Account balance at the end of every month in the V1 data range (first to last period, including
  the dump month).
- Card invoices: periods, statuses, payments and totals.

Expected difference, the only one accepted: a boleto. V2 posts a boleto in its payment month, V1 in
its period. For each month end, V2 must equal V1 recomputed with V2 posting. The last month end must
also equal raw V1. Each shifted row is listed under `boleto-posting-month` with its month, amount and
difference against raw V1. Any other difference fails.

`global.rehearsalReady` is `true` only when every user passes.

## 6. Rehearse in one command

```bash
time pnpm etl:v1 rehearse --target-url $TARGET_URL --scratch --resolutions .v1-etl/resolutions.json
```

Runs `validate`, then `load` only if no blocker is unresolved, then `reconcile`. Success target:
under 60 minutes (SC-005), measured with `time`.

## 7. Idempotency and fresh-scratch checks

- **Second load**: run the same `load` command again. Expected: every user `skipped-already-loaded`,
  0 rows written, same `checksum` per user as the first run (SC-002).
- **Fresh scratch**: create `openmonetis_v1_rehearsal_2`, migrate it, load the same dump and
  resolutions. Compare the `checksum` of each user in both `load.json` files. They must be identical.

## 8. Resolved decisions that shape results

These decisions were made during design. They change what a V2 figure looks like compared with V1,
so the cutover review must know them.

- **Initial balance**: when the V1 account is not flagged to exclude from income, the initial balance
  loads as a regular settled income transaction on that account, in its V1 category, so income totals
  keep V1's effect. Flagged accounts get an `accountBalanceAdjustment` transaction.
- **Boleto posting shift**: described in section 5. Shifted rows are listed, never hidden.
- **Recurrence duplicates (detach)**: two occurrences in one period. The row farther from the series
  day becomes a single transaction. Totals do not change.
- **Recurrence series**: V1 fixed counts become `recurrenceEndDate` (the last V1 occurrence). A change
  that holds to the end of the series becomes a new rule version; an isolated deviation becomes a
  one-occurrence version; a skip becomes a gap between versions. Zero-amount occurrences load as skip
  exceptions.
- **Transfer pairs**: a V1 transfer loads as two V2 `transfer` rows with signed amounts sharing one new
  `transferId`. No count collapse.
- **Dropped stamps**: V1 reconciliation stamps (`ofx_import_fingerprint`, `import_batch_id`) cannot be
  reproduced in V2 and are dropped. The load report counts them.
- **Loaded mappings**: import category and name mappings load into V2, with category ids remapped
  (subcategory to child category).
- **Pre-launch inbox items**: every status loads, with status and timestamps kept. Processed items link to the V2 transaction mapped from their V1 transaction.
- **Skipped tables** (counted in the reports): `session` and `verification` (disposable),
  `tokens_api` (Companion must be re-paired), `compartilhamentos_pagador` (payers must be re-invited),
  `insights_salvos` (regenerable), `reconciliation_ignores` (re-doable).
- **Passwords**: hashes carry over when both sides use the same hash format, which the validator checks
  on the real data. Otherwise the user gets a forced password reset (`repairList.passwordReset`).
- **Passkeys**: they load only when `--v1-rp-id` equals the host of the target `WEB_URL`. Otherwise
  they are not loaded and listed under `passkeysNotLoaded`, and users re-register them.
- **Attachments**: stored files stay in place; only database references migrate. `--check-bucket`
  sends HEAD requests to report keys missing from the bucket. It sends no other write.

## 9. Repair list

Read `repairList` in `load.json`. The tool does not perform these actions; they happen after cutover:

| Key | Action |
| --- | --- |
| `companionRepair` | Each user re-pairs the Companion (no device token is migrated) |
| `shareReinvite` | Each owner re-invites the payer that was shared |
| `passwordReset` | Each user resets the password |
| `passkeysNotLoaded` | Each user re-registers the passkey |

## 10. Inputs for the cutover decision

Daniel decides the cutover. Before that decision, confirm each item:

- `validate.json`: zero unresolved blockers; `.v1-etl/resolutions.json` reviewed.
- `load.json`: every user `loaded`; every balance line closes; repair list reviewed.
- `reconcile.json`: `global.rehearsalReady: true`; every figure passes; each boleto shift accepted.
- Second load wrote nothing; fresh-scratch checksums are identical.
- Timing from `time` is under 60 minutes.
- Manual sign-in checks on the scratch (V2 started with `EXTERNAL_DATABASE_URL=$TARGET_URL`):
  1. Sign in with a migrated V1 account and its V1 password; the dashboard shows migrated data.
  2. Account statement balance per month equals V1 for the months in `reconcile.json`.
  3. Card invoices match V1 in periods, statuses and payments.
  4. Recurring report shows no occurrence beyond each series end in V1.
  5. Companion: no device token exists; pairing a new one works.
  6. Passkey: listed only when `--v1-rp-id` matched the host; otherwise absent and reported.
- Section 8 decisions and section 9 repair list communicated to the affected users.

## 11. After the cutover (out of scope, recorded for the runbook)

- Archive the `.v1-etl/` outputs securely, then delete them from the working copy.
- Drop the tool state from the production database: `DROP SCHEMA v1_etl CASCADE;`.
- A scratch database is dropped as a whole.
