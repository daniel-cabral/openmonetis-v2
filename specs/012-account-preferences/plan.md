# Implementation Plan: Account Preferences and Email Change

**Branch**: `012-account-preferences` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-account-preferences/spec.md` (clarified, UI option A chosen)

## Summary

Extend the existing `preferences` feature with six fields (column order, group by date, hide
anticipated installments, show summary in details, note as column, attachment size limit) through
one versioned migration on `user_preferences`, the existing `GET/PATCH/DELETE /preferences`
contract and two new Settings > Preferences sections. Pure rules (column order resolution,
anticipated-installment filter, attachment limit resolution) live in `packages/domain`. The
transactions list endpoint filters anticipated installments server-side before pagination; the
attachments service enforces the personal limit in its single prepare path (transactions and
notes). Email change is a new `POST /settings/email` in the `settings` feature (password for
credential accounts, fresh session for Google-only, case-insensitive uniqueness, atomic update with
admin person email, other sessions revoked, optional Resend verification mail), because Better
Auth 1.7.16 `changeEmail` cannot meet FR-008..FR-012 ([research.md](research.md) R1). Details:
[data-model.md](data-model.md), [contracts/account-preferences-api.md](contracts/account-preferences-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle ORM, Zod, Better Auth 1.7.16
(`better-auth/crypto` `verifyPassword`, `auth.api.sendVerificationEmail`), TanStack
Start/Router/Query/Form, shadcn/ui (`switch`, `select`, `dialog`, `input`, `button` installed),
lucide-react. No new dependency.

**Storage**: PostgreSQL; migration `0037_account_preferences` (6 columns on `user_preferences`,
one check constraint) generated with `pnpm db:generate`, never `push`. Email change writes
`user`, `people` (admin) and deletes `session` rows in one transaction.

**Testing**: `node:test` + `tsx`. Domain unit tests (`preferences.test.ts`, `settings.test.ts`,
extend `attachments.test.ts`); web presentation test for date grouping/column resolution use;
API integration suite `test:account-preferences:integration`
(`apps/api/src/account-preferences.integration.test.ts`) plus one assertion added to
`settings.integration.test.ts` (reset restores defaults). Per `test-slop-guard`: few,
behavior-focused tests.

**Target Platform**: self-hosted web app (API + TanStack Start web)

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: no extra request on the transactions screen (preferences query is already
loaded there); list filter is O(n) over already hydrated rows.

**Constraints**: every query filters `userId`; generic errors on email change; passwords never
logged; no dev server on default ports (lane A 7101-7103).

**Scale/Scope**: 1 migration, 1 new endpoint, 4 touched services (preferences, transactions list,
attachments, settings), 2 new preference sections, 1 dialog, table rendering changes, docs page.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Extends existing `preferences`, `settings`, `attachments`, `transactions` feature shapes; rules in domain (`preferences.ts`, `settings.ts`, `attachments.ts`); services depend on ports (`readListPreferences`, `getAttachmentSizeLimitMb`, `verifyPassword`, `sendEmailVerification`), not on Better Auth or Drizzle; route passes `sessionId`/`sessionCreatedAt` as values; forms use TanStack Form + Zod |
| II. Upstream-compatible | PASS | Product code, migration, tests, `docs/account-preferences.md`, CHANGELOG `Unreleased` `### Fork`; no unrelated upstream code touched |
| III. V1 is reference | PASS | Spec lists kept/changed/dropped; column set redesigned to V2 columns; email change made session-safe; 100 MB option dropped (ceiling) |
| IV. Financial integrity | PASS | No amount math; hide filter is list-only (SC-005); every repository call filters `userId`; versioned migration |
| V. Behavior-verified | PASS | Integration tests assert observable outcomes: no writes after rejected email change, isolation, consistent `total`, server rejection of oversized upload, defaults after reset |

Post-design re-check: PASS (Complexity Tracking empty).

## Upstream overlap check

- `CHANGELOG.md` (fork `main`, 0.16.0 + `Unreleased`) and `upstream/main` (`4b00b83`, 0.17.1,
  9 commits ahead): nothing adds email change, these preferences or a per-user attachment limit.
  `git grep changeEmail upstream/main -- apps packages` is empty; Better Auth's own
  `/change-email` is not enabled in `auth.ts`.
- Overlap risk: upstream 0.17.0 adds a **"Situação"** column to the transactions table and
  touches `transaction-row.tsx`/`transactions-table.tsx`. This feature reorders those cells. At the
  next upstream merge, add `status` to `transactionColumnIds` (appended per US1-6) and resolve the
  row/table conflict by rendering the new cell through the column map. Upstream also centralizes
  rounding/formatters (`566906e`), not touched here.
- `apps/api/src/auth.ts`: this feature adds an optional `emailVerification` block and exports the
  fresh-session age; upstream did not change `auth.ts` in those commits.

No feature-level overlap; no upstream code is reused.

## Project Structure

### Documentation (this feature)

```text
specs/012-account-preferences/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/account-preferences-api.md
├── previews/                 # UI previews (app.css ignored)
└── tasks.md                  # /speckit-tasks
```

### Source Code (repository root)

```text
packages/db/src/schema.ts                         # + 6 user_preferences columns, check
packages/db/drizzle/0037_account_preferences.sql  # generated (+ meta snapshot/journal)
packages/domain/src/
├── preferences.ts            # + column ids/order resolution, anticipated filter, new defaults/normalize
├── preferences.test.ts       # NEW
├── attachments.ts            # + size limit options, resolveAttachmentSizeLimit, isAllowedAttachment(limit)
├── attachments.test.ts       # + limit cases
├── settings.ts               # + fresh session, email normalization
└── settings.test.ts          # NEW
packages/validators/src/
├── preferences.ts            # + 6 fields, column order refine
└── settings.ts               # + ChangeAccountEmailInput/Output
apps/api/src/
├── auth.ts                   # export fresh-session age; optional emailVerification (Resend)
├── middlewares/auth.ts       # set sessionId, sessionCreatedAt
├── types/context.ts          # + sessionId, sessionCreatedAt
├── repositories/preferences.repository.ts  # persist new fields
├── services/transactions.service.ts        # options object, listTransactionsForScreen
├── routes/transactions.ts                  # GET / uses listTransactionsForScreen
├── services/attachments.service.ts         # personal limit in startUpload
├── services/settings.service.ts            # changeEmail
├── repositories/settings.repository.ts     # credential hash, email taken, changeEmailForUser
├── routes/settings.ts                      # POST /email
├── app.ts                                  # wire ports
├── account-preferences.integration.test.ts # NEW
└── settings.integration.test.ts            # + reset defaults assertion
apps/web/src/features/
├── preferences/components/preferences-transactions-list-section.tsx  # NEW (switches + column order)
├── preferences/components/preferences-details-attachments-section.tsx # NEW
├── preferences/components/preferences-form.tsx  # mount sections
├── preferences/usePreferencesForm.ts            # array-aware change detection
├── preferences/preferences.presentation.ts      # labels, size options
├── settings/components/change-email-dialog.tsx  # NEW
├── settings/components/profile-settings.tsx     # "Alterar e-mail" button
├── settings/settings.api.ts / .mutations.ts / .presentation.ts  # changeEmail + PT-BR errors
├── transactions/components/transactions-table.tsx, transaction-row.tsx, transaction-row-description.tsx, transactions-mobile-list.tsx
├── transactions/transactions.presentation.ts    # date grouping helper
├── transactions/components/transaction-details-content.tsx  # summary toggle
└── attachments/attachments.presentation.ts, components/attachment-file-picker.tsx  # personal limit
docs/account-preferences.md   # NEW contract doc
docs/testing.md               # + integration suite
docs/environment-variables.md # Resend also sends email verification
CHANGELOG.md                  # Unreleased ### Fork entry (PT-BR)
package.json                  # + test:account-preferences:integration
```

**Structure Decision**: no new feature folder; the six preferences extend `preferences`, email
change extends `settings`, enforcement extends `transactions` and `attachments`. Integration suite
named after the spec (`account-preferences`) like `card-usage-report`.

## Complexity Tracking

None.
