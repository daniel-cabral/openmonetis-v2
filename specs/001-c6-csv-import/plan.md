# Implementation Plan: C6 CSV Import (statement and invoice)

**Branch**: `001-c6-csv-import` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

## Summary

Add C6 statement and invoice CSV parsing to the existing V2 import pipeline through a bank profile
registry in `packages/domain`, a two-step CSV flow (detect profile -> user confirms profile and
destination -> preview), deterministic row identities stored in the existing
`import_source_fingerprint`/`import_external_id` columns, a merchant-aware category memory key
with legacy-key fallback, and `.xls` (xlsx content) acceptance. No migration.

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19
**Primary Dependencies**: Hono + zod-openapi, Drizzle, TanStack Start/Query/Form, ExcelJS (already present)
**Storage**: PostgreSQL; reuses `transactions.import_*` columns and `import_category_mappings`
**Testing**: `node:test` via tsx (domain unit tests next to source); `apps/api/src/imports.integration.test.ts` (`IMPORTS_INTEGRATION_TEST=1`)
**Target Platform**: web client + API
**Project Type**: web application (pnpm monorepo)
**Performance Goals**: preview of 1000 lines stays a single request (existing limits 5 MB / 1000 lines)
**Constraints**: amounts in integer cents in the domain; domain has no I/O (hashing stays in the service)
**Scale/Scope**: 2 profiles, ~10 source files touched/added

## Constitution Check

| Principle | Status |
|---|---|
| I. AGENTS.md authority | Parsing, identity payloads and description key live in `packages/domain`; service hashes and orchestrates; routes thin; web only renders. Pass. |
| II. Upstream-compatible | Fork-only flagged in spec; deliverables = code, tests, `CHANGELOG.md` (`### Fork`), `docs/transaction-imports.md`. No unrelated upstream edits. Pass. |
| III. V1 reference only | Kept/changed/dropped table in spec; identity stored in V2 fields, not a V1 column. Pass. |
| IV. Financial integrity | Cents parsing in domain; every lookup filters `userId`; destination ownership checked in preview and import; no migration. Pass. |
| V. Behavior-verified | Domain tests port the V1 oracle; integration test covers re-import idempotency, rejection without writes, undo, isolation. Pass. |

Post-design re-check: unchanged, pass.

## Upstream overlap check

- `CHANGELOG.md`: no CSV bank import, row identity or `.xls` entry; only CSV *export* (category trends, transactions). `main..upstream/main` has no import/CSV commits (last upstream: `chore(release): prepare version 0.16.0`).
- Code: upstream import is `parseOfxStatement` + `parseSpreadsheetStatement` in the same files this feature extends; the profile registry is additive, the OFX/XLSX branches stay untouched apart from the `.xls` extension and the description key lookup.

## Design

### Domain (`packages/domain/src`)

| File | Responsibility |
|---|---|
| `import-csv.ts` | CSV primitives: strip BOM, split lines (CRLF/LF), split fields honoring quotes for a given separator, `dd/mm/yyyy` -> ISO, decimal text -> integer cents (comma or point). |
| `import-c6.ts` | `parseC6StatementCsv(content)`, `parseC6InvoiceCsv(content)`, `classifyC6InvoiceLine`. Return `ImportedStatement` with extended lines and `invalidLines`. |
| `import-profiles.ts` | Profile registry (`importProfiles`: id, label, kind, destinationType, header signature, optional account reader, parser), `detectImportProfile(content)`, `findImportProfile(id)`. |
| `import-row-identity.ts` | `buildImportRowIdentityPayloads({kind, source, accountIdentification, destination, rows})` = V1 fingerprint payloads (version `openmonetis-import-row-v1`). |
| `transactions.ts` | Extend `ImportedTransaction`/`ImportedStatement` with optional CSV fields; add `getImportedDescriptionKey` (merchant-aware, FR-015); keep `normalizeImportedDescriptionKey` as the legacy key. |

Fixtures copied from V1 to `packages/domain/src/__fixtures__/c6-extrato.csv` and `c6-fatura.csv`.

### API

- `POST /transactions/imports/detect` (new): CSV only; returns detected profile, all profiles, account identification.
- `POST /transactions/imports/preview`: CSV requires `profileId` + `destinationType` + `destinationId`; service checks profile kind vs destination type and destination ownership; computes `externalId = sha256(payload)` and `sourceFingerprint = sha256("csv:<profileId>:<accountIdentification>")`; duplicate lookup unchanged. Category lookup uses merchant key then legacy key. `.xls` routed to the spreadsheet parser; OLE2 signature -> `IMPORT_XLS_BINARY_NOT_SUPPORTED`.
- `POST /transactions/imports`: rows accept optional `lineKind`; `credit`/`invoice-payment` -> 400 `IMPORT_ROW_NOT_IMPORTABLE` before any write; mappings stored under the merchant key.
- Contracts: [contracts/import-api.md](contracts/import-api.md).

### Web (`apps/web/src/features/transactions`)

- `transactions.api.ts` / `transactions.mutations.ts`: `detectTransactionImportProfile`, preview with CSV options.
- `useTransactionImportReview.ts`: `.csv` -> detect -> profile step; preview carries the locked destination.
- New `components/transaction-import-profile-step.tsx` (UI option A, see spec "UI decisions"), TanStack Form.
- Review row: line kind badge, installment/FX muted text, non-importable rows disabled. Summary: invalid lines notice.
- `transactions.presentation.ts`: PT-BR labels and error messages for the new codes.
- `transaction-import-screen-options.ts`: accepted extensions `ofx, qfx, xlsx, xls, csv`.

## Project Structure

### Documentation (this feature)

```text
specs/001-c6-csv-import/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/import-api.md
└── tasks.md
```

### Source Code

```text
packages/domain/src/{import-csv,import-c6,import-profiles,import-row-identity}.ts (+ .test.ts), transactions.ts, __fixtures__/
packages/validators/src/transactions.ts
apps/api/src/{routes/transactions.ts, services/transactions.service.ts, imports.integration.test.ts}
apps/web/src/features/transactions/{transactions.api.ts, transactions.mutations.ts, transactions.presentation.ts, useTransactionImportReview.ts, components/*import*}
docs/transaction-imports.md, CHANGELOG.md
```

## Complexity Tracking

None.
