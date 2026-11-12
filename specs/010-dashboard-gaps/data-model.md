# Data Model: 010 Dashboard Gaps

No schema change. Derived shapes (cents in domain; API output uses the same money format as other dashboard endpoints).

## SpendingOverview (domain `calculateSpendingOverview({ period, entries, recurringRules })`)
- `topExpenses` (max 10): `{ key, name, purchaseDate, amountCents, categoryIcon }`; order amount desc, purchaseDate desc, name asc (pt-BR).
- `topEstablishments` (max 10): `{ name, count, totalCents, categoryIcon }`; order count desc, totalCents desc, name asc; grouping by exact name.
- Eligibility: `isEstablishmentPurchase`; only rows of `period`; recurring occurrences of `period` included; zero amounts dropped; amount = abs(admin share).

## PeriodAttachmentsSummary (domain `summarizePeriodAttachments(links)`)
- `count`, `totalBytes`, `imageCount`, `pdfCount` over distinct attachment ids.
- `recent` (max 5): `{ id, fileName, mimeType, fileSize, transactionName, purchaseDate }`; order purchaseDate desc, createdAt desc, id asc; each attachment dated by its most recent linked transaction in the period.

## Category history (web presentation)
- `categoryHistoryWindow(period)` returns `{ startPeriod: period-8, endPeriod: period+1 }` (10 periods).
- Selection: `string[]` (max 5) in `sessionStorage` key `openmonetis.dashboard.category-history`; ids missing from available categories dropped on load.

## Dashboard widget ids
- New: `spending-overview` (analysis), `category-history` (analysis, wide), `attachments` (planning).
