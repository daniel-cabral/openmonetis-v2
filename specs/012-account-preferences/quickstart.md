# Quickstart: Account Preferences and Email Change

Run from the worktree root in bash (lane A database `openmonetis_lane_a` from `.env`).

1. Migration: `pnpm db:migrate && pnpm db:migrations:check` (adds `0037_account_preferences`).
2. Domain rules: `node --import tsx --test packages/domain/src/preferences.test.ts packages/domain/src/settings.test.ts packages/domain/src/attachments.test.ts`
   (column order resolution with unknown/missing ids, anticipated filter, limit resolution, fresh session).
3. API against PostgreSQL:
   - `pnpm test:account-preferences:integration`: preferences round trip and validation, hidden
     anticipated installments with consistent `total`, attachment limit on transaction and note
     prepare, email change (password, duplicate in other case, same email, stale Google session,
     other sessions revoked, sign-in with new email, generic errors).
   - `pnpm test:settings:integration`: reset restores the new preference defaults.
4. Web presentation: `node --import tsx --test apps/web/src/features/transactions/transactions.presentation.test.ts`.
5. Gate: `pnpm lint && pnpm lint:ui && pnpm typecheck`.
6. Manual (optional, lane A ports 7101-7103, stop afterwards): Settings > Preferences, change each
   control, save, reload `/transactions`; Settings > Profile > "Alterar e-mail". Expected layout:
   `previews/option-a-v1-preferences.html`.
