# Contract: Reconciliation API

Router `apps/api/src/routes/reconciliations.ts`, mounted at `/reconciliations`. All endpoints: authenticated session, same rate limit and `Cache-Control: private, no-store` as `/transactions/imports/*`, envelope `{ data, error: null }` / `{ error: true, message, code }`. Amounts in JSON are positive numbers in reais plus `type` (`income` | `expense`), like the import contract. Zod schemas in `packages/validators/src/reconciliations.ts`.

Shared file input (`ReconciliationFileInput`): `{ fileName, contentBase64, profileId, targetType: "account" | "card", targetId: uuid, invoicePeriod?: "YYYY-MM" }` (same file rules as the import preview; `invoicePeriod` required when `targetType = "card"`).

## POST /reconciliations/detect
Input `{ fileName, contentBase64 }` (CSV only). Output: 001 `TransactionImportDetection` fields + `suggestedAccountId: uuid | null` (FR-002). No write.

## POST /reconciliations/preview
Input `ReconciliationFileInput`. No write (FR-003). Output:
- `fileRange: { start, end } | null` (account: min/max of launch and posted dates; card: null), `invoicePeriod | null`.
- `lines[]`: `{ index, purchaseDate, postedDate, amount, type, name, installment, lineKind, bucket, rule | null, entryKey | null, candidateKeys: string[], divergence: { appAmount, fileAmount } | null, alignment: { kind: "none" | "align" | "kept", reason | null }, suspicions: { reason, entryDate?, fileStartDate?, appAmount?, fileAmount? }[], ignoredReason | null, suggestedName, suggestedCategoryId | null }`.
- `entries[]`: every candidate entry of the target in the searched window `{ entryKey, name, date, period, amount, type, categoryId | null }` (used for "Vincular" lists and labels).
- `appOnlyKeys: string[]` (FR-006 scope already applied).
- `counts: { needsDecision, matched, bankOnly, ambiguous, ignored, informational, appOnly }`.
- `classificationDigest`: hex SHA-256 of the per-line `[index, bucket, rule, entryKey, candidateKeys]` list; opaque to the client.

Errors: 001 file/profile codes (`IMPORT_PROFILE_REQUIRED`, `IMPORT_PROFILE_NOT_FOUND`, `IMPORT_DESTINATION_MISMATCH`, `IMPORT_TOO_MANY_ROWS`...), `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND` (404), `RECONCILIATION_INVOICE_PERIOD_REQUIRED` (400).

## POST /reconciliations
Input `ReconciliationFileInput & { classificationDigest: string (64 hex), decisions: LineDecision[] }`; the server recomputes the digest and rejects with 409 `RECONCILIATION_STALE` when it differs; decisions sparse by `lineIndex` (unique), `action` `keep | create | link | ignore | skip`; `create` requires `name` (1..160, trimmed) and `personId`, optional `categoryId`; `link` requires `entryKey`; `ignore` requires `ignoreReason` (1..160). At least one effective change, else 400 `RECONCILIATION_NOTHING_TO_APPLY`.
Output 201 `{ batchId, created, reconciled, ignored, skipped }` (`skipped` = creations refused by an identity already owned outside the review).
Errors (nothing written): 404 `PERSON_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND`; 409 `RECONCILIATION_STALE` (decision no longer supported by the re-classification, entry gone, link to a consumed or out-of-period entry); 400 `INVOICE_ALREADY_PAID` (creation in a paid invoice period). No `CARD_LIMIT_EXCEEDED`.

## DELETE /reconciliations/{batchId}
Undo once. Output `{ batchId, undone: true }`. 404 `RECONCILIATION_BATCH_NOT_FOUND` when unknown, another user's, or already undone.
