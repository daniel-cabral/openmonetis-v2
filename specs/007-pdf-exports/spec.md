# Feature Specification: Branded PDF Exports for Transactions and Reports

**Feature Branch**: `007-pdf-exports`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 branded PDF export for the transactions list and for reports to V2, which today exports transactions only as CSV/XLSX and the category trends report only as CSV."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export the transactions list as a branded PDF (Priority: P1)

A user viewing transactions for a period, with filters applied, wants a printable PDF to share or archive. They open "Exportar" and pick "Exportar como PDF".

**Why this priority**: Most-used export in V1 and the visible gap in the V2 export menu (CSV/XLSX only).

**Independent Test**: Apply a filter, export as PDF, and verify the downloaded file has the branded header, the period, and exactly the filtered rows.

**Acceptance Scenarios**:

1. **Given** the transactions page for October 2026 with no filters, **When** the user chooses "Exportar como PDF", **Then** a landscape PDF named `lancamentos-2026-10.pdf` downloads, with the app logo, the title "Lançamentos", "Período: outubro 2026" and "Gerado em: <today dd/mm/yyyy>" above a rule in the brand color.
2. **Given** filters (type, condition, payment method, person, category, account or card, text search, paid state, attachment, split, amount range, date range), **When** the user exports PDF, **Then** the PDF contains every transaction matching those filters, not only the visible page of results, and no other.
3. **Given** a custom date range filter, **When** exporting, **Then** the header shows "Período: <início> até <fim>" (with "Início" or "hoje" for an open end) and the file name uses the range (`lancamentos-<início>-<fim>.pdf`).
4. **Given** the exported table, **When** the user reads a row, **Then** it shows date (dd/mm/aaaa), name with "(parcela/total)" for installments, type, condition, payment method, amount in BRL, category, account or card, and person, with "-" for empty values.
5. **Given** expense and income rows, **When** rendered, **Then** the amount is red for expenses and green for income.
6. **Given** a result longer than one page, **When** exported, **Then** the table continues across pages and its header row repeats on every page.
7. **Given** no transactions match, **When** the user opens the export menu, **Then** the export options are disabled (same as CSV/XLSX).
8. **Given** the export is running, **When** the user looks at the menu, **Then** it shows "Exportando…" and is disabled until the file is ready; on failure a PT-BR error "Erro ao exportar lançamentos em PDF" is shown and no file is produced.

---

### User Story 2 - Export the category report as a branded PDF and Excel (Priority: P1)

A user analysing the category trends report wants to export it. V2 offers only CSV; V1 offered CSV, Excel and PDF.

**Why this priority**: Inventory marks report export as partial; same branding work as Story 1.

**Independent Test**: Open the category report for a range, export PDF and Excel, and verify both match the on-screen table.

**Acceptance Scenarios**:

1. **Given** a category report for a period range, **When** the user chooses "Exportar como PDF", **Then** a landscape PDF downloads with the branded header, the title "Relatório de Categorias por Período", "Período: <primeiro mês> - <último mês>", the generated-at date, a column per month plus "Total", one row per category and a final "Total Geral" row.
2. **Given** a category with a prior month, **When** rendered, **Then** each month cell shows the amount and, on a second line, the variation versus the previous month with an arrow and percentage ("↑ / ↓"), and the first month has no variation.
3. **Given** expense and income categories, **When** rendered, **Then** the values are colored red and green respectively and the totals row is bold with a light background.
4. **Given** the same report, **When** the user chooses "Exportar como Excel (.xlsx)", **Then** a workbook downloads with the sheet "Relatório de Categorias", the same rows, month columns, variation text, and totals as the screen.
5. **Given** the report has no categories, **When** the user opens the menu, **Then** the export options are disabled.
6. **Given** the existing CSV export, **When** the user exports CSV, **Then** it keeps working unchanged next to the new options, with the file name carrying the selected range.

---

### User Story 3 - Consistent, safe export files (Priority: P2)

A user exports from several places and expects uniform file names, language and safe content.

**Why this priority**: Prevents inconsistent output and spreadsheet-injection regressions when adding formats.

**Independent Test**: Export a transaction named `=HYPERLINK(...)` as PDF, Excel and CSV, and confirm the text appears literally and is never evaluated.

**Acceptance Scenarios**:

1. **Given** a transaction name starting with `=`, `+`, `-` or `@`, **When** exported to any format, **Then** the cell shows the text literally and is not evaluated as a formula.
2. **Given** a very long name or note, **When** exported to PDF, **Then** the text wraps within the column and never overflows or is cut silently.
3. **Given** accents and the symbol "R$", **When** exported to PDF, **Then** all characters render correctly.
4. **Given** the export includes data of other users or hidden people, **When** exported, **Then** only the signed-in user's visible transactions appear.

---

### Edge Cases

- Exports of up to the largest allowed result (several thousand rows) complete without freezing the page; very large results show progress feedback rather than a blank wait.
- Brand color and logo come from the app's current theme and assets; if the logo cannot load, the PDF is still produced without it.
- Dates are formatted in the user's calendar day (no off-by-one day from time zones).
- Transfers appear with type "Transferência" and show origin and destination accounts in the account/card column.
- A split transaction shows the person's share row, consistent with what the list shows.
- Settled and pending states are not part of the PDF columns (as in V1) but remain in CSV/XLSX.
- The PDF is produced on the user's device or by the server without sending data to third parties.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add "Exportar como PDF" to the transactions export menu, next to CSV and Excel, on every screen that already offers the transactions export.
- **FR-002**: The PDF MUST contain all transactions matching the current period and filters, independent of pagination, using the same filtering as the CSV/XLSX export.
- **FR-003**: The PDF MUST be landscape, with the app logo (symbol and text), title "Lançamentos", period line, generated-at date and a rule in the brand color, followed by a table with repeating header on each page.
- **FR-004**: The transactions table MUST have the columns Data, Nome, Tipo, Condição, Pagamento, Valor, Categoria, Conta/Cartão, Pessoa, with the installment suffix "(n/total)" in Nome for installments, and "-" for empty values.
- **FR-005**: Amounts MUST be shown in BRL with red for expenses and green for income.
- **FR-006**: The file name MUST be `lancamentos-<período>.pdf`, where the period is the selected month, or `<início>-<fim>` for a date range, with "inicio" and "hoje" for open ends.
- **FR-007**: The period label MUST read "<mês ano>" for a month and "<início> até <fim>" for a range ("Início" or "hoje" when open).
- **FR-008**: The category report MUST offer "Exportar como PDF" and "Exportar como Excel (.xlsx)" in addition to the existing CSV.
- **FR-009**: The category report PDF MUST be landscape with the same branding, the title "Relatório de Categorias por Período", the range line, a column per month plus Total, a row per category, month-over-month variation with arrow and percentage, color by category type, and a "Total Geral" row.
- **FR-010**: The category report Excel file MUST contain the sheet "Relatório de Categorias" with the same content and variation text as the screen.
- **FR-011**: The export options MUST be disabled while an export is running and when there is nothing to export, and failures MUST show a short PT-BR message without producing a partial file.
- **FR-012**: Success MUST be confirmed with a brief message ("Lançamentos exportados em PDF com sucesso!" and "Relatório exportado em PDF com sucesso!" or the Excel equivalent).
- **FR-013**: Every exported cell MUST be neutralized against spreadsheet formula injection in CSV and Excel, and PDF text MUST be literal.
- **FR-014**: Exports MUST include only the authenticated user's data and MUST follow the same visibility rules as the screen (people, shares).
- **FR-015**: PDF generation MUST NOT introduce a heavy dependency in the normal page load; it is loaded only when the user exports.
- **FR-016**: All user-facing text in the files and messages MUST be PT-BR; no financial computation may differ from what the screen shows.

### Key Entities

- **Export context**: the period, filters and source screen that define which transactions are exported.
- **Transaction export row**: the flattened view of a transaction used for CSV, XLSX and PDF.
- **Category trends report**: categories by month with totals and month-over-month variation.
- **Brand assets**: logo and primary color applied to PDF headers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user obtains a branded PDF of the filtered transactions in 2 clicks and under 10 seconds for up to 5,000 rows.
- **SC-002**: 100% of PDF rows equal the rows of the CSV export for the same filters in acceptance tests (count and amounts).
- **SC-003**: The category report PDF and Excel totals equal the on-screen totals in 100% of verification cases.
- **SC-004**: 0 exported cells are evaluated as formulas when opened in a spreadsheet application.
- **SC-005**: Repeated header and wrapped text keep every page of a 10-page PDF fully legible (no clipped columns) in visual review.
- **SC-006**: Existing CSV and XLSX exports of transactions and the category CSV behave exactly as before.

## Assumptions

- V1 branded PDF exists only for the transactions list and the category report; other V2 reports (installments, recurring, commitments, financial distribution, AI diagnoses) are out of scope. The person statement already has its own PDF and is untouched.
- The PDF columns follow V1 (nine columns) while CSV/XLSX keep the richer V2 columns.
- The V1 account statement variant of the export is covered only if the V2 account statement already reuses the transactions export menu; no new screen is added.
- Brand colors and logos come from the app's current theme and public assets.
- Where the PDF is built (device or server) is a planning decision; it must satisfy FR-013 to FR-015.

## Source

- V1 evidence: `src/features/transactions/components/transactions-export.tsx` (CSV, Excel and PDF export, period labels, columns, colors), `src/features/transactions/actions/export-actions.ts` (full filtered data for export), `src/features/reports/components/category-report-export.tsx` (CSV, Excel, PDF of the category report), `src/shared/utils/export-branding.ts` (brand color and logos).
- V2 evidence: `apps/web/src/features/transactions/components/transactions-export-menu.tsx` (CSV/XLSX only), `apps/api/src/utils/transactions-export.ts`, `apps/web/src/features/category-trends/category-trends.mutations.ts` and `.presentation.ts` (CSV only), `apps/web/src/lib/print-document.ts` and `docs/person-reports.md` (existing PDF precedent), `apps/web/src/lib/csv.ts`.
- Inventory rows covered: "Export transactions" (port; "V2: CSV/XLSX only, no branded PDF"), "Report export (PDF/Excel)" (port; "V2: category-trends CSV and person-report PDF/XLSX only").

## Dependencies

- Roadmap lane A sequence: after 006.
- Functional: reuses the transactions page filters and export menu; adds the category report formats independently of 006. No other migration feature is required.
