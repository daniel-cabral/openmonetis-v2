# Quickstart: 010 Dashboard Gaps

1. Unit (scoped): `node --import tsx --test packages/domain/src/spending-overview.test.ts packages/domain/src/attachments.test.ts apps/api/src/services/dashboard.service.test.ts apps/web/src/features/spending-overview/spending-overview.presentation.test.ts apps/web/src/features/category-trends/category-trends.presentation.test.ts apps/api/src/services/notifications.service.test.ts`
2. Integration (bash, lane DB from `.env`): `pnpm test:spending-overview:integration` and `pnpm test:establishments-report:integration` (005 regression after the entry change).
3. `pnpm lint` and `pnpm typecheck`.
4. Manual (optional): dashboard on ports 7201/7202, add the 3 widgets from the add-widget dialog, change month, check empty states, privacy toggle, "Ver relatório de estabelecimentos" and "Ver todos".
