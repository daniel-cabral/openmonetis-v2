# Feature Specification: Cross-Card Usage Report

**Feature Branch**: `008-card-usage-report`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 card usage report (reports/card-usage): one page that compares all credit cards for a month and drills into one card, to V2, which only has the per-card flow."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare all cards for a month (Priority: P1)

A user with several credit cards wants one page showing, for the selected month, how much of the total limit they are using and how each card compares, with a trend against the previous month.

**Why this priority**: The core value of the report and a standalone MVP: an overview without drill-down is already useful.

**Independent Test**: With three cards and expenses in two months, open the report for the later month and verify limit, used, available and percentage totals plus each card's row and trend.

**Acceptance Scenarios**:

1. **Given** three active cards with limits 5,000, 3,000 and 2,000 and month spending of 2,500, 1,500 and 0, **When** the user opens the report, **Then** the summary shows Limite 10.000, Usado 4.000, Disponível 6.000 and Utilização 40%.
2. **Given** the card list, **When** displayed, **Then** cards are sorted by usage in the selected month, highest first, and each row shows name, brand or logo, limit, a usage bar and the percentage.
3. **Given** usage below 50% of a card's limit, **When** displayed, **Then** its bar is in the success color; from 50% to below 80% the warning color; from 80% on the danger color; the bar fills at most 100% even if usage exceeds the limit.
4. **Given** a card with limit 0, **When** displayed, **Then** usage percentage is 0% and no division error occurs.
5. **Given** a card used 1,000 last month and 1,200 this month, **When** displayed, **Then** the change is +20% with an "up" trend; between -5% and +5% the trend is "stable"; below -5% "down".
6. **Given** a card with no spending last month and spending this month, **When** displayed, **Then** the change is +100% with an "up" trend.
7. **Given** inactive cards, **When** the report loads, **Then** they are not listed and do not count in totals.
8. **Given** the user has no active cards, **When** opening the report, **Then** the page shows "Nenhum cartão encontrado" instead of an error.

---

### User Story 2 - Drill into one card (Priority: P1)

The user selects a card from the list and sees its 12-month history, invoice statuses, category breakdown and biggest expenses for the selected month.

**Why this priority**: Turns the overview into an analysis tool; required for V1 parity.

**Independent Test**: Select a card with 12 months of data and verify the four blocks match the underlying transactions.

**Acceptance Scenarios**:

1. **Given** the page opens without a card chosen, **When** loaded, **Then** the card with the highest usage in the month is selected automatically.
2. **Given** the user clicks another card, **When** the page updates, **Then** the selected card and month are kept in the address so the view can be shared or reloaded.
3. **Given** a selected card, **When** the chart renders, **Then** it shows 12 monthly bars (the selected month and the 11 before it, zero for empty months), a reference line at the card limit, and a tooltip with month, amount and percentage of the limit.
4. **Given** the invoice block, **When** displayed, **Then** each of the same months shows the invoice state: "Pago", "Pendente", "Atrasado" or a dash placeholder when there is no invoice, with its amount.
5. **Given** the category block, **When** displayed, **Then** it lists up to 10 categories of the selected month with amount and percentage of the card's month total, largest first, with "Sem categoria" for uncategorized spending.
6. **Given** the top expenses block, **When** displayed, **Then** it lists up to 10 largest expenses of the month on that card with name, date (dd/mm/aaaa), category and amount.
7. **Given** a card with no spending in the month, **When** blocks render, **Then** empty states are shown ("Nenhum gasto encontrado", "Nenhuma categoria encontrada") and the page does not error.
8. **Given** the card id in the address is not one of the user's cards, **When** loaded, **Then** the page falls back to the default card and does not reveal that the id exists elsewhere.

---

### User Story 3 - Navigate months and reach the report (Priority: P2)

The user changes the month with the standard month navigation and finds the report from the reports menu.

**Why this priority**: Makes the report discoverable and consistent with other reports.

**Independent Test**: Open the reports menu, enter "Uso de cartões", move back two months, and verify all numbers recompute.

**Acceptance Scenarios**:

1. **Given** the reports menu, **When** the user opens it, **Then** an entry for the card usage report is available alongside the other reports.
2. **Given** the month navigation, **When** the user moves to another month, **Then** summary, trends and the selected card's blocks recompute for that month and the selected card is preserved.
3. **Given** an invalid month in the address, **When** loaded, **Then** the current month is used.
4. **Given** a very small screen, **When** viewed, **Then** the card list and blocks stack in one column without horizontal scroll.

---

### Edge Cases

- Spending counted is the user's own share: for shared or split transactions only the user's own person share counts, never other people's shares.
- Recurring occurrences count in the month only after their date has passed (V1 rule); future occurrences of the current month are excluded.
- Only expenses count toward usage; income, transfers and invoice payments do not.
- Refunds follow the same treatment as the existing per-card spending flow.
- A card with spending only on a future period shows zero in the current month.
- Cards with the same name remain distinguishable by brand or logo.
- A card created mid-year shows zero for months before it existed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a card usage report page under reports, reachable from the reports menu, scoped to a selected month.
- **FR-002**: The system MUST list all of the user's active cards (inactive excluded) with name, brand or logo, limit, usage in the selected month, usage percentage of the limit, previous-month usage, change percentage and trend.
- **FR-003**: Usage MUST be the user's own expenses on the card in the selected billing period, excluding income, transfers and invoice payments, counting recurring occurrences only up to today.
- **FR-004**: The summary MUST show total limit, total used, total available (limit minus used) and total usage percentage across listed cards.
- **FR-005**: Percentages MUST be zero when the limit is zero; usage bars MUST be capped at 100% with thresholds: under 50% success, 50% to under 80% warning, 80% and above danger.
- **FR-006**: Trend MUST be "up" above +5%, "down" below -5%, otherwise "stable"; with no previous usage and current usage greater than zero, change is +100% and trend "up".
- **FR-007**: Cards MUST be sorted by current usage, descending.
- **FR-008**: The system MUST let the user select a card, default to the highest-usage card, and keep card and month in the address; an unknown card id MUST fall back to the default.
- **FR-009**: The selected card detail MUST show 12 months of usage ending at the selected month with the limit as reference, and a tooltip with month, amount and percentage of limit.
- **FR-010**: The selected card detail MUST show the invoice state per month ("Pago", "Pendente", "Atrasado", or a dash placeholder when none) with its amount.
- **FR-011**: The selected card detail MUST show up to 10 categories of the month with amount and percentage of the card's month total, including "Sem categoria", and up to 10 largest expenses with name, date, category and amount.
- **FR-012**: Empty states MUST be shown for no cards, no spending and no categories, without errors.
- **FR-013**: The report MUST only read the authenticated user's data and MUST NOT expose other users' cards by id.
- **FR-014**: All amounts MUST be calculated by the backend, using the same financial rules as the rest of V2; the page only renders them.
- **FR-015**: All text MUST be PT-BR, accessible (keyboard, labels for bars and charts) and responsive.

### Key Entities

- **Card summary**: card with limit, month usage, percentage, previous usage, change and trend.
- **Card detail**: monthly usage series, invoice status series, category breakdown and top expenses of one card.
- **Invoice**: state per card and month (paid, pending, overdue, none).
- **Report period**: the month selected through the shared month navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with up to 10 cards sees the overview in under 2 seconds.
- **SC-002**: Totals and per-card usage equal the sum of the user's own expense transactions in 100% of verification cases, including shared transactions and recurring occurrences.
- **SC-003**: Trend and color thresholds match the V1 rules at the boundaries (49.9%, 50%, 79.9%, 80%, +5%, -5%) in acceptance tests.
- **SC-004**: Switching the selected card or month updates all blocks within 1 second and keeps the shareable address in sync.
- **SC-005**: 100% of empty-data cases (no cards, no spending, no invoices) render an empty state with no error.

## Assumptions

- "Usage" is the month's spending on the card, as in V1, not the committed limit of unpaid future installments that the V2 invoice summary may show; the report labels it "Usado".
- V1 counted only the admin (default) person; in V2 that is the user's own person, and for split transactions only the user's own share counts.
- Inactive means the V2 card status equivalent to V1 "inativo".
- The V2 per-card page (spending flow, invoice history chart) stays; this report adds the cross-card view and may link to it.
- Invoice status uses the V2 invoice states mapped to paid, pending, overdue and none.

## Source

- V1 evidence: `src/app/(dashboard)/reports/card-usage/page.tsx`, `src/features/reports/lib/cards-report-queries.ts` (`fetchCartoesReportData`, `fetchCardDetail`), `src/features/reports/components/cards/cards-overview.tsx`, `card-usage-chart.tsx`, `card-invoice-status.tsx`, `card-category-breakdown.tsx`, `card-top-expenses.tsx`.
- V2 evidence: `packages/validators/src/cards.ts` (card output, invoice summary and history), `apps/web/src/features/cards/components/card-spending-flow.tsx`, `card-invoice-history-chart.tsx`, `apps/web/src/routes/reports/` (no card usage route yet).
- Inventory row covered: "Report: card usage" (port; "V2 has per-card flow only").

## Dependencies

- Roadmap lane A sequence: after 007.
- Functional: none on other migration features; relies on existing V2 cards, invoices, people and transactions. Independent of the trip filter (004/005).
