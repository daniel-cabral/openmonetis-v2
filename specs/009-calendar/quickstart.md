# Quickstart: Monthly Calendar

Prerequisites: lane database up (root `.env`), `pnpm install`.

1. Domain and validators: `node --import tsx --test packages/domain/src/calendar.test.ts`
2. Web presentation: `node --import tsx --test apps/web/src/features/calendar/calendar.presentation.test.ts`
3. API integration (bash): `pnpm test:calendar:integration`
   Expected: expense on purchase day, boleto on due date, transfer absent, card installment once,
   invoice event with total and state, recurring occurrence present, other user's data absent, 401
   without session.
4. Gate: `pnpm check`, `pnpm typecheck`.
5. Manual (optional, ports 7201-7203): open `/calendar?period=2026-10`, click a day, press "+".

Contract: [contracts/calendar-api.md](contracts/calendar-api.md).
