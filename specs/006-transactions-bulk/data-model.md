# Data model: Transactions Mass-Add and Full Bulk Edit (006)

## Persistence

No schema change and no migration. Mass-add inserts ordinary `transactions` rows (`origin
"regular"`, `condition "single"`, no series, no recurrence, no splits, no note). Bulk edit updates
existing `transactions` columns and replaces `transaction_splits` rows of split targets when the
amount changes. Verified against `packages/db/src/schema.ts`: every written column already exists.

## Validation (`packages/validators/src/transactions.ts`)

### `BulkCreateTransactionsInputSchema` (strict)

| Field | Rule |
| --- | --- |
| `type` | `"income" \| "expense"` |
| `paymentMethod` | `paymentMethods` enum |
| `accountId` | uuid; required when `paymentMethod !== "credit_card"`, forbidden otherwise |
| `cardId` | uuid; required when `paymentMethod === "credit_card"`, forbidden otherwise |
| `invoicePeriod` | `periodSchema`, optional; only with `credit_card` |
| `rows` | 1..500, each strict `{ purchaseDate, name, amount, categoryId, personId }` |
| `rows[].purchaseDate` | `dateSchema` |
| `rows[].name` | `TransactionNameSchema` (trim, 1..160) |
| `rows[].amount` | same as `TransactionFieldsSchema.amount` (positive, max 999 999 999.99) |
| `rows[].categoryId`, `rows[].personId` | uuid, required (FR-006, FR-007) |

`superRefine` issues: `cardId` / `accountId` per method (paths `cardId`, `accountId`),
`invoicePeriod` without `credit_card`. Type `BulkCreateTransactionsInput`.

### `BulkUpdateTransactionsInputSchema` (strict)

| Field | Rule |
| --- | --- |
| `ids` | uuid 1..500 (same as `BulkTransactionsInputSchema`), duplicates collapsed by the service |
| `scope` | `TransactionActionScopeSchema`, default `"single"` |
| `changes` | strict object, at least one key |
| `changes.purchaseDate` | `dateSchema` |
| `changes.invoicePeriod` | `periodSchema` (not nullable) |
| `changes.dueDate` | `dateSchema.nullable()` (null clears the due date) |
| `changes.personId`, `accountId`, `cardId`, `categoryId` | uuid (not nullable) |
| `changes.note` | trim, max 1000, nullable (`""` normalized to null by the service, as today) |
| `changes.amount` | same as `TransactionFieldsSchema.amount` |

Unknown keys (`condition`, `isSettled`, `boletoPaymentDate`, `type`, `paymentMethod`, `splitShares`,
`tagIds`, `tripId`, `name`) -> 400 `validation_error` (Story 4). Type `BulkUpdateTransactionsInput`.

Output: existing `BulkTransactionsOutputSchema { ids: uuid[] }`.

## Domain types (`packages/domain/src/transactions.ts`)

```text
bulkTransactionUpdateFields = [purchaseDate, invoicePeriod, dueDate, personId, accountId,
                               cardId, categoryId, note, amount]
BulkTransactionUpdateTarget = BulkTransactionTarget & {
  condition: TransactionCondition; isRecurring: boolean; isSplit: boolean; isSettledLocked: boolean
}                                       isSettledLocked = settledDate !== null
BulkTransactionUpdateRejection = "protected" | "recurring" | "notApplicable"
                               | "splitPersonChange" | "settled"
BulkSeriesItem = { id, seriesId: string | null, currentInstallment: number | null }
InstallmentSeriesValues = { purchaseDate?: string; dueDate?: string | null;
                            boletoPaymentDate?: string | null; period?: string }
settlementLockedTransactionFields = [amount, type, paymentMethod, purchaseDate, personId,
  accountId, cardId, splitShares, settledDate, boletoPaymentDate, dueDate, condition,
  invoicePeriod]                         (moved from updateTransaction, unchanged)
```

## Repository read (`listBulkTransactionTargetsForUser`)

Adds to the existing select (all `userId`-filtered, same query): `condition`, `seriesId`,
`currentInstallment`, `recurringRuleId`, `settledDate`, `purchaseDate`, `period`, `dueDate`,
`personId`, `accountId`, `plannedAmount` (`transactions.amount`). Existing callers ignore the
extra columns.

## Derived per request (never stored)

- Mass-add record per row: `buildBaseRecord(rowInput, context)` + `amount =
  normalizeTransactionAmount(type, amount)` + `purchaseDate` + `period = derivePeriod(...)`
  (chosen invoice period for cards, else card closing rule or the row's date) + `installmentCount`,
  `currentInstallment`, `seriesId` null; `isSettled` false for accounts, null for cards.
- Bulk edit planned update per target: only changed columns; `period` from
  `resolveEditedTransactionPeriod` (single and anchors) or `shiftInstallmentSeriesValues` (covered
  installments); `splits` from `allocateAmountProportionally` when the amount changes on a split
  target.

## State and lifecycle

- Mass-add batch: transient; only the created rows persist. No batch id, no undo (each row is a
  normal transaction, deletable by existing single or bulk delete).
- Bulk edit: no new state; settled items stay locked until the settlement action undoes them;
  a paid invoice's total never changes through bulk edit (no item moves in or out, no amount
  change inside it); the write commits every planned row or none.
