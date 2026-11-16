# Implementation Plan: V1 to V2 Data Migration (ETL)

**Branch**: `016-v1-etl` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-v1-etl/spec.md` (clarified 2026-11-12; full spec in
scope, including conversions with zero rows in the real dump, proven by fixtures)

## Summary

A fork-only operator CLI, `pnpm etl:v1 validate|load|reconcile|rehearse`, under
`apps/api/src/scripts/v1-etl/`:

1. **Validate (US1)**: reads a restored V1 dump in one read-only snapshot, runs a rule catalog
   (blocker / fixable / informational, with allowed operator resolutions) plus a schema manifest
   check, and writes JSON + text output with V1 counts and skipped tables.
2. **Load (US2, US4, US5, US6)**: pure conversions build a per-user V2 write plan; a writer inserts it
   with Drizzle in one transaction per user into a migrated scratch database. Ids are UUIDv5 of the
   V1 key, persisted in a tool-owned `v1_etl` schema (id map, run fingerprint, per-user checksum),
   which makes re-runs write nothing and lets an interrupted run resume. Guards refuse non-scratch,
   unmigrated, foreign-data and production-marked targets. Transfers load as V2 transfer pairs;
   initial balances as regular income (or `accountBalanceAdjustment` when V1 excluded them from
   income); import category and name mappings load with category remap; V1 reconciliation stamps
   are dropped and counted.
3. **Recurrence**: V2 has no exception table; exceptions are versions. Each V1 series becomes
   versions over runs of equal consecutive occurrences (isolated deviations are one-occurrence
   versions, gaps and zero amounts are skips, a second occurrence in one month is detached as a
   single), settled rows become occurrence rows, the deadline is
   the last V1 occurrence, and every series is verified by expanding it with the V2 domain against
   V1 month by month before it is written.
4. **Reconcile (US3)**: V1 figures from SQL that ports V1 semantics; V2 figures from the real V2
   services and domain built in-process; exact-cent comparison of balances at every month end,
   invoices, counts, category and person totals, with computed expected differences. Boletos paid
   in another month are checked against V1 recomputed with V2 posting (last month equal to raw V1)
   and listed row by row.

Details: [research.md](research.md), [data-model.md](data-model.md),
[contracts/cli.md](contracts/cli.md), [contracts/output-formats.md](contracts/output-formats.md), [contracts/internal-types.md](contracts/internal-types.md),
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+), run with `tsx`

**Primary Dependencies**: `@openmonetis/db` (Drizzle schema + client), `@openmonetis/domain`,
`pg` (V1 read connection), V2 services/repositories from `apps/api/src` for reconciliation,
`node:crypto` (UUIDv5, SHA-256). No new dependency.

**Storage**: source V1 PostgreSQL 18 (restored dump, read-only role); target V2 PostgreSQL 16
scratch database, fully migrated; tool state in schema `v1_etl` of the target (no application schema
change, no Drizzle migration).

**Testing**: `node:test` + `tsx`. Unit: `conversions/recurrence.test.ts`, `conversions/markers.test.ts`,
`reconcile/compare.test.ts`. Integration: `apps/api/src/v1-etl.integration.test.ts`
(`test:v1-etl:integration`, run from bash) with a V1 fixture database built from a committed
sanitized schema and one seeded case per rule/conversion. Rehearsal on the real dump is manual
([quickstart.md](quickstart.md)).

**Target Platform**: operator workstation (Windows + Git Bash, Docker Desktop)

**Project Type**: CLI tool inside the pnpm monorepo (fork-only)

**Performance Goals**: full rehearsal under 60 minutes (SC-005); the real dump (1625 transactions,
1 user) is expected to take seconds; memory bounded per user

**Constraints**: V1 never written (three layers); single worker, pool size 1; no email, notification,
Companion, AI or S3 write; integer cents; no password hash, token or file content in outputs;
deterministic outputs

**Scale/Scope**: 29 V1 tables, 23 V1 -> V2 table mappings, about 30 validator rules, 4 commands,
1 integration suite, 3 unit test files, 1 runbook

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS with justified deviations | No route, service or repository of the app changes. The tool is an operator script beside `mock-data.ts`; it writes the V2 schema directly and keeps V1-to-V2 translation rules outside `packages/domain` (both in Complexity Tracking). Every V2 financial rule it needs (cents, periods, recurrence expansion, invoice dates, installments) comes from `@openmonetis/domain`. Files kebab-case, no barrels, English identifiers |
| II. Upstream-compatible | PASS | Fork-only, flagged in the spec Assumptions; new folder only (`apps/api/src/scripts/v1-etl/`), plus one script line per `package.json`, one `.gitignore` line, `docs/fork-v1-migration.md` and a `### Fork` CHANGELOG entry. Nothing to offer upstream |
| III. V1 is reference | PASS | Spec Source lists kept/changed/dropped; research maps V1 to the V2 model as it exists in code (recurrence versions, transfer pairs, typed origins), not V1's shape |
| IV. Financial integrity | PASS | Integer cents; deterministic, repeatable load on a production dump; per-user atomicity; reconciliation of balances at every month end, invoice totals and status, counts, category and person totals, all exact; recurrences verified by V2 expansion before writing; production refused by default |
| V. Behavior-verified | PASS | Pure unit tests for recurrence, markers and comparison; one integration suite asserting observable outcomes (seeded findings, reconciled totals, zero writes on re-run, rollback and resume, guards, sign-in) |

Gate result before Phase 0: PASS (deviations justified below). Post-design re-check: PASS; the
design added no new deviation. The research open questions were resolved by Daniel on 2026-11-12
(research "Resolved decisions", spec Clarifications).

## Project Structure

### Documentation (this feature)

```text
specs/016-v1-etl/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/cli.md, contracts/output-formats.md, contracts/internal-types.md
└── tasks.md (next step)
```

### Source Code

```text
apps/api/src/scripts/v1-etl/
├── cli.ts                        # argument parsing, env wiring, command dispatch, exit codes
├── v1-source.ts                  # read-only pool, snapshot transaction, per-user extraction, fingerprint
├── v1-schema-manifest.ts         # expected V1 tables/columns and per-table decision
├── validate/rules.ts             # rule catalog (id, severity, resolutions)
├── validate/validator.ts         # runs rules over extracted data
├── conversions/amounts.ts        # signed -> type + cents, payment methods, enums
├── conversions/catalog.ts        # users, credentials, passkeys, people, categories, accounts, cards, trips, prefs
├── conversions/installments.ts   # installment series, anticipations
├── conversions/recurrence.ts     # occurrences -> runs -> versions, occurrence rows, round-trip check
├── conversions/markers.ts        # AUTO_FATURA payments, credit lines, AUTO_REEMBOLSO refunds
├── conversions/transactions.ts   # singles, transfer pairs, split groups, initial balance
├── conversions/side-data.ts      # notes, inbox, attachments, logos, notification states, import mappings
├── load/plan-user.ts             # pure per-user V2 write plan + id map + checksum
├── load/v2-writer.ts             # Drizzle inserts, one transaction per user
├── load/etl-state.ts             # v1_etl schema bootstrap, runs, user_loads, id_map
├── load/guards.ts                # scratch / migrated / foreign data / production guards
├── reconcile/v1-figures.ts       # V1 semantics SQL
├── reconcile/v2-figures.ts       # V2 services + domain, in-process
├── reconcile/compare.ts          # exact-cent comparison, expected differences
├── output/render.ts              # JSON + text rendering, redaction, determinism
├── conversions/recurrence.test.ts, conversions/markers.test.ts, reconcile/compare.test.ts
└── __fixtures__/v1-schema.sql, v1-fixture.sql
apps/api/src/v1-etl.integration.test.ts
apps/api/package.json, package.json   # etl:v1, test:v1-etl:integration
docs/fork-v1-migration.md             # runbook (FR-018): validate, rehearse, reconcile, cutover inputs
CHANGELOG.md (### Fork), .gitignore (.v1-etl/)
```

**Structure Decision**: an operator script folder inside `apps/api`, next to the existing scripts,
so reconciliation reuses the real V2 services and the integration suite reuses
`test-support/integration-database.ts`. No new workspace package (research R1).

## Implementation phases

1. Source and validator: V1 extraction + fingerprint, schema manifest, rule catalog, `validate`
   with output files; fixture schema and violation fixture; integration case 1.
2. Conversions (pure): amounts and enums, catalog, installments, markers, transactions, recurrence
   with round-trip verification; unit tests.
3. Load: state schema, guards, plan, writer, resume and checksum; integration cases 3 to 6.
4. Reconcile: V1 figures, V2 figures through services, compare with expected differences;
   integration case 2; `rehearse`.
5. Rehearsal on the real dump, runbook `docs/fork-v1-migration.md`, CHANGELOG, final gate.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Writes the V2 schema with Drizzle outside repositories/services (AGENTS.md sections 3, 5) | Deterministic ids, historical timestamps and settled states, no side effects, one transaction per user (research R3) | Services mint random ids, stamp "today", and can trigger side effects; HTTP adds nothing but those limits |
| V1-to-V2 translation rules outside `packages/domain` (AGENTS.md section 11) | They encode V1's model (PT enums, note markers, materialized recurrences), are fork-only and die at cutover; V2 financial rules still come from the domain (research R2) | A domain module would ship V1 knowledge upstream and leave dead code in the core package |
| Tool-owned `v1_etl` schema created by DDL, not a Drizzle migration (constitution IV, AGENTS.md section 10) | Id map and run state must commit atomically with each user's rows in the target, but are not application schema (research R4). The runbook drops it (`DROP SCHEMA v1_etl CASCADE`) after the cutover reconciliation is archived, so it never stays in a running V2 | A migration would add ETL tables to every V2 installation; a JSON file cannot be transactional with the load |
