# Contract: Calendar API

## GET /calendar?period=YYYY-MM

Auth: session required (401 otherwise). `Cache-Control: private, no-store`.

Query: `period` optional, `YYYY-MM`; defaults to the current month in Brazil. Invalid -> 400
(the web normalizes invalid values to the current month before calling).

Response 200:

```json
{
  "data": {
    "period": "2026-10",
    "days": [
      {
        "date": "2026-10-12",
        "inMonth": true,
        "isToday": false,
        "totals": { "income": 0, "expense": 120.5 },
        "events": [
          {
            "id": "tx:...",
            "kind": "transaction",
            "date": "2026-10-12",
            "transactionId": "uuid",
            "name": "Mercado",
            "type": "expense",
            "amount": 120.5,
            "categoryName": "Mercado",
            "categoryIcon": "ShoppingCart",
            "paymentMethod": "debit_card",
            "cardName": null,
            "isSettled": true,
            "dueDate": null
          }
        ]
      }
    ]
  },
  "error": null
}
```

Other kinds per [data-model.md](../data-model.md). `days` always has 42 entries. Data is limited
to the authenticated user; amounts are own share (FR-007) except invoice totals.
