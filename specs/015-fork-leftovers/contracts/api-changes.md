# API Contract Changes: Fork Leftovers (015)

All changes are additive except one error code split. Envelope unchanged
(`{ data, error: null }` / `{ error: true, message, code }`).

## GET /invoices?period=YYYY-MM

`items[]` (`DashboardInvoice`) gains:

```json
{ "creditAmount": 7320.62 }
```

Non-negative; sum of the card's `invoiceCredit` movements in the period. `amount` keeps its meaning
(net of credits).

## POST /invoices/{cardId}/{period}/payments

Request unchanged (`CreateInvoicePaymentInput`: `accountId`, `paidAt`, `allocations[]` with explicit
amounts). Responses:

| Status | Code | When |
|---|---|---|
| 200 | | allocations within each person's open balance |
| 400 | `invalid_invoice_payment_amount` | duplicate person, empty total, person without balance on this invoice |
| 409 | `invoice_payment_balance_changed` (new) | a listed person's allocation exceeds its current open balance (includes a fully covered invoice); nothing is written |
| 409 | `invoice_payment_conflict` (existing) | paid total changed between read and write |
| 404 | existing codes | foreign card, account, person |

Previously the `invoice_payment_balance_changed` case returned 400 `invalid_invoice_payment_amount`.

## GET /reports/category-trends (route `category-trends`)

`categories[]` items that are root categories with children gain:

```json
{
  "subcategoryBreakdown": [
    { "categoryId": "uuid-aluguel", "name": "Aluguel", "amount": 2800.00, "percentage": 63.2 },
    { "categoryId": "uuid-condominio", "name": "Condomínio", "amount": 650.00, "percentage": 14.7 },
    { "categoryId": "uuid-faxina", "name": "Faxina", "amount": 480.00, "percentage": 10.8 },
    { "categoryId": "uuid-iptu", "name": "IPTU", "amount": 312.40, "percentage": 7.0 },
    { "categoryId": null, "name": null, "amount": 189.90, "percentage": 4.3 }
  ]
}
```

Computed over the requested `startPeriod..endPeriod` with the same `personScope` and `trip` filter
as `totalAmount`; `sum(amount) === totalAmount`. Empty array when the range has no movement;
absent on categories without children. Schema name `CategorySubcategoryBreakdownRow`.

## GET /transactions

New optional query `categoryMatch`: `family` (default, current behavior: selected categories plus
their children) or `exact` (only the listed category ids).

## Web route

`/categories/$categoryId?subcategory=<child uuid>|none` (plus existing search). Invalid values are
dropped by `validateSearch`; unknown uuids are ignored by the page.
