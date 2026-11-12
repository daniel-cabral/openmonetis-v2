# Contract: `GET /reports/card-usage`

Auth required (`/reports/*` middleware: session, `Cache-Control: private, no-store`).

## Query (`ListCardUsageReportQuerySchema`)

| Param | Type | Default | Notes |
|---|---|---|---|
| `period` | `YYYY-MM` | current month (Brasília) | invalid → 400 |
| `cardId` | UUID | absent | not one of the user's active cards → default card (no error) |

## 200 response (`CardUsageReportOutputSchema`, amounts as decimal numbers)

```json
{
  "data": {
    "period": "2026-11",
    "summary": { "totalLimit": 10000, "totalUsed": 4000, "totalAvailable": 6000, "usagePercentage": 40, "tone": "success" },
    "cards": [
      {
        "id": "uuid", "name": "C6 Carbon", "brand": "mastercard", "logo": null,
        "limit": 5000, "usedAmount": 2500, "availableAmount": 2500,
        "usagePercentage": 50, "tone": "warning",
        "previousAmount": 2000, "changePercentage": 25, "trend": "up"
      }
    ],
    "selectedCardId": "uuid",
    "detail": {
      "cardId": "uuid",
      "history": [{ "period": "2025-12", "usedAmount": 0, "usagePercentage": 0 }],
      "invoices": [{ "period": "2025-12", "state": "none", "amount": 0 }],
      "categories": [{ "categoryId": "uuid", "name": "Mercado", "icon": "cart", "amount": 1200, "percentage": 48 }],
      "topExpenses": [{ "name": "Mercado A", "purchaseDate": "2026-11-05", "categoryName": "Mercado", "amount": 742.1 }]
    }
  },
  "error": null
}
```

- `tone`: `success | warning | danger`; `trend`: `up | down | stable`; `state`: `paid | pending | overdue | none`.
- `history` and `invoices` always have 12 items, oldest first, ending at `period`.
- No cards: `cards: []`, summary zeros, `selectedCardId: null`, `detail: null`.
- Uncategorized: `categoryId`, `name`, `icon` null (web shows "Sem categoria").
- Never contains `userId`.

## Errors

400 invalid `period` or `cardId` format; 401 unauthenticated.
