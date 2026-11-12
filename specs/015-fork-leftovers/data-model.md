# Data Model: Fork Leftovers (015)

No table, column or migration change. All entities are derived values.

## InvoicePaymentAnnouncement (domain, derived)

`describeInvoicePaymentAnnouncement(input)` in `packages/domain/src/invoices.ts`.

| Input | Type | Notes |
|---|---|---|
| `amount` | number | invoice net amount (already net of credits) |
| `creditAmount` | number >= 0 | sum of `invoiceCredit` movements |
| `paidAmount` | number >= 0 | payments allocated |
| `remainingAmount` | number >= 0 | open balance |
| `recordAmount` | number >= 0 | what the selected mode would send (sum of allocations) |

| Output | Rule (integer cents) |
|---|---|
| `invoiceAmount` | `amount + creditAmount` |
| `coveredAmount` | `creditAmount + paidAmount` |
| `recordAmount` | input reported as is (no clamping), so the UI shows exactly what will be sent |
| `remainingAfterAmount` | `max(0, remainingAmount - recordAmount)` |
| `nothingToRecord` | `remainingAmount === 0` |

Validation: the server remains the authority (R3). Over-balance is rejected server-side.

## Invoice output addition

`DashboardInvoiceSchema.creditAmount: number >= 0` (2 decimals). Computed by
`sumInvoiceCredits(movements: { origin?: TransactionOrigin; amount: number }[])` (cents) in domain.

## Allocation validation errors (domain)

`validateInvoicePaymentAllocations` throws `RangeError` with message:
`person_without_balance` | `amount_exceeds_person_balance` | `duplicate_person` |
`payment_amount_required`. Service mapping in [contracts/api-changes.md](contracts/api-changes.md).

## SubcategoryBreakdownRow (domain, derived)

`buildSubcategoryBreakdown(rows)` in `packages/domain/src/category-trends.ts`.

| Field | Type | Rule |
|---|---|---|
| `categoryId` | uuid or `null` | `null` = direct parent transactions ("Sem subcategoria") |
| `name` | string or `null` | child name; `null` for the direct row |
| `amount` | number | `fromCents(cents)` |
| `percentage` | number | `round(cents * 1000 / totalCents) / 10`; `0` when `totalCents <= 0` |

Rules: drop rows with 0 cents; children by cents desc, ties by name; direct row last; `sum(amount)`
equals the parent's combined `totalAmount` for the same request (same cents map).

Attached as `subcategoryBreakdown?: SubcategoryBreakdownRow[]` on each root
`CategoryTrendCategoryOutput` that has children; omitted otherwise.

## Category page search

`CategoryTransactionsSearch.subcategory?: string` (`"none"` or child uuid). Invalid -> `undefined`;
unknown uuid -> ignored by the page.

## Transactions list query addition

`ListTransactionsQuerySchema.categoryMatch?: "family" | "exact"` (default `family`).

## Person connection

Unchanged. No permission level exists or is added.
