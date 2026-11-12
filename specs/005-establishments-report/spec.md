# Feature Specification: Establishments Report and Trip Filter in Reports

**Feature Branch**: `005-establishments-report`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Establishments report (top places) with trip filter; trip filter in category trends" (roadmap row 005; inventory base row "Report: establishments" and fork row "Trip filter in reports").

**Fork-only flag**: the establishments report is a V1 base feature missing in V2 and is a candidate for an upstream PR on its own; the trip filter depends on trips (004), which are fork-only. Keep the report PR-able without the trip filter.

## Clarifications

### Session 2026-11-11

Answered autonomously by the lane worker (roadmap per-feature workflow), from V1 evidence and the V2 code.

- Q: Which month does a purchase belong to for the 3/6/12 window? → A: Its V2 transaction period (card purchases fall in their invoice period), and recurring occurrences use the period derived by the domain, the same attribution category trends already uses.
- Q: How do installments and ties rank? → A: Each installment inside the window counts as one purchase with its installment amount (V1 counted rows); ties on count are ordered by total spent descending, then name ascending.
- Q: Which rows count as a purchase? → A: Only expense rows with origin `regular` (refunds, which are income, are excluded, not netted); uncategorized expenses count in establishment totals and summaries but are omitted from category lists.
- Q: Which recurring occurrences count when a specific trip is selected in the establishments report? → A: Only occurrences explicitly linked to that trip (004 occurrence links), at their linked dates; unlinked projections never count under a specific trip.
- Q: What are the URL parameter names and values? → A: `trip` (absent = "Todos os lançamentos", `none` = "Sem viagens", otherwise a trip id) on both reports; `months` (3, 6 or 12) and `period` (`YYYY-MM`) on the establishments report.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where I spend the most (Priority: P1)

The user opens the "Estabelecimentos" report and sees the places where they spent, ranked by how often they bought, with totals, average ticket and main categories, for the last 3, 6 or 12 months.

**Why this priority**: it is the missing V1 report and the base for the trip filter and for the dashboard spending widget (010).

**Independent Test**: seed expenses across establishments and months, open the report and verify ranking, totals, summary cards and the window.

**Acceptance Scenarios**:

1. **Given** expenses in the last 6 months, **When** the user opens the report with no parameters, **Then** the window is the last 6 months ending at the selected period, labeled "Últimos 6 meses".
2. **Given** the report is open, **When** the user picks 3 or 12 months, **Then** the window and the label ("Últimos 3 meses", "Últimos 12 meses") change and the choice survives a reload.
3. **Given** "Mercado A" with 8 purchases (R$ 800,00 total) and "Posto B" with 3 purchases (R$ 900,00), **When** the list renders, **Then** "Mercado A" ranks first (most frequent), each row shows count, total and average (total divided by count), and the summary names "Mercado A" as "Mais Frequente" and "Posto B" as "Maior Gasto Total".
4. **Given** an establishment with purchases in several categories, **When** its row renders, **Then** up to its 3 most frequent categories are shown, ordered by count.
5. **Given** the window has expenses, **When** the summary cards render, **Then** they show distinct establishments ("Locais diferentes"), number of transactions ("Compras no período"), total spent ("Soma de todas as compras") and average ticket ("Média por transação").
6. **Given** expenses across categories, **When** "top categories" renders, **Then** it lists up to 10 categories by total spent, descending, with transaction count.
7. **Given** no expenses in the window, **When** the report opens, **Then** it shows "Nenhum estabelecimento encontrado" / "Quando houver compras registradas, elas aparecerão aqui." and "Nenhuma categoria encontrada" for categories, and summary values are zero.
8. **Given** more than 50 establishments, **When** the list renders, **Then** only the top 50 by frequency are listed.

---

### User Story 2 - Only genuine purchases are counted (Priority: P1)

The report ranks real spending: system rows never inflate it.

**Why this priority**: wrong totals make the report untrustworthy; V1 has explicit exclusions.

**Independent Test**: add an invoice payment, an initial-balance row, a transfer and an expense in an account excluded from balances, and confirm none of them show up.

**Acceptance Scenarios**:

1. **Given** an invoice payment, **When** the report computes, **Then** it is excluded (the card purchases already represent the spending).
2. **Given** an account initial-balance row, a transfer, an invoice adjustment/credit or a person settlement, **When** the report computes, **Then** they are excluded.
3. **Given** an expense on an account configured to be left out of balances, **When** the report computes, **Then** it is excluded.
4. **Given** income rows, **When** the report computes, **Then** they are excluded (expenses only).
5. **Given** an expense split with Ana, **When** the report computes, **Then** only the user's own share counts.
6. **Given** a recurring expense whose occurrences fall in the window, **When** the report computes, **Then** those occurrences count as purchases (V1 counted them as ordinary rows).

---

### User Story 3 - Filter the report by trip (Priority: P2)

The user picks a trip in the "Viagem" selector of the establishments report and sees the places of that trip only, for the whole trip, regardless of the month window.

**Why this priority**: this is the reason the report lands in the trips lane; it answers "where did we spend in Lisboa".

**Independent Test**: with a trip older than the window, choose it and verify the whole trip is listed and the label reads "Viagem: {name}".

**Acceptance Scenarios**:

1. **Given** the selector, **When** it opens, **Then** it offers "Todos os lançamentos" (default), "Sem viagens" and one entry per own trip.
2. **Given** the window is "últimos 3 meses" and a trip ended a year ago, **When** the user chooses that trip, **Then** the list shows the establishments of the whole trip, the month window is ignored, and the period label reads "Viagem: {trip name}".
3. **Given** "Sem viagens", **When** chosen, **Then** only transactions without a trip count and the month window still applies.
4. **Given** the URL carries a trip identifier of another user or a deleted trip, **When** the page loads, **Then** it behaves as "Todos os lançamentos".
5. **Given** a trip is chosen, **When** the page reloads or the link is shared, **Then** the same trip stays selected (selection lives in the URL).
6. **Given** a trip filter is active, **When** the user changes the 3/6/12 choice, **Then** the trip filter is kept (and the window stays ignored while a trip is selected).

---

### User Story 4 - Filter category trends by trip (Priority: P2)

The category trends report gets the same "Viagem" selector; choosing a trip makes the range cover the whole trip.

**Why this priority**: lets the user see a trip's spending by category over time; extends an existing V2 report.

**Independent Test**: choose a trip with installments spread over months and verify range auto-adjust and totals.

**Acceptance Scenarios**:

1. **Given** category trends from 03/2026 to 06/2026, **When** the user chooses "Sem viagens", **Then** the table sums only transactions with no trip.
2. **Given** the selector, **When** the user chooses "Lisboa", **Then** the table sums only transactions and recurring occurrences linked to "Lisboa".
3. **Given** "Lisboa" has installments from 03/2026 to 12/2026 and purchases in 06/2026, **When** it is chosen, **Then** the range jumps to 03/2026 through 12/2026.
4. **Given** a trip whose linked rows span more than 24 months, **When** chosen, **Then** the range starts at the first period and is capped at 24 months.
5. **Given** a trip with no linked rows, **When** chosen, **Then** the current range is kept and the table is empty.
6. **Given** the URL carries another user's trip identifier, **When** the page loads, **Then** it behaves as "Todos os lançamentos".
7. **Given** a trip is selected with categories filtered, **When** the user clicks "Limpar", **Then** the selector returns to "Todos os lançamentos", the trip parameter leaves the URL, categories are cleared and the range returns to the default.
8. **Given** the trip filter, **When** the user also uses the existing person scope or category filter, **Then** all filters combine.
9. **Given** a trip is selected, **When** the table shows variation versus the previous period, **Then** both sides are computed on the filtered set.
10. **Given** a recurring rule projected into future periods without a trip link, **When** a specific trip is selected, **Then** the projection is excluded; under "Sem viagens" or "Todos" it counts as today.
11. **Given** other reports (installments analysis, and the future card usage report), **When** they open, **Then** no trip selector appears and their numbers are unchanged.

### Edge Cases

- No admin person: the establishments report renders empty with zero summary instead of failing.
- Establishments are grouped by the transaction name as recorded (case-sensitive, as in V1); logos use the existing V2 name-based logo lookup.
- Average and percentages with zero transactions are zero, never NaN.
- A deleted trip in a shared URL falls back to "Todos os lançamentos" without an error page.
- Period parameter invalid or absent falls back to the current period; 3/6/12 invalid falls back to 6 (web resolver; the API returns 400).
- Money is computed in integer cents.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an "Estabelecimentos" report reachable from the reports navigation, with a period selector (selected month) and a window of 3, 6 or 12 months (default 6), reflected in the URL.
- **FR-002**: The report MUST rank establishments (grouped by transaction name) by number of purchases descending (ties: total spent descending, then name ascending), limited to the top 50, each with count, total spent and average ticket. Each installment in the window counts as one purchase; purchases belong to their V2 transaction period.
- **FR-003**: Each establishment MUST show its top 3 categories by count.
- **FR-004**: The report MUST show summary figures: distinct establishments, number of transactions, total spent, average ticket, "Mais Frequente" and "Maior Gasto Total" establishments.
- **FR-005**: The report MUST show the top 10 categories by total spent with transaction count.
- **FR-006**: The report MUST count only the user's own share of expenses, excluding income, transfers, invoice payments, invoice adjustments and credits, account balance adjustments, initial-balance rows, person settlements and transactions on accounts excluded from balances (only expense rows with origin `regular` count). Uncategorized expenses count in totals but not in category lists.
- **FR-007**: Recurring occurrences inside the window MUST count as purchases.
- **FR-008**: Empty windows MUST show the V1 empty states and zeroed summaries.
- **FR-009**: Both the establishments report and category trends MUST offer a "Viagem" selector with modes "Todos os lançamentos" (default), "Sem viagens" and one entry per own trip.
- **FR-010**: The chosen mode MUST be stored in the URL parameter `trip` (absent = all, `none`, or a trip id), survive reload, and unknown or foreign trip identifiers MUST degrade to "Todos os lançamentos" without revealing whether the trip exists.
- **FR-011**: In the establishments report a specific trip MUST ignore the month window and label the period "Viagem: {name}", counting only rows and recurring occurrences explicitly linked to the trip; "Sem viagens" MUST keep the window.
- **FR-012**: In category trends choosing a trip MUST set the range to the earliest through latest period among the trip's linked rows (including linked recurring occurrences), capped at 24 months from the first period; a trip without rows keeps the current range.
- **FR-013**: In category trends a specific trip MUST include only rows and occurrences linked to it, "Sem viagens" only rows with no link (projected recurring occurrences included), and "Todos" everything as before; totals, summaries and previous-period comparisons MUST be computed on the filtered set.
- **FR-014**: "Limpar" in category trends MUST reset the trip filter to "Todos os lançamentos", clear the category selection and restore the default range.
- **FR-015**: The trip filter MUST combine with the existing category and person filters of category trends and MUST NOT appear in other reports.
- **FR-016**: All data MUST be scoped to the authenticated user; trip identifiers are validated for ownership.
- **FR-017**: Report rules (exclusions, ranking, filtering, range resolution) MUST live in the domain; the UI only presents them.

### Key Entities

- **Establishment aggregate**: derived per name within the filter scope: count, total, average, top categories.
- **Trip filter**: one of three modes (all, none, specific trip); not persisted beyond the URL.
- **Trip range**: derived min and max period of a trip's linked rows (004).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Selecting a trip from a year ago lists that trip's establishments in one interaction, with no month window cut-off.
- **SC-002**: For the V1 trip fixtures, category trends with "Sem viagens" plus the sum of every individual trip equals the "Todos os lançamentos" total.
- **SC-003**: Selecting a trip with installments over 10 months sets a 10-month range in one interaction; a trip over 30 months is capped to 24.
- **SC-004**: A foreign or stale trip identifier in the URL never errors and never exposes data (0 leaks in tests).
- **SC-005**: Invoice payments, transfers, initial balances and excluded-account expenses contribute R$ 0,00 to every establishment total (verified on a fixture).
- **SC-006**: Reports other than the two filtered ones show no trip selector and produce identical numbers before and after the feature.

## Assumptions

- Own share = admin person, as in V1; a person selector on the establishments report is out of scope (category trends keeps the V2 person scope it already has).
- Grouping by exact transaction name is kept from V1; smarter merchant normalization belongs to the reconciliation work (001/002), not here.
- V1 materialized recurring rows, so counting expanded V2 recurring occurrences in the window preserves V1 numbers.
- Charts, if any, follow the existing V2 report components; V1 layout (summary cards, highlights, list, top categories) is the reference and the exact UI is decided in the mockup step.
- Trips come from 004; until it lands the selector has no entries.

## Dependencies

- Requires 004 (trips entity, links, trip range). Feeds 010 (the dashboard spending widget links here).
- Extends existing V2 category trends (`/reports/category-trends`); the establishments feature in V2 today only manages logos.

## Source

V1 disposition: **kept** (ranking, windows, exclusions, summary figures, trip filter modes, range rules, URL parameter semantics); **changed** (recurrence counted from V2 rules and occurrences; filter implemented on typed origins instead of note prefixes; the trip URL parameter follows V2 naming); **dropped** (none).

V1 evidence (`D:\Repos\daniel-cabral\openmonetis`): `openspec/specs/trip-report-filter/spec.md`, `src/app/(dashboard)/reports/establishments/page.tsx`, `src/features/reports/establishments/queries.ts` and `queries.test.ts`, `src/features/reports/components/establishments/*` (summary-cards, highlights-cards, establishments-list, top-categories, period-filter, trip-filter), `src/features/reports/components/trip-filter-select.tsx`, `src/features/reports/lib/trip-range.ts` and `trip-range.test.ts`, `src/shared/lib/trips/trip-filter-param.ts`, `trip-filter-condition.ts`, `trip-filter.test.ts`, `period-ranges.ts`.

V2 code extended: `apps/web/src/routes/reports/category-trends.tsx`, `apps/web/src/features/category-trends/`, `packages/domain/src/category-trends.ts`, `apps/api/src/services/category-trends.service.ts`, `apps/api/src/routes/establishments.ts` (logos only).

Inventory rows covered: base "Report: establishments" (missing, port); fork "Trip filter in reports (category trends, establishments; `viagem=` param; range auto-adjust)" (missing, port own entity).

## UI decisions

Previews (real app CSS compiled from `apps/web/src/styles/app.css`; regenerate with
`cd apps/web && pnpm dlx @tailwindcss/cli@4.3.4 -i ../../specs/005-establishments-report/previews/preview.css -o ../../specs/005-establishments-report/previews/app.css`):
`specs/005-establishments-report/previews/option-a-v1-layout.html`, `option-b-table.html`, `category-trends-trip.html`.

**Chosen: option A (V1 layout: summary cards, highlights, list + top categories)**, decided autonomously. Rationale: closest to V1 (same sections and order) using only existing V2 pieces, and its list rows are reusable by the dashboard spending widget (010).

- Route `/reports/establishments`, nav entry "Estabelecimentos" in the "Relatórios" group of `components/navigation/nav-items.tsx` (`preservePeriod: true`, icon `Store`, description "Onde você mais compra").
- Header: `PageHeader` (eyebrow "Relatórios"); toolbar with `MonthNavigation` (`period`), shadcn `ToggleGroup` "3 meses" / "6 meses" / "12 meses" (`months`) and a "Viagem" `Select` ("Todos os lançamentos", "Sem viagens", own trips); period label "Últimos N meses" or "Viagem: {nome}". While a trip is selected, month navigation and the toggle are disabled.
- Four summary `Card`s (Locais diferentes, Compras no período, Soma de todas as compras, Média por transação), two highlight tiles ("Mais Frequente", "Maior Gasto Total"), then `grid xl:grid-cols-3`: establishments list (2 cols; rank, `EstablishmentLogo` with `editable={false}`, name, up to 3 category `Badge`s, "{n} compras", total, "média R$ x") and "Principais categorias" (1 col, top 10 with count).
- Empty states: "Nenhum estabelecimento encontrado" / "Quando houver compras registradas, elas aparecerão aqui." and "Nenhuma categoria encontrada"; summaries zero.
- Category trends: a "Viagem" `Select` (same component, shared from `features/trips/components/trip-filter-select.tsx`) added to `category-trends-filters.tsx` next to the categories filter; "Limpar filtros" also resets it and shows when a trip is selected; choosing a trip replaces the range with the one returned by the API.
- Discarded: option B (dense table + metric strip), because it drops the V1 highlights and does not fit mobile without horizontal scroll.
