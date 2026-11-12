# Invoice payments

The invoice payment dialog announces what a confirmation will record before the user confirms it.
The API is the source of truth: the web shows the server numbers and does no financial math beyond
building the allocation list from them. The rules live in `packages/domain/src/invoices.ts`.

## Announcement numbers

For one invoice, the dialog shows four values, computed in integer cents:

- **Value** (`invoiceAmount`): `amount + creditAmount`. `amount` is the open balance of the invoice;
  `creditAmount` is the sum of `invoiceCredit` movements already on the invoice.
- **Covered** (`coveredAmount`): `creditAmount + paid`. Credits plus payments already recorded.
- **To record** (`recordAmount`): the sum of the allocations sent. Never clamped.
- **Remaining after** (`remainingAfterAmount`): `max(0, remainingAmount - recordAmount)`.

When `remainingAmount` is 0 the invoice is covered: `nothingToRecord` is true, the dialog says that
nothing will be recorded, and confirmation is disabled. The dialog still opens so the user can see
why.

`creditAmount` is a field on each invoice item in `GET /invoices`. It does not change `amount` or
`remainingAmount`: credits are already covered, not a reduction of the open balance.

## Announced equals recorded

The web builds the allocation list with the same rules the announcement uses (`invoice`, `person`
or `manual` mode). The text shown before confirmation is computed from that same list, so the amount
announced is the amount the API receives and records. The API validates each allocation against the
person's remaining balance on the invoice snapshot, not against the client's copy.

## Refusals

Payments are refused before any write when the snapshot has changed:

| Status | Code                             | Meaning                                                                 |
| ------ | -------------------------------- | ----------------------------------------------------------------------- |
| 409    | `invoice_payment_balance_changed` | An allocation is above the person's current remaining balance.         |
| 409    | `invoice_payment_conflict`        | The invoice changed while the payment was being registered.            |
| 400    | `invalid_invoice_payment_amount`  | Amount is not positive, duplicated per person, or otherwise malformed. |

A 409 means the user must look at the refreshed values again. The web invalidates the invoice
queries, keeps the dialog open, and asks the user to confirm again. A 400 is a request error and
keeps the existing error toast.
