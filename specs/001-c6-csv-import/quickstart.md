# Quickstart: validate 001

Prereqs: Docker Postgres up (`pnpm docker:db`), `.env` with lane DB, `pnpm install --frozen-lockfile`.

1. Domain oracle: `pnpm exec tsx --test packages/domain/src/import-*.test.ts packages/domain/src/transactions.test.ts` -> all V1 cases pass (113 statement lines, 98 invoice lines, totals 23.440,50 / 23.365,50, 12 identity cases, 8 key cases).
2. API integration (bash): `IMPORTS_INTEGRATION_TEST=1 pnpm exec tsx --test apps/api/src/imports.integration.test.ts` -> OFX/XLSX unchanged; C6 detect, preview, import, re-preview all duplicate, re-import 0, credit row rejected without writes, undo, binary `.xls` rejected.
3. Web scoped tests: `pnpm exec tsx --test apps/web/src/features/transactions/components/transaction-import-review.test.ts apps/web/src/features/transactions/transactions.presentation.test.ts`.
4. Gate: `pnpm lint`, `pnpm typecheck`.
5. Manual (optional): upload `packages/domain/src/__fixtures__/c6-extrato.csv` in "Importar extrato"; profile preselected, choose account, review 113 lines.
