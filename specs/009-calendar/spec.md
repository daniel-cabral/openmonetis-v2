# Feature Specification: Monthly Calendar

**Feature Branch**: `009-calendar`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 monthly calendar page to V2: a month grid showing transactions, installment purchases, boleto due dates and card invoice due dates per day, with a day detail and quick create."

## Clarifications

### Session 2026-11-11

Answered autonomously from V1 code (`fetchCalendarData`) and V2 code, per the roadmap worker protocol.

- Q: V2 stores one transaction row per installment with the purchase date shifted month by month (V1 kept one purchase date for all rows); how should installments appear? → A: A credit-card installment series shows one "Parcelas" event on the purchase date of its first tracked installment, only in that month (later installments are covered by the card invoice event). Every other non-boleto installment row shows as a "Parcelas" event on its own date with "k/N" and the per-installment value. Boleto installments show as "Boleto" events on their due dates.
- Q: Do credit-card purchases appear as day events in addition to the card invoice event? → A: Yes, as in V1: single card purchases appear as "Lançamento" on their purchase date; the invoice event shows the bill on its due date.
- Q: Which amount does a shared or split transaction show? → A: Only the user's own (admin person) share, as the dashboard computes it; transactions with no own share are omitted.
- Q: Which total and status does a card invoice event show? → A: The invoice total for the month as the card page shows it (the bill the user pays, all people included), shown only when the total is greater than zero. Status "paid" shows "Pago em <data do último pagamento>"; "overdue" shows "Atrasada"; "open"/"closed" show "Pendente".
- Q: Where do event links go (FR-014)? → A: Card invoice events link to that card's invoice page for the month; transaction, installment and boleto events have no link in this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the month's money events on a calendar (Priority: P1)

A user wants to open a monthly calendar and see, day by day, what was spent, which boletos fall due and when each card invoice is due.

**Why this priority**: The core of the feature and a standalone MVP.

**Independent Test**: With one expense, one boleto and one card with spending, open the month and verify each event sits on the correct day with the right type marker.

**Acceptance Scenarios**:

1. **Given** the month of October 2026, **When** the user opens the calendar, **Then** a 6-week grid (42 cells) starting on Monday shows the weekday headers "Seg, Ter, Qua, Qui, Sex, Sáb, Dom", days of adjacent months dimmed, and today highlighted.
2. **Given** a non-boleto income or expense dated October 12, **When** displayed, **Then** it appears on day 12 as a "Lançamento" event.
3. **Given** a boleto with due date October 20 and purchase date September 30, **When** displayed, **Then** it appears on day 20 (due date), not on day 30 of September, as a "Boleto" event.
4. **Given** a transfer between accounts, **When** displayed, **Then** it does not appear.
5. **Given** a purchase in installments made on October 5, **When** displayed, **Then** it appears once on day 5 as a "Parcelas" event showing the number of installments and the value per installment, rather than one event per installment.
6. **Given** a card with spending in the October invoice, **When** displayed, **Then** an invoice event appears on the card's due day (clamped to the month's last day, for example due day 31 in a 30-day month shows on day 30) with the card name, logo or brand, and the total due.
7. **Given** a card invoice already paid, **When** displayed, **Then** the event shows "Pago" and the payment date; otherwise its status label (pending, overdue) is shown.
8. **Given** a recurring rule with an occurrence in the month, **When** displayed, **Then** the occurrence appears on its date as a "Lançamento" event, paused or skipped occurrences do not appear, and past confirmed occurrences show as paid.
9. **Given** a day with more than 3 events, **When** displayed, **Then** the cell shows 3 previews and "+N mais".
10. **Given** a month with no events, **When** opened, **Then** the grid renders empty with no error.

---

### User Story 2 - Open a day and see details (Priority: P1)

The user clicks a day to see everything on it, grouped by type, with the state of each item.

**Why this priority**: Without details the grid is only a heat map; V1 parity requires the day modal.

**Independent Test**: Click a day with one of each event type and verify four groups with correct titles and amounts.

**Acceptance Scenarios**:

1. **Given** a day with events, **When** the user clicks it (or presses Enter or Space on it), **Then** a dialog lists them grouped as "Lançamentos", "Parcelas", "Boletos" and "Faturas", in that order.
2. **Given** an income or expense event, **When** shown, **Then** it displays name, amount (colored by type), category and settlement state: "Pago" for expense, "Recebido" for income, otherwise "Pendente", plus the due date when relevant.
3. **Given** an installment event, **When** shown, **Then** it displays the installment count, "por parcela" and the value per installment.
4. **Given** a card invoice event, **When** shown, **Then** it displays the card, total due, and "Pago em <data>" or the status.
5. **Given** a day without events, **When** opened, **Then** the dialog says "Nenhum lançamento encontrado para este dia."; for a day with events it says "Lançamentos e vencimentos cadastrados para este dia."
6. **Given** the dialog is open, **When** the user presses Escape or the close control, **Then** it closes and focus returns to the day.

---

### User Story 3 - Create a transaction from a day (Priority: P2)

The user creates a transaction directly from a calendar day with the date pre-filled.

**Why this priority**: Convenience that V1 had; not required to read the calendar.

**Independent Test**: Click the "+" on a day, create an expense, and verify it appears on that day without leaving the page.

**Acceptance Scenarios**:

1. **Given** a day cell, **When** the user clicks its create control, **Then** the standard new-transaction form opens with that date pre-filled and without opening the day dialog.
2. **Given** the day dialog, **When** the user chooses "Novo lançamento", **Then** the same form opens with the day's date.
3. **Given** a successfully created transaction, **When** the form closes, **Then** the calendar updates and shows the new event on the right day.
4. **Given** the form is cancelled, **When** it closes, **Then** nothing changes.

---

### User Story 4 - Navigate months (Priority: P3)

The user moves between months using the standard month navigation and the selected month is kept in the address.

**Why this priority**: Required, but behavior is shared with every other period-based page.

**Independent Test**: Move forward two months and reload the page; the same month stays selected.

**Acceptance Scenarios**:

1. **Given** the month navigation, **When** the user moves to another month, **Then** the grid and events refresh for that month.
2. **Given** an invalid month in the address, **When** loaded, **Then** the current month is shown.
3. **Given** a legend, **When** shown, **Then** it explains the four event types: Lançamentos, Parcelas, Boletos, Fatura de Cartão.

---

### Edge Cases

- Leap year and months where the first day is Sunday (six leading days) render correctly.
- Events dated on days of adjacent months visible in the grid are not shown there (events belong to the selected month only), as in V1.
- Only the user's own share of shared or split transactions is shown; other people's shares are excluded.
- A card with no invoice spending in the month shows no invoice event.
- A card whose adjusted due date differs from its nominal due day (non-business-day rules) shows the adjusted due date.
- Pending boletos past their due date are visibly marked overdue.
- Time-zone offsets never shift an event to the neighbouring day.
- Mobile width collapses previews to compact markers without horizontal scroll.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a calendar page showing one month at a time as a 6-week Monday-first grid with weekday headers, adjacent-month days dimmed and today highlighted.
- **FR-002**: The system MUST show non-boleto income and expense transactions on their purchase date, excluding transfers.
- **FR-003**: The system MUST show boletos on their due date, even when the purchase date is in another month.
- **FR-004**: The system MUST show a credit-card installment purchase as a single "Parcelas" event with installment count and per-installment value on the purchase date of its first tracked installment; other non-boleto installment rows show as "Parcelas" events on their own date with "k/N"; boleto installments follow FR-003.
- **FR-005**: The system MUST show recurring occurrences, expanded by the recurrence rule for the visible month, on their date, respecting pauses, skips and endings, without materializing future occurrences.
- **FR-006**: The system MUST show one invoice event per card whose invoice total for the month is greater than zero, on the card's due date adjusted to the month length and to the V2 due-date rules, with card identity, invoice total and state ("Pago em <data>", "Atrasada" or "Pendente"), linking to the card's invoice page for the month.
- **FR-007**: The system MUST show only the user's own (admin person) share of shared or split transactions, omit transactions with no own share, and MUST NOT include other people's shares. Card invoice events show the full bill (FR-006).
- **FR-008**: The system MUST order events within a day: lançamentos and parcelas first, then boletos, then card invoices.
- **FR-009**: The system MUST show up to 3 event previews per day with a "+N mais" indicator for the rest.
- **FR-010**: The system MUST open a day dialog on click or Enter/Space, grouped by type with the titles and states in Story 2, and with correct empty text.
- **FR-011**: The system MUST let the user create a transaction from a day cell or from the day dialog with the date pre-filled, and refresh the calendar afterwards.
- **FR-012**: The system MUST show a legend of the four event types.
- **FR-013**: The system MUST use the shared month navigation, keep the month in the address, and fall back to the current month for invalid input.
- **FR-014**: The calendar MUST be read-only for existing events (no drag and drop, no editing of existing items in this feature); only card invoice events link out (to the card invoice page).
- **FR-015**: All financial amounts, paid states and due dates MUST come from the backend; the page only renders and groups them.
- **FR-016**: The page MUST be keyboard accessible (cells focusable, dialog focus managed), responsive, in PT-BR, and limited to the authenticated user's data.

### Key Entities

- **Calendar event**: a dated item of type transaction, installment purchase, boleto or card invoice, with amount and paid state.
- **Calendar day**: a grid cell with date, in-month flag, today flag and its events.
- **Card invoice**: due date, total and payment state of a card's invoice for the month.
- **Recurrence occurrence**: a dated expansion of a recurring rule in the visible month.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user sees the full month with all event types in under 2 seconds.
- **SC-002**: 100% of events appear on the correct day (purchase date, boleto due date, adjusted card due date) in acceptance tests, including month-end clamping and time zones.
- **SC-003**: Per-day totals shown in the day dialog equal the sum of the underlying transactions in 100% of verification cases.
- **SC-004**: A user creates a transaction from a calendar day in under 30 seconds and sees it on the right day without a manual refresh.
- **SC-005**: Every interactive element of the grid and dialog is reachable and operable with the keyboard only.

## Assumptions

- V1 materialized recurring transactions as rows; V2 expands recurrence rules per queried period, so the calendar must use the V2 expansion for the visible month.
- V1 placed non-boleto items by purchase date and boletos by due date; the same rule is kept, using V2 adjusted due dates for boletos.
- V1 considered only the admin (default) person; in V2 that is the user's own person and own share of splits.
- V1 identified paid invoices through a payment-by-name lookup; V2 uses typed invoice payments and states instead.
- Settled recurring occurrences and installments show the same paid labels as in lists.
- The existing V2 new-transaction form, month navigation and invoice due-date rules are reused.

## Source

- V1 evidence: `src/app/(dashboard)/calendar/page.tsx`, `src/features/calendar/queries.ts` (`fetchCalendarData`: event rules, installment grouping, card due events), `src/features/calendar/components/monthly-calendar.tsx`, `calendar-grid.tsx`, `day-cell.tsx`, `event-modal.tsx`, `calendar-legend.tsx`, `src/shared/utils/calendar.ts` (Monday-first 42-cell grid, weekday labels), `src/shared/lib/types/calendar.ts`.
- V2 evidence: `packages/validators/src/cards.ts` (invoice summary with due dates), `docs/due-date-rules.md`, `docs/recurring-transactions.md`, `apps/web/src/routes/` (no calendar route yet).
- Inventory row covered: "Calendar" (port).

## Dependencies

- Roadmap lane B sequence: after 010 (sequence only; no functional dependency on dashboard widgets).
- Functional: existing V2 transactions, recurrence expansion, installments, cards and invoices, due-date rules and the new-transaction form. None of the other migration features is required.

## UI decisions

Previews (real app CSS compiled from `apps/web/src/styles/app.css`; regenerate with
`cd apps/web && pnpm dlx @tailwindcss/cli@4.3.4 -i ../../specs/009-calendar/previews/preview.css -o ../../specs/009-calendar/previews/app.css`):
`specs/009-calendar/previews/option-a-v1-grid.html`, `option-b-split-panel.html`.

**Chosen: option A (V1 grid + day dialog)**, decided autonomously. Rationale: closest to V1 and to
Story 2 (dialog), keeps the page a single column, and the dialog is a stock shadcn `Dialog` with
built-in focus management (FR-016).

- Page: standard page header "Calendário" with `MonthNavigation` (period in the URL), legend row
  with 4 markers (Lançamentos, Parcelas, Boletos, Fatura de Cartão), then a bordered 7-column grid
  (Seg..Dom), 6 rows.
- Day cell: focusable `button`-like cell (Enter/Space opens the dialog), day number, today ring,
  adjacent-month days dimmed with no events, a "+" icon button (visible on hover/focus, always
  visible on touch widths) that opens `TransactionDialog` with the date, up to 3 chips (type
  marker, name, amount) and "+N mais".
- Mobile (< `sm`): chips collapse to colored dots; no horizontal scroll.
- Day dialog: shadcn `Dialog`, title with the long date, description per Story 2, groups
  "Lançamentos", "Parcelas", "Boletos", "Faturas" with name, `MoneyValue`-style colored amount,
  category, state badge, invoice "Pago em dd/MM/yyyy" and a "Ver fatura" link to
  `/cards/$cardId?period=`; footer button "Novo lançamento".
- Markers use existing tokens: Lançamentos `bg-info`, Parcelas `bg-brand`, Boletos `bg-warning`,
  Fatura a chart token distinct from the income green (preview used `bg-success`, which clashed).
- Discarded: option B (dots + side panel), because it drops V1's in-cell previews and the dialog
  required by Story 2.
