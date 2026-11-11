# Feature Specification: Account Preferences and Email Change

**Feature Branch**: `012-account-preferences`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the 6 missing V1 preferences (transactions column order, group by date, hide anticipated installments, show summary in the transaction modal, statement note as column, max attachment size) and the email change to V2 settings."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Personalize the transactions table (Priority: P1)

A person opens Settings > Preferences and tunes how the transactions list looks: the order of the reorderable columns, whether the statement note is shown as its own column, whether rows are grouped by date, and whether installments that were anticipated are hidden from the list.

**Why this priority**: These four preferences change what the person sees every day on the most used screen; V1 users will notice their absence immediately after cutover (full parity gate).

**Independent Test**: Change each preference, reload the transactions screen and confirm the list reflects it, and that the choice survives logout/login and a second device.

**Acceptance Scenarios**:

1. **Given** the default preferences, **When** the person opens the transactions list, **Then** rows are grouped by date, the note is not a column, anticipated installments are shown, and columns follow the default order (name, type, amount, condition, payment method, category, person, note, account/card).
2. **Given** the person reorders columns to put "Valor" first, **When** the transactions list loads on any device, **Then** the reorderable columns follow the saved order while the selection checkbox stays first and the actions column stays last.
3. **Given** "Show note as column" is on, **When** the list renders, **Then** each transaction note appears in its own column; turning it off removes the column without losing notes.
4. **Given** "Group by date" is off, **When** the list renders, **Then** rows appear as a single flat list in the existing sort order, with no date headers.
5. **Given** "Hide anticipated installments" is on, **When** the person lists a month containing installments that were anticipated, **Then** those installments are not listed and balances and totals computed elsewhere do not change.
6. **Given** a saved column order that contains a column id that no longer exists or misses a new column, **When** the list renders, **Then** unknown ids are ignored and missing columns are appended in default position (no crash, no empty table).
7. **Given** the person clicks "Reset order", **When** confirmed, **Then** the saved order is cleared and the default order applies.

---

### User Story 2 - Transaction modal summary and attachment size limit (Priority: P2)

A person chooses whether the transaction dialog shows the summary panel (default on) and picks the maximum size of an attachment they may upload (5, 10, 25, 50 or 100 MB; default 50 MB).

**Why this priority**: Smaller convenience settings; V2 already has the summary and a fixed 50 MB limit, so they work today without the toggle.

**Independent Test**: Turn the summary off and open the transaction dialog; set the limit to 5 MB and try uploading a 6 MB file.

**Acceptance Scenarios**:

1. **Given** "Show summary in transaction modal" is off, **When** the person opens the create or edit transaction dialog, **Then** the summary panel is not shown and saving still works.
2. **Given** the limit is 5 MB, **When** the person selects a 6 MB file on a transaction, **Then** the file is rejected before upload with a short PT-BR message naming the limit.
3. **Given** the limit is 5 MB, **When** a client bypasses the UI and sends a 6 MB file to the server, **Then** the server rejects it as well.
4. **Given** the person lowers the limit below the size of files already attached, **When** they save, **Then** existing attachments are kept and only new uploads are checked.
5. **Given** the limit is set to a value outside the allowed list (e.g. 500 MB), **When** the request reaches the server, **Then** it is rejected with a validation error and the stored value does not change.

---

### User Story 3 - Change my email (Priority: P1)

A person changes the email used to sign in, from Settings > Profile, after confirming their identity.

**Why this priority**: V2 shows the email read-only; without this, a V1 user who migrates with a stale or mistyped email has no recourse.

**Independent Test**: Change the email with the correct password, sign out, sign in with the new address.

**Acceptance Scenarios**:

1. **Given** a person who signs in with email and password, **When** they enter a new email and their current password correctly, **Then** the account email changes and they can sign in with the new one.
2. **Given** a wrong current password, **When** they submit, **Then** nothing changes and a generic PT-BR error is shown.
3. **Given** the new email equals the current one (ignoring case), **When** they submit, **Then** the form shows "O novo e-mail deve ser diferente do atual" and nothing changes.
4. **Given** the new email already belongs to another account (any letter case), **When** they submit, **Then** the change is refused with a generic message and nothing changes.
5. **Given** a person who signs in only with Google, **When** they change the email, **Then** the flow asks for a recent re-authentication instead of a password, and the Google link is preserved.
6. **Given** the change succeeds, **When** other sessions of that account exist, **Then** they are signed out and the current session stays valid.
7. **Given** repeated attempts, **When** the rate limit is exceeded, **Then** further attempts are rejected until the window passes.

### Edge Cases

- First read for a person without extended preferences: defaults apply, no error.
- Concurrent edits from two devices: last write wins per field; unrelated fields are not overwritten.
- Invalid email format, empty email, email with leading/trailing spaces (trimmed) or differing only by case.
- Preference values written by an older client lacking new fields: server fills defaults.
- Account reset ("Reset account data") restores the new preferences to defaults; account deletion removes them.
- Hiding anticipated installments must not hide the anticipation transaction itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store per person: transactions column order (ordered list of reorderable column ids or "default"), group-by-date flag (default on), hide-anticipated-installments flag (default off), show-summary-in-modal flag (default on), statement-note-as-column flag (default off), and maximum attachment size in MB (allowed 5, 10, 25, 50, 100; default 50).
- **FR-002**: System MUST expose these preferences through the existing preferences read/update contract, with per-operation validation rejecting unknown column ids, duplicates and sizes outside the allowed list.
- **FR-003**: The Settings Preferences page MUST present the six controls in PT-BR, save them without a full page reload, and confirm success or failure briefly.
- **FR-004**: The transactions list MUST honor column order, note-as-column and group-by-date; fixed columns (selection first, actions last) MUST NOT be reorderable.
- **FR-005**: Hiding anticipated installments MUST be decided by the server (so pagination and counts stay consistent) and the rule MUST live in the domain, not in the UI.
- **FR-006**: The transaction dialog MUST hide its summary when the preference is off, without changing validation or save behavior.
- **FR-007**: Attachment uploads MUST be validated against the person's limit both in the client and on the server; the current fixed 50 MB value remains the hard ceiling.
- **FR-008**: A person MUST be able to change their email after proving identity (password for credential accounts; recent re-authentication for Google-only accounts).
- **FR-009**: Email uniqueness MUST be case-insensitive.
- **FR-010**: On email change, the verified flag MUST follow the installation's capability: if it can send mail, the new address starts unverified and a confirmation is sent; if it cannot, the change applies immediately and the UI states that no confirmation mail was sent.
- **FR-011**: Changing the email MUST NOT alter the admin person's name, data ownership, passkeys or Google link, and MUST revoke other active sessions.
- **FR-012**: Email change MUST be authenticated, rate limited, never log passwords, and return generic errors.
- **FR-013**: Reset-account and delete-account flows MUST include the new preference fields.

### Key Entities *(include if feature involves data)*

- **User preferences**: existing per-person record extended with the six fields above; one row per person, defaults when absent.
- **Account email**: sign-in identity of the user, unique case-insensitively, with a verified flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Each of the six preferences can be changed and observed on the next screen load in under 30 seconds of effort, and persists across devices and sessions.
- **SC-002**: With all new preferences at default, the transactions list and dialogs look and behave exactly as they do today (no regression in existing tests).
- **SC-003**: 100% of attachment uploads larger than the saved limit are rejected, by both the client check and a direct server call.
- **SC-004**: A person can change their email and sign in with the new address in under 2 minutes; 0 successful changes occur with a wrong password.
- **SC-005**: Hiding anticipated installments changes the list by exactly the anticipated installments of the period and never changes balances or totals computed elsewhere.

## Assumptions

- Column set and default order are V1's nine reorderable columns adapted to V2's current list columns; V2-only columns, if any, are appended at the end.
- The attachment limit is a personal limit; the installation ceiling (50 MB, current V2 value) is not raised.
- V2 has no mandatory email verification today and mail delivery (Resend) is optional; FR-010 degrades gracefully when no mail provider is configured.
- Dashboard preference `myAccountsShowExcluded` belongs to dashboard preferences and is out of this feature.
- UI requires `mockup-ui` before planning; per the roadmap the worker picks the option closest to V1 within V2 patterns and records it here.
- The upstream overlap check (CHANGELOG, issues, code) is recorded in the plan.

## Source

V1 evidence:

- `src/db/schema.ts:144` (`preferencias_usuario`: `extrato_note_as_column`, `lancamentos_column_order`, `attachment_max_size_mb`, `mostrar_resumo_lancamento`, `agrupar_lancamentos_por_data`, `ocultar_parcelas_antecipadas`).
- `src/features/transactions/lib/column-order.ts` (reorderable ids, labels, default order).
- `src/shared/lib/attachments/config.ts` (size options 5/10/25/50/100, default 50 MB).
- `src/features/settings/components/preferences-form.tsx`, `update-email-form.tsx`.
- `src/features/settings/actions.ts:318` (`updateEmailAction`: password check for non-Google, case-insensitive duplicate check, resets `emailVerified`).

V2 current state: `user_preferences` (`packages/db/src/schema.ts`: theme, hide values, defaults, page size, start page, due-soon days), `apps/web/src/features/settings/components`, `apps/api/src/services/preferences.service.ts`, `packages/domain/src/attachments.ts` (`maximumAttachmentSize` 50 MB), `apps/api/src/utils/resend.ts`, `apps/api/src/auth.ts`.

Inventory rows covered (section 1.1, Decision = port): Update email; Preference: statement note as column; Preference: transactions column order; Preference: show summary in transaction modal; Preference: group transactions by date; Preference: hide anticipated installments; Preference: max attachment size.

Kept / changed / dropped vs V1: kept all six preferences and defaults; changed email change to be session-safe and mail-capability-aware (V1 flipped the verified flag with no mail sent); dropped V1 storage of dashboard widgets inside the preferences row (V2 has `dashboard_preferences`).

## Dependencies

- Roadmap order: after 008 (lane A); no functional dependency on other specs.
- Consumed by 016: the ETL maps V1 `preferencias_usuario` values into these fields.
- Touches the transactions list and transaction dialog; fork conventions keep shared-file hooks minimal.
