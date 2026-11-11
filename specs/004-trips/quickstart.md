# Quickstart: validating Trips (004)

Lane B worktree; the root `.env` already points to the lane database (`openmonetis_lane_b`). Never
start dev servers on default ports; if a manual check is needed use 7201 (API), 7202 (web), 7203 (AI).

## Automated checks (bash)

```bash
pnpm db:generate            # once, after the schema change; commit the generated 0032_* files
pnpm db:migrations:check
node --import tsx --test packages/domain/src/trips.test.ts
node --import tsx --test packages/validators/src/trips.test.ts
node --import tsx --test apps/web/src/features/trips/trips.presentation.test.ts
pnpm test:trips:integration  # creates and drops its own database on the lane server
pnpm lint && pnpm typecheck
```

Expected: all green. `test:trips:integration` proves SC-001, SC-002, SC-004, SC-006 and the
recurring per-occurrence rule against real PostgreSQL.

## Manual walk-through (optional, ports 7201-7203)

1. "Viagens" in the Organização menu -> empty state "Nenhuma viagem ainda".
2. Create "Lisboa" 12/05/2026 to 22/05/2026; try "Porto" 20/05 to 25/05 -> message naming Lisboa.
3. New expense dated 14/05/2026 -> "Viagem" prefilled with Lisboa; 10x installment linked -> trip
   page shows 10 rows; unlink 7/10 -> 9 remain.
4. Recurring "Netflix": link the May occurrence from suggestions -> only May linked.
5. Transactions list: select 3 rows + a transfer, "Viagem" -> Lisboa -> toast "3 atualizados,
   1 ignorado".
6. Delete Lisboa -> transactions still listed, without trip.
