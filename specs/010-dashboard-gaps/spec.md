# Feature Specification: Dashboard Gaps (Spending Overview, Attachments, Category History, Notifications)

**Feature Branch**: `010-dashboard-gaps`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Spending overview widget (top expenses + establishments), attachments widget, category history widget, notifications mark-unread/unarchive" (roadmap row 010; inventory base rows for dashboard widgets and notifications).

**Fork-only flag**: the three widgets are V1 base features that upstream V2 lacks; they can be proposed upstream. The notifications item is verification only.

## Clarifications

### Session 2026-11-11

Answered autonomously from V1 code, the 005 spec and the current V2 code (goal run).

- Q: Which rows count in the spending overview (both tabs)? → A: The 005 purchase rule: type expense, origin `regular`, not `excludeFromBalance`, not the invoice-payment system category; paid and pending both count; period attribution is the V2 transaction period (card purchases fall in their invoice period); each installment and each expanded recurring occurrence is one row; only the admin person's share; refunds are excluded, not netted. The rule is shared with the establishments report in the domain, not re-implemented.
- Q: How are establishments grouped and how are ties broken in both tabs? → A: Establishments group by the exact recorded name (case-sensitive, as in 005); order count desc, total desc, name asc (pt-BR). Top expenses order amount desc, purchase date desc, name asc.
- Q: Which logo does each row show? → A: The V2 name-based `EstablishmentLogo` (read-only), not the V1 card/account logo, matching the establishments report rows.
- Q: Which attachments does the attachments widget summarise? → A: All attachments linked to the user's transactions of the selected period, across all of the user's people (same default set as the attachments library with no person filter), so "Ver todos" shows the same set; an attachment linked to several transactions of the period counts once and is dated by its most recent linked purchase date; size is the sum of file sizes in bytes.
- Q: What does the category history widget plot and from which data? → A: For each selected category and month, the category trends total (actual plus recurring occurrences, admin share, parent includes children, transfers/invoice payments/balance adjustments excluded), read from the existing category trends report with the 10-month window and the selected ids; selection is kept in `sessionStorage` per browser tab session.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spending overview widget (Priority: P1)

A dashboard widget "Panorama de gastos" with two tabs: "Top gastos" (biggest single expenses of the selected month) and "Estabelecimentos" (places the user bought from most often in that month).

**Why this priority**: the largest missing V1 dashboard piece (inventory effort M) and the only one that needs new data.

**Independent Test**: seed a month with expenses, system rows and several purchases at the same places; open the dashboard and check both tabs.

**Acceptance Scenarios**:

1. **Given** expenses in the selected month, **When** the widget renders on "Top gastos", **Then** it lists up to 10 single expenses by amount descending, each with logo, name, purchase date and amount.
2. **Given** the same month, **When** the user switches to "Estabelecimentos", **Then** it lists up to 10 establishments grouped by name, ordered by number of purchases descending then by total descending, each showing "{N} lançamentos · total acumulado" ("1 lançamento" when N is 1) and the accumulated amount.
3. **Given** invoice payments, transfers, initial-balance rows, invoice adjustments/credits, balance adjustments and person settlements in the month, **When** either tab renders, **Then** none of them appear.
4. **Given** an expense legitimately named "Fatura de energia" (a utility bill), **When** the tab renders, **Then** it is listed (V1 hid any name containing "fatura"; V2 excludes by typed origin instead).
5. **Given** a split expense, **When** the tab renders, **Then** only the user's own share counts and is shown.
6. **Given** no expenses in the month, **When** a tab renders, **Then** it shows an empty state ("Nenhuma despesa encontrada" / "Nenhum estabelecimento encontrado" with "Quando houver despesas registradas, elas aparecerão aqui.").
7. **Given** the user changes the dashboard month, **When** the period changes, **Then** both tabs refresh to the new month.
8. **Given** the widget footer, **When** the user follows the link, **Then** they land on the establishments report (005).

---

### User Story 2 - Attachments widget (Priority: P2)

A dashboard widget "Anexos" ("Comprovantes do período") summarising the receipts attached to the month's transactions.

**Why this priority**: quick access to receipts; the data and library page already exist in V2.

**Independent Test**: attach images and PDFs to transactions of the month, open the dashboard and verify counts, size, recent list and preview.

**Acceptance Scenarios**:

1. **Given** attachments on the user's transactions of the selected month, **When** the widget renders, **Then** it shows total count ("1 anexo" / "N anexos"), total size, and separate counts for images and PDFs (a count chip is hidden when zero).
2. **Given** more than 5 attachments, **When** the widget renders, **Then** it lists the 5 most recent by the transaction purchase date, descending, each with type icon, file name (full name on hover), transaction name, day/month and size.
3. **Given** a listed attachment, **When** the user activates it, **Then** a preview opens and the user can move across the listed attachments.
4. **Given** the footer link "Ver todos", **When** followed, **Then** it opens the attachments library.
5. **Given** no attachments in the month, **When** the widget renders, **Then** it shows "Nenhum anexo no período" with "Adicione comprovantes nos seus lançamentos para vê-los aqui.".
6. **Given** attachments of other users, **When** the widget renders, **Then** none appear.

---

### User Story 3 - Category history widget (Priority: P2)

A dashboard widget "Histórico de categorias" where the user picks up to 5 categories and sees their monthly amounts over about 10 months in one chart.

**Why this priority**: the V1 history page was merged into category trends in V2 (accepted), but the V1 dashboard-style picker over a fixed window is not covered; effort S.

**Independent Test**: pick categories in the widget, reload, and compare plotted values with category trends for the same months.

**Acceptance Scenarios**:

1. **Given** the widget, **When** it loads for a selected month, **Then** the window is the 8 months before it, the month itself and the next month (10 points).
2. **Given** no category selected, **When** the widget renders, **Then** it shows an empty prompt asking the user to choose categories and no chart.
3. **Given** the category picker, **When** it opens, **Then** categories are grouped as "Despesas" and "Receitas", already-selected ones are not offered, and the selection stops at 5.
4. **Given** categories selected, **When** the chart renders, **Then** each has a distinct color, values are absolute monthly totals of the user's own share (invoice payments excluded), months without data are zero.
5. **Given** selected categories, **When** the user removes one or clears all, **Then** the chart updates accordingly.
6. **Given** the user reloads the dashboard in the same browser session, **When** it loads, **Then** the previous selection returns (up to 5), dropping categories that no longer exist; a new session starts empty.
7. **Given** a parent category with child categories, **When** it is selected, **Then** its value includes its children, matching category trends.
8. **Given** the same months and categories, **When** compared with category trends, **Then** totals are identical.

---

### User Story 4 - Notifications: mark unread and unarchive (Priority: P3)

Verify and document that the V2 notification panel already supports marking read/unread and archiving/restoring, with V1 semantics preserved. No new capability expected.

**Why this priority**: inventory says "confirm mark-unread/unarchive in V2"; the check found the API and panel already support both directions, so this is acceptance coverage, not new work.

**Independent Test**: exercise the four state changes through the panel and the API.

**Acceptance Scenarios**:

1. **Given** an unread notification, **When** the user marks it read and then unread, **Then** it returns to "Nova" and the unread count updates.
2. **Given** an archivable notification, **When** the user archives it, **Then** it moves to "Arquivadas" and is considered read.
3. **Given** an archived notification, **When** the user restores it, **Then** it returns to the active list as read.
4. **Given** an action-required notification, **When** the user tries to archive it, **Then** the action is refused.
5. **Given** the underlying condition changes (new fingerprint), **When** the user acts on a stale notification, **Then** the action is refused with a conflict and the panel reloads.

### Edge Cases

- A user without an admin person gets empty states, not errors, on all three widgets.
- Hidden widgets and custom order of existing users are preserved; new widgets are appended and visible by default, and can be hidden or reordered like the others.
- A widget that fails to load shows the standard widget error state without affecting the rest of the grid.
- Long names are truncated with the full text on hover or in a list sheet.
- Amounts are shown through the existing money component (respecting the privacy toggle if V2 has one).
- Archived notifications cannot be marked unread (archived implies read): accepted V2 rule, differs from V1 where unread could be set on an archived item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each new widget MUST be a registry entry of the V2 dashboard (identifier, section, title, description, icon, optional wide flag, period-aware render) so it appears in the add-widget dialog and obeys hide, show, reorder and "restore default".
- **FR-002**: New widget identifiers MUST be accepted by saved preferences; users with saved layouts MUST keep their order and hidden set, with the new widgets appended and visible.
- **FR-003**: Each widget MUST load its own data for the selected dashboard period, be scoped to the authenticated user and use the user's own share (admin person), consistent with the other V2 widgets.
- **FR-004**: The spending overview widget MUST offer the two tabs described in US1, top 10 each, with the specified ordering, row content, empty states and exclusions by typed transaction origin (V1 name-text exclusions are dropped). The row rule is the establishments report purchase rule (expense, origin `regular`, not excluded from balance, not the invoice-payment category; paid and pending; admin share; recurring occurrences expanded), reused from the domain.
- **FR-005**: The spending overview widget MUST link to the establishments report (005).
- **FR-006**: The attachments widget MUST show the period summary (total count, total size, image count, PDF count), the 5 most recent attachments, preview, and a link to the attachments library, with the specified empty state. Scope is every attachment linked to the user's transactions of the period (all people), each attachment counted once.
- **FR-007**: The category history widget MUST let the user pick up to 5 categories (expense and income, grouped), plot a 10-month window (8 before, selected, 1 after), remember the selection for the browser session (`sessionStorage`), and drop stale category identifiers. Values come from the category trends report (no new backend).
- **FR-008**: Category history values MUST match category trends for the same categories and months.
- **FR-009**: Amounts MUST be computed in integer cents; rules for exclusions and grouping live in the domain, the widget only presents them.
- **FR-010**: Notifications: the system MUST keep supporting mark read, mark unread, archive and restore as described in US4; no behavior change is required. The acceptance scenarios MUST be covered by tests that fail if the behavior regresses.
- **FR-011**: Widgets MUST show loading, empty and error states in the standard V2 widget style, and be usable on mobile widths.

### Key Entities

- **Spending overview**: derived per period: top expenses list and establishment frequency list (no stored data).
- **Attachment summary**: derived per period: counts, size and recent items (existing attachments, no new storage).
- **Category history series**: derived per category and month (no new storage); selection is ephemeral browser state.
- **Notification state**: existing (read and archived timestamps per notification and fingerprint); unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a fixture month, the spending overview lists the same top 10 expenses and top 10 establishments, in the same order, as V1 for the same data (after the documented exclusion change).
- **SC-002**: A user adds each new widget from the add-widget dialog and sees its content in under 2 seconds on a typical month (up to 500 transactions).
- **SC-003**: Existing users with a saved dashboard layout see no change in their existing widget order or hidden set after the upgrade (0 regressions in preference tests).
- **SC-004**: Category history totals equal category trends totals for every selected category and month on a fixture (0 mismatches).
- **SC-005**: The four notification state transitions are covered by automated acceptance tests that pass.
- **SC-006**: No widget shows data from another user (0 leaks in tests).

## Assumptions

- Notifications: V2 already exposes the state change in both directions (API update with read and archived flags, panel buttons "Marcar como não lida" and "Restaurar"), so no implementation is planned; if a gap is found during planning it becomes a small fix inside this feature.
- Category history in V1 lived only on the history page (not in the V1 dashboard widget list); it is ported here as a dashboard widget, and the V1 page itself stays "accepted as merged into category trends".
- Default widget section: spending overview and category history in "Análises do período"; attachments in "Planejamento" next to notes. Final placement and the "wide" flag are decided in the mockup step.
- The 5-attachment and top-10 limits come from V1; "see all" patterns (list sheet) follow existing V2 widgets where more rows exist.
- Attachment scope is every attachment linked to the user's transactions of the period, across all of the user's people (library default), see Clarifications.
- Mobile clients out of scope; the web layout must still work on narrow screens.

## Dependencies

- Requires 005 (the spending overview links to the establishments report and shares its exclusion rules). Also relies on existing V2 attachments and category trends.
- Blocks 009 (calendar) in lane order only because of lane sequencing, not data.

## Source

V1 disposition: **kept** (tabs, limits, ordering, empty states, attachment summary, 10-month window and 5-category cap, session memory); **changed** (name-text exclusions replaced by typed origins, category history becomes a dashboard widget fed by category trends data, registry integration); **dropped** (V1 widget grid internals, V1 history page).

V1 evidence (`D:\Repos\daniel-cabral\openmonetis`): `src/features/dashboard/components/widgets/spending-overview-widget.tsx`, `top-establishments-widget.tsx`, `top-expenses-widget.tsx`, `attachments-widget.tsx`, `category-history-widget.tsx`, `src/features/dashboard/overview/current-period-overview-queries.ts` (`buildTopExpensesData`, `buildTopEstablishmentsData`, `shouldIncludeNamedItem`), `src/features/dashboard/categories/category-history-queries.ts`, `src/features/dashboard/fetch-dashboard-data.ts` (attachments snapshot), `src/features/attachments/queries.ts`, `src/features/dashboard/widget-registry/widget-config.tsx`, `src/features/dashboard/notifications/notifications-actions.ts`.

V2 code extended: `apps/web/src/features/dashboard/components/dashboard-widget-registry.tsx`, `packages/domain/src/dashboard.ts` (widget identifiers and preference normalization), `apps/api/src/routes/dashboard.ts`, `apps/web/src/features/category-trends/`, `apps/web/src/features/attachments/`, `apps/api/src/routes/notifications.ts`, `packages/domain/src/notifications.ts`, `apps/web/src/features/notifications/components/notification-row.tsx`.

Inventory rows covered: "Widget: spending overview (top expenses + top establishments)" (missing, port); "Widget: category history" (missing, port); "Widget: attachments of the period" (missing, port); "Dashboard notifications (read/unread, archive)" (partial, port; resolved as accept V2 plus tests).

## UI decisions

Previews (real app CSS compiled from `apps/web/src/styles/app.css`; regenerate with
`cd apps/web && pnpm dlx @tailwindcss/cli@4.3.4 -i ../../specs/010-dashboard-gaps/previews/preview.css -o ../../specs/010-dashboard-gaps/previews/app.css`):
`specs/010-dashboard-gaps/previews/option-a-v1-layout.html`, `option-b-dense.html`.

**Chosen: option A (V1 behaviour inside V2 patterns)**, decided autonomously. Rationale: closest to V1, reuses the 005 list rows and existing dashboard components, and stays readable on mobile.

- Registry: "Panorama de gastos" (icon `Wallet`) and "Histórico de categorias" (icon `ChartLine`) go in section "analysis"; "Anexos" (icon `Paperclip`) goes in "planning". New widgets are appended and visible by default.
- Panorama de gastos: normal width, `DashboardWidget` with shadcn `Tabs` ("Top gastos" / "Estabelecimentos"; `DashboardWidgetViewToggle` is a list/chart icon toggle, not tabs), 5 `DashboardWidgetRow`s (`EstablishmentLogo` with `editable={false}`, name, subline, `MoneyValue`) and `DashboardWidgetListSheet` for the remaining rows up to 10. Top gastos subline: purchase date (dd/MM). Footer link "Ver relatório de estabelecimentos" goes to `/reports/establishments` (preserving period). Empty: `DashboardWidgetEmptyState` with "Nenhuma despesa encontrada" or "Nenhum estabelecimento encontrado" and "Quando houver despesas registradas, elas aparecerão aqui.".
- Anexos: normal width. Summary chips ("N anexos", total size, "N imagens" and "N PDFs" hidden when zero) above 5 rows (type icon, file name with `title`, transaction name, dd/MM, size). Each row opens the existing `AttachmentPreviewDialog` over the 5 listed items. Footer link "Ver todos" goes to `/attachments` with the period. Empty: "Nenhum anexo no período" / "Adicione comprovantes nos seus lançamentos para vê-los aqui.".
- Histórico de categorias: `wide` true, selected-category chips (color dot, remove button, "Adicionar categoria", "Limpar") above a recharts line chart (10 months, `--chart-*` colors, `MoneyValue`-style formatting, hidden values in privacy mode). The picker is a shadcn Popover with Command, grouped "Despesas" / "Receitas", already-selected categories hidden, stops at 5. Empty prompt: "Escolha categorias para ver o histórico" / "Selecione até 5 categorias para comparar mês a mês.", no chart. Selection kept in `sessionStorage`.
- Discarded: option B (wide spending widget with side-by-side lists, normal-width bar chart, attachment stat tiles), because it breaks on mobile and bars become unreadable with 5 categories across 10 months.
