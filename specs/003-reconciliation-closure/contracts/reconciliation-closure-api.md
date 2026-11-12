# Contract: Reconciliation closure and projection (extends 002)

Extends `specs/002-reconciliation-core/contracts/reconciliation-api.md`. Schemas in `packages/validators/src/reconciliations.ts`. All new amounts are integer cents.

## POST /reconciliations/preview (output additions)

- `lines[].signedCents: integer` (file value with sign: expense negative).
- `lines[].bucket`: credit lines (`lineKind = "credit"`) now get `matched` / `needs-decision` / `bank-only` / `ambiguous` / `ignored`; only `lineKind = "invoice-payment"` gets `informational`.
- `closure`:
  - account: `{ kind: "statement", closes: boolean, days: StatementDayClosure[], unverifiedDays: string[] (YYYY-MM-DD), divergences: StatementDayClosure[], finalBalance: { date, cents } | null }` where `StatementDayClosure = { day, balanceCents, previousBalanceCents, movementCents, sumCents, differenceCents, closes }`.
  - card: `{ kind: "invoice", netCents: integer }` (purchases add, credits subtract, previous-invoice payments excluded, after the date reclassification).
  - `null` when the file has no lines.
- `projection`:
  - account: `{ kind: "account", cutoffDate: "YYYY-MM-DD", baselineCents: integer, entries: ProjectionEntry[] }` (baseline = account balance through `cutoffDate` by the account-screen rule; `cutoffDate = fileRange.end`).
  - card: `{ kind: "card", invoicePeriod: "YYYY-MM", entries: ProjectionEntry[] }` (status always null).
  - `null` when the account file has no dates.
  - `ProjectionEntry = { entryKey, name, postingDate: "YYYY-MM-DD", period: "YYYY-MM", signedCents: integer, alignable: boolean, status: "in-balance" | "unsettled" | "after-end" | null }`, one per preview `entries[]` item (same keys).
- `classificationDigest` is unchanged in shape (credit lines now carry their match rule and entry key in it).

No new error code. The invoice total is never sent.

## POST /reconciliations (apply)

Unchanged input. Behaviour: a `create` decision on a card credit line inserts origin `invoiceCredit`, type income, `credit_card`, invoice period, batch id and identity. A decision on an `invoice-payment` line stays `RECONCILIATION_STALE`.

## GET /transactions (account statement)

`view=accountStatement` items gain `isPaidUnreconciled: boolean` (optional in `TransactionOutputSchema`, set only in this view): `isSettled === true`, no row identity, statement date (`postingDate ?? purchaseDate`) >= the account's first reconciled date; false when the account has no reconciled transaction.

## PUT/PATCH transaction update

- `origin = invoiceCredit` entries are editable (previously only `regular`). The update must keep `type = income`, `paymentMethod = credit_card` and the same `cardId`; otherwise 400 `INVOICE_CREDIT_SHAPE_LOCKED` (nothing written).
- `DELETE` accepts `invoiceCredit` (`canDeleteTransactionOrigin`).
- Copy remains regular-only (`GENERATED_TRANSACTION_IMMUTABLE`).
