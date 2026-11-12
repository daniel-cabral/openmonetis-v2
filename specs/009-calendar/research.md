# Research: Monthly Calendar

## R1. Source of transaction and recurrence events

- **Decision**: The calendar service composes `transactionsService.listTransactions` (unpaginated)
  twice: (a) purchase-date range `dateStart`/`dateEnd` = first/last day of the month, for
  non-boleto items and recurring occurrences; (b) `period` + `payables=true` +
  `paymentMethod=boleto`, for boletos whose resolved (adjusted) due date falls in the month.
- **Rationale**: `listTransactions` already expands recurring rules for the range, applies
  pauses/skips/ends and per-occurrence settlement, resolves adjusted due dates, and projects split
  allocations. `tripsService` already uses mode (a) the same way (`apps/api/src/app.ts`). No
  duplicated recurrence or due-date logic.
- **Alternatives**: a dedicated calendar repository with SQL (rejected: would re-implement
  recurrence expansion and due-date resolution); one call with `period` (rejected: card purchases
  are filtered by invoice period, not purchase date).

## R2. Own share

- **Decision**: An item counts when its `allocation.personId` is the admin person, or, with no
  splits (`allocation === null`), when `personId` is the admin person. Amount shown is
  `allocation.amount` or `amount`. Admin person from `findAdminPersonByUserId`.
- **Rationale**: Same rule as dashboard/establishments (`people.role = 'admin'` share), applied on
  the already-projected DTO; the rule itself lives in `packages/domain/src/calendar.ts`.

## R3. Installments

- **Decision**: V2 stores one row per installment with the purchase date shifted month by month.
  A credit-card installment row becomes a "Parcelas" event only when `currentInstallment === 1`
  (its purchase date is the original purchase date); later card installments are not shown (the
  invoice event covers them). A series tracked from a later installment (imported mid-way) shows
  no purchase event, since the purchase predates tracking. Every other non-boleto installment row
  (account debit, cash, Pix) shows as a "Parcelas" event on its own date with `k/N`. Boleto
  installments show as "Boleto" events by due date.
- **Rationale**: matches V1 (one event per purchase on the purchase date) without a second query.
- **Alternatives**: listing the previous month to detect series starts (rejected: extra query for
  a rare imported case).

## R4. Card invoice events

- **Decision**: `cardsService.list(userId, period)` gives each card's `invoiceSummary` (amount,
  status, adjusted `dueDate`, payments). An event exists when `amount > 0`, placed on
  `invoiceSummary.dueDate` (already clamped to the month and adjusted by due-date rules in
  `calculateCardInvoiceSummary`); a due date outside the month (adjustment crossing month end)
  drops the event from this month. State: `paid` -> "paid" with the latest `payments[].paidAt`;
  `overdue` -> "overdue"; `open`/`closed` -> "pending".
- **Alternatives**: recomputing totals from transactions (rejected: duplicates invoice rules).

## R5. Month grid

- **Decision**: pure domain helper `buildCalendarDays(period, today)` returns the 42 Monday-first
  days as date-only strings with `inMonth` and `isToday`, using UTC date arithmetic only. The API
  returns `days` with each day's ordered events, so the web only renders.
- **Rationale**: FR-015 and AGENTS.md (no rules in the web); date-only strings avoid time-zone
  shifts (SC-002). `today` comes from `getCurrentDateInBrazil()` in the service.

## R6. Web refresh after create

- **Decision**: Query key root `"calendar"` added to `financialQueryRoots`, so the existing
  `refreshTransactionQueries` after create refreshes the calendar. Dialog: existing
  `TransactionDialog` with `createDefaults={{ purchaseDate }}`.
