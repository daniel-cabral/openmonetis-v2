# Quickstart: V1 to V2 Data Migration (016)

Validation and run guide. Commands run from the repository root in Git Bash. Contracts:
[contracts/cli.md](contracts/cli.md), [contracts/output-formats.md](contracts/output-formats.md).

## Prerequisites

- V2 dev Postgres up (`pnpm docker:db`, container `openmonetis-v2-db-1`, `127.0.0.1:7000`).
- A V1 production dump in custom format (`pg_dump -Fc`, PG 18), e.g. `E:/Downloads/v1.dump`.

```bash
export MSYS_NO_PATHCONV=1
```

## 1. Restore the V1 dump (PG 18 source, read-only)

```bash
docker run -d --name openmonetis-v1-source -e POSTGRES_PASSWORD=<local admin password> \
  -p 127.0.0.1:7001:5432 postgres:18
docker cp E:/Downloads/v1.dump openmonetis-v1-source:/tmp/v1.dump
docker exec openmonetis-v1-source createdb -U postgres openmonetis_v1
docker exec openmonetis-v1-source pg_restore -U postgres -d openmonetis_v1 \
  --no-owner --no-privileges /tmp/v1.dump
docker exec openmonetis-v1-source psql -U postgres -d openmonetis_v1 -c "
  create role v1_reader login password 'v1reader';
  grant connect on database openmonetis_v1 to v1_reader;
  grant usage on schema public to v1_reader;
  grant select on all tables in schema public to v1_reader;
  alter role v1_reader set default_transaction_read_only = on;"
export V1_DATABASE_URL=postgres://v1_reader:v1reader@127.0.0.1:7001/openmonetis_v1
```

The V2 container is PG 16 and cannot restore a PG 18 archive; the ETL reads V1 over a connection
(research R7).

## 2. Create and migrate the scratch V2 database

```bash
docker exec openmonetis-v2-db-1 createdb -U postgres openmonetis_v1_rehearsal
export TARGET_URL=postgres://postgres:postgres@127.0.0.1:7000/openmonetis_v1_rehearsal
EXTERNAL_DATABASE_URL=$TARGET_URL pnpm db:migrate
```

## 3. Validate, load, reconcile

```bash
pnpm etl:v1 validate                                  # exit 1 while blockers are unresolved
# fill the printed template (the real dump has 1 blocker) into .v1-etl/resolutions.json
pnpm etl:v1 load --target-url $TARGET_URL --scratch --resolutions .v1-etl/resolutions.json
pnpm etl:v1 reconcile --target-url $TARGET_URL
# or all three, timed (SC-005: under 60 minutes)
time pnpm etl:v1 rehearse --target-url $TARGET_URL --scratch --resolutions .v1-etl/resolutions.json
```

Expected on the current production dump:

- `validate`: 1 blocker, `transaction.period-date-mismatch` (a Pix row with purchase month 2026-09
  and period 2026-06): use `use-period` in `.v1-etl/resolutions.json` (decided 2026-11-12); fixable: 3 zero-amount recurrence
  occurrences, 1 installment gap, 1 duplicate recurrence occurrence (detached); informational:
  skipped tables (sessions, verification, tokens, insights, reconciliation ignores, shares), dropped
  stamps (713 fingerprints, 348 batch ids), passkey not loaded unless `--v1-rp-id` matches.
- `load`: 1 user loaded; per-table balance lines all close; 256 category and 91 name import
  mappings written; repair list has 1 Companion re-pair.
- `reconcile`: every figure passes; the resolved row listed under `period-date-resolved`; 2 boleto rows listed under `boleto-posting-month` with month,
  amount and difference vs raw V1; `rehearsalReady: true`.

## 4. Idempotency and resume checks

```bash
pnpm etl:v1 load --target-url $TARGET_URL --scratch --resolutions .v1-etl/resolutions.json
# expect: user status skipped-already-loaded, 0 rows written, same checksum (SC-002)
```

Fresh-scratch equality: create `openmonetis_v1_rehearsal_2`, migrate, load, and compare the
`checksum` of each user in both `load.json` files: identical.

Interrupt: start `load` on a fresh scratch, kill it (Ctrl+C) mid-run, run it again: completes and
checksums equal the uninterrupted run (SC-004).

## 5. Guards

- `load` without `--scratch` -> exit 2.
- `load` with `--target-url` equal to the V1 URL, or against the dev database that holds other
  users -> exit 2.
- `load` of a different dump into the same scratch -> exit 2 (reset the scratch first).

## 6. Sign-in checks on the rehearsal (manual)

Start V2 against the scratch (`EXTERNAL_DATABASE_URL=$TARGET_URL pnpm dev`):

1. Sign in with the V1 email and password -> dashboard shows migrated data.
2. Account statement balance per month equals V1 for the months in `reconcile.json`.
3. Card invoices: 6 periods, statuses and payments as in V1; 2026-07 pending with its partial
   payment.
4. Recurring report lists 21 series with occurrences only up to their V1 end; no projection beyond
   the last V1 month; the detached duplicate appears as a single transaction.
5. Companion: no device tokens exist; pairing a new one works.
6. Passkey: listed only when `--v1-rp-id` equals the host used; otherwise absent and reported.

## 7. After the cutover (out of scope here, recorded for the runbook)

Archive the `.v1-etl/` outputs, then drop the tool state from the production database:
`DROP SCHEMA v1_etl CASCADE;` (plan Complexity Tracking). A scratch database is simply dropped.

## Automated checks

```bash
pnpm exec tsx --test apps/api/src/scripts/v1-etl/conversions/recurrence.test.ts \
  apps/api/src/scripts/v1-etl/conversions/markers.test.ts \
  apps/api/src/scripts/v1-etl/reconcile/compare.test.ts
pnpm test:v1-etl:integration   # from bash; creates its own V1 fixture and V2 databases
```

The integration suite covers: validator findings equal the seeded set (SC-001), load + reconcile
pass on the fixture, one-cent alteration fails, second load writes nothing (SC-002), per-user
rollback and resume (US2.6, SC-004), guards, import mappings with remapped categories (US6.1), and
fixture password sign-in (US5.1).
