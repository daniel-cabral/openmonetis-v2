# Data Model: Branded PDF Exports

## Persistence

None. No table, column or migration. Exports read existing data through existing service calls.

## Contracts (validators, `packages/validators/src/transactions.ts`)

- `TransactionExportItemsOutputSchema` (`.openapi("TransactionExportItems")`):
  `{ items: TransactionOutputSchema[], rowCount: int >= 0 }`. Type
  `TransactionExportItemsOutput`.
- Query: `ListTransactionsQuerySchema` reused as is (R2).

## Web types (presentation, not contracts)

- `TransactionsExportFormat = ExportTransactionsQuery["format"] | "pdf"` in
  `transactions.presentation.ts`; `TransactionsScreenProps["onExport"]` takes it.
- `TransactionPdfRow` (`transactions.presentation.ts`):
  `{ cells: [date, name, type, condition, paymentMethod, amount, category, accountOrCard, person]
  (9 strings, "-" when empty), tone: "expense" | "income" | null }`.
- `BrandedPdfTable` (`apps/web/src/lib/pdf-export.ts` input):
  `{ title, periodLabel, generatedAt, fileName, branding: ExportBranding, columns: Array<{ header,
  width?, align? }>, rows: Array<{ cells: Array<{ text, tone?: "expense" | "income" | null,
  trend?: "up" | "down" | null }>, emphasis?: boolean }> }`.
- `ExportBranding` (`apps/web/src/lib/export-branding.ts`):
  `{ color: [r, g, b], logos: { mark: string; wordmark: string } | null }` (PNG data URLs).
- `CategoryTrendsExportTable` (`category-trends.presentation.ts`, shared by PDF and XLSX):
  `{ periodLabel, columns: string[] ("Categoria", one per month via formatPeriod(period, true),
  "Total"), rows: Array<{ label, type: "expense" | "income" | null, emphasis, cells: Array<{
  amount: number, variation: string | null, trend: "up" | "down" | null }>, total: number }> }`.
  Order: expense categories, `"Total Geral - Despesas"` (emphasis, amounts from
  `periods[].expenseAmount`, total `summary.expenseAmount`), income categories,
  `"Total Geral - Receitas"` (`incomeAmount`). A section without categories is omitted with its
  total row. Variation: first month null; else `formatTrendPercentage(changePercentage,
  changeKind)` prefixed by `↑ ` / `↓ ` in Excel (trend from the sign of `changeAmount`).

## Validation rules

- Nothing to export -> menu items disabled (transactions: `rowCount`/visible total 0, existing
  rule; category report: `report.categories.length === 0`).
- No partial file: the download anchor is created only after the builder resolved.
