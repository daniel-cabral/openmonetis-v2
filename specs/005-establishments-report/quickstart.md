# Quickstart: validate feature 005

Prerequisites: worktree `.env` pointing to the lane B database (`openmonetis_lane_b`), migrated.

1. Unit tests (scoped):
   `node --import tsx --test packages/domain/src/establishments-report.test.ts packages/domain/src/trips.test.ts packages/domain/src/category-trends.test.ts packages/validators/src/establishments-report.test.ts apps/web/src/features/establishments-report/establishments-report.presentation.test.ts apps/web/src/features/category-trends/category-trends.presentation.test.ts`
2. Integration (from bash): `pnpm test:establishments-report:integration`, plus
   `pnpm test:trips:integration` and `pnpm test:categories:integration` (regression).
   Expected: exclusions contribute 0 (SC-005), foreign trip id behaves as all (SC-004),
   `none` + each trip = all for category trends (SC-002), range capped at 24 (SC-003).
3. Gate: `pnpm lint`, `pnpm typecheck`.
4. Manual (optional, lane B ports 7201-7203): open `/reports/establishments`, switch 3/6/12, pick a
   trip, reload; open `/reports/category-trends`, pick a trip, check the range jump and "Limpar filtros".
