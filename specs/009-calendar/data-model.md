# Data Model: Monthly Calendar

No schema change. All entities are read-model DTOs built by `packages/domain/src/calendar.ts`.

## CalendarDay

| Field | Type | Rule |
|---|---|---|
| date | `YYYY-MM-DD` | one of 42 Monday-first days covering the month |
| inMonth | boolean | date belongs to the requested period |
| isToday | boolean | date equals today in America/Sao_Paulo |
| events | CalendarEvent[] | empty for days outside the month; ordered transaction/installment, boleto, invoice, then name |
| totals | `{ income: number, expense: number }` | own-share sums (cents in domain) of transaction, installment and boleto events; invoices excluded (their purchases are already counted) |

## CalendarEvent (discriminated by `kind`)

Common: `id` (stable string), `kind`, `date`.

| kind | Extra fields | Placement |
|---|---|---|
| `transaction` | `transactionId` (null for unsettled recurring occurrence), `name`, `type` (income/expense), `amount` (own share, positive), `categoryName`, `categoryIcon`, `paymentMethod`, `cardName`, `isSettled`, `dueDate` | purchase date |
| `installment` | transaction fields + `currentInstallment`, `installmentCount` (amount = per-installment own share) | purchase date (card: only installment 1) |
| `boleto` | transaction fields + `dueDate` (adjusted), `isOverdue` (unsettled and dueDate < today) | adjusted due date |
| `invoice` | `cardId`, `cardName`, `cardLogo`, `cardBrand`, `amount` (invoice total), `state` (`paid`/`overdue`/`pending`), `paidAt` | adjusted invoice due date |

Exclusions: transfers; items with no own (admin) share; card installment rows with
`currentInstallment > 1`; events whose date is outside the month; invoices with total 0.

## Inputs (service -> domain)

- `period`, `today`, `adminPersonId`
- `purchaseItems`: `TransactionOutput[]` from the purchase-date range listing
- `boletoItems`: `TransactionOutput[]` from the payables listing filtered to boletos
- `cards`: `CardOutput[]` with `invoiceSummary` for the period
