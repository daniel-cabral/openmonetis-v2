# Feature Specification: Account Preferences and Email Change

**Feature Branch**: `012-account-preferences`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the 6 missing V1 preferences (transactions column order, group by date, hide anticipated installments, show summary in the transaction modal, statement note as column, max attachment size) and the email change to V2 settings."

## Clarifications

### Session 2026-11-12

Answered autonomously by the lane worker (roadmap per-feature workflow); each answer carries its rationale.

- Q: Which columns are reorderable, given that V2's desktop table has fewer columns than V1's nine (type, category and person are rendered inside the description cell)? → A: The reorderable ids are V2's real columns plus the optional note column: `name`, `amount`, `condition`, `paymentMethod`, `note`, `account`; default order `name, amount, condition, paymentMethod, note, account` (V1's relative order). V1 ids `type`, `category`, `person` have no V2 column and are dropped when read (the 016 ETL keeps the relative order of the rest). Columns added later (e.g. upstream 0.17 "Situação") are appended per scenario 6. Rationale: V2's description cell already merges type/category/person; inventing three new columns would be a redesign, not a port.
- Q: V2's desktop table is a flat list today and only the mobile list shows date headers; what does "group by date" (default on) change? → A: Default stays on (V1 default, ETL maps 1:1). When on, the desktop table shows a date header row before each day (same date labels as the mobile list) and the mobile list keeps its headers; when off, both render a flat list. SC-002 is amended accordingly. Rationale: closest to V1 behaviour; the mobile list already proves the grouping pattern in V2.
- Q: Which "summary" does "Show summary in transaction modal" hide, since V2's create/edit dialog has no summary panel? → A: The "Resumo do lançamento" block at the top of the transaction details view (sheet/dialog opened from a row), the only transaction summary V2 has. Off hides that block; the details fields and actions stay. Rationale: inventory row says "V2 summary exists, no toggle"; adding a new summary to the create dialog only to hide it would be speculative.
- Q: In V2 anticipating installments moves them into the target invoice period; which rows does "hide anticipated installments" remove? → A: Every installment linked to an anticipation (in whatever period it now sits) is excluded from the transactions list endpoint, including its pagination count; the discount adjustment transaction ("Desconto por antecipação") is not an installment and stays. Reports, invoices, balances and exports are unaffected. Rationale: list-only filter keeps SC-005 (totals never change) and FR-005 (server-side, consistent pages).
- Q: What does "recent re-authentication" mean for Google-only accounts, and what does the change do to the verified flag when mail is available? → A: Recent = the current session was created within the last 10 minutes (the existing fresh-session age used for passkey management); otherwise the dialog offers "Entrar novamente com Google" and returns to Settings > Profile. On success the email changes immediately and the new address is always marked unverified (it was not proven); if the installation can send mail (Resend configured) a verification link is sent to the new address, otherwise the UI says no confirmation mail was sent. Rationale: reuses the existing freshness rule; V2 has no mandatory verification, so the change must never depend on mail delivery.
- Q: V1 offered 100 MB but FR-007 keeps 50 MB as the hard ceiling; is 100 MB still a choice? → A: No. Allowed values are 5, 10, 25 and 50 MB (default 50); the 016 ETL maps a V1 value of 100 to 50. Rationale: a choice above the installation ceiling would be silently capped, which misleads the person.

## UI decisions

Previews (real app CSS compiled from `apps/web/src/styles/app.css`; regenerate with
`cd apps/web && pnpm dlx @tailwindcss/cli@4.3.4 -i ../../specs/012-account-preferences/previews/preview.css -o ../../specs/012-account-preferences/previews/app.css`):
`specs/012-account-preferences/previews/option-a-v1-preferences.html`,
`option-b-list-columns-popover.html`, `option-c-compact-date-column.html`.

**Chosen: option A (V1 layout: all six preferences in Settings > Preferences, email change in a dialog from Settings > Profile)**, decided autonomously. Rationale: same place and controls as V1's `preferences-form.tsx` / `update-email-form.tsx`, built only from existing V2 pieces (`SettingsPanel`/`SettingsSection`, shadcn `Switch`, `Select`, `Button`, `Dialog`, `Input`) and the existing `usePreferencesForm` save/discard/restore flow.

- Preferences page: new `SettingsSection` "Lista de lançamentos" with switches "Agrupar por data", "Anotação como coluna", "Ocultar parcelas antecipadas" and the "Ordem das colunas" list (one row per reorderable column, up/down icon buttons with `aria-label`, keyboard-accessible, no drag-and-drop dependency; "Restaurar ordem" sets `default`). New section "Detalhes e anexos" with switch "Mostrar resumo nos detalhes" and `Select` "Tamanho máximo de anexo" (5/10/25/50 MB). All saved by the existing "Salvar preferências" action.
- Profile: "Alterar e-mail" outline button next to "Editar perfil" opens a `Dialog`: new email + current password for credential accounts; for Google-only accounts with a session older than 10 minutes, the dialog shows "Entrar novamente com Google" instead of the password field. Success toast states whether a confirmation link was sent.
- Transactions desktop table: date header row (`eyebrow` label, same text as the mobile list) before each day when grouping is on; note column (truncated, muted) when "Anotação como coluna" is on, and then the note is no longer repeated under the description.
- The attachment pickers (transaction and note) show the person's limit ("máx. N MB") instead of the fixed 50 MB.
- Discarded: B (a "Colunas" popover in the list splits preferences across two places and departs from V1; the inline email form keeps a password field always visible); C (merged "Data" column with rowspan breaks row hover/selection and the mobile pattern; drag-only chips are not keyboard-accessible without a new dependency).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Personalize the transactions table (Priority: P1)

A person opens Settings > Preferences and tunes how the transactions list looks: the order of the reorderable columns, whether the statement note is shown as its own column, whether rows are grouped by date, and whether installments that were anticipated are hidden from the list.

**Why this priority**: These four preferences change what the person sees every day on the most used screen; V1 users will notice their absence immediately after cutover (full parity gate).

**Independent Test**: Change each preference, reload the transactions screen and confirm the list reflects it, and that the choice survives logout/login and a second device.

**Acceptance Scenarios**:

1. **Given** the default preferences, **When** the person opens the transactions list, **Then** rows are grouped by date (a date header row before each day), the note is not a column, anticipated installments are shown, and columns follow the default order (description, amount, condition, payment method, account/card; the note column, when enabled, sits before account/card).
2. **Given** the person reorders columns to put "Valor" first, **When** the transactions list loads on any device, **Then** the reorderable columns follow the saved order while the selection checkbox stays first and the actions column stays last.
3. **Given** "Show note as column" is on, **When** the list renders, **Then** each transaction note appears in its own column; turning it off removes the column without losing notes.
4. **Given** "Group by date" is off, **When** the list renders, **Then** rows appear as a single flat list in the existing sort order, with no date headers.
5. **Given** "Hide anticipated installments" is on, **When** the person lists a month containing installments that were anticipated, **Then** those installments are not listed and balances and totals computed elsewhere do not change.
6. **Given** a saved column order that contains a column id that no longer exists or misses a new column, **When** the list renders, **Then** unknown ids are ignored and missing columns are appended in default position (no crash, no empty table).
7. **Given** the person clicks "Reset order", **When** confirmed, **Then** the saved order is cleared and the default order applies.

---

### User Story 2 - Transaction modal summary and attachment size limit (Priority: P2)

A person chooses whether the transaction details view shows the "Resumo do lançamento" block (default on) and picks the maximum size of an attachment they may upload (5, 10, 25 or 50 MB; default 50 MB).

**Why this priority**: Smaller convenience settings; V2 already has the summary and a fixed 50 MB limit, so they work today without the toggle.

**Independent Test**: Turn the summary off and open a transaction's details; set the limit to 5 MB and try uploading a 6 MB file.

**Acceptance Scenarios**:

1. **Given** "Show summary in transaction modal" is off, **When** the person opens a transaction's details view, **Then** the "Resumo do lançamento" block is not shown while the other details and actions remain, and creating or editing transactions behaves as before.
2. **Given** the limit is 5 MB, **When** the person selects a 6 MB file on a transaction, **Then** the file is rejected before upload with a short PT-BR message naming the limit.
3. **Given** the limit is 5 MB, **When** a client bypasses the UI and sends a 6 MB file to the server, **Then** the server rejects it as well.
4. **Given** the person lowers the limit below the size of files already attached, **When** they save, **Then** existing attachments are kept and only new uploads are checked.
5. **Given** the limit is set to a value outside the allowed list (e.g. 100 or 500 MB), **When** the request reaches the server, **Then** it is rejected with a validation error and the stored value does not change.

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
- Hiding anticipated installments must not hide the anticipation discount adjustment transaction itself.
- Google-only session older than 10 minutes: the email form asks to sign in with Google again before submitting; nothing changes until then.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store per person: transactions column order (ordered list of reorderable column ids, or null meaning the default order), group-by-date flag (default on), hide-anticipated-installments flag (default off), show-summary-in-modal flag (default on), statement-note-as-column flag (default off), and maximum attachment size in MB (allowed 5, 10, 25, 50; default 50).
- **FR-002**: System MUST expose these preferences through the existing preferences read/update contract, with per-operation validation rejecting unknown column ids, duplicates and sizes outside the allowed list.
- **FR-003**: The Settings Preferences page MUST present the six controls in PT-BR, save them without a full page reload, and confirm success or failure briefly.
- **FR-004**: The transactions list MUST honor column order, note-as-column and group-by-date; fixed columns (selection first, actions last) MUST NOT be reorderable. Reorderable ids: `name`, `amount`, `condition`, `paymentMethod`, `note`, `account`. Group-by-date applies to the desktop table (date header rows) and the mobile list.
- **FR-005**: Hiding anticipated installments MUST be decided by the server (so pagination and counts stay consistent) and the rule MUST live in the domain, not in the UI. It excludes installments linked to an anticipation from the transactions list only; the discount adjustment transaction, reports, invoices, balances and exports are unaffected.
- **FR-006**: The transaction details view MUST hide its "Resumo do lançamento" block when the preference is off, without changing any other details, actions, validation or save behavior.
- **FR-007**: Attachment uploads (transactions and notes) MUST be validated against the person's limit both in the client and on the server; the current fixed 50 MB value remains the hard ceiling.
- **FR-008**: A person MUST be able to change their email after proving identity (password for credential accounts; recent re-authentication for Google-only accounts).
- **FR-009**: Email uniqueness MUST be case-insensitive.
- **FR-010**: On email change the new address applies immediately and starts unverified; if the installation can send mail, a verification link is sent to the new address; if it cannot, the UI states that no confirmation mail was sent. Mail failure never blocks or rolls back the change.
- **FR-011**: Changing the email MUST NOT alter the admin person's name, data ownership, passkeys or Google link, and MUST revoke other active sessions. The admin person's email is updated to the new address in the same transaction, because Settings > Profile presents it as the sign-in email.
- **FR-012**: Email change MUST be authenticated, rate limited, never log passwords, and return generic errors.
- **FR-013**: Reset-account and delete-account flows MUST include the new preference fields.

### Key Entities *(include if feature involves data)*

- **User preferences**: existing per-person record extended with the six fields above; one row per person, defaults when absent.
- **Account email**: sign-in identity of the user, unique case-insensitively, with a verified flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Each of the six preferences can be changed and observed on the next screen load in under 30 seconds of effort, and persists across devices and sessions.
- **SC-002**: With all new preferences at default, the transactions list and dialogs look and behave as they do today (no regression in existing tests), except the desktop table's date header rows introduced by the group-by-date default (V1 parity).
- **SC-003**: 100% of attachment uploads larger than the saved limit are rejected, by both the client check and a direct server call.
- **SC-004**: A person can change their email and sign in with the new address in under 2 minutes; 0 successful changes occur with a wrong password.
- **SC-005**: Hiding anticipated installments changes the list by exactly the anticipated installments of the period and never changes balances or totals computed elsewhere.

## Assumptions

- Column set and default order are V1's reorderable columns adapted to V2's current list columns (see Clarifications); V1 `type`, `category`, `person` are dropped because V2 renders them inside the description cell; future columns are appended at the end.
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
- Touches the transactions list and transaction details view; fork conventions keep shared-file hooks minimal.
