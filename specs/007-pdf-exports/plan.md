# Implementation Plan: Branded PDF Exports for Transactions and Reports

**Branch**: `007-pdf-exports` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-pdf-exports/spec.md` (clarified 2026-11-12;
mockup skipped by recorded decision: only dropdown items are added)

## Summary

The transactions export menu (desktop and mobile) gains "Exportar como PDF"; the category trends
report's "Exportar CSV" button becomes an "Exportar" dropdown with CSV (unchanged), Excel and PDF.
PDFs are built on the device with `jspdf` + `jspdf-autotable` and Excel with `exceljs`, all loaded
by `import()` only at export time (FR-015). Transaction rows come from a new read endpoint
`GET /transactions/export/items` that reuses the exact filtering call of the CSV/XLSX export
(FR-002, FR-014, SC-002). The category report files are built from the `CategoryTrendsOutput`
already on screen; every amount, total and variation comes from the API (no client computation).
Two generic, DOM-free builders live in `apps/web/src/lib/` (`pdf-export.ts`, `xlsx-export.ts`) so
008 can reuse them; branding (theme color, rasterized SVG logos) is resolved separately in the
browser (`export-branding.ts`). Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/transactions-export-items-api.md](contracts/transactions-export-items-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+, workspace `tsconfig`), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod, TanStack Start/Query, shadcn/ui,
lucide-react, sonner. New in `apps/web`: `jspdf`, `jspdf-autotable` (V1 majors 4 / 5), `exceljs`
(same `^4.4.0` already in the lockfile via `apps/api`). Install with
`pnpm --filter @openmonetis/web add jspdf jspdf-autotable exceljs@^4.4.0`; commit the
`pnpm-lock.yaml` change.

**Storage**: PostgreSQL; no schema change, no migration

**Testing**: `node:test` + `tsx`; web presentation and builder tests in node; PostgreSQL
integration through the assembled app (bash, lane database)

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: SC-001, 5,000 rows to a downloaded PDF under 10 s (one API request, one
`autoTable` call)

**Constraints**: no PDF/Excel code in the initial bundle (dynamic `import()`); no data to third
parties; every query filters `userId` (reused service path); existing CSV/XLSX unchanged (SC-006)

**Scale/Scope**: 1 endpoint, 1 output schema, 1 service use case, 3 web lib modules, presentation
helpers in 2 features, 3 menus touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| I. AGENTS.md authority | Pass | Route thin (`c.req.valid("query")` -> service); service reuses `listTransactions` (repositories already filter `userId`); web calls `transactions.api.ts`, state via TanStack Query mutations, formatting in `*.presentation.ts`; shadcn `DropdownMenu`; no financial rule on the web (all amounts, totals and variations come from the API) |
| II. Upstream-compatible | Pass | Deliverables: product code, tests, `CHANGELOG.md` (`### Fork` in `Unreleased`), `docs/exports.md`. No unrelated upstream file touched; the new endpoint is additive |
| III. V1 is reference | Pass | Kept: PDF layout, columns, colors, file names, category report formats. Changed: rows come from a V2 endpoint, arrows drawn as vectors, totals split by type like the V2 screen, transfer column "origem para destino". Dropped: V1 account-statement variant beyond reuse of the same menu |
| IV. Financial integrity and isolation | Pass | Same `listTransactions(userId, query, false)` as the existing export; ownership asserted in the integration test (T003); no client arithmetic on money |
| V. Behavior-verified | Pass | Test plan below; scoped tests plus the transactions and financial-integrity integration tests |

AGENTS.md section 7 dependency evaluation: research.md R1.

## Upstream overlap check

- `git log --oneline upstream/main -30` (through `0.17.1`, 2026-11-11): the only PDF work is the
  person statement "Salvar PDF" via browser print (`e413eb7`, 0.16.0). No transactions or report
  PDF, no category report Excel.
- `git grep -i "jspdf|application/pdf|format.*pdf" upstream/main -- apps packages`: matches only
  attachments (PDF uploads). No conflict expected; `transactions-export-menu.tsx`,
  `transactions-mobile-actions-menu.tsx` and `category-trends-page.tsx` may receive upstream UI
  changes, resolved at merge time per the roadmap merge protocol.

## Design

### Validators (`packages/validators/src/transactions.ts`)

`TransactionExportItemsOutputSchema` = `{ items: z.array(TransactionOutputSchema), rowCount }`,
`.openapi("TransactionExportItems")`, type `TransactionExportItemsOutput`. Query reuses
`ListTransactionsQuerySchema` (research R2).

### API

- Service (`apps/api/src/services/transactions.service.ts`): `listTransactionsForExport(userId,
  query: ListTransactionsQuery)` -> `{ items, rowCount }` with `period = query.period ??
  getCurrentPeriodInBrazil()` and `listTransactions(userId, { ...query, period }, false)` (same
  lines as `exportTransactions`); exposed next to `exportTransactions`.
- Route (`apps/api/src/routes/transactions.ts`): `GET /export/items` declared next to `/export`
  (before `/{id}`), same auth, error responses and `Cache-Control: private, no-store`.

### Web

- `apps/web/src/lib/export-branding.ts` (browser only): `resolveExportBranding():
  Promise<ExportBranding>` (research R5).
- `apps/web/src/lib/pdf-export.ts` (DOM-free): `buildBrandedPdf(table: BrandedPdfTable):
  Promise<{ blob: Blob; pageCount: number }>`; imports `jspdf` and `jspdf-autotable` statically, the module itself is only
  reached via `import()`. Landscape A4; header: mark + wordmark when `logos`, title (16pt), period
  and "Gerado em" (10pt), rule in `branding.color`; `autoTable` with header fill
  `branding.color`, `overflow: "linebreak"`, repeated head, `didParseCell` text color red
  `[220, 38, 38]` for `tone: "expense"`, green `[22, 163, 74]` for `"income"`, bold + light gray
  fill for `emphasis`; `didDrawCell` draws the trend triangle (research R4).
- `apps/web/src/lib/xlsx-export.ts` (DOM-free): `buildXlsx({ sheetName, columns, rows }):
  Promise<Blob>` with exceljs; bold header, frozen first row, column widths; values written as
  plain JS strings/numbers (research R6).
- `apps/web/src/lib/download-blob.ts`: `downloadBlob(blob, fileName)` (object URL + anchor,
  revoked after click), used by both features; the file is created only after the builder resolved
  (no partial file, FR-011).
- Transactions:
  - `transactions.api.ts`: `getTransactionExportItems(search)` -> `GET
    /transactions/export/items` with `transactionsSearchParams({ ...search, page: undefined,
    pageSize: undefined })`.
  - `transactions.presentation.ts`: `type TransactionsExportFormat`;
    `getTransactionsExportPeriodLabel(search)`, `getTransactionsPdfFileName(search)` (research
    R7), `toTransactionPdfRow(item: TransactionOutput): TransactionPdfRow` (research R3, reuse
    existing type/condition/payment labels, `formatDate`, `formatCurrency`), `formatExportGeneratedAt(date)`.
  - `transactions.mutations.ts`: `useExportTransactionsMutation` accepts
    `TransactionsExportFormat`; for `"pdf"`: fetch items, `await import("@/lib/pdf-export")`,
    resolve branding, build, `downloadBlob` with `labelTransactionExportFileName(fileName,
    fileLabel)`; returns `{ rowCount }`. CSV/XLSX path unchanged.
  - `transactions-screen.types.ts`: `onExport?: (format: TransactionsExportFormat) => void`.
  - `transactions-export-menu.tsx` and `transactions-mobile-actions-menu.tsx`: item "Exportar como
    PDF" (lucide `FileDown`), same disabled/pending rules.
  - `transactions-container.tsx`: PDF success toast "Lançamentos exportados em PDF com sucesso!",
    error "Erro ao exportar lançamentos em PDF"; CSV/XLSX messages unchanged.
- Category trends:
  - `category-trends.presentation.ts`: `buildCategoryTrendsExportTable(report)`
    (data-model.md), `getCategoryTrendsExportFileName(report, extension)`,
    `toCategoryTrendsXlsxSheet(table)` (layout in "Excel layout decision" below) and
    `toCategoryTrendsPdfTable(table, branding, generatedAt)` (amount line + variation line per
    month cell, trend for the triangle, tone by category type, emphasis on total rows).
  - `category-trends.mutations.ts`: `useExportCategoryTrendsMutation` takes `{ report, format:
    "csv" | "xlsx" | "pdf" }`; CSV path calls the unchanged `downloadCategoryTrendsCsv`.
  - New `components/category-trends-export-menu.tsx`: dropdown like
    `transactions-export-menu.tsx`, disabled when pending, fetching or no categories.
  - `category-trends-page.tsx`: replace the button with the menu; toasts "Relatório exportado em
    PDF com sucesso!", "Relatório exportado em Excel com sucesso!", error "Erro ao exportar o
    relatório".

### Excel layout decision (category report)

Columns: `Categoria`, `Tipo`, then per month `<Mês>` (number, `"R$" #,##0.00`) and `<Mês> var.`
(text, e.g. `↑ 12,5%`, empty for the first month), then `Total` (number). Rows as
`CategoryTrendsExportTable`. Sheet "Relatório de Categorias". Keeps amounts numeric (sortable,
summable) while carrying the screen's variation text (FR-010).

## Test plan (test-slop-guard)

| Behavior | Layer | Declaration |
| --- | --- | --- |
| Items endpoint returns every filtered row across pages, equal to CSV count/amounts | API integration | `new, because distinct contract` (new endpoint) in `apps/api/src/transactions.integration.test.ts`: "export items return every filtered transaction beyond one page, matching the CSV export" |
| Items endpoint never reveals another user's rows | API integration | `extends apps/api/src/financial-integrity.integration.test.ts::foreign filters and exports do not reveal another user's transactions` |
| 401 without session | API integration | `none, because transactions.integration.test.ts::every documented private operation rejects requests without a session or device token iterates every OpenAPI path` |
| Period label + file name (month, range, open ends) | web presentation | `new, because distinct contract`: one parametrised test in `transactions.presentation.test.ts` "PDF export period label and file name follow the month or date range" |
| PDF row mapping (installment, transfer, split, empties, formula-like literal, tone) | web presentation | `new, because distinct contract`: one test in `transactions.presentation.test.ts` "PDF rows show the nine V1 columns with literal text" |
| Category export table (order, totals from API, variation/trend, first month) | web presentation | `new, because distinct contract`: one test in `category-trends.presentation.test.ts` "export table lists expense then income categories with API totals and variations" |
| Excel workbook content and literal formula text | web lib, node | `new, because distinct contract`: `apps/web/src/lib/xlsx-export.test.ts` "workbook keeps sheet, header, numbers and formula-like text literal" (exceljs read-back) |
| PDF builder produces a multi-page PDF without DOM and without logos | web lib, node | `new, because distinct contract`: `apps/web/src/lib/pdf-export.test.ts` "branded PDF spans pages for long tables and renders without logos" (blob text starts with `%PDF`, `pageCount > 1` for 120 rows, no throw with `logos: null`) |
| Branding resolution, menus, toasts | none | `none, because` browser-only (canvas, computed style) and visual wiring; verified by quickstart.md manual pass; no e2e (visual-only menus) |
| CSV/XLSX unchanged | none | `none, because locked by existing financial-integrity export test and category-trends.presentation.test.ts CSV test` |

No e2e: menus are thin wiring; the risky logic sits in the tested presentation/builders.
