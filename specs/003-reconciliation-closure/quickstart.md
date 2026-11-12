# Quickstart: validate 003

Prereqs: Docker Postgres up, worktree `.env` with the lane A database, `pnpm install --frozen-lockfile`, migrations applied (`pnpm db:migrate`).

1. Migration: `pnpm db:migrations:check` -> passes with `0034_*` (adds `invoiceCredit` to `transaction_origin`).
2. Domain oracle: `pnpm exec tsx --test packages/domain/src/reconciliations-closure.test.ts packages/domain/src/reconciliations-projection.test.ts packages/domain/src/reconciliations.test.ts packages/domain/src/reconciliations-plan.test.ts` -> 11 V1 closure cases (34 verified days, 2026-07-06 unverified, 07/07 divergence 10,00, final balance -580,23 on 2026-09-01), invoice cases (12.936,33 / 13.000,00 / 772,23 / fixture 23.365,50 / July 12.164,10), projection values 1.118,44 843,44 1.118,44 908,44 1.200,59 1.118,44 1.118,44 1.118,44, -524,56 and 165,00, 5 status cases, unreconciled icon cases.
3. Origin exclusion: `pnpm exec tsx --test packages/domain/src/dashboard.test.ts packages/domain/src/budgets.test.ts packages/domain/src/tags.test.ts` -> a credit entry adds 0 to income and expenses.
4. API integration (bash): `pnpm test:reconciliations:integration` -> credits created with origin `invoiceCredit`; dashboard/budget numbers unchanged by R$ 7.320,62 of credits; invoice remaining 12.164,10; invoice payment undo keeps credits; batch undo removes them; re-upload matches them by identity; preview carries closure and projection; account statement flags paid-but-unreconciled rows.
5. Regression (bash): `pnpm test:imports:integration`, `pnpm test:settlements:integration`, `pnpm test:transactions:integration`, `pnpm test:migrations:integration`.
6. Web: `pnpm exec tsx --test apps/web/src/features/reconciliations/components/reconciliation-review.test.ts apps/web/src/features/reconciliations/reconciliations.presentation.test.ts`.
7. Gate: `pnpm lint`, `pnpm typecheck`.
8. Manual (optional, lane ports 7101-7103): reconcile `c6-extrato.csv` (panel "Fecha", bar with projected balance), then a card invoice with a typed total (panel recomputes on typing), create the credits, open the card invoice (total lowered) and the dashboard (income unchanged); open the account statement and see the unlink icon on paid entries without identity.
