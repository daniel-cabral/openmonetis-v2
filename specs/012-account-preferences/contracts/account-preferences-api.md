# Contracts: Account Preferences and Email Change

All routes require a session (`requireAuth`), send `Cache-Control: private, no-store`, and use the
`{ data, error }` / `{ error: true, message, code }` envelope.

## `GET /preferences`, `GET /preferences/defaults`, `PATCH /preferences`, `DELETE /preferences`

Existing routes; `UserPreferencesOutput` gains:

```json
{
  "transactionsColumnOrder": null,
  "groupTransactionsByDate": true,
  "hideAnticipatedInstallments": false,
  "showTransactionSummary": true,
  "transactionNoteAsColumn": false,
  "attachmentMaxSizeMb": 50
}
```

`PATCH` accepts any subset (strict). Errors: `400` validation (unknown column id, duplicate id,
`attachmentMaxSizeMb` not in 5/10/25/50, unknown field). Fields not sent are kept (last write wins
per field).

## `GET /transactions` (existing)

Unchanged query and response schema. When the caller's `hideAnticipatedInstallments` is true,
installments with `anticipationId != null` are excluded before grouping and pagination, so
`total`, `page` and `items` agree. Export routes are unaffected.

## `POST /attachments/prepare`, `POST /attachments/note/prepare` (existing)

Unchanged request schema (`fileSize` max stays 50 MB). New error:
`400 { code: "attachment_too_large" }` when `fileSize` exceeds the caller's
`attachmentMaxSizeMb`. Already-stored attachments are never re-checked.

## `POST /settings/email` (new)

Rate limited by the existing `/settings/*` limiter (5/min per user → `429 rate_limited`).

Request (`ChangeAccountEmailInputSchema`, strict):

```json
{ "newEmail": "novo@exemplo.com", "currentPassword": "optional for Google-only accounts" }
```

`newEmail`: trimmed, lowercased, valid email, max 320. `currentPassword`: string 1..128, optional.

Responses:

| Status | Code | When |
|---|---|---|
| 200 | | `{ "data": { "email": "novo@exemplo.com", "verificationEmailSent": false }, "error": null }` |
| 400 | `email_unchanged` | new email equals the current one (case-insensitive) |
| 400 | `email_change_rejected` | wrong/missing password on a credential account, or email used by another account (same generic message) |
| 400 | validation | invalid body |
| 401 | `unauthorized` | no session |
| 403 | `fresh_session_required` | Google-only account whose session is older than 10 minutes |
| 429 | `rate_limited` | limiter |

Side effects on 200: `user.email` and admin person email updated, `email_verified = false`, other
sessions deleted, current session kept; verification mail sent only when mail is configured.

## `GET /settings/security` (existing)

Unchanged; `passwordChangeAvailable` already tells the web whether to ask for the password.
