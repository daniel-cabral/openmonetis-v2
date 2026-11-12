# Quickstart: validate 002

Prereqs: Docker Postgres up (`pnpm docker:db`), worktree `.env` with the lane A database, `pnpm install --frozen-lockfile`, migrations applied.

1. Migration: `pnpm db:migrations:check` -> passes with `0033_*`.
2. Domain oracle: `pnpm exec tsx --test packages/domain/src/reconciliations.test.ts packages/domain/src/reconciliations-plan.test.ts` -> ported V1 matcher (44), plan (20), origin and review cases pass.
3. API integration (bash): `RECONCILIATIONS_INTEGRATION_TEST=1 pnpm exec tsx --test apps/api/src/reconciliations.integration.test.ts` -> preview writes nothing and partitions 113 lines; apply/undo restores state; re-apply creates 0; isolation, stale and paid-invoice rejections write nothing; V1 action cases pass.
4. Regression: `pnpm test:imports:integration` and `pnpm test:settlements:integration` (bash) unchanged and green (SC-008).
5. Web: `pnpm exec tsx --test apps/web/src/features/reconciliations/components/reconciliation-review.test.ts apps/web/src/features/reconciliations/reconciliations.presentation.test.ts`.
6. Gate: `pnpm lint`, `pnpm typecheck`.
7. Manual (optional, lane ports 7101-7103): "Lançamentos" -> "Conciliar extrato", upload `packages/domain/src/__fixtures__/c6-extrato.csv`, account preselected by `99999999`, walk the buckets, Aplicar, Desfazer.
