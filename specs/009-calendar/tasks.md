# Tasks: Monthly Calendar

**Input**: Design documents from `specs/009-calendar/` (spec.md with Clarifications and UI decisions,
plan.md, research.md, data-model.md, contracts/calendar-api.md, quickstart.md)

**Tests**: required by the constitution (principle V). Each test task carries its test-slop-guard
declaration. Run only the touched test files while iterating; lint/typecheck once at the end.

**Conventions**: follow AGENTS.md (feature shape, no barrels, UI copy PT-BR, code English). Mimic
the establishments report feature (`packages/domain/src/establishments-report.ts`,
`apps/api/src/routes/establishments-report.ts`, `apps/api/src/services/establishments-report.service.ts`,
`apps/web/src/features/establishments-report/`, `apps/web/src/routes/reports/establishments.tsx`).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Add root script `"test:calendar:integration": "CALENDAR_INTEGRATION_TEST=1 tsx --test apps/api/src/calendar.integration.test.ts"` next to `test:establishments-report:integration` in `package.json`

---

## Phase 2: Foundational

- [X] T002 [P] Create `packages/validators/src/calendar.ts` (export path like the other validator modules in `packages/validators/package.json` if exports are explicit): `CalendarQuerySchema` (`period` optional `YYYY-MM`, reuse the existing period schema used by `DashboardQuerySchema`), `CalendarEventSchema` as a Zod discriminated union on `kind` (`transaction` | `installment` | `boleto` | `invoice`) with the fields in `specs/009-calendar/data-model.md` (`transactionId` nullable, `type` enum income/expense, `amount` number >= 0, `categoryName`/`categoryIcon`/`cardName`/`dueDate` nullable, `paymentMethod` nullable enum, `isSettled` boolean; installment adds `currentInstallment`, `installmentCount` ints; boleto adds `isOverdue`; invoice has `cardId`, `cardName`, `cardLogo` nullable, `cardBrand`, `amount`, `state` enum `paid`/`overdue`/`pending`, `paidAt` nullable date), `CalendarDaySchema` (`date`, `inMonth`, `isToday`, `totals: { income, expense }`, `events`), `CalendarOutputSchema` (`period`, `days` length 42), all with `.openapi(...)` names. Test: none, because Zod regex/default is a framework guarantee and the 400 on invalid period is locked by `apps/api/src/calendar.integration.test.ts` (T007).
- [X] T003 [P] Create `packages/domain/src/calendar.ts` with `buildCalendarDays(period: string, today: string)` returning 42 `{ date, inMonth, isToday }` Monday-first, date-only strings, UTC arithmetic only; and `packages/domain/src/calendar.test.ts`. Test: new, because distinct contract (grid): one parametrised test over October 2026 (first cell `2026-09-28`, last `2026-11-08`), February 2028 leap year (has `2028-02-29`), and a month starting on Sunday (March 2026: first cell `2026-02-23`, six leading days), plus `isToday` on the given date only; literal expected values.

---

## Phase 3: User Story 1 - See the month's money events (P1) MVP

**Goal**: `GET /calendar` returns the month's events per day and the web renders the grid.

**Independent test**: expense, boleto and card spending appear on the right days with the right kind (integration test + page).

- [X] T004 [US1] In `packages/domain/src/calendar.ts` add `buildCalendarMonth(input)` with input `{ period, today, adminPersonId, purchaseItems, boletoItems, cards }` (item shape: the subset of `TransactionOutput` from `@openmonetis/validators/transactions` it needs, declared as a local structural type; cards: subset of `CardOutput` with `invoiceSummary`). Export the output types `CalendarEvent` (union by `kind`), `CalendarDay` and `CalendarMonth = { period: string; days: CalendarDay[] }` with exactly the field names and nullability of `specs/009-calendar/data-model.md` (the validators schema in T002 mirrors the same list). Rules (spec FR-002..FR-009, Clarifications, research R2-R4): exclude `type === "transfer"`; own share only: keep item when `allocation?.personId === adminPersonId`, or `allocation === null && personId === adminPersonId`; amount = `Math.abs(allocation?.amount ?? amount)` computed in cents; from `purchaseItems` drop every boleto, installment boletos included (all boletos come only from `boletoItems` as `kind: "boleto"`, never `installment`), place by `purchaseDate`; installment rows (`condition === "installment"` / `installmentCount > 1`) become `kind: "installment"`, and credit-card ones (`paymentMethod === "credit_card"`) only when `currentInstallment === 1`; `boletoItems` filtered to `paymentMethod === "boleto"` placed by `dueDate`, `isOverdue = !isSettled && dueDate < today`; one `invoice` event per card with `invoiceSummary.amount > 0` on `invoiceSummary.dueDate`, state from status (`paid` -> `paid` with latest `payments[].paidAt`, `overdue` -> `overdue`, `open`/`closed` -> `pending`); drop events outside the month; de-duplicate by `id`; order within a day transaction/installment, boleto, invoice, then name; per-day `totals` income/expense from non-invoice events; return `{ period, days }` merging with `buildCalendarDays`. Extend `packages/domain/src/calendar.test.ts`. Test: new, because distinct contract (event rules): one shared fixture month, split into named `test(...)` cases (placement and exclusions; own share; installments; boletos; invoices; ordering and totals), asserting literal outputs for: expense on purchase day, transfer absent, boleto from September on its October due date (and the same boleto row in `purchaseItems` not duplicated), other person's item absent and split item showing only the admin share, card installment 1 as one `installment` event and installment 2 absent, account-debit installment 3/10 shown with `currentInstallment` 3, invoice paid with `paidAt`, open invoice -> `pending`, zero-total card absent, overdue boleto flagged, ordering inside one day, and day `totals` equal to the literal sum.
- [ ] T005 [US1] Create `apps/api/src/services/calendar.service.ts`: `createCalendarService(deps: { listTransactions(userId, query): Promise<TransactionOutput[]>; listCards(userId, period): Promise<CardOutput[]>; findAdminPersonId(userId): Promise<string | null> })` with `getMonth(userId, period?)`: period default `getCurrentPeriodInBrazil()`, today `getCurrentDateInBrazil()`, in parallel call `listTransactions` with `ListTransactionsQuerySchema.parse({ dateStart: first day, dateEnd: last day (getPeriodEndDateString), pageSize: 100 })` (the `pageSize` is ignored: the dependency calls `listTransactions(..., false)`, which returns every group unpaginated) and with `ListTransactionsQuerySchema.parse({ period, payables: "true", paymentMethod: "boleto", pageSize: 100 })`, `listCards(userId, period)`, admin id; no admin -> month with no transaction events (cards still shown); returns `buildCalendarMonth(...)` parsed by nothing extra (the route validates output). Test: none, because the composition is locked by `apps/api/src/calendar.integration.test.ts` (T007) and rules by `packages/domain/src/calendar.test.ts`.
- [ ] T006 [US1] Create `apps/api/src/routes/calendar.ts` (`createCalendarRoute(service)`, `GET /` with `CalendarQuerySchema`, auth like `establishments-report.ts`, `ok(...)`, `Cache-Control: private, no-store` as the sibling routes do) and wire it in `apps/api/src/app.ts`: instantiate after `transactionsService`/`cardsService` with `listTransactions: async (userId, query) => (await transactionsService.listTransactions(userId, query, false)).items`, `listCards: (userId, period) => cardsService.list(userId, period)` (`cardsService.list` returns the summarized card array, the same objects the `/cards` route returns as `CardOutput[]`), `findAdminPersonId: async (userId) => (await findAdminPersonByUserId(userId))?.id ?? null`; mount at `/calendar` next to `/reports/establishments`. Test: none, because locked by T007.
- [ ] T007 [US1] Create `apps/api/src/calendar.integration.test.ts` following `apps/api/src/establishments-report.integration.test.ts` (`skip: process.env.CALENDAR_INTEGRATION_TEST !== "1"`, `withIntegrationDatabase`, `createTestApiClient`). Test: new, because distinct contract (HTTP composition over real recurrence/invoice services): one workflow test for one owner in a fixed period: expense on day 12 -> `transaction` on `2026-10-12`; transfer absent; boleto with purchase `2026-09-30` and due `2026-10-20` -> `boleto` on `2026-10-20`; credit-card purchase in 3 installments -> one `installment` event on its purchase date; card with spending -> one `invoice` event with the invoice total; a monthly recurring expense -> `transaction` on its occurrence date; `days.length === 42`; second user registered with their own expense sees none of the owner's events and the owner sees none of theirs; `period=2026-13` -> 400; no session -> 401. Use literal expected dates and amounts. Check helper names in `apps/api/src/test-support/api-client.ts` for boleto/card/installment/recurring creation (fall back to `api.request` POST `/transactions` with the validator payload).
- [X] T008 [P] [US1] Create `apps/web/src/features/calendar/calendar.api.ts` (`getCalendarMonth(period)` via `requestApi`, typed with `CalendarOutput`) and `apps/web/src/features/calendar/calendar.queries.ts` (`calendarQueryOptions(period)` with key `["calendar", period]`); add `"calendar"` to `financialQueryRoots` in `apps/web/src/lib/financial-query-invalidation.ts`. Test: none, because no behaviour beyond the framework; refresh-after-create is the existing `refreshFinancialQueries` contract.
- [X] T009 [P] [US1] Create `apps/web/src/features/calendar/calendar.presentation.ts` with these exact exports (types from `@openmonetis/validators/calendar`: `CalendarEvent = z.infer<typeof CalendarEventSchema>`):
  - `type CalendarSearch = { period: string }`; `validateCalendarSearch(search: Record<string, unknown>): Partial<CalendarSearch>` (keeps `period` only when it matches `YYYY-MM` with month 01-12) and `resolveCalendarSearch(search: Partial<CalendarSearch>): CalendarSearch` (missing -> `getCurrentPeriodInBrazil()`); copy the `establishments-report.presentation.ts` pattern.
  - `const weekdayLabels: readonly string[] = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]`.
  - `type CalendarEventGroupKey = "transactions" | "installments" | "boletos" | "invoices"`; `type CalendarLegendItem = { key: CalendarEventGroupKey; label: string; markerClassName: string }`; `const calendarLegendItems: readonly CalendarLegendItem[]` = transactions "Lançamentos" `bg-info`, installments "Parcelas" `bg-brand`, boletos "Boletos" `bg-warning`, invoices "Fatura de Cartão" `bg-chart-4`; `calendarEventMarkerClassName(event: CalendarEvent): string` maps `kind` (`transaction`->transactions, `installment`->installments, `boleto`->boletos, `invoice`->invoices) to the same class.
  - `splitDayPreview(events: CalendarEvent[], limit = 3): { visible: CalendarEvent[]; hiddenCount: number }`.
  - `eventStateLabel(event: CalendarEvent): string`: invoice `paid` -> `Pago em dd/MM/yyyy` (from `paidAt`; "Pago" when null), `overdue` -> "Atrasada", `pending` -> "Pendente"; boleto unsettled with `isOverdue` -> "Atrasado"; settled expense -> "Pago"; settled income -> "Recebido"; else "Pendente".
  - `type CalendarEventGroup = { key: CalendarEventGroupKey; title: string; events: CalendarEvent[] }`; `calendarEventGroups(events: CalendarEvent[]): CalendarEventGroup[]` in order transactions "Lançamentos", installments "Parcelas", boletos "Boletos", invoices "Faturas", omitting empty groups.
  - Formatting reuses existing currency/date helpers already used by other web features (no new formatter if one exists).
  Add `apps/web/src/features/calendar/calendar.presentation.test.ts`. Test: new, because distinct contract (web presentation): one parametrised test of `eventStateLabel` cases, one of `resolveCalendarSearch(validateCalendarSearch(...))` (valid `2026-10` kept, `2026-13`/missing -> current period), one asserting `splitDayPreview` with 5 events -> 3 visible + `hiddenCount` 2, one asserting `calendarEventGroups` order and titles with literal values.
- [ ] T010 [US1] Create the page: `apps/web/src/routes/calendar.tsx` (`createFileRoute("/calendar")`, `validateSearch`, `head` title "Calendário · OpenMonetis", invalid period normalized with `navigate({ replace: true })` like `routes/reports/establishments.tsx`), `apps/web/src/features/calendar/components/calendar-page.tsx` (page header "Calendário", query, loading skeleton and error state like the establishments page), `calendar-grid.tsx` (weekday headers, 42 cells; each cell is a container `div` holding two sibling buttons, never nested: a button that opens the day and the "+" create button), `calendar-day-cell.tsx` (day number, today ring, adjacent days dimmed, up to 3 chips with type marker + name + amount and "+N mais"; chips become dots below `sm`; no horizontal scroll) per spec "UI decisions" and `specs/009-calendar/previews/option-a-v1-grid.html`; markers from `calendarLegendItems`/`calendarEventMarkerClassName` (T009); and add nav item "Calendário" (icon `CalendarDays` or the already imported `CalendarClock`, `preservePeriod: true`) in `apps/web/src/components/navigation/nav-items.tsx` in the "Lançamentos" or "Finanças" section. No financial logic in components. Test: none, because rendering is visual and rules are locked by T004/T009.

**Checkpoint**: MVP: the calendar shows the month.

---

## Phase 4: User Story 2 - Open a day and see details (P1)

- [ ] T011 [US2] Create `apps/web/src/features/calendar/components/calendar-day-dialog.tsx` (shadcn `Dialog`, title with the long PT-BR date, description "Lançamentos e vencimentos cadastrados para este dia." or "Nenhum lançamento encontrado para este dia.", groups from `calendarEventGroups`, rows with name, amount colored by type (reuse the app's money component/classes), category, state from `eventStateLabel`, installment "N parcelas · R$ x por parcela" (and `k/N` for non-card), invoice with card logo (or brand asset via `apps/web/src/features/cards/card-brand-assets.ts`), "Pago em <data>" or state and a "Ver fatura" link to `/cards/$cardId` with `search: { period }`); open from the day cell on click/Enter/Space; focus returns to the cell on close (Radix default with a trigger, or restore focus explicitly). Test: none, because visual; labels and grouping locked by T009.

---

## Phase 5: User Story 3 - Create a transaction from a day (P2)

- [ ] T012 [US3] In `calendar-page.tsx`/`calendar-day-cell.tsx`/`calendar-day-dialog.tsx`: a "+" icon button per in-month cell (`aria-label` "Novo lançamento em dd/MM", `stopPropagation` so the day dialog does not open) and a "Novo lançamento" button in the dialog footer, both opening the existing `TransactionDialog` (`apps/web/src/features/transactions/components/transaction-dialog.tsx`) with `transaction={null}` and `createDefaults={{ purchaseDate: day.date }}`, loading accounts/cards/categories/people through their existing query options as other pages do (see `card-invoices-page.tsx` usage); creating closes the day dialog first; refresh relies on the `"calendar"` query root (T008). Test: none, because the create flow and refresh are locked by the transactions dialog tests and `refreshFinancialQueries`.

---

## Phase 6: User Story 4 - Navigate months (P3)

- [ ] T013 [US4] In `calendar-page.tsx` add `MonthNavigation` (`apps/web/src/components/month-navigation.tsx`) bound to the `period` search param (`navigate({ search: { period } })`) and `apps/web/src/features/calendar/components/calendar-legend.tsx` with the 4 types "Lançamentos", "Parcelas", "Boletos", "Fatura de Cartão". Test: none, because invalid-period fallback is locked by T009 and navigation is the shared component.

---

## Phase 7: Polish

- [ ] T014 [P] Create `docs/calendar.md` in the style of `docs/establishments-report.md`: endpoint, placement rules, own share, installments, invoice state, exclusions.
- [ ] T015 [P] Add a PT-BR entry under `### Fork` at the end of `Unreleased` in `CHANGELOG.md`: "Calendário mensal com lançamentos, parcelas, boletos e faturas por dia, detalhe do dia e criação rápida."
- [ ] T016 Gate: run `pnpm check`, `pnpm typecheck`, the touched unit tests (`node --import tsx --test packages/domain/src/calendar.test.ts apps/web/src/features/calendar/calendar.presentation.test.ts`) and `pnpm test:calendar:integration` (bash); fix failures; do not commit `apps/web/src/routeTree.gen.ts` incidental diffs beyond the new `/calendar` route.

---

## Dependencies

- T001, T002, T003 first (T002/T003 parallel). T004 needs T002/T003. T005 needs T004. T006 needs T005. T007 needs T006.
- Web: T008 needs T002; T009 needs T002; T010 needs T008/T009 and the API (T006). T011 needs T010. T012 needs T011. T013 needs T010.
- T014/T015 any time after T004; T016 last.

## Parallel examples

- T002 + T003; T008 + T009 (after T002); T014 + T015.

## Implementation strategy

MVP = Phases 1-3 (API + grid). Then dialog (US2), quick create (US3), navigation/legend (US4), polish and gate.
