# Research: Branded PDF Exports for Transactions and Reports

Decisions behind [plan.md](plan.md). Spec "Clarifications" holds the short form.

## R1. Where the PDF is built

- **Decision**: on the device, with `jspdf` + `jspdf-autotable`, loaded by `import()` only when
  the user picks a PDF or Excel export.
- **Rationale**: V1 parity (real download with the exact file name in 2 clicks, SC-001); the brand
  color is read from the live theme (`--primary`) and the logos from `apps/web/public/images`; no
  data leaves the device. `autoTable` repeats the header row on every page (`showHead:
  "everyPage"`, default) and wraps long text (`overflow: "linebreak"`), covering US1-6 and US3-2.
- **Alternatives**: browser print (`apps/web/src/lib/print-document.ts`, person report precedent)
  rejected: needs the print dialog, file name only suggested via the page title. Server-side
  `pdfkit` rejected: the API has no access to the theme color or the web logos, and it adds the
  dependency to the API image.
- **Dependency evaluation (AGENTS.md section 7)**: `jspdf` (MIT, maintained since 2010, millions of
  weekly downloads) and `jspdf-autotable` (MIT, de-facto table plugin) were used by V1 at
  `jspdf@^4.2.1` / `jspdf-autotable@^5.0.8`; install the latest stable of those majors. `exceljs`
  is already in `pnpm-lock.yaml` through `apps/api` (`^4.4.0`); `apps/web` declares the same
  range, so no new package enters the lockfile for it.

## R2. Rows for the transactions PDF

- **Decision**: new `GET /transactions/export/items`, query = `ListTransactionsQuerySchema` (the
  same schema the CSV/XLSX export extends; `page`/`pageSize` are accepted and ignored), response
  `{ items: TransactionOutput[], rowCount }` from `listTransactions(userId, { ...query, period },
  false)`, the exact call `exportTransactions` makes.
- **Rationale**: one filtering path for CSV, XLSX and PDF (FR-002, FR-014, SC-002) without paging
  the list endpoint (max `pageSize` 100, up to 50 round trips for 5,000 rows).
- **Alternatives**: `format=pdf` on `/transactions/export` rejected (that contract returns a
  finished file; mixing a row list into it breaks `TransactionExportOutputSchema`). Paging
  `/transactions` from the client rejected (slow, duplicates pagination logic). Zod 4 `.omit` on
  the refined list schema is not used (it throws on schemas with refinements).

## R3. Split, transfer and installment rendering

- Amount = `allocation?.amount ?? amount`, person = `allocation?.personName ?? personName`: same
  as the CSV row (`apps/api/src/utils/transactions-export.ts` `transactionRow`) and the list.
- Transfer: Conta/Cartão = `"<sourceAccountName> para <destinationAccountName>"`; no tone
  (neutral text color). Standard PDF fonts (WinAnsi) have accents and "R$" but no arrow glyphs.
- Installment: Nome = `"<name> (<currentInstallment>/<installmentCount>)"` when both exist.
- Condição: `isRecurring` -> "Recorrente", else the existing web condition label.

## R4. Arrows in the category report PDF

- **Decision**: the cell text holds only the amount and the percentage line; `didDrawCell` draws a
  filled triangle (`doc.triangle`) left of the percentage, up for `changeAmount > 0`, down for
  `< 0`, none for zero, "Novo" or "Sem base". No font file is embedded.
- **Excel**: variation text uses the Unicode arrows `↑` / `↓` (cells are UTF-8).

## R5. Branding

- `resolveExportBranding()` (browser only): color from `getComputedStyle(documentElement)
  .getPropertyValue("--primary")` resolved through a probe element to `rgb(...)`, fallback the
  coral `[201, 106, 58]` (V1 value); logos `/images/openmonetis-mark.svg` and
  `/images/openmonetis-wordmark.svg` loaded into `Image`, drawn on a canvas, `toDataURL("image/png")`.
  Any failure returns `logos: null`; the PDF is still produced (spec Edge Cases).
- The PDF builder receives branding as a parameter, so it runs in node tests without DOM.

## R6. Excel formula injection

- exceljs serializes JS strings as string cells (shared strings), never as formulas; a formula
  needs an explicit `{ formula }` value. So `=HYPERLINK(...)` is stored literally without an
  apostrophe. Locked by reading the generated workbook back in the T006 test.

## R7. Period label, file name, generated-at

- Month: label `"outubro 2026"` (lowercase long month + year, from `formatPeriod(period)` with
  `" de "` removed and lowercased); file `lancamentos-2026-10.pdf`.
- Range: label `"<dd/mm/aaaa> até <dd/mm/aaaa>"`, open start "Início", open end "hoje"; file
  `lancamentos-<yyyy-mm-dd|inicio>-<yyyy-mm-dd|hoje>.pdf`.
- `fileLabel` (account statement scope) is applied with the existing
  `labelTransactionExportFileName`.
- Generated-at: `dd/mm/aaaa` of the user's local day (`new Date()` formatted with
  `Intl.DateTimeFormat("pt-BR")`), never an ISO string cut at `T` (no UTC off-by-one).
- Category report: `"Período: <Mês ano> - <Mês ano>"` with `formatPeriod`; files
  `relatorio-categorias-<startPeriod>-<endPeriod>.(pdf|xlsx)`; CSV name unchanged.

## R8. Upstream overlap

See plan.md "Upstream overlap check": no transactions or report PDF export upstream through
0.17.1.
