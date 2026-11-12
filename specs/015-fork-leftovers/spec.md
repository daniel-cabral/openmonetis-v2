# Feature Specification: Fork Leftovers (Settle Announcement, Subcategory Block, People Sharing Check)

**Feature Branch**: `015-fork-leftovers`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Invoice settle announcement, 'by subcategory' block on category page, people-sharing read-only/edit check (adapt only if V2 lacks it)" (roadmap row 015; inventory fork delta partial rows).

**Fork-only flag**: the settle announcement and the subcategory block are small fork additions that could be offered upstream as separate PRs; the people-sharing item is documentation and a regression guard only.

## Clarifications

### Session 2026-11-12

- Q: How does the server guarantee the recorded amount equals the announced one (FR-003)? → A: The client already sends explicit per-person allocation amounts; the server keeps recomputing the open balance and rejects any allocation above it (stale announcement), returning a typed error; the web then refetches the invoice and shows the refreshed announcement. No new "expected amount" field.
- Q: Where is the subcategory breakdown computed? → A: On the server: a pure domain function over integer cents (breakdown rows, percent to one decimal) fed by the same data set as the page's month total, exposed by the category-trends/category API; the web only renders it.
- Q: What URL value represents "Sem subcategoria"? → A: Search param `subcategory`: a child category uuid, or the literal `none`; anything else (unknown uuid or invalid value) is ignored.
- Q: What happens on a fully covered invoice? → A: The payment action stays visible but the dialog shows only the "already covered" message with confirmation disabled; the server rejects a zero/no-balance payment and creates no transaction.
- Q: Which recipient mutation paths does the regression guard cover (FR-012)? → A: Integration test: with an active connection, the recipient calls update/delete on the owner's transaction, person, account and card by id and gets 404; recipient listing of shared expenses stays read-only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know what a payment will record before confirming (Priority: P1)

Before confirming an invoice payment, the dialog tells the user the invoice value, how much is already covered, and exactly what the confirmation will record. A payment that records nothing is announced as such.

**Why this priority**: the V1 bug that motivated this (a phantom R$ 6.899,44 expense created without warning on an already covered invoice) is a financial-integrity risk; V2 shows only "saldo de X" today.

**Independent Test**: open the payment dialog on invoices with no payments, partial payments and full coverage; check the announcement text and that confirming records exactly the announced amount.

**Acceptance Scenarios**:

1. **Given** an invoice of R$ 12.164,10 with nothing paid, **When** the user opens the payment dialog in "Fatura inteira" mode, **Then** it announces: invoice value R$ 12.164,10, already covered R$ 0,00, and that confirming will record a payment of R$ 12.164,10 from the chosen account.
2. **Given** an invoice of R$ 19.063,54 with R$ 7.320,62 already covered by earlier payments or credits, **When** the dialog opens, **Then** it announces invoice value, R$ 7.320,62 already covered and that confirming will record R$ 11.742,92.
3. **Given** the "Valor parcial" mode with an amount typed, **When** the amount changes, **Then** the announcement updates to that amount and shows the amount that would remain after it.
4. **Given** the "Registrar parte da pessoa" mode, **When** a person is chosen, **Then** the announcement reflects that person's amount and whether it moves an account or is an external person's payment without account movement.
5. **Given** an invoice already fully covered, **When** the user reaches the payment action, **Then** the screen says the invoice is already covered and that nothing will be recorded, and confirming (if reachable) creates no transaction.
6. **Given** the announcement is shown, **When** the user confirms, **Then** the recorded amount equals the announced amount to the cent; when the invoice changed in between so that the announced amount no longer fits the open balance, nothing is recorded, the announcement refreshes and the user must confirm again.
7. **Given** an amount above the open balance, **When** the user tries to confirm, **Then** it is rejected (existing server rule is kept) with a clear PT-BR message.

---

### User Story 2 - See a category's month broken down by subcategory (Priority: P2)

On a category page, a "Por subcategoria" block under the header statistics shows how the month's total splits across the category's subcategories, and clicking a row filters the transaction list.

**Why this priority**: V2 already has child categories and an aggregated total on the page, but not the breakdown or the filter; effort S.

**Independent Test**: seed a parent category with children and direct transactions in one month and verify rows, percentages, sum and the filter.

**Acceptance Scenarios**:

1. **Given** Moradia in 10/2026 with Aluguel R$ 2.800,00, Condomínio R$ 650,00, Faxina R$ 480,00, IPTU R$ 312,40 and R$ 189,90 directly in Moradia, **When** the page opens, **Then** the block shows five rows in that order with 63,2%, 14,7%, 10,8%, 7,0% and 4,3%, the last labeled "Sem subcategoria", summing to R$ 4.432,30 equal to the page's month total.
2. **Given** the block, **When** the user clicks "Faxina", **Then** the transaction list shows only Faxina transactions of the period, the row is highlighted, and the filter appears in the URL.
3. **Given** an active filter, **When** the user clicks the same row again, **Then** the filter clears and the full list returns.
4. **Given** "Sem subcategoria" is clicked, **When** the list updates, **Then** it shows only transactions recorded directly in the parent category.
5. **Given** a category with no subcategories, **When** the page opens, **Then** no block appears.
6. **Given** a child category page, **When** it opens, **Then** no block appears (one level only).
7. **Given** subcategories that have no transactions in the month, **When** the block renders, **Then** those subcategories are omitted; if every transaction is directly in the parent, the block shows a single "Sem subcategoria" row at 100%.
8. **Given** a month with no transactions in the category, **When** the page opens, **Then** the block shows no rows or an empty note and percentages are zero, never NaN.
9. **Given** the person scope of the page (own share, all, or a person), **When** it changes, **Then** the block recomputes with the same scope, and the sum still equals the page total.
10. **Given** an unknown subcategory identifier in the URL, **When** the page loads, **Then** the filter is ignored and the full list shows.

---

### User Story 3 - People sharing: confirm V2 behavior, no edit rights (Priority: P3)

Document and guard that a person connection gives the recipient no edit rights over the owner's data. V1 had a `permission` column but only ever stored "read"; V2 connections never grant write access.

**Why this priority**: closes the inventory question "does V2 distinguish read-only vs edit?" with an explicit decision and a regression test; no new capability.

**Independent Test**: with an active connection, the recipient tries to read the shared items through the supported paths and to modify the owner's data through the owner's endpoints.

**Acceptance Scenarios**:

1. **Given** an active connection between an owner and a recipient, **When** the recipient lists shared expenses, **Then** they see only the items shared with them, read-only, and can import them into their own records.
2. **Given** the same connection, **When** the recipient tries to create, edit or delete any owner transaction, person, account or card, **Then** it is rejected as not found.
3. **Given** a revoked connection, **When** the recipient lists shared items, **Then** nothing new is delivered.
4. **Given** the connection model, **When** reviewed, **Then** no permission level is stored or accepted anywhere in the invitation, claim or confirm flow.

### Edge Cases

- Announcement with split payments: the announced amount is the one for the chosen mode, not the invoice total, and states whether an account is debited.
- Announcement while the invoice data is loading or fails: confirmation is disabled and a retry is offered, instead of showing wrong numbers.
- Payments made in another tab: the server balance wins; the user sees the refreshed announcement before anything is recorded.
- Credits (typed invoice credit lines from reconciliation 003, when present) count as "already covered" in the announcement; before 003 lands, only payments count.
- Subcategory block rounding: percentages to one decimal; the displayed amounts always sum to the page total (cents-exact), percentages may differ from 100,0% by rounding only.
- Percent of a subcategory with R$ 0,00 total never divides by zero.
- Filter by subcategory combines with existing list filters and survives reload via the URL.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The invoice payment dialog MUST announce, before confirmation: the invoice value, the amount already covered (payments and credit lines), and the amount the confirmation will record, per selected payment mode.
- **FR-002**: When nothing remains to pay, the UI MUST state that the invoice is already covered and that nothing will be recorded; no transaction is created in that case.
- **FR-003**: The announced amount MUST equal the amount recorded. The client sends explicit allocation amounts (no extra "expected amount" field); when an allocation exceeds the person's current open balance on the server (stale announcement, e.g. paid in another tab) or a concurrent payment changes the paid total, the payment MUST be refused with a typed error, nothing is recorded, and the dialog shows the refreshed numbers. An allocation still within the current balance is recorded exactly as announced.
- **FR-004**: The server MUST keep rejecting payments that are zero, negative or above the open balance, using calculations done on the server.
- **FR-005**: Announcement copy MUST be in PT-BR and use the V1 phrasing as reference: "Fatura de {valor}, {abatido} já abatidos. Confirmar vai registrar {pagamento}." and "Os pagamentos e créditos do período já cobrem esta fatura. Nada será lançado."
- **FR-006**: The category page MUST show a "Por subcategoria" block for the selected period when the category has child categories: one row per child with transactions in the period (name, proportional bar, amount, percent), ordered by amount descending, plus "Sem subcategoria" last when the parent has direct transactions.
- **FR-007**: The block amounts MUST sum to the month total shown on the page for the same person scope, and use the same data set (including recurring projections, if the page total includes them).
- **FR-008**: Clicking a block row MUST filter the page's transaction list by that subcategory (or by "no subcategory"); clicking again MUST clear it; the filter MUST live in the URL as `subcategory=<child uuid>|none` and ignore unknown or invalid values.
- **FR-009**: The block MUST NOT appear for categories without children or on a child category page.
- **FR-010**: The breakdown MUST be computed on the server in a pure domain function. Percentages MUST be computed from integer cents, rounded to one decimal, and be zero when the total is zero.
- **FR-011**: The system MUST NOT introduce a permission level (read-only versus edit) into person connections; the recipient's access remains limited to read-only shared items and importing them into their own records.
- **FR-012**: Cross-user isolation tests MUST assert that a connection recipient cannot mutate any owner data (regression guard for the V1 `permission` question).
- **FR-013**: The decision "V1 payer shares map to V2 connections; shares are recreated, not migrated" MUST remain documented for the ETL (016) in this spec's Source section.

### Key Entities

- **Invoice payment announcement**: derived view of an invoice and a chosen payment mode: value, covered, to-record, remaining after.
- **Subcategory breakdown row**: derived per child category (or "none") for a category, period and person scope: amount, percent.
- **Person connection**: existing V2 entity; unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested payment modes the amount recorded equals the amount announced; announcing nothing-to-record never creates a transaction.
- **SC-002**: The V1 incident fixture (invoice with R$ 7.320,62 of credits and payments) announces "11.742,92" to record and not the gross total.
- **SC-003**: For the V1 October example the block shows exactly five rows with 63,2 / 14,7 / 10,8 / 7,0 / 4,3 percent and a R$ 4.432,30 sum equal to the page total.
- **SC-004**: Filtering by a subcategory and clearing it takes one click each and survives a reload.
- **SC-005**: Recipient mutation attempts on owner data are rejected in 100% of cases in tests.

## Assumptions

- People sharing resolution: V2 `person_connections` has no read-only/edit field; the V1 `compartilhamentos_pagador.permission` was always inserted as "read" (V1 join action) and the recipient in V2 receives shared items as read-only external expenses to import. Decision: **accept V2**, document only; no adaptation needed.
- V2 invoice payments are allocated per person and may be partial; the announcement therefore speaks of "pagamento", not the V1 "despesa de complemento". The V1 complement concept does not exist in V2 and is not recreated.
- Credit lines (typed origin) arrive with reconciliation closure (003); this spec only requires that whatever the server counts as covered is what the dialog shows.
- Subcategory model is the accepted V2 child-category model (inventory decision); bulk "set subcategory" and import memory are accepted V2 and out of scope.
- The block is part of the category page header card; exact placement is decided in the mockup step.

## Dependencies

- None functionally. Compatible with 003 (credit lines) once merged but does not wait for it. Lane position (after 013) is sequencing only.

## Source

V1 disposition: **kept** (announce before write, covered-by-credits message, block rows/order/percent/sum rule, click filter and clear, hidden when no subcategories); **changed** (announcement adapted to V2 per-person payment modes; breakdown built over V2 child categories and person scope); **dropped** (V1 complement-expense wording, V1 `permission` column).

V1 evidence (`D:\Repos\daniel-cabral\openmonetis`): `openspec/changes/allow-invoice-credit-lines/proposal.md` and its `specs/invoice-closure-correction/spec.md` ("Quitação anuncia o complemento antes de gravar"), `openspec/specs/invoice-payment/spec.md`, `src/features/invoices/components/invoice-summary-card.tsx` (`complementDescription`, commit 82da8cc / 9b48d72), `openspec/specs/subcategories/spec.md` ("Página da categoria mostra o detalhamento por subcategoria"), `src/features/categories/lib/subcategory-breakdown.ts` and `subcategory-breakdown.test.ts`, `src/features/payers/actions.ts` (share insert with `permission: "read"`), `src/db/schema.ts:306`.

V2 code extended: `apps/web/src/features/invoices/components/invoice-payment-dialog.tsx`, `apps/api/src/services/invoices.service.ts`, `apps/web/src/features/cards/components/card-invoices-page.tsx`, `apps/web/src/features/categories/components/category-transactions-page.tsx`, `apps/web/src/routes/categories_.$categoryId.tsx`, `apps/web/src/features/category-trends/components/category-trends-list.tsx`, `apps/api/src/routes/person-connections.ts`, `apps/api/src/services/person-connections.service.ts`, `apps/api/src/routes/external-expenses.ts`.

Inventory rows covered: "Settle announcement on invoice payment" (partial, port); "Category page 'By subcategory' block with filter" (partial, port); "Payer sharing (code, join, leave, regenerate)" (remodelled, accept V2 if it has read-only vs edit rights, else adapt: resolved as accept V2); data mapping row `compartilhamentos_pagador` (recreate shares instead of migrating).

## UI decisions

Previews (temporary, not committed): `previews/015/payment-dialog-{a,b}.html`, `previews/015/category-subcategories-{a,b}.html`, compiled from the real `apps/web/src/styles/app.css`. Chosen autonomously (closest to V1 within V2 patterns).

- **Payment dialog: option A (inline callout).** A `rounded-md bg-muted px-3 py-2 text-sm` paragraph above the dialog footer (same pattern as the existing "não movimenta suas contas" notice) carrying the V1 sentence of FR-005; partial mode appends "Restará {valor}."; person mode states whether an account is debited. Fully covered: callout shows the "já cobrem esta fatura. Nada será lançado." message and confirm is disabled. Loading: skeleton in place of the callout, confirm disabled; error: short PT-BR message with a "Tentar novamente" button.
- **Discarded:** option B (summary `dl` with 4 lines) duplicates numbers already shown by the dialog header and departs from the V1 single-sentence announcement.
- **Subcategory block: option A (inside the header card).** Rendered through the `details` slot of `FinancialSummaryHeader`, under the metrics: title "Por subcategoria", rows as `button` with `aria-pressed` (name, `Progress` bar, amount, percent), active row highlighted, click again clears. Empty month: short note "Sem lançamentos no período." Loading: `Skeleton` rows.
- **Discarded:** option B (separate `Card` between header and list) adds a third vertical block; the spec and V1 place it under the header statistics.
