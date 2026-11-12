# V1 -> V2 migration roadmap

Source of truth for decisions: [inventory.md](inventory.md) (section "Decisions" and the Decision
column). This file defines the features, their order, the parallel lanes and the execution
protocol. The orchestrator session updates the **Status** column; workers never edit this file.

## Features

| # | Spec dir | Scope (inventory rows) | Lane | Depends on | Status |
|---|---|---|---|---|---|
| 001 | `specs/001-c6-csv-import` | C6 statement + invoice CSV parsers, parser registry/signature detection, row fingerprint for lines without FITID, merchant-aware description key, `.xls` legacy import | A | - | merged |
| 002 | `specs/002-reconciliation-core` | reconciliation screen and target inference, deterministic matcher + buckets, name mappings, file value wins, pending -> paid on match, batch apply/undo, permanent ignores, suspicious bucket, "Mark all as Create", category memory on reconcile | A | 001 | merged |
| 003 | `specs/003-reconciliation-closure` | statement/invoice closure proofs, invoice credit lines + new typed credit origin, sticky projection bar, "paid but not reconciled" icon, `auditar-conciliacao` skill | A | 002 | merged |
| 004 | `specs/004-trips` | trips entity, CRUD + menu, trip field on transactions (propagation rules), trip page with net cost and breakdowns, suggestions, bulk set trip | B | - | merged |
| 005 | `specs/005-establishments-report` | establishments report (top places) with trip filter; trip filter in category trends | B | 004 | merged |
| 006 | `specs/006-transactions-bulk` | mass-add dialog, full bulk edit (date, person and the other V1 series-edit fields; no condition change) | A | 003 | merged |
| 007 | `specs/007-pdf-exports` | branded PDF export for transactions and reports | A | 006 | merged |
| 008 | `specs/008-card-usage-report` | cross-card usage report | A | 007 | merged |
| 009 | `specs/009-calendar` | monthly calendar page | B | 010 | merged |
| 010 | `specs/010-dashboard-gaps` | spending overview widget (top expenses + establishments), attachments widget, category history widget, regression tests for notifications mark-unread/unarchive (already in V2) | B | 005 | merged |
| 011 | `specs/011-note-attachments` | attachments on notes | B | 009 | merged |
| 012 | `specs/012-account-preferences` | 6 V1 preferences (column order, group by date, hide anticipated, modal summary, note as column, max attachment size) + email change | A | 008 | executing |
| 013 | `specs/013-ai-api-key-providers` | API-key AI providers (incl. Ollama) next to V2 CLI providers | B | 011 | merged |
| 014 | `specs/014-landing-page` | public landing page | A | 012 | specified |
| 015 | `specs/015-fork-leftovers` | invoice settle announcement, "by subcategory" block on category page, people-sharing regression guard (V2 has no permission level; V1 only used read, so accept V2) | B | 013 | merged |
| 016 | `specs/016-v1-etl` | pre-flight validator over a V1 dump, V1 -> V2 load (id remap, amounts, installments, recurrence rules, invoice payments/refunds, trips, note attachments), rehearsal and totals reconciliation | orchestrator | all | specified |

Lane order: **A** 001 -> 002 -> 003 -> 006 -> 007 -> 008 -> 012 -> 014;
**B** 004 -> 005 -> 010 -> 009 -> 011 -> 013 -> 015; then 016.

Status values: `todo`, `specified`, `planned`, `executing`, `review`, `merged`, `blocked`.

## Phase 0 (done in the orchestrator, before any lane starts)

1. This roadmap.
2. `spec.md` for every feature via `/speckit-specify` (numbers fixed as above), carrying the
   inventory decisions and V1 evidence. No `[NEEDS CLARIFICATION]` left that the inventory
   already answers.
3. Commit on the fork `main` (local).

Plans and tasks are **not** written up front: each lane writes them just in time, on top of the
`main` that already contains the previous features.

## Lanes (Herdr)

- Two lanes, A and B, each a Herdr workspace with one Claude worker. The orchestrator is this
  session, running inside a Herdr pane (`HERDR_ENV=1`).
- Worktrees live inside the project: `.claude/worktrees/<NNN-slug>` (ignored via
  `.git/info/exclude`; Biome already ignores `.claude/`). Created with
  `herdr worktree create --branch <NNN-slug> --base main --path .claude/worktrees/<NNN-slug> --label "<lane> <NNN>"`.
- Lane setup per worktree: copy `.env`, set its own database
  (`openmonetis_lane_a` / `openmonetis_lane_b` on the same Docker Postgres, created and migrated
  before the worker starts), `pnpm install --frozen-lockfile`. Workers never start dev servers
  on default ports; if needed, lane A uses 7101/7102/7103 and lane B 7201/7202/7203.
- Worker start: `herdr agent start lane-<x> --kind claude --pane <pane>` in the worktree, auto
  permission mode.
- The orchestrator waits with `herdr agent wait lane-<x>` (background), reads with
  `herdr agent read`, and answers `blocked` states. Workers never push, merge or touch `main`.
- Actual run (2026-11-11): the Herdr desktop app exposes the `hc` CLI (herdr-core), not
  `herdr agent`/`herdr worktree`. Mapping used: worktree via `git worktree add -b <slug>`,
  worker via `hc run --bg --name lane-<x> --outlive-parent --cwd <wt> claude --permission-mode auto`,
  goal via `hc send`, wait/read via `hc wait` / `hc read`, removal via `git worktree remove`.

## Per-feature workflow (worker goal)

Each feature runs as one `/goal` in its lane worker:

1. `/speckit-clarify`: answer every question autonomously from inventory/roadmap/V1 code; record
   answers in the spec.
2. UI features: `mockup-ui`, worker picks the option closest to V1 behaviour within V2 patterns
   and records choice + rationale in the spec.
3. `/speckit-plan`, then `/speckit-tasks`, then `/speckit-analyze` (fix every CRITICAL/HIGH).
4. Upstream overlap check (CHANGELOG, code) recorded in the plan.
5. Execute with `/executar-plano` on `specs/<NNN-slug>/tasks.md`.
6. Gate in the worktree: lint, typecheck, scoped tests, plus the feature's integration tests
   against the lane database. No full suite in the lane.
7. Commit on the feature branch (PT-BR messages, explicit paths, CHANGELOG entry under
   `### Fork` at the end of `Unreleased`), then report "ready for merge".

Worker goal template:

```
/goal Deliver feature <NNN> per .specify/migration/roadmap.md and specs/<NNN-slug>/spec.md, following CLAUDE.md, AGENTS.md and the constitution, using the per-feature workflow in the roadmap (clarify, mockup if UI, plan, tasks, analyze, /executar-plano). Decide autonomously; record decisions in the spec. Done when lint, typecheck, scoped and feature integration tests pass (output shown), all tasks in tasks.md are checked, and the work is committed on branch <NNN-slug>. Never push, merge or edit main. Or stop after 60 turns.
```

## Merge protocol (orchestrator only, one merge at a time)

1. In the worktree: merge current `main` into the feature branch.
2. Migration conflict (`packages/db/drizzle/meta/_journal.json` or numbering): drop the branch's
   generated migration, regenerate with `drizzle-kit generate` on top of `main`, run
   `pnpm db:migrations:check`.
3. Take `main`'s `routeTree.gen.ts`, regenerate if needed.
4. Run the full suite once (heavy processes never in parallel with another full suite).
5. Merge into `main` (`--no-ff`), update Status here, remove the worktree
   (`herdr worktree remove`), start the lane's next feature from the new `main`.
6. Push only when Daniel asks.

## Done criteria for the whole migration

- Every inventory row marked `port`/`adapt` is `merged`.
- 016 rehearsal on a production dump reconciles balances, invoice totals and transaction counts
  per user with V1; then Daniel decides the cutover.
