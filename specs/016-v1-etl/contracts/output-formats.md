# Output Format Contract (016)

Every command writes JSON (`<out>/<command>.json`) plus a text rendering (`<out>/<command>.txt`).
Deterministic for the same inputs: keys and arrays sorted, amounts as decimal strings with 2
places, dates `YYYY-MM-DD`, periods `YYYY-MM`, one `generatedAt` timestamp. Common header:

```json
{ "tool": "v1-etl", "command": "validate", "dumpFingerprint": "sha256...", "generatedAt": "..." }
```

## Finding

```json
{
  "rule": "recurrence.duplicate-occurrence",
  "severity": "fixable",
  "table": "lancamentos",
  "v1Id": "uuid",
  "v1UserId": "text",
  "reason": "Series has 2 occurrences in 2026-07",
  "context": { "seriesId": "uuid", "period": "2026-07", "rows": ["uuid", "uuid"] },
  "resolutions": ["detach", "drop"],
  "resolutionKey": "recurrence.duplicate-occurrence:lancamentos:<uuid>"
}
```

`severity`: `blocker` (load refuses until resolved), `fixable` (load applies the documented rule),
`informational` (counted, nothing to decide). `context` never holds note text, hashes or tokens.

## Rule catalog

| Rule id | Severity | Resolutions |
|---|---|---|
| `schema.unmapped` (unknown V1 table or column) | blocker | none (update the manifest) |
| `user.email-case-duplicate` | blocker | none (the load cannot merge or skip a user) |
| `passkey.duplicate-credential` | blocker | none (the load cannot choose a passkey) |
| `credential.incompatible-hash` | fixable | user flagged for password reset |
| `people.admin-cardinality` (not exactly one admin payer) | blocker | `admin:<v1 payer id>` |
| `people.blank-name` | blocker | `rename:<text>` |
| `amount.zero` (not a recurrence occurrence) | blocker | `drop` |
| `amount.zero-recurrence` | fixable | loaded as skip |
| `amount.precision` (more than 2 decimals) | blocker | none |
| `reference.dangling` (missing id, or id owned by another user: account, card, category, payer, trip, series, anticipated installment, marker target, mapping category) | blocker | `drop` for subcategories and import category mappings (skipped by the load); none for the other tables |
| `text.too-long` (value longer than the V2 `varchar(n)` of its target column, limit read from the Drizzle schema) | blocker | `truncate`, `drop` for side data (notes, attachments, inbox, notification states, logos, import mappings); none for transactions, payers, categories, accounts and cards |
| `transaction.period-date-mismatch` (non-card row, purchase month differs from `periodo`; boletos excluded) | blocker | `use-date`, `use-period` |
| `invoice.without-card` | blocker | `drop` |
| `invoice.paid-without-date` (paid, no payment row) | blocker | none |
| `budget.without-category` | blocker | `drop` |
| `budget.non-positive-amount` | blocker | `drop` |
| `note.missing-title` | blocker | `title-from-content`, `drop` |
| `note.blank-content` (`nota` with blank `descricao`) | blocker | `as-checklist`, `drop` |
| `note.task-description-as-item` (`tarefa` with non-blank `descricao`) | fixable | becomes the first unchecked item |
| `inbox.missing-identity`, `inbox.non-positive-amount` | blocker | `drop`, `null-amount` |
| `card.day-out-of-range` | blocker | none |
| `card.unknown-brand` | fixable | maps to `other` |
| `account.unknown-type` (value outside the V1 type list) | fixable | maps to `other` |
| `category.subcategory-type-mismatch` | blocker | none |
| `category.system-parent` (V1 parent merges onto a V2 system category) | blocker | `separate-root` |
| `category.name-collision` | fixable | merged onto the existing category (listed) |
| `installment.count-out-of-range` | blocker | none |
| `installment.duplicate-number`, `installment.inconsistent-members` | blocker | none |
| `installment.gap` (number missing between `trackedFromInstallment` and `totalInstallments`) | fixable | loaded with existing numbers, total derived |
| `recurrence.duplicate-occurrence` | fixable | default `detach` (extra row loads as a single); override `drop` |
| `recurrence.not-reproducible` (round-trip mismatch) | blocker | `as-singles` |
| `marker.missing-target` (payment card/period, refund source) | blocker | none |
| `trip.length` | blocker | none |
| `table.skipped-by-decision` (sessions, tokens, shares, ...) | informational | none |
| `stamp.dropped` (reconciliation fingerprints, batch ids) | informational | none (counted) |
| `mapping.key-not-normalized` (import mapping key V2 would not produce) | informational | none (loaded) |
| `passkey.rp-id-mismatch` (`--v1-rp-id` absent or not the target host) | informational | none (not loaded, listed) |

## Validation output (`validate.json`)

```json
{
  "header": {},
  "v1Counts": { "lancamentos": 1625 },
  "skippedTables": [{ "table": "session", "rows": 29, "decision": "disposable" }],
  "droppedStamps": { "ofx_import_fingerprint": 713, "import_batch_id": 348 },
  "findings": [],
  "summary": { "blocker": 0, "fixable": 3, "informational": 9 },
  "resolutionTemplate": { "<resolutionKey>": "<one of resolutions>" }
}
```

Exit 0 iff no blocker is left unresolved.

## Load output (`load.json`)

```json
{
  "header": {},
  "tables": [
    { "v1Table": "lancamentos", "read": 1625, "written": 877, "merged": 0,
      "skipped": [{ "reason": "zero-recurrence-skip", "rows": 3 }],
      "collapsed": [{ "reason": "recurrence-occurrences", "rows": 745, "into": 21 }],
      "detached": [{ "reason": "recurrence-duplicate", "rows": 1 }],
      "droppedColumns": [{ "column": "ofx_import_fingerprint", "rows": 713 }, { "column": "import_batch_id", "rows": 348 }] },
    { "v1Table": "import_category_mappings", "read": 256, "written": 256, "merged": 0, "skipped": [] },
    { "v1Table": "import_name_mappings", "read": 91, "written": 91, "merged": 0, "skipped": [] }
  ],
  "skippedTables": [{ "table": "session", "rows": 29, "decision": "disposable" }],
  "users": [
    { "v1UserId": "text", "v2UserId": "uuid", "status": "loaded|skipped-already-loaded|failed",
      "checksum": "sha256", "error": { "table": "passkey", "cause": "passkey_credential_id_unique" } }
  ],
  "appliedRules": [{ "rule": "card.unknown-brand", "rows": 0 }],
  "repairList": {
    "companionRepair": [{ "v1UserId": "text", "email": "...", "tokens": 1 }],
    "shareReinvite": [{ "ownerEmail": "...", "personName": "...", "sharedWithEmail": "..." }],
    "passwordReset": [{ "email": "..." }],
    "passkeysNotLoaded": [{ "email": "...", "count": 1, "reason": "rp-id-mismatch" }]
  }
}
```

Every V1 row of every table is in exactly one of written, merged, skipped or collapsed (SC-006):
the text output prints per table `read = written + merged + skipped + collapsed sources`
(detached rows count as written).

## Reconciliation output (`reconcile.json`)

```json
{
  "header": {},
  "users": [
    {
      "v1UserId": "text",
      "pass": true,
      "figures": [
        { "kind": "accountBalance", "key": { "account": "uuid", "periodEnd": "2026-10" },
          "v1": "1234.56", "v1WithV2Posting": "1234.56", "v2": "1234.56", "difference": "0.00", "pass": true },
        { "kind": "invoiceTotal", "key": { "card": "uuid", "period": "2026-07" },
          "v1": "...", "v2": "...", "status": { "v1": "pending", "v2": "pending" },
          "paidAt": { "v1": null, "v2": null }, "pass": true },
        { "kind": "invoiceTotal", "key": { "card": "uuid", "period": "2026-06" },
          "v1": "...", "v2": "...", "status": { "v1": "paid", "v2": "paid" },
          "paidAt": { "v1": "2026-06-11", "v2": "2026-06-11" }, "pass": true },
        { "kind": "transactionCount", "key": { "period": "2026-07", "type": "expense" }, "v1": 41, "v2": 41, "pass": true },
        { "kind": "categoryTotal", "key": { "period": "2026-07", "rootCategory": "uuid", "type": "expense" }, "v1": "...", "v2": "...", "pass": true },
        { "kind": "personTotal", "key": { "person": "uuid", "period": "2026-07" }, "v1": "...", "v2": "...", "pass": true }
      ],
      "informational": [{ "reason": "recurrence-duplicate-detached", "rows": 1 }],
      "expectedDifferences": [
        { "reason": "zero-recurrence-skip", "kind": "transactionCount", "count": 3 },
        { "reason": "period-date-resolved", "kind": "transactionCount", "rows": [{ "v1Id": "uuid", "resolution": "use-period", "period": "2026-06" }] },
        { "reason": "boleto-posting-month", "kind": "accountBalance",
          "rows": [{ "v1Id": "uuid", "period": "2026-08", "paymentMonth": "2026-09", "amount": "123.45",
                     "differenceVsRawV1": { "periodEnd": "2026-08", "value": "123.45" } }] },
        { "reason": "invoice-payment-category", "kind": "categoryTotal",
          "rows": [{ "v1Id": "uuid", "period": "2026-05", "amount": "-397.00" }] }
      ]
    }
  ],
  "global": { "users": 1, "passed": 1, "rehearsalReady": true, "totals": {} }
}
```

V1 `paidAt` = date of the latest invoice auto-payment row of that card and period, only for paid
invoices; pending invoices compare `null`. Boleto posting rule: an `accountBalance` figure passes only when `v2 == v1WithV2Posting`; the last
month end also requires `v2 == v1`. V1 categories merged into the V2 system invoice-payment
category ("Pagamentos") are left out of V1 `categoryTotal`, as V2 category trends leave that
category out; their admin rows (other than `AUTO_FATURA:` markers and transfers) are listed under
`invoice-payment-category` for the operator to recategorize. Any difference not listed in `expectedDifferences` fails.
Figures are compared in integer cents. `accountBalance` covers every month end from the first to the
last V1 period (Clarification 3). Transaction counts compare V1 rows with V2 rows plus expanded
recurrence occurrences. Exit 1 on any `pass: false`.
