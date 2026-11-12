# Feature Specification: Cross-Card Usage Report

**Feature Branch**: `008-card-usage-report`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 card usage report (reports/card-usage): one page that compares all credit cards for a month and drills into one card, to V2, which only has the per-card flow."

## Clarifications

### Session 2026-11-12

Answered autonomously by the lane A worker (roadmap per-feature workflow), from the V1 evidence in
this spec and the V2 code (`cards.service.ts`, `packages/domain/src/cards.ts`,
`category-trends.ts`, `establishments-report.ts`, `transactions.ts`).

- Q: Which card rows count as "Usado" and how do refunds and credits behave? → A: The user's own
  share (the admin person's row, or the admin split row in a split, same SQL as the
  establishments report) of every card transaction in the period, valued with the existing
  `calculateExpenseImpact` rule used by category trends and budgets: expenses add (single,
  installment and recurring), refunds (`refund` income) and positive invoice adjustments subtract.
  Rows that never count: transfers, plain income, `invoicePayment`, `invoiceCredit`,
  `accountBalanceAdjustment`, `personSettlement` and the system invoice-payment category. A card's
  month usage never goes below zero. "Usado" is therefore not the V2 invoice amount (which is the
  whole bill, including other people's shares); the invoice block shows the invoice amount.
- Q: Which month does a purchase belong to, and which recurring occurrences count? → A: Its stored
  transaction `period` (card purchases already carry their invoice period; each installment counts
  in its own period). Active recurring rules on the card are expanded with the domain's existing
  occurrence walk (`listRuleOccurrences`, with occurrence amount overrides) and an occurrence
  counts only when its purchase date is on or before today in Brasília (V1 rule); paused or
  cancelled rules never count. The same rule applies to every month of the 12-month series.
- Q: Which cards are listed and how is an invoice state shown? → A: Only cards with status
  `active`; an inactive, unknown or foreign card id in the address falls back to the default card.
  The invoice state per month comes from the existing V2 invoice summary
  (`calculateCardInvoiceSummary`, same dates, due-date rules and payments as the card page):
  `paid` → "Pago", `overdue` → "Atrasado", `open` or `closed` → "Pendente"; "none" (dash) when the
  month has no invoice: amount zero, no stored invoice record and no payment. The amount shown is
  that invoice amount.
- Q: How are percentages, the trend and the bar color computed at the boundaries? → A: In the
  domain, from integer cents. Usage percentage = used / limit × 100 rounded to 2 decimals (0 when
  the limit is 0); tone `success` below 50, `warning` from 50 to below 80, `danger` from 80 on,
  evaluated on the rounded percentage; bar fill = min(percentage, 100). Change percentage =
  (current − previous) / previous × 100 rounded to 2 decimals; previous 0 and current > 0 → +100;
  both 0 → 0; trend `up` when change > 5, `down` when change < −5, otherwise `stable` (exactly ±5 is
  stable). Available = limit − used, floored at 0; summary percentage uses total used over total
  limit. Ties in the card order: usage desc, then name (pt-BR), then id.
- Q: What do the address and the API look like, and what do the detail lists contain? → A: Search
  params `period` (`YYYY-MM`, invalid → current month) and `card` (UUID, otherwise ignored). One
  endpoint `GET /reports/card-usage?period=&cardId=` returns summary, card list, the resolved
  `selectedCardId` and that card's detail in one response. Categories: own-share net impact per
  category of the selected card's month rows, categories with net ≤ 0 omitted, largest first (ties
  by name), up to 10, percentage of the card's month usage. Top expenses: individual expense rows
  and counted recurring occurrences (refunds excluded), largest own-share amount first, then most
  recent date, then name, up to 10.

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
- Refunds and positive invoice adjustments on the card reduce the month usage (same expense-impact
  rule as category trends and budgets); usage never goes below zero; invoice credits
  (`invoiceCredit`) and invoice payments never count.
- Usage above the limit: percentage above 100 is shown as text, the bar stays full and available is
  0.
- A card with spending only on a future period shows zero in the current month.
- Cards with the same name remain distinguishable by brand or logo.
- A card created mid-year shows zero for months before it existed.

## UI decisions

Previews (real app CSS compiled from `apps/web/src/styles/app.css`; regenerate with
`cd apps/web && pnpm dlx @tailwindcss/cli@4.3.4 -i ../../specs/008-card-usage-report/previews/preview.css -o ../../specs/008-card-usage-report/previews/app.css`):
`specs/008-card-usage-report/previews/option-a-v1-layout.html`, `option-b-table-tabs.html`,
`option-c-tiles.html`.

**Chosen: option A (V1 layout: summary, card list on the left, selected card detail on the right)**,
decided autonomously. Rationale: same sections and reading order as V1 (overview list + drill-down
side by side, all four detail blocks visible at once), built only from existing V2 pieces
(`PageHeader`, `MonthNavigation`, shadcn `Card`, `Progress`, `Badge`, recharts `ChartContainer` as in
`card-invoice-history-chart.tsx`), and it stacks into one column on small screens without a table.

- Route `/reports/card-usage`, search params `period` and `card`; nav entry "Uso de cartões" in the
  "Relatórios" group of `components/navigation/nav-items.tsx` after "Estabelecimentos"
  (`preservePeriod: true`, icon `CreditCard`, description "Limite usado por cartão no mês").
- Header: `PageHeader` (eyebrow "Relatórios", title "Uso de cartões", description "Quanto do limite
  de cada cartão você usou no mês e como isso mudou."); toolbar with `MonthNavigation` only.
- Summary `Card`: "Limite total", "Usado", "Disponível", "Utilização" plus one overall bar.
- Layout `grid lg:grid-cols-3`: left "Cartões" list (1 col) of selectable rows (`button` with
  `aria-pressed`): brand flag (`getCardBrandAsset`) or logo, name, "R$ usado de R$ limite",
  percentage in the tone color, trend icon with signed change ("Alta"/"Queda"/"Estável" as
  accessible label), and a `Progress` bar colored by the backend tone
  (`bg-success`/`bg-warning`/`bg-destructive`). Right (2 cols): 12-month bar chart with a dashed
  reference line at the limit, tooltip "mês, valor, % do limite", and a "Ver cartão" link to the
  card's invoice page; "Faturas" grid of 12 months with status `Badge` ("Pago" success, "Atrasado"
  destructive, "Pendente" warning, "–" muted) and amount; "Categorias" and "Maiores gastos" side by
  side (`md:grid-cols-2`).
- Empty and loading states: "Nenhum cartão encontrado" (page body, no list or detail), "Nenhum
  gasto encontrado" (top expenses and chart caption), "Nenhuma categoria encontrada", skeleton
  while loading, error card with "Tentar novamente".
- Discarded: option B (table + tabs), because it hides three of the four V1 detail blocks behind
  tabs and needs horizontal scroll on mobile; option C (card tiles), because the tiles push the
  detail below the fold for 4+ cards and drift from V1's list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a card usage report page under reports, reachable from the reports menu, scoped to a selected month.
- **FR-002**: The system MUST list all of the user's active cards (inactive excluded) with name, brand or logo, limit, usage in the selected month, usage percentage of the limit, previous-month usage, change percentage and trend.
- **FR-003**: Usage MUST be the user's own-share expense impact on the card in the selected billing period (expenses add; refunds and positive invoice adjustments subtract; transfers, plain income, invoice payments, invoice credits, balance adjustments and person settlements excluded; floored at zero), counting active recurring occurrences only when their date is on or before today.
- **FR-004**: The summary MUST show total limit, total used, total available (limit minus used, floored at zero) and total usage percentage across listed cards.
- **FR-005**: Percentages MUST be zero when the limit is zero and rounded to 2 decimals; usage bars MUST be capped at 100% with thresholds on the rounded percentage: under 50% success, 50% to under 80% warning, 80% and above danger. The tone MUST be computed by the backend.
- **FR-006**: Trend MUST be "up" above +5%, "down" below -5%, otherwise "stable" (exactly ±5% is stable); with no previous usage and current usage greater than zero, change is +100% and trend "up"; with both zero, change is 0% and "stable".
- **FR-007**: Cards MUST be sorted by current usage, descending, then by name and id.
- **FR-008**: The system MUST let the user select a card, default to the highest-usage card, and keep card (`card`) and month (`period`) in the address; an unknown, inactive or foreign card id MUST fall back to the default.
- **FR-009**: The selected card detail MUST show 12 months of usage ending at the selected month with the limit as reference, and a tooltip with month, amount and percentage of limit.
- **FR-010**: The selected card detail MUST show the invoice state per month from the existing V2 invoice summary ("Pago" for paid, "Atrasado" for overdue, "Pendente" for open or closed, or a dash placeholder when the month has no invoice amount, record or payment) with the invoice amount.
- **FR-011**: The selected card detail MUST show up to 10 categories of the month with own-share net amount and percentage of the card's month usage (categories with net amount ≤ 0 omitted), including "Sem categoria", and up to 10 largest expenses (refunds excluded) with name, date, category and own-share amount.
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
- Inactive means the V2 card status `inactive` (V1 "inativo").
- The V2 per-card page (spending flow, invoice history chart) stays; this report adds the cross-card view and may link to it.
- Invoice status uses the V2 invoice states mapped as in FR-010 (`open` and `closed` both show "Pendente").

## Source

- V1 evidence: `src/app/(dashboard)/reports/card-usage/page.tsx`, `src/features/reports/lib/cards-report-queries.ts` (`fetchCartoesReportData`, `fetchCardDetail`), `src/features/reports/components/cards/cards-overview.tsx`, `card-usage-chart.tsx`, `card-invoice-status.tsx`, `card-category-breakdown.tsx`, `card-top-expenses.tsx`.
- V2 evidence: `packages/validators/src/cards.ts` (card output, invoice summary and history), `apps/web/src/features/cards/components/card-spending-flow.tsx`, `card-invoice-history-chart.tsx`, `apps/web/src/routes/reports/` (no card usage route yet).
- Inventory row covered: "Report: card usage" (port; "V2 has per-card flow only").

V1 disposition: **kept** (overview totals, per-card usage bar thresholds, ±5% trend, +100% with no
previous usage, default highest-usage card, 12-month chart with limit line, invoice status row,
top 10 categories and top 10 expenses, recurring only up to today); **changed** (own share uses V2
splits and typed origins, refunds net via the V2 expense-impact rule, invoice states come from the
V2 invoice summary with `open`/`closed` shown as "Pendente", one API call returns overview and
detail); **dropped** (none). Not fork-only: the report is upstream-compatible.

## Dependencies

- Roadmap lane A sequence: after 007.
- Functional: none on other migration features; relies on existing V2 cards, invoices, people and transactions. Independent of the trip filter (004/005).
