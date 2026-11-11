<!--
Sync Impact Report
- Version change: (template) -> 1.0.0
- Principles added: I. AGENTS.md Is the Architecture Authority; II. Upstream-Compatible Changes;
  III. V1 Is Product Reference, Not Model; IV. Financial Integrity and Isolation;
  V. Behavior-Verified Changes
- Sections added: Fork Constraints, Development Workflow, Governance
- Sections removed: none
- Deferred TODOs: none
-->

# OpenMonetis V2 (daniel-cabral fork) Constitution

## Core Principles

### I. AGENTS.md Is the Architecture Authority

`AGENTS.md` at the repository root is the binding architecture and coding standard. Every spec,
plan and task MUST comply with it, in particular:

- Dependency direction: web -> Hono routes -> services -> domain / repositories -> Drizzle.
- Financial rules live only in `packages/domain`; UI and routes contain none.
- The per-feature folder shape, naming table and "no barrel files" rule of AGENTS.md section 4.
- The PR checklist of AGENTS.md section 14 is a gate for every feature.

This constitution MUST NOT restate or override AGENTS.md. On conflict, AGENTS.md wins and this
document is amended.

Rationale: the fork wants its work accepted upstream; the maintainer reviews against AGENTS.md.

### II. Upstream-Compatible Changes

Every feature MUST be shippable as an upstream PR without the fork's tooling:

- Spec-kit artifacts (`.specify/`, `specs/`, `.claude/`) MUST NOT appear in PR branches.
- Product code, migrations, tests, `CHANGELOG.md` (`Unreleased`) and a `docs/<feature>.md` contract
  in the maintainer's style are the only deliverables of a feature.
- A feature MUST NOT require modifying unrelated upstream code; when it does, the change is split
  into its own upstream-sized PR first.
- Fork-only behavior (not intended upstream) MUST be flagged as such in its spec.

Rationale: divergence from upstream is the failure mode that ended the V1 fork.

### III. V1 Is Product Reference, Not Model

Features ported from the V1 fork (`openmonetis`, Next.js) MUST be redesigned for V2: data model,
contracts, names and UX. A V1 OpenSpec spec is input to `/speckit-specify`, never copied as-is.
The spec MUST state which V1 behavior is kept, changed or dropped, and why.

Rationale: V2 explicitly rejects V1 modeling (CONTRIBUTING.md, AGENTS.md preamble).

### IV. Financial Integrity and Isolation (NON-NEGOTIABLE)

- Amounts are computed in integer cents in the domain; money is never lost or duplicated across
  splits, installments, invoices or transfers.
- Every repository operation filters by `userId`; every related ID is ownership-checked.
- Schema changes go through versioned, forward-only Drizzle migrations; never `db push`.
- The V1 -> V2 data migration MUST be repeatable against a production dump, MUST reconcile totals
  (account balances, invoice totals) between source and target, and MUST NOT run against
  production before a rehearsal passes.

Rationale: this is a personal finance system holding real data that already reconciles with banks.

### V. Behavior-Verified Changes

- Each feature lands with tests per `docs/testing.md`: domain rules in pure tests, persistence
  rules in the matching `*.integration.test.*` suite.
- Tests assert observable outcomes (conserved totals, preserved history, no writes after rejection,
  user isolation), not implementation details.
- While iterating, run only the tests for touched files; run lint, typecheck and the full suite once
  before commit.

Rationale: matches the maintainer's testing guide and keeps verification cheap.

## Fork Constraints

- Language: UI copy in PT-BR; code, database, contracts and spec-kit artifacts in English;
  commits and PR descriptions in PT-BR (upstream convention).
- Production stays on the V1 fork until V2 covers the features in use and the data migration
  rehearsal passes. V2 runs only locally until then.
- Local environment uses compose project name `openmonetis-v2` to stay isolated from V1.
- Tags, releases and Docker images follow AGENTS.md section 15 and are never created without an
  explicit request.

## Development Workflow

1. `/speckit-specify` from the V1 spec or user request, then `/speckit-clarify` when ambiguous.
2. UI changes get a mockup choice (real app CSS/components) recorded in the spec before planning.
3. `/speckit-plan` MUST include a Constitution Check against principles I to V.
4. `/speckit-tasks`, then implementation on a feature branch.
5. Upstream PR branch is cut from `upstream/main` with only the deliverables of principle II.

## Governance

- This constitution governs spec-kit work in this fork; AGENTS.md governs code.
- Amendments: edit this file, bump the version, update the Sync Impact Report, commit with
  `docs: amend constitution to vX.Y.Z`.
- Versioning: MAJOR for removed or redefined principles, MINOR for new principles or sections,
  PATCH for wording.
- Every plan's Constitution Check and every PR review verifies compliance; deviations MUST be
  justified in the plan's Complexity Tracking.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
