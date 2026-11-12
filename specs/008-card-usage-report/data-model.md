# Data Model: Cross-Card Usage Report

No schema change. Domain types in `packages/domain/src/card-usage-report.ts` (cents are integers).

## Inputs (from the repository)

`CardUsageCard`: `{ id, name, brand: CardBrand, logo: string | null, limit: string | number }`
(only `status = 'active'`, filtered by `userId`).

`CardUsageEntry` (one stored card transaction row, own share):
`{ cardId: string, name: string, period: string, purchaseDate: string, amount: string | number,
origin: TransactionOrigin, transactionType: TransactionType, categoryId: string | null,
categoryName: string | null, categoryIcon: string | null, isInvoicePaymentCategory: boolean }`

`CardUsageRecurringRule` = `Omit<CategoryTrendRecurringRule, "categoryId" | "type">` &
`{ cardId: string, name: string, transactionType: TransactionType, categoryId: string | null,
categoryName: string | null, categoryIcon: string | null, isInvoicePaymentCategory: boolean }`
(amount = admin split amount when split; expense rules with a card only).

`CardUsageInvoiceSnapshot` (from the cards-service port):
`{ period: string, status: CardInvoiceStatus, amount: number, hasRecord: boolean }`
(`hasRecord` = stored invoice row or at least one payment for that period).

## Constants

`cardUsageHistoryMonths = 12`, `cardUsageCategoryLimit = 10`, `cardUsageTopExpenseLimit = 10`,
`cardUsageWarningPercentage = 50`, `cardUsageDangerPercentage = 80`, `cardUsageTrendThreshold = 5`.

## Pure functions

- `calculateUsagePercentage(usedCents, limitCents)` → `limitCents > 0 ? round2(used / limit × 100) : 0`.
- `resolveUsageTone(percentage)` → `"success"` (< 50) | `"warning"` (50 ≤ p < 80) | `"danger"` (≥ 80).
- `calculateUsageTrend(currentCents, previousCents)` → `{ changePercentage, trend }`:
  previous 0 & current > 0 → `{ 100, "up" }`; both 0 → `{ 0, "stable" }`; else
  `round2((current − previous) / previous × 100)` and `"up"` if > 5, `"down"` if < −5, else `"stable"`.
- `listCountedCardRows({ entries, recurringRules, startPeriod, endPeriod, today })` → rows with
  `impactCents` (via `calculateExpenseImpact`), excluding skipped origins/types/categories (R1),
  zero impacts, and recurring occurrences with `purchaseDate > today` or rules not `active`.
- `resolveCardUsageInvoiceState({ status, amount, hasRecord })` → `"paid"` if status paid;
  `"none"` if amount 0 and !hasRecord; `"overdue"` if status overdue; otherwise `"pending"`.
- `calculateCardUsageOverview({ period, today, cards, entries, recurringRules, requestedCardId })` →
  `CardUsageReport` below (without invoices).

## Output (`CardUsageReport`)

- `summary`: `{ totalLimitCents, totalUsedCents, totalAvailableCents = max(0, limit − used),
  usagePercentage, tone }`.
- `cards[]` sorted usage desc, name pt-BR, id: `{ id, name, brand, logo, limitCents, usedCents,
  availableCents, usagePercentage, tone, previousUsedCents, changePercentage, trend }`
  (`usedCents` = max(0, Σ impact in `period`); previous = same for `period − 1`).
- `selectedCardId`: requested id when in `cards`, else `cards[0]?.id ?? null`.
- `detail` (null when no card): `{ cardId, history: [{ period, usedCents, usagePercentage }] × 12
  (period − 11 … period), categories: [{ categoryId | null, name | null, icon | null, amountCents,
  percentage }] (net per category, > 0 only, desc then name, ≤ 10, percentage of month usage),
  topExpenses: [{ name, purchaseDate, categoryName | null, amountCents }] (positive impacts only,
  amount desc, date desc, name, ≤ 10) }`.

The service adds `detail.invoices` = 12 × `{ period, state, amount }` from the port and maps cents to
decimals with `fromCents`.
