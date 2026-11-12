# Research: Account Preferences and Email Change

All Technical Context unknowns resolved below. Clarified product decisions live in
[spec.md](spec.md) (Clarifications, UI decisions).

## R1. Email change: Better Auth `changeEmail` vs a V2 settings endpoint

- **Decision**: own endpoint `POST /settings/email` (settings route/service/repository). Better Auth
  stays the session and credential authority: the service verifies the password with
  `verifyPassword` from `better-auth/crypto` (same scrypt format Better Auth writes), and the
  optional verification mail uses `auth.api.sendVerificationEmail`.
- **Rationale**: Better Auth 1.7.16 (`pnpm-lock.yaml`) `POST /change-email`
  (`dist/api/routes/update-user.mjs`) does not fit FR-008..FR-012:
  - no current-password check and no freshness requirement (only `sensitiveSessionMiddleware`,
    which just requires a session);
  - when the new email already exists it returns `{ status: true }` silently (anti-enumeration),
    so the UI would report success on a refused change (scenario US3-4 needs "refused");
  - for a verified user (every Google user) it requires a mail sender, otherwise
    `Verification email isn't enabled`; V2 runs without Resend by default;
  - it never revokes other sessions (FR-011);
  - same-email check compares lowercased input with the stored value without lowercasing it.
  A before-hook on `/change-email` could add the password and freshness checks but cannot fix the
  silent duplicate, the mail dependency or session revocation.
- **Alternatives**: hook-wrapped `changeEmail` (rejected above); `updateUser` (Better Auth
  forbids `email` in `updateUser`).

## R2. Identity proof

- **Decision**: credential account (row in `account` with `provider_id = 'credential'` and a
  password) must send `currentPassword`; it is checked against the stored hash. Google-only
  accounts send no password; the session must be younger than 10 minutes (reuse
  `PASSKEY_FRESH_SESSION_AGE_SECONDS`, now exported as the shared fresh-session age). The web
  offers `authClient.signIn.social({ provider: "google", callbackURL: "/settings?tab=profile&email=1" })`
  to obtain a fresh session.
- **Rationale**: matches V1 (password for non-Google) and the existing V2 freshness rule for
  passkey management. Freshness is a pure rule in `packages/domain/src/settings.ts`
  (`isFreshSession(createdAt, now)`); the route passes `sessionId` and `sessionCreatedAt` (set by
  `requireAuth`) as plain values, so the service never reads headers.

## R3. Uniqueness, atomicity, sessions

- **Decision**: email is trimmed and lowercased in the validator. Repository
  `changeEmailForUser(userId, email, keepSessionId)` runs one DB transaction: update `user.email`
  and `email_verified = false`, update the admin person's `email`, delete the user's other rows in
  `session`. A unique violation on `user_email_lower_unique` (race) maps to the same generic error
  as a pre-check hit.
- **Rationale**: the `lower(email)` unique index already exists (`packages/db/src/schema.ts:192`);
  no cookie cache is configured, so the next `getSession` reads the new email from the DB. The
  credential `account.account_id` is the user id in Better Auth 1.x, so no account row changes;
  passkeys and the Google `account` row are untouched (FR-011).
- **Generic errors**: wrong password, duplicate email and missing credential all return
  `400 email_change_rejected` ("Email change rejected"); stale Google session returns
  `403 fresh_session_required`; same email returns `400 email_unchanged`.

## R4. Rate limit, logging, mail

- **Decision**: the existing `/settings/*` mutation limiter (5 per minute per user, `app.ts`)
  already covers `POST /settings/email`; no new limiter. Passwords are never logged (the service
  logs only `[Settings] Failed to send email verification` with no payload).
- **Mail**: `auth.ts` configures `emailVerification.sendVerificationEmail` only when
  `readEmailEnvironment()` returns a key and sender (Resend via `createResendEmailSender`); the
  settings service receives a port `sendEmailVerification(email): Promise<boolean>` that returns
  `false` when mail is disabled or fails. Output `verificationEmailSent` drives the PT-BR toast.
- **Rationale**: FR-010 (mail optional, never blocks the change).

## R5. Hiding anticipated installments

- **Decision**: domain `excludeAnticipatedInstallments(items, hide)` in
  `packages/domain/src/preferences.ts` keeps an item unless `hide` and `item.anticipationId !== null`.
  `transactions.service.listTransactions` already hydrates and paginates in memory; it gains an
  options object `{ paginate, hideAnticipatedInstallments }`, filters before grouping/pagination,
  and the GET `/transactions` route path uses a new service method `listTransactionsForScreen`
  that reads the flag through a `readListPreferences(userId)` port (preferences service). Exports,
  calendar, AI context and companion callers keep the current behavior.
- **Rationale**: FR-005 (server decides, counts consistent), SC-005 (no total changes elsewhere).
  `anticipationId` already exists on `TransactionOutput`.

## R6. Attachment size limit

- **Decision**: `attachmentSizeLimitOptionsMb = [5, 10, 25, 50]` and
  `resolveAttachmentSizeLimit(mb)` (bytes, never above `maximumAttachmentSize`) in
  `packages/domain/src/attachments.ts`; `isAllowedAttachment(mime, size, limit = maximumAttachmentSize)`.
  The attachments service gets a port `getAttachmentSizeLimitMb(userId)` and checks it in
  `startUpload`, the single prepare path used by both transaction and note uploads; a size over the
  personal limit returns `400 attachment_too_large`. `confirmUpload` keeps the ceiling check (the
  size was fixed at prepare and is re-verified against storage).
- **Web**: `validateAttachmentFile(file, limitMb)` and the picker label use the person's limit.

## R7. Column order and grouping

- **Decision**: `transactionColumnIds = ["name","amount","condition","paymentMethod","note","account"]`,
  `resolveTransactionColumnOrder(saved, { noteAsColumn })` in domain preferences: keeps known ids
  in saved order, drops unknown/duplicates, appends missing ids in default position, removes `note`
  when note-as-column is off. Stored as nullable `text[]` (`null` = default). Grouping: web
  presentation `groupTransactionsByDate(rows)` mirrors the mobile list keys and labels; the table
  inserts a header row per date when `groupTransactionsByDate` is on.
- **Rationale**: tolerant read (US1-6) and future columns (upstream 0.17 "Situação").

## R8. Reset / delete (FR-013)

- **Decision**: no new code path. `settings.repository.resetForUser` already deletes the
  `user_preferences` row (defaults apply on next read) and account deletion cascades. The settings
  integration test asserts the new fields come back as defaults after reset.

## R9. Migration

- **Decision**: edit `packages/db/src/schema.ts`, run `pnpm db:generate` (expected
  `0037_*`), rename to `0037_account_preferences`, then `pnpm db:migrations:check`. Never
  `drizzle-kit push`. Columns have defaults, so existing rows are valid without backfill.
