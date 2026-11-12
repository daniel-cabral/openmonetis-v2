# Quickstart: Cross-Card Usage Report

Run from the worktree root in bash (lane A database from `.env`).

1. Domain rules: `node --import tsx --test packages/domain/src/card-usage-report.test.ts`
   (tone 49.9/50/79.9/80, trend +5/−5, limit 0, no previous usage, recurring after today excluded).
2. Web search/labels: `node --import tsx --test apps/web/src/features/card-usage-report/card-usage-report.presentation.test.ts`.
3. API against PostgreSQL: `pnpm test:card-usage-report:integration`
   (sums equal own-share card expenses, refunds net, inactive card hidden, invoice paid state,
   foreign card id falls back, 401 without session).
4. Gate: `pnpm lint && pnpm typecheck`.
5. Manual (optional, lane A ports 7101-7103): open `/reports/card-usage`, check the menu entry
   "Uso de cartões", switch cards and months, reload with `?period=2026-13&card=x` (falls back to
   the current month and the highest-usage card). Expected layout:
   `previews/option-a-v1-layout.html`.
