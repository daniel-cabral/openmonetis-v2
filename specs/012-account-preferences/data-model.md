# Data Model: Account Preferences and Email Change

## `user_preferences` (existing, extended; migration `0037_account_preferences`)

| Column | Type | Null | Default | Constraint | API field |
|---|---|---|---|---|---|
| `transactions_column_order` | `text[]` | yes | `null` | none (tolerant read) | `transactionsColumnOrder` (`TransactionColumnId[] \| null`, `null` = default order) |
| `group_transactions_by_date` | `boolean` | no | `true` | | `groupTransactionsByDate` |
| `hide_anticipated_installments` | `boolean` | no | `false` | | `hideAnticipatedInstallments` |
| `show_transaction_summary` | `boolean` | no | `true` | | `showTransactionSummary` |
| `transaction_note_as_column` | `boolean` | no | `false` | | `transactionNoteAsColumn` |
| `attachment_max_size_mb` | `integer` | no | `50` | `check in (5, 10, 25, 50)` | `attachmentMaxSizeMb` |

One row per user (PK `user_id`, cascade on user delete). Absent row = all defaults
(`normalizeUserPreferences`). Reset deletes the row; delete-account cascades (FR-013).

### Validation (`UpdateUserPreferencesInputSchema`, partial + strict)

- `transactionsColumnOrder`: `null`, or 1..6 items of `TransactionColumnId`, no duplicates
  (refine). Unknown ids → 400.
- `attachmentMaxSizeMb`: literal union `5 | 10 | 25 | 50`; anything else → 400, stored value unchanged.
- Booleans: `z.boolean()`.

### Domain (`packages/domain/src/preferences.ts`)

- `transactionColumnIds = ["name","amount","condition","paymentMethod","note","account"] as const`.
- `resolveTransactionColumnOrder(saved: readonly string[] | null, options: { noteAsColumn: boolean })`
  → ordered `TransactionColumnId[]`: saved known ids first (deduplicated), then missing ids in
  default order; `note` removed when `noteAsColumn` is false.
- `excludeAnticipatedInstallments<T extends { anticipationId: string | null }>(items, hide)`.
- `normalizeUserPreferences` fills the six fields (invalid stored values → defaults).

### Domain (`packages/domain/src/attachments.ts`)

- `attachmentSizeLimitOptionsMb = [5, 10, 25, 50] as const`, default `50`.
- `resolveAttachmentSizeLimit(mb)` → `min(mb * 1024 * 1024, maximumAttachmentSize)`.
- `isAllowedAttachment(mimeType, size, limit = maximumAttachmentSize)`.

## `user` (Better Auth, existing; no schema change)

| Field | Rule |
|---|---|
| `email` | trimmed + lowercased on change; unique case-insensitive via existing `user_email_lower_unique` |
| `email_verified` | set to `false` on every email change |

## `people` (admin person, existing; no schema change)

- On email change, the user's `role = 'admin'` person gets `email = newEmail` in the same transaction.
  Name, avatar and ownership unchanged.

## `session` (Better Auth, existing)

- On email change, every session of the user except the current `session.id` is deleted.

## Domain (`packages/domain/src/settings.ts`)

- `freshSessionMaxAgeSeconds = 600`.
- `isFreshSession(createdAt: Date, now: Date)`.
- `normalizeAccountEmail(email)` (trim + lowercase) and `isSameAccountEmail(a, b)`.

## State: email change

```
request -> [same email?] -> 400 email_unchanged
        -> [credential account?] yes -> [password ok?] no -> 400 email_change_rejected
                                 no  -> [session fresh?] no -> 403 fresh_session_required
        -> [email taken by another user?] yes -> 400 email_change_rejected
        -> tx(update user + admin person email, verified=false, delete other sessions)
        -> [mail enabled?] yes -> send verification (failure logged, verificationEmailSent=false)
        -> 200 { email, verificationEmailSent }
```
