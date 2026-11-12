# Contract: Establishments Report and Trip Filter

All endpoints require a session; responses use `{ data, error: null }` and `Cache-Control: private, no-store`.

## GET /reports/establishments

Query (`ListEstablishmentsReportQuerySchema`):

| Param | Type | Default | Notes |
|---|---|---|---|
| `period` | `YYYY-MM` | current period (Brazil) | end of the window |
| `months` | `3` \| `6` \| `12` | `6` | ignored when `trip` is a trip id |
| `trip` | `none` \| uuid | absent = all | foreign/unknown id -> all |

Response `data`:

```json
{
  "window": { "startPeriod": "2026-01", "endPeriod": "2026-06" },
  "months": 6,
  "tripFilter": { "mode": "trip", "tripId": "uuid", "tripName": "Lisboa" },
  "summary": {
    "establishmentCount": 12, "transactionCount": 40, "totalAmount": 3456.78,
    "averageAmount": 86.42, "mostFrequent": "Mercado A", "highestTotal": "Posto B"
  },
  "establishments": [
    { "name": "Mercado A", "count": 8, "totalAmount": 800, "averageAmount": 100,
      "categories": [{ "categoryId": "uuid", "name": "Mercado", "icon": "cart", "count": 8 }] }
  ],
  "topCategories": [
    { "categoryId": "uuid", "name": "Mercado", "icon": "cart", "totalAmount": 800, "count": 8 }
  ]
}
```

`tripFilter.mode` is `all` | `none` | `trip`; `tripId`/`tripName` only for `trip`.
Invalid `period`/`months` -> 400 validation error (the web never sends them: its resolver falls back).

## GET /reports/category-trends (extended)

New optional param `trip` (`none` | uuid). Absent = current behavior. Foreign/unknown id -> all.

## GET /trips/:tripId/period-range

Response `data`: `{ "startPeriod": "2026-03", "endPeriod": "2026-12" }` or `null` (trip without linked
rows, unknown or foreign). Range capped at 24 months from `startPeriod`.
