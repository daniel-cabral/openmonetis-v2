# Feature Specification: Trips

**Feature Branch**: `004-trips`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Trips entity, CRUD + menu, trip field on transactions (propagation rules), trip page with net cost and breakdowns, suggestions, bulk set trip" (roadmap row 004; inventory fork delta rows for trips).

**Fork-only flag**: no upstream signal for trips (inventory section 2). This feature is fork-only until the maintainer shows interest; it must still follow AGENTS.md and the upstream-compatible shape.

## Clarifications

### Session 2026-11-11

Answered autonomously (user unavailable) from the inventory, the V1 code and the current V2 code; each answer carries its rationale.

- Q: How does "Definir viagem" in the bulk bar treat ineligible rows (transfers, system origins, recurring occurrences)? → A: The web pre-filters the selection with the shared domain eligibility rule and reports "N atualizados, M ignorados"; the API rejects the whole batch if any id is ineligible or foreign. Recurring occurrences (rows without a stored record) are always counted as ignored in bulk. Rationale: this is exactly how every existing V2 bulk action works (`selectBulkTransactionIds` + `canApplyBulkTransactionAction`), and bulk ids are stored-record UUIDs only.
- Q: When a transaction is saved, when does the trip field change any row? → A: `tripId` omitted = untouched (no row changes); `tripId: null` = unlink only the edited row (or the edited occurrence); a trip id that differs from the row's stored trip = link with propagation (whole installment series). Same value as stored = no-op. Rationale: V1 `single-actions.ts` rule (present and different), which is what keeps 7/10 unlinked when 3/10 is re-saved.
- Q: Which amount counts toward net cost and breakdowns, and what is the user's own share in V2? → A: The booked amount (`amount`, paid or unpaid; for a recurring occurrence the occurrence amount after per-occurrence overrides). Own share = the admin person's split share when the transaction has split shares, otherwise the whole amount when the transaction's person is the admin, otherwise zero. Expenses = own expense shares; reimbursements = own income shares (regular income and refunds). Rationale: V1 summed `valor` of admin rows; V2 replaces split groups with split shares, so the admin share is the split amount.
- Q: How is a recurring occurrence identified for its trip link, and what happens when the series is rescheduled? → A: By (recurring series, occurrence date). Creating a recurring entry with a trip links only the occurrence on the entry date. A link whose date no longer yields an occurrence (skipped, rescheduled, stopped) is ignored by the trip page, list counts and summaries; it is not shown and does not count. Rationale: V2 occurrences are expanded from rules, and the existing per-occurrence state (`recurring_transaction_occurrences`) is keyed the same way; ignoring orphans avoids hooking into every recurrence edit path.
- Q: What do the trips list "linked count" and ordering mean? → A: Linked count = number of linked rows the trip page lists (stored transactions, each installment counted, plus valid recurring occurrences); net cost uses the FR-014 rule; list ordered by start date descending, ties by name (pt-BR). Rationale: V1 counted linked rows (`count(transactions.id)`) and ordered by start desc.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register trips and see what they cost (Priority: P1)

The user creates a trip (name, start and end date, optional note), links transactions to it and opens the trip page to see the net cost of the trip and where the money went.

**Why this priority**: the net cost per trip is the whole point of the feature; V1 production data already carries trips that the ETL (016) must land somewhere.

**Independent Test**: create "Lisboa" (12/05 to 22/05), link expenses and one reimbursement, open the trip page and check net cost, expenses, reimbursements and the three breakdowns.

**Acceptance Scenarios**:

1. **Given** no trips, **When** the user creates "Lisboa" from 12/05/2026 to 22/05/2026, **Then** it appears in the trips list and is reachable from the "Viagens" menu entry.
2. **Given** "Lisboa" exists, **When** the user creates "Porto" from 20/05 to 25/05, **Then** creation is rejected with a message naming "Lisboa" and its dates, and nothing is saved.
3. **Given** "Lisboa" exists, **When** the user edits "Lisboa" to extend its own end date, **Then** it saves (a trip never conflicts with itself).
4. **Given** a one-day trip (start equals end), **When** it is created, **Then** it saves.
5. **Given** an end date before the start date, **When** the user submits, **Then** the form shows a PT-BR validation message and nothing is saved.
6. **Given** a trip with R$ 9.212,30 of the user's own expenses and R$ 800,00 of linked income of the user, **When** the trip page opens, **Then** net cost shows R$ 8.412,30, expenses R$ 9.212,30 and reimbursements R$ 800,00.
7. **Given** a R$ 300,00 dinner split between the user (R$ 150,00) and Ana (R$ 150,00) linked to the trip, **When** the trip page opens, **Then** net cost adds only R$ 150,00 and the by-person breakdown shows Ana with R$ 150,00.
8. **Given** linked transactions, paid and unpaid, **When** the trip page opens, **Then** both count toward the totals.
9. **Given** a trip with no linked transactions, **When** it opens, **Then** totals are zero and the breakdowns are empty.
10. **Given** "Lisboa" has 24 linked transactions, **When** the user deletes it after confirming ("Os lançamentos continuam existindo, só deixam de pertencer a esta viagem."), **Then** the 24 transactions remain, without a trip.

---

### User Story 2 - Link a transaction to a trip while entering it (Priority: P1)

In the transaction form a "Viagem" field is prefilled from the purchase date and can be cleared or changed. The link follows fixed propagation rules.

**Why this priority**: without correct linking, the trip total is wrong; propagation rules are the most error-prone part of V1 and are covered by V1 tests.

**Independent Test**: create transactions of each condition (single, installment, split, recurring) and edit the link; verify which rows change.

**Acceptance Scenarios**:

1. **Given** "Lisboa" 12/05 to 22/05, **When** the user starts a new transaction with purchase date 14/05/2026, **Then** "Viagem" comes prefilled with "Lisboa".
2. **Given** the same trip, **When** the user enters a ticket dated 02/03 and picks "Lisboa" manually, **Then** it is saved linked to "Lisboa" (any own trip can be chosen regardless of date).
3. **Given** a prefilled trip, **When** the user clears the field, **Then** the transaction is saved without a trip.
4. **Given** a transfer, an invoice payment or another system-generated transaction (invoice adjustment/credit, balance adjustment, person settlement), **When** its form or row is shown, **Then** no "Viagem" field is offered and the API refuses to link it.
5. **Given** a 10-installment purchase, **When** the user links installment 1/10 to "Lisboa" with any edit scope, **Then** all 10 installments are linked.
6. **Given** all 10 installments linked, **When** the user unlinks installment 7/10, **Then** only 7/10 is unlinked and the other 9 stay linked.
7. **Given** installment 7/10 was unlinked, **When** the user edits installment 3/10 without touching "Viagem", **Then** 7/10 stays unlinked.
8. **Given** a split transaction shared with Ana, **When** it is linked to "Lisboa", **Then** the whole transaction (and therefore every person's share) belongs to the trip.
9. **Given** a recurring series (e.g. "Netflix"), **When** the user links the May occurrence to "Lisboa", **Then** only the May occurrence is linked; other months and the series rule stay without a trip, and no other occurrence gets materialized.
10. **Given** a linked recurring occurrence, **When** the user unlinks it, **Then** only that occurrence changes.
11. **Given** a trip id that belongs to another user, **When** it is submitted on any write, **Then** the write is rejected as not found and nothing changes.

---

### User Story 3 - Suggestions: link what already happened in the trip dates (Priority: P2)

The trip page lists unlinked transactions dated inside the trip, so the user can link them in bulk instead of editing one by one.

**Why this priority**: most trip spending is entered before the trip exists; this is how V1 users actually populate trips.

**Independent Test**: with unlinked transactions inside and outside the date range, open the trip and link a selection.

**Acceptance Scenarios**:

1. **Given** unlinked "Uber 13/05" and "Pingo Doce 14/05" inside "Lisboa", **When** the user selects both and confirms, **Then** both become linked and leave the suggestions.
2. **Given** unlinked transactions outside the trip dates, linked ones, transfers and invoice payments, **When** suggestions load, **Then** none of those appear.
3. **Given** an installment series with all installments in range, **When** suggestions load, **Then** the series appears once, and linking it links every installment.
4. **Given** recurring occurrences inside the range, **When** suggestions load, **Then** each occurrence is its own suggestion.
5. **Given** more than 20 suggestions, **When** the list loads, **Then** it is paginated at 20 per page, an out-of-range page is clamped into range, and an empty list shows an empty state.
6. **Given** suggestions from several cards and accounts, **When** the user filters by origin, **Then** the options are: all, only cards, only accounts, then each card and each account once, sorted by name; the list narrows accordingly.
7. **Given** a page of suggestions, **When** the user uses "select page" or "select all", **Then** the selection covers the page or the whole filtered list, and batch link applies to it.
8. **Given** an empty selection, **When** the user tries to link, **Then** the action is rejected.
9. **Given** linked transactions on the trip page, **When** the user unlinks one, **Then** only that row is unlinked (same rule as US2 scenario 6).

---

### User Story 4 - Set the trip in bulk from the transaction list (Priority: P3)

The bulk selection bar of the transactions list offers "Definir viagem" (choose a trip or "Sem viagem").

**Why this priority**: convenience on top of US2 and US3; V1 offered it inside the bulk-update action.

**Independent Test**: select mixed transactions in the list, set a trip, verify propagation and ineligible handling.

**Acceptance Scenarios**:

1. **Given** a selection with a regular expense and an installment row, **When** the user sets "Lisboa", **Then** both are linked and the installment's whole series is linked.
2. **Given** a selection that includes a transfer, **When** the user sets a trip, **Then** the transfer is skipped and the user is told how many rows were updated and how many ignored.
3. **Given** a selection, **When** the user picks "Sem viagem", **Then** only the selected rows are unlinked (no propagation on unlink).

### Edge Cases

- Two trips that share a single boundary day are an overlap (ranges are inclusive).
- Impossible dates (e.g. 31/02) are rejected; name is required, trimmed, at most 60 characters; note is optional, at most 500, empty note stored as none.
- A trip's date range may be edited so that linked transactions fall outside it; they stay linked (the range only drives prefill and suggestions).
- Deleting a trip that is the active filter in a report must not break that report (the filter falls back to "all", see 005).
- Money is summed in integer cents; no floating-point drift on totals and breakdowns.
- Labels for missing data: "Sem categoria", "Sem cartão ou conta", "Sem pessoa".
- A user without an admin person (no own share to compute) sees zero totals instead of an error.
- Breakdown ordering: amount descending, ties by label in pt-BR order.
- A recurring occurrence link whose date no longer yields an occurrence (skipped, rescheduled, stopped series) is ignored by the trip page, counts and summaries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store trips as their own entity per user (name, start date, end date, optional note); trips are not tags and not a tag specialization.
- **FR-002**: Users MUST be able to create, edit, list and delete their own trips; every operation is scoped to the authenticated user and a foreign trip id is treated as not found.
- **FR-003**: Trip name MUST be required, trimmed, max 60 characters; note optional, max 500; start and end MUST be real calendar dates with end on or after start; messages shown in PT-BR.
- **FR-004**: The system MUST reject a trip whose inclusive date range overlaps another trip of the same user (excluding itself on edit), with a message naming the conflicting trip and its dates.
- **FR-005**: Deleting a trip MUST unlink its transactions without deleting them, after an explicit confirmation.
- **FR-006**: A "Viagens" entry MUST exist in the app navigation, leading to the trips list (name, period, linked count, net cost; start date descending, ties by name; empty state "Nenhuma viagem ainda") and from there to each trip page.
- **FR-007**: A transaction MUST be linkable to at most one own trip, independent of its date.
- **FR-008**: When a new transaction is created, the form MUST prefill the trip whose range contains the purchase date; the user can clear or change it.
- **FR-009**: Transfers and system-generated transactions (invoice payment, invoice adjustment/credit, account balance adjustment, person settlement) MUST NOT be linkable, MUST NOT show the field, and MUST be excluded from suggestions and bulk linking. Regular income and expense (including refunds/reimbursements) are linkable.
- **FR-010**: Linking an installment transaction MUST link every installment of its series regardless of edit scope; unlinking MUST affect only the given installment.
- **FR-011**: Linking a transaction with split shares MUST link the whole transaction, so every share belongs to the same trip.
- **FR-012**: For a recurring series the link MUST be stored per occurrence, identified by (series, occurrence date): linking or unlinking one occurrence MUST NOT change the series rule or other occurrences, and MUST NOT materialize unrelated occurrences. A link whose date no longer yields an occurrence is ignored everywhere.
- **FR-013**: Saving a transaction without touching the trip field MUST NOT change the trip of any other row. An omitted trip field changes nothing; `null` unlinks only the edited row or occurrence; a trip different from the stored one links with FR-010 propagation; the stored value re-sent is a no-op.
- **FR-014**: The trip page MUST show net cost = (own expenses) minus (own linked income/reimbursements), plus the expenses and reimbursements figures, counting paid and unpaid rows at their booked amount (recurring occurrences at their occurrence amount), computed in integer cents. "Own" means the admin person's split share when the transaction is split, otherwise the whole amount when its person is the admin, otherwise zero. Reimbursements are the own share of linked income (regular income and refunds).
- **FR-015**: The trip page MUST show breakdowns of expenses by category, by card or account, and by person; the person breakdown includes every person's expense shares, while category and card/account breakdowns and net cost count only the user's own share.
- **FR-016**: The trip page MUST list linked transactions and allow unlinking each.
- **FR-017**: Suggestions MUST list unlinked, eligible transactions with purchase date inside the trip range; installment series appear once, recurring occurrences individually.
- **FR-018**: Suggestions MUST support pagination (20 per page, clamped page), origin filter (all, cards, accounts, a specific card, a specific account), select page, select all, and batch link of the selection; an empty selection is rejected.
- **FR-019**: The transactions bulk bar MUST offer "Definir viagem" with a "Sem viagem" option, applying FR-009 to FR-012 and reporting updated and ignored counts. The web pre-filters ineligible rows and recurring occurrences (counted as ignored); the API rejects a batch containing any ineligible or foreign id.
- **FR-020**: Trips and links MUST be exposed through the API with OpenAPI contracts and Zod validation, following the AGENTS.md feature shape; financial rules (net cost, eligibility, propagation, overlap) live in the domain.
- **FR-021**: Trip data MUST be reachable by the V1 ETL (016): trips and the transaction-to-trip link, including per-occurrence links of recurring series, can be loaded.
- **FR-022**: Other features (005 report filter) MUST be able to read a user's trips and the trip of each transaction/occurrence. The "min and max period of a trip's linked rows" read is built by 005, its only consumer, on top of the 004 link tables (decision: no speculative read in 004).

### Key Entities

- **Trip**: belongs to one user; name, start date, end date (inclusive), optional note. No overlap within a user.
- **Trip link**: association of a transaction (or a single recurring occurrence) to at most one trip. Absent link means "no trip".
- **Trip summary**: derived, never stored: net cost, expenses, reimbursements, breakdowns by category, source (card or account) and person.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the V1 fixture (R$ 9.212,30 expenses and R$ 800,00 reimbursement) the trip page shows net cost R$ 8.412,30, identical to V1.
- **SC-002**: Linking one installment of a 10-installment purchase links 10 of 10; unlinking one leaves 9 of 10 linked, in 100% of attempts.
- **SC-003**: A user can link 20 suggested transactions to a trip in a single confirmation.
- **SC-004**: No transaction, occurrence or trip of another user is readable or writable through any trip operation (zero cross-user leaks in tests).
- **SC-005**: Overlap, eligibility, propagation and net-cost rules pass the V1 test cases ported to V2 (overlap with self, single-day trip, 7/10 unlink, recurring per-occurrence, split admin share, empty admin).
- **SC-006**: Deleting a trip never deletes a transaction (count before equals count after).

## Assumptions

- Trips are redesigned for V2 as a dedicated entity (inventory decision), not tags; the upstream overlap check ("could tags model a trip") is answered: no, because trips need a non-overlapping date range, propagation rules and a net-cost page.
- V1 "split group" rows become, in V2, one transaction with split shares; "link the whole group" is therefore automatic. This is a change from V1 (kept behavior, simpler model).
- V1 excluded transfers and `AUTO_FATURA` notes; V2 expresses the same intent through typed origins and also excludes the other system origins. Note-prefix checks are dropped.
- "Own" share = admin person, as in V1 (admin payer); a person selector on the trip page is out of scope.
- Bulk ignore behavior (count of updated and ignored rows) mirrors the existing V2 bulk actions (web pre-filter plus strict API); V1 did not report counts for trips.
- Trip field on a recurring entry applies only to the occurrence on the entry date, never to the rule.
- Mobile clients are out of scope.

## Dependencies

- None (first feature of lane B). Feeds 005 (report filter), 010 (via 005) and 016 (ETL of V1 `viagens` and `viagem_id`).
- Does not depend on lane A (reconciliation); touches the transaction form and bulk bar, which are shared hotspots (inventory section 2): keep hooks small.

## Source

V1 disposition: **kept** (overlap rule, inclusive ranges, prefill by date, propagation rules, net cost definition, suggestions with dedupe, origin filter, pagination 20); **changed** (own entity in V2 schema, split group becomes shares, typed origins instead of note prefix, per-occurrence link on recurrence occurrences); **dropped** (V1 note-prefix eligibility, `viagem_id` column naming).

V1 evidence (`D:\Repos\daniel-cabral\openmonetis`): `openspec/specs/trips/spec.md`, `openspec/specs/trip-report-filter/spec.md`, `src/features/trips/actions.ts`, `queries.ts`, `lib/overlap.ts`, `lib/summary.ts`, `lib/suggestions.ts`, `lib/suggestion-view.ts`, `lib/schemas.ts`, `components/trip-suggestions.tsx`, `src/shared/lib/trips/link.ts`, `eligibility.ts`, `find-trip-for-date.ts`; tests `actions.test.ts`, `link-actions.test.ts`, `overview.test.ts`, `queries.test.ts`, `lib/overlap.test.ts`, `lib/summary.test.ts`, `lib/suggestion-view.test.ts`, `shared/lib/trips/link.test.ts`, `eligibility.test.ts`.

V2 code extended: `packages/db/src/schema.ts` (`transactions`, `transactionSplits`, `recurringTransactionOccurrences`, `installmentSeries`), `packages/domain/src/transactions.ts`, transaction form and bulk bar in `apps/web/src/features/transactions/`.

Inventory rows covered (fork delta 1.2): Trip CRUD + "Viagens" menu; Trip field on entry; Trip page net cost and breakdowns; Trip suggestions; Bulk set trip. The report-filter row belongs to 005. Data mapping row `viagens` / `lancamentos.viagem_id` (section 3) is served by FR-021.

## UI decisions

Previews (real app CSS compiled from `apps/web/src/styles/app.css`; regenerate with
`cd apps/web && pnpm dlx @tailwindcss/cli@4.3.4 -i ../../specs/004-trips/previews/preview.css -o ../../specs/004-trips/previews/app.css`):
`specs/004-trips/previews/option-a-single-page.html`, `option-b-tabs.html`, `form-and-bulk.html`.

**Chosen: option A (single scrolling page, card grid list)**, decided autonomously. Rationale: it is the V1 layout and section order (header, summary, three breakdowns, linked list, suggestions), built only from existing V2 pieces, so users migrating from V1 find the same page.

- Trips list: `PageHeader` (eyebrow "Organização", icon `Plane`, action "Nova viagem") plus a card grid like `people-grid.tsx` (`grid gap-4 md:grid-cols-2 xl:grid-cols-3`); each card shows name, period, "{n} lançamento(s)" and net cost, links to `/trips/$tripId`. Empty state: inline `Card role="status"` "Nenhuma viagem ainda" / "Crie uma viagem para juntar os gastos dela em um só lugar." with the create button.
- Navigation: "Viagens" entry in the "Organização" section of `components/navigation/nav-items.tsx`, icon `Plane`, description "Quanto custou cada viagem".
- Trip page: `FinancialSummaryHeader` (`variant="soft"`) with primary "Custo líquido" and metrics Despesas, Reembolsos, Lançamentos; actions Editar / Excluir (confirmation "Excluir viagem?" + "Os lançamentos continuam existindo, só deixam de pertencer a esta viagem."). Then three `Card`s "Por categoria", "Por cartão ou conta", "Por pessoa" (`grid gap-6 xl:grid-cols-3`, empty "Nada por aqui ainda."), then "Lançamentos da viagem" with per-row "Desvincular", then "Sugestões (N)" with origin `Select` ("Origem"), table with page checkbox, "select all of filter" banner, "Vincular N selecionados" and the `transactions-pagination.tsx` footer style.
- Trip dialog: shadcn `Dialog` + TanStack Form with Nome, Início, Fim, Anotação ("Nova viagem" / "Editar viagem"), same pattern as `tag-dialog.tsx`/`tag-form.tsx`.
- Transaction form: "Viagem" single select (`components/forms/mobile-select.tsx`) inside the collapsible block of `transaction-advanced-fields.tsx`, before "Etiquetas"; option "Nenhuma"; hidden for transfers and system origins.
- Bulk bar: new "Viagem" icon action (`Plane`) in `transaction-bulk-action-dock.tsx`, a `MobilePicker` + `Command` picker copied from `transaction-bulk-category-picker.tsx` with "Sem viagem" first, then trips; toast reports updated and ignored counts.
- Discarded: option B (table list + tabs on the trip page), because tabs hide the suggestions that are the main way to populate a trip and break V1 muscle memory.
