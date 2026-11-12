# API contracts: 010 Dashboard Gaps

Both endpoints: auth required, `Cache-Control: private, no-store`, query `period` (YYYY-MM, required), 400 on invalid period, 401 unauthenticated, envelope `{ data, error: null }`.

## GET /dashboard/spending-overview

```json
{ "data": {
  "period": "2026-11",
  "topExpenses": [{ "key": "uuid", "name": "Mercado A", "purchaseDate": "2026-11-03", "amount": 412.9, "categoryIcon": "ShoppingCart" }],
  "topEstablishments": [{ "name": "Mercado A", "count": 4, "total": 980.4, "categoryIcon": "ShoppingCart" }]
}, "error": null }
```
User without admin person: empty lists.

## GET /attachments/summary

```json
{ "data": {
  "period": "2026-11",
  "count": 7, "totalBytes": 4823112, "imageCount": 5, "pdfCount": 2,
  "recent": [{ "id": "uuid", "fileName": "nota.pdf", "mimeType": "application/pdf", "fileSize": 120331, "transactionName": "Farmácia", "purchaseDate": "2026-11-09" }]
}, "error": null }
```
Only the caller's attachments linked to the caller's transactions of the period.
