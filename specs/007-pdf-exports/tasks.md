---
description: "Task list for 007 Branded PDF Exports for Transactions and Reports"
---

# Tasks: Branded PDF Exports for Transactions and Reports

**Input**: `specs/007-pdf-exports/` (spec.md, plan.md, research.md, data-model.md,
contracts/transactions-export-items-api.md, quickstart.md)

**Execution model**: each task is executed by one subagent (implement -> review -> fix) in the
order below. Every task names exact files, the behavior to build (with the design doc section to
read) and a **Done check**. Do not commit inside tasks; the orchestrator commits at the end. Run
only scoped tests while iterating (test-slop-guard). Integration tests run from **bash** against
the lane database configured in the root `.env`.

**Tests**: few strong behavior tests, each with a test-slop-guard declaration
(`extends` / `new, because` / `none, because`). No e2e (plan.md "Test plan").

**Format**: `- [ ] T### [P?] [US?] Description`. [P] = may run in parallel with the previous task
(different files, no dependency). Story labels map to spec.md: US1 transactions PDF, US2 category
report PDF and Excel, US3 consistent and safe files.

---

## Phase 1: Setup

- [x] T001 Dependencies (plan.md "Technical Context", research.md R1). From the worktree root:
  `pnpm --filter @openmonetis/web add jspdf@^4 jspdf-autotable@^5 exceljs@^4.4.0`. Only
  `apps/web/package.json` and `pnpm-lock.yaml` change; exceljs must resolve to the version already
  locked for `apps/api` (no second exceljs entry). Test: none, because no behavior change.
  **Done check**: `pnpm install --frozen-lockfile` exits 0 and `git diff --stat` lists only those
  two files.

---

## Phase 2: Foundational (contract, endpoint, generic builders)

- [ ] T002 [US1] Items contract and endpoint (contracts/transactions-export-items-api.md, plan.md
  "Design > Validators/API", research.md R2). `packages/validators/src/transactions.ts`: add
  `TransactionExportItemsOutputSchema` = `z.object({ items: z.array(TransactionOutputSchema),
  rowCount: z.number().int().nonnegative() }).openapi("TransactionExportItems")` and type
  `TransactionExportItemsOutput`, next to `TransactionExportOutputSchema`.
  `apps/api/src/services/transactions.service.ts`: `listTransactionsForExport(userId, query:
  ListTransactionsQuery)` returning `{ items, rowCount: items.length }` from
  `listTransactions(userId, { ...query, period: query.period ?? getCurrentPeriodInBrazil() },
  false)`; expose it in the service object next to `exportTransactions`.
  `apps/api/src/routes/transactions.ts`: `GET /export/items` declared next to the `/export` route
  (before any `/{id}` route), request query `ListTransactionsQuerySchema`, 200 response
  `{ data: TransactionExportItemsOutput, error: null }`, same tag, auth, error responses and
  `Cache-Control: private, no-store` as `/export`; handler `c.json(ok(await
  service.listTransactionsForExport(c.get("userId"), c.req.valid("query"))), 200)`. Test: none
  here, because locked by T003. **Done check**: `pnpm --filter @openmonetis/validators typecheck`
  and `pnpm --filter @openmonetis/api typecheck` pass.

- [ ] T003 [US1] [US3] Integration tests for the items endpoint.
  (a) `apps/api/src/transactions.integration.test.ts`. Test: new, because distinct contract (new
  endpoint) - add one `t.test("export items return every filtered transaction beyond one page,
  matching the CSV export", ...)` inside the existing top-level test, one fixture: 35 expenses in
  one period on one account with one category plus 3 expenses in another category and 1 income;
  `GET /transactions/export/items?period=<p>&categoryIds=<c>` -> `rowCount` 35 and 35 items (more
  than the default page of 30), every item of that category; the CSV export with the same query ->
  `rowCount` 35 and the decoded CSV "Valor (R$)" column equals the items' amounts in the same
  order (literal expected values built from the fixture amounts, not from the code under test);
  one transaction named `=HYPERLINK("x")` returns `name` unchanged in items.
  (b) `apps/api/src/financial-integrity.integration.test.ts`. Test: extends
  `financial-integrity.integration.test.ts::foreign filters and exports do not reveal another
  user's transactions` - inside the existing filter loop also call
  `/transactions/export/items?period=2020-01&${filter}` as the owner and assert `items` is `[]`
  and `rowCount` 0. 401 coverage: Test: none, because
  `transactions.integration.test.ts::every documented private operation rejects requests without
  a session or device token` iterates every OpenAPI path. **Done check**: from bash,
  `pnpm test:transactions:integration` and
  `FINANCIAL_INTEGRITY_INTEGRATION_TEST=1 pnpm exec tsx --test apps/api/src/financial-integrity.integration.test.ts`
  pass.

- [ ] T004 [P] Generic file builders in `apps/web/src/lib/` (plan.md "Design > Web",
  data-model.md, research.md R4-R6). New `download-blob.ts`: `downloadBlob(blob, fileName)`.
  New `export-branding.ts` (browser only): `type ExportBranding`, `resolveExportBranding()`
  (`--primary` via a probe element -> `[r,g,b]`, fallback `[201, 106, 58]`; SVG mark and wordmark
  from `/images/openmonetis-mark.svg` and `/images/openmonetis-wordmark.svg` rasterized on a
  canvas to PNG data URLs; any failure -> `logos: null`, never throws). New `pdf-export.ts`
  (no DOM access): `type BrandedPdfTable`, `buildBrandedPdf(table) -> Promise<{ blob, pageCount
  }>` with `jspdf` landscape A4 and `jspdf-autotable` (header with logos when present, title,
  "Período: ...", "Gerado em: ...", rule in brand color; table head filled with brand color and
  repeated on every page; `overflow: "linebreak"`; tone colors red `[220, 38, 38]` / green
  `[22, 163, 74]`; `emphasis` rows bold with light gray fill; `didDrawCell` triangle for `trend`
  up/down left of the variation line). New `xlsx-export.ts` (no DOM access): `buildXlsx({
  sheetName, columns: Array<{ header, width, numFmt? }>, rows: Array<Array<string | number |
  null>> }) -> Promise<Blob>` with exceljs (bold frozen header; strings written as plain values).
  Test: new, because distinct contract - `apps/web/src/lib/pdf-export.test.ts` "branded PDF spans
  pages for long tables and renders without logos" (120 rows, `logos: null`: blob text starts
  with `%PDF`, `pageCount` > 1). Test: new, because distinct contract -
  `apps/web/src/lib/xlsx-export.test.ts` "workbook keeps sheet, header, numbers and formula-like
  text literal" (read back with exceljs: sheet name, header row, a number cell stays numeric, a
  `=HYPERLINK("x")` cell has `type` string and the literal text). If jsPDF cannot load in node,
  report it and keep only the xlsx test (do not mock jsPDF). **Done check**:
  `node --import tsx --test apps/web/src/lib/pdf-export.test.ts apps/web/src/lib/xlsx-export.test.ts`
  passes.

---

## Phase 3: User Story 1 - Transactions PDF (P1)

- [ ] T005 [US1] [US3] Transactions presentation (research.md R3, R7, data-model.md "Web types").
  `apps/web/src/features/transactions/transactions.presentation.ts`: `type
  TransactionsExportFormat = ExportTransactionsQuery["format"] | "pdf"`;
  `getTransactionsExportPeriodLabel(search)` ("outubro 2026"; "01/10/2026 até 15/10/2026";
  "Início até 15/10/2026"; "01/10/2026 até hoje"); `getTransactionsPdfFileName(search)`
  (`lancamentos-2026-10.pdf`; `lancamentos-2026-10-01-2026-10-15.pdf`; open ends `inicio` /
  `hoje`); `formatExportGeneratedAt(date: Date)` (`dd/mm/aaaa` of the local day);
  `toTransactionPdfRow(item: TransactionOutput): TransactionPdfRow` (9 cells: date
  `dd/mm/aaaa`, name with ` (n/total)` for installments, type label, condition label with
  "Recorrente" when `isRecurring`, payment label or "-", BRL of `allocation?.amount ?? amount`,
  category, account or card or `"<origem> para <destino>"` for transfers, `allocation?.personName
  ?? personName`; "-" for any empty value; tone expense/income, null for transfers). Reuse the
  existing label maps and `formatDate` / `formatCurrency`. Test: new, because distinct contract -
  in `apps/web/src/features/transactions/transactions.presentation.test.ts` one parametrised test
  "PDF export period label and file name follow the month or date range" (the 4 cases above,
  literal strings). Test: new, because distinct contract - "PDF rows show the nine V1 columns with
  literal text" (installment expense 2/10 with no category -> "-" and tone expense; transfer ->
  "Conta A para Conta B", tone null; split with allocation -> allocation amount and person;
  name `=HYPERLINK("x")` kept literal; income -> tone income). **Done check**:
  `node --import tsx --test apps/web/src/features/transactions/transactions.presentation.test.ts`
  passes.

- [ ] T006 [US1] Transactions PDF wiring (plan.md "Design > Web > Transactions", FR-001, FR-011,
  FR-012). `apps/web/src/features/transactions/transactions.api.ts`:
  `getTransactionExportItems(search)` (GET `/transactions/export/items`, params as
  `exportTransactions` without `format`). `transactions.mutations.ts`:
  `useExportTransactionsMutation` accepts `TransactionsExportFormat`; `"pdf"` fetches items,
  `const [{ buildBrandedPdf }, { resolveExportBranding }] = await Promise.all([import("@/lib/pdf-export"), import("@/lib/export-branding")])`,
  builds the table (title "Lançamentos", columns Data, Nome, Tipo, Condição, Pagamento, Valor,
  Categoria, Conta/Cartão, Pessoa), then `downloadBlob(blob,
  labelTransactionExportFileName(getTransactionsPdfFileName(search), fileLabel))`; CSV/XLSX path
  unchanged. `components/transactions-screen.types.ts`: `onExport` takes
  `TransactionsExportFormat`. `components/transactions-export-menu.tsx` and
  `components/transactions-mobile-actions-menu.tsx`: "Exportar como PDF" item (lucide `FileDown`) after
  Excel, same disabled/pending rules. `components/transactions-container.tsx`: for `"pdf"` toasts
  "Lançamentos exportados em PDF com sucesso!" / "Erro ao exportar lançamentos em PDF"; CSV/XLSX
  messages unchanged. Test: none, because mapping and naming are locked by T005, rows by T003 and
  the builder by T004; the rest is UI wiring (quickstart.md steps 2-5). **Done check**:
  `pnpm --filter @openmonetis/web typecheck` passes and `pnpm --filter @openmonetis/web lint:ui`
  passes.

---

## Phase 4: User Story 2 - Category report PDF and Excel (P1)

- [ ] T007 [US2] [US3] Category export presentation (spec Clarifications "Total Geral",
  data-model.md `CategoryTrendsExportTable`, plan.md "Excel layout decision").
  `apps/web/src/features/category-trends/category-trends.presentation.ts`:
  `buildCategoryTrendsExportTable(report)` (expense categories, "Total Geral - Despesas" from
  `periods[].expenseAmount` and `summary.expenseAmount`, income categories, "Total Geral -
  Receitas" from `incomeAmount`; section omitted when empty; first month variation null; other
  months `formatTrendPercentage(changePercentage, changeKind)` with trend from the sign of
  `changeAmount`), `getCategoryTrendsExportFileName(report, "pdf" | "xlsx")`
  (`relatorio-categorias-<start>-<end>.<ext>`), `getCategoryTrendsExportPeriodLabel(report)`
  ("Janeiro 2026 - Março 2026" via `formatPeriod`), `toCategoryTrendsXlsxSheet(table)` (sheet
  "Relatório de Categorias"; columns Categoria, Tipo, per month amount + "<mês> var." text with
  `↑ ` / `↓ ` prefix, Total) and `toCategoryTrendsPdfTable(table, branding, generatedAt)` (title
  "Relatório de Categorias por Período"; per month cell text `"<BRL>\n<variation>"`; tone by
  type; emphasis on total rows). No arithmetic on amounts. Test: new, because distinct contract -
  in `apps/web/src/features/category-trends/category-trends.presentation.test.ts` one test
  "export table lists expense then income categories with API totals and variations" (fixture of
  2 months, 1 expense + 1 income category: literal row labels and order, totals equal the fixture
  `periods[].expenseAmount` / `summary` values even when they differ from the category sum, first
  month variation null, second `"+12,5%"` with trend up, a `changeKind "started"` -> "Novo").
  **Done check**:
  `node --import tsx --test apps/web/src/features/category-trends/category-trends.presentation.test.ts`
  passes (existing CSV test included, unchanged).

- [ ] T008 [US2] Category export wiring (FR-008, FR-011, FR-012).
  `category-trends.mutations.ts`: `useExportCategoryTrendsMutation` takes `{ report, format:
  "csv" | "xlsx" | "pdf" }`; `csv` -> unchanged `downloadCategoryTrendsCsv`; `xlsx` ->
  `import("@/lib/xlsx-export")`; `pdf` -> `import("@/lib/pdf-export")` +
  `import("@/lib/export-branding")`; download with `downloadBlob`. New
  `components/category-trends-export-menu.tsx` (shadcn `DropdownMenu`, same look as
  `transactions-export-menu.tsx`: "Exportar CSV", "Exportar como Excel (.xlsx)", "Exportar como
  PDF"; trigger "Exportando…" while pending; disabled when pending, fetching or
  `report.categories.length === 0`). `components/category-trends-page.tsx`: replace the button
  with the menu; toasts "Relatório exportado em PDF com sucesso!", "Relatório exportado em Excel
  com sucesso!", error "Erro ao exportar o relatório"; CSV keeps its current behavior. Remove
  imports orphaned by the change only. Test: none, because content is locked by T007, builders by
  T004 and the CSV by the existing presentation test; menu is UI wiring (quickstart.md step 6).
  **Done check**: `pnpm --filter @openmonetis/web typecheck` and
  `pnpm --filter @openmonetis/web lint:ui` pass.

---

## Phase 5: Polish

- [ ] T009 [P] Docs and changelog. New `docs/exports.md` (PT-BR, maintainer style like
  `docs/transaction-bulk-actions.md`): formats per screen, PDF layout and columns, file names,
  period labels, category report totals per type and variation, Excel layout, formula safety,
  where files are built (device, lazy-loaded, nothing sent to third parties), endpoint
  `GET /transactions/export/items` contract, how to verify (quickstart.md). `CHANGELOG.md`: one
  entry at the end of `### Fork` in `Unreleased` (PT-BR, mentions the new endpoint and the new web
  dependencies, links `docs/exports.md`). Test: none, because docs only. **Done check**:
  `pnpm exec biome check CHANGELOG.md docs/exports.md` exits 0 (or the files are outside Biome's
  scope).

- [ ] T010 Final gate (no code changes except fixes for failures found). Run, one at a time,
  from bash at the worktree root: `pnpm lint`; `pnpm typecheck`;
  `node --import tsx --test apps/web/src/lib/pdf-export.test.ts apps/web/src/lib/xlsx-export.test.ts`;
  `node --import tsx --test apps/web/src/features/transactions/transactions.presentation.test.ts`;
  `node --import tsx --test apps/web/src/features/category-trends/category-trends.presentation.test.ts`;
  `pnpm test:transactions:integration`;
  `FINANCIAL_INTEGRITY_INTEGRATION_TEST=1 pnpm exec tsx --test apps/api/src/financial-integrity.integration.test.ts`;
  `pnpm db:migrations:check` (expects no new migration). No full suite in the lane. Revert
  incidental diffs in `apps/web/src/routeTree.gen.ts`. **Done check**: every command exits 0;
  report the outputs.

---

## Dependencies

- T001 first (T004 imports the new packages). T002 -> T003. T004 [P] after T001, independent of
  T002/T003.
- US1: T005 -> T006 (T006 needs T002 types and T004 builders).
- US2: T007 -> T008 (T008 needs T004). US2 does not depend on US1.
- T009 [P] any time after T008. T010 last.

## Parallel opportunities

- T002 || T004 (validators/api vs web lib); T009 || T010 prerequisites done. Other tasks share
  files and run in order.

## Implementation strategy

- MVP = US1: T001-T006. Then US2: T007-T008. US3 rules are asserted inside T003, T004, T005, T007.
  Docs and gate close the feature.
