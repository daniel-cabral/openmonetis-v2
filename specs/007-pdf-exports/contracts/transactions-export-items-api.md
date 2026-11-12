# Contract: `GET /transactions/export/items`

Every transaction matching the list filters, without pagination, for exports built on the device
(the branded PDF). Same filtering, ownership and visibility as `GET /transactions/export`.

- Auth: session (same middleware as `/transactions/export`); 401 without it.
- Headers: `Cache-Control: private, no-store`.
- Query: `ListTransactionsQuery` (all list filters: `period`, `dateStart`, `dateEnd`, `type`,
  `condition`, `paymentMethod`, `personIds`, `categoryIds`, `tagIds`, `accountIds`, `cardIds`, `q`,
  paid state, attachment, split, `minAmount`, `maxAmount`, ...). `page` / `pageSize` accepted and
  ignored. Missing `period` defaults to the current period in Brazil (as the export).
- 200: `{ "data": { "items": TransactionOutput[], "rowCount": number }, "error": null }`;
  `rowCount === items.length`.
- 400: invalid query (`{ "error": true, "message": "...", "code"?: "..." }`), same as the list.
- Registered before any `/{id}` route. OpenAPI tag `Transactions`, schema `TransactionExportItems`.

## Equality guarantee

For the same query, `rowCount` equals `GET /transactions/export?format=csv` `rowCount`, and the
amounts are those of the CSV "Valor (R$)" column in the same order (SC-002).
