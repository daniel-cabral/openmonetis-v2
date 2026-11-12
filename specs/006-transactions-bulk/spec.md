# Feature Specification: Transactions Mass-Add and Full Bulk Edit

**Feature Branch**: `006-transactions-bulk`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 mass-add dialog and the full V1 bulk edit (date, condition, person and the other V1 editable fields) to V2, expressed on top of V2 recurrence rules, installment series, transaction splits and people."

## Clarifications

### Session 2026-11-11

- Q: How does bulk edit change the paid state, and the boleto payment date? → A: Through the existing bulk settlement action of the selection dock (settle / undo), not the bulk-edit form. V2 forbids changing `isSettled` by edit and only accepts a boleto payment date together with settlement, so boleto payment date is not a bulk-edit field.
- Q: How is the edit scope chosen when the selection holds items of installment series? → A: One scope per bulk request (this item, this and following, whole series), applied to every installment item in the selection; single items ignore it. The dialog asks for it only when the selection contains installment items.
- Q: Are recurring occurrences editable in bulk? → A: No. V2 recurrence edits are versioned rule changes addressed by occurrence date; a selection containing a recurring item is rejected whole with "Lançamentos recorrentes devem ser editados individualmente." The existing single scoped recurring edit already provides V2 recurrence scopes (V1 parity for recurring series is kept there).
- Q: How do split transactions behave under bulk edit? → A: V2 models a split as shares of one transaction, so an edit always applies to the whole transaction (all shares); there is no "this person's share only" scope. A changed amount is reallocated proportionally across shares; changing the person of a split transaction is rejected with "Lançamentos divididos não podem trocar de pessoa em massa."
- Q: Does the paid-invoice rejection list the affected months? → A: No. It reuses the existing V2 code `INVOICE_ALREADY_PAID` with the PT-BR message "Uma das faturas de destino já está paga. Desfaça o pagamento antes de mover estes lançamentos." (keeps the API error contract unchanged).
- Plan-time decisions (orchestrator, 2026-11-11): (1) the API error envelope stays `{ error, message, code }`, with no row number; the mass-add dialog validates required fields and amount per row and names the row, while server ownership errors for rows show "Categoria não encontrada em uma das transações." / "Pessoa não encontrada em uma das transações."; (2) the paid-invoice rejection lists no months; (3) the settlement lock follows the full V2 list of financial fields; (4) bulk edit also blocks moving out of a paid invoice: when card, invoice period, date or amount changes on a card item, both the source and the destination invoices must be unpaid, so a paid invoice's total never changes; (5) the bulk write aborts the whole database transaction if any planned row is not updated (reported as not found).
- Analyze-time decisions (2026-11-12): (1) the installment offset is the installment number difference (FR-017), also for Story 3 #2; (2) SC-004 measures installment series only, since recurring items are rejected from bulk edit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mass-add several transactions in one dialog (Priority: P1)

A user registering a month of receipts or a card statement by hand wants to create many one-off transactions at once. They open "Adicionar em massa", choose the shared settings once (type, payment method, account or card, invoice period) and then fill one row per transaction (date, establishment, amount, category, person).

**Why this priority**: Highest-volume entry flow in V1 and the only fully missing capability in this feature. Independently shippable.

**Independent Test**: Open the dialog from the transactions page, fill shared settings and three rows, submit, and verify exactly three single-condition transactions exist with the shared settings applied.

**Acceptance Scenarios**:

1. **Given** the dialog is open with type "Despesa" and payment method credit card, **When** the user selects a card, keeps the default invoice period and submits three valid rows, **Then** three expense transactions are created on that card, all assigned to the invoice period shown in the dialog, and the user sees "3 lançamentos criados com sucesso."
2. **Given** the payment method is not credit card, **When** the user selects an account and submits, **Then** the transactions are created against that account, with no card, and as pending (not settled).
3. **Given** the payment method is credit card, **When** no card is selected, **Then** submit is blocked with "Selecione um cartão para continuar"; for other methods without an account the message is "Selecione uma conta para continuar".
4. **Given** one row lacks date, establishment or amount, **When** the user submits, **Then** nothing is created and "Preencha todos os campos obrigatórios das transações (data, estabelecimento e valor)" is shown.
5. **Given** the dialog has one row, **When** the user tries to remove it, **Then** the row stays and "É necessário ter pelo menos uma transação" is shown.
6. **Given** the user adds a new row, **When** the row appears, **Then** its date is pre-filled with the previous row's date and its person with the default person.
7. **Given** type "Receita", **When** the user opens a row's category list, **Then** only income categories are offered (and only expense categories for "Despesa").
8. **Given** the user typed data, **When** the user closes the dialog, **Then** a confirmation ("Descartar" / "Continuar editando") appears before discarding.
9. **Given** any row references a category or person that does not belong to the user or is no longer available, **When** submitted, **Then** nothing is created and "Categoria não encontrada em uma das transações." (or "Pessoa não encontrada em uma das transações.") is shown.

---

### User Story 2 - Edit extra fields on many selected transactions at once (Priority: P1)

A user who selected several transactions in the table wants to change purchase date, invoice period, due date, person, account or card, category, note or amount in one action. V2 today offers category, name, tag, trip, delete and settlement bulk actions.

**Why this priority**: Closes the V2 gap listed in the inventory (date, condition, payer and other fields). Independent of mass-add.

**Independent Test**: Select five single-condition transactions, bulk-change person and purchase date, and verify all five changed and no other field did.

**Acceptance Scenarios**:

1. **Given** several selected single transactions, **When** the user changes only the person, **Then** every selected transaction is reassigned to that person and untouched fields keep their values.
2. **Given** selected transactions, **When** the user sets a new purchase date, **Then** every selected transaction takes that date and recomputes its competence period and invoice the same way a single edit does.
3. **Given** selected transactions of mixed payment methods, **When** the user sets account, card or due date, **Then** the dialog states which fields do not apply to which payment method, and the action is rejected if the combination is invalid for any item.
4. **Given** selected expense and income transactions, **When** the user sets an amount, **Then** the sign convention is preserved per type (the value entered is positive, the type decides direction) and zero or negative is rejected.
5. **Given** a selection where at least one item is system-managed (invoice payment, initial balance, refund, transfer leg), **When** the user confirms any bulk edit, **Then** the whole action is rejected with "Lançamentos protegidos não podem ser atualizados em massa." and nothing changes (all-or-nothing, as in the other V2 bulk actions).
6. **Given** a selected credit card transaction that sits in, or would land in, an already paid invoice, **When** the user submits a change of card, purchase date, period or amount, **Then** the action is rejected with "Uma das faturas de destino já está paga. Desfaça o pagamento antes de mover estes lançamentos." (the same message covers a paid source invoice).
7. **Given** a selected item already settled (paid or received), **When** the change touches any financial field (V2 settlement rules: amount, dates, invoice period, person, account or card), **Then** the action is rejected asking to undo the settlement first.
8. **Given** the user marks the selection paid or pending, **When** confirmed through the existing bulk settlement action, **Then** each item follows V2 settlement rules (credit card items stay "pela fatura"); the bulk-edit form has no paid-state field.

---

### User Story 3 - Apply an edit to a whole series with an explicit scope (Priority: P2)

In V1, editing a transaction of a series asked "apenas este / este e os próximos / todos" and applied the changed fields to those items. The user expects the same when bulk-editing installment items in V2. Recurring items keep using the existing single scoped recurring edit (see Clarifications).

**Why this priority**: Required for V1 parity on series; secondary to the plain multi-select flow.

**Independent Test**: Bulk-edit category and due date of one installment with scope "este e os próximos" and verify earlier installments are untouched and later ones moved by the right month offsets.

**Acceptance Scenarios**:

1. **Given** a selection containing an item of an installment series, **When** the user submits a bulk edit, **Then** the user must pick one scope (this item only, this and following, whole series) applied to every installment item before anything is applied.
2. **Given** scope "este e os próximos" on an installment series, **When** the user changes the due date, **Then** each affected installment's due date moves by its installment number difference from the selected installment (in months, clamped to month end), preserving the monthly rhythm.
3. **Given** scope "este e os próximos" or "toda a série", **When** the user changes purchase date or invoice period, **Then** every affected item shifts by its own month offset from the edited item (V1 rule), not to the same absolute value.
4. **Given** a selection containing a recurring item, **When** the user submits a bulk edit, **Then** the whole action is rejected with "Lançamentos recorrentes devem ser editados individualmente." and nothing changes.
5. **Given** a transaction split among several people, **When** the user bulk-edits it, **Then** the change applies to the whole transaction (all shares), a new amount is reallocated proportionally across shares, and a change of person is rejected with "Lançamentos divididos não podem trocar de pessoa em massa."
6. **Given** the chosen scope would move any affected item into a paid invoice, **When** submitted, **Then** the whole action is rejected with the paid-invoice message and nothing changes.
7. **Given** a selection spanning several installment series, **When** the user submits, **Then** each series is processed with the single chosen scope anchored on its selected item, and the action is atomic across the whole selection.

---

### User Story 4 - Change condition in bulk (dropped)

Resolved (orchestrator, 2026-11-11): option (a). V1 never bulk-changed the condition; the roadmap wording was imprecise. Bulk edit does not change condition; mass-add keeps creating single ("à vista") entries.

**Acceptance Scenarios**:

1. **Given** the bulk-edit dialog, **When** the user opens it, **Then** there is no condition control, and a request carrying a condition is rejected by the API contract.

---

### Edge Cases

- A selection above the V2 bulk limit (500) is rejected before sending; mass-add above the same limit is rejected with a clear message.
- Submitting twice quickly must not duplicate mass-add transactions (submit disabled while pending).
- A mass-add row with a purchase date outside the chosen invoice period is allowed (the chosen period wins, as in V1) and the date stays as typed.
- Without a fixed invoice period (non-card methods), the competence period derives from each row's date.
- Month-end due dates when shifting by month offsets clamp to the last valid day of the month.
- A person removed between opening the dialog and submit produces "Pessoa não encontrada em uma das transações." and no partial creation.
- Bulk delete, category, rename and tag actions already exist and keep working with the same selection UI.
- Mass-added transactions appear immediately in lists, invoices and dashboard totals.
- V2 accepts child categories as ordinary categories, so the dialog has no separate subcategory field.

## UI decisions

Previews (real app CSS compiled with Tailwind from `apps/web/src/styles/app.css`): scratchpad `previews/mass-add.html` and `previews/bulk-edit.html` of the 006 worker session (not committed). Chosen autonomously (goal run), closest to V1 behaviour within V2 patterns.

- **Mass-add: option A.** Wide dialog (same width class as the transaction dialog): a "Configurações comuns" block on top (tipo, forma de pagamento, conta or cartão, fatura only for cartão) and a compact editable table of rows (data, estabelecimento, valor, categoria, pessoa, remover) with "Adicionar linha" below; row errors shown inline under the row; footer "Cancelar" / "Criar N lançamentos". Opened from `TransactionsCreateActions` ("Adicionar em massa"); on the card page the cartão is locked.
- **Bulk edit: option A.** Opened from a new "Editar" action of `TransactionBulkActionDock`; fixed list of fields, each with an "Alterar" checkbox enabling its input (data da compra, fatura, vencimento, pessoa, conta, cartão, categoria, observação, valor); an "Escopo das parcelas" radio group (Apenas este / Este e os próximos / Toda a série) appears only when the selection has installment items; an inline notice lists fields that do not apply to some selected payment methods.
- Discarded: mass-add B (side column + row cards: new layout, slower entry for 20 rows); bulk-edit B ("Adicionar campo" picker: extra popover state and a new component for no gain).

## Requirements *(mandatory)*

### Functional Requirements

**Mass-add**

- **FR-001**: The system MUST provide a mass-add dialog on the transactions page, and on a card's page with the card locked, where the user sets shared settings once (type, payment method, account or card, invoice period) and enters one or more rows (date, establishment, amount, category, person).
- **FR-002**: The system MUST require a card for credit card payment and an account for any other method, and reject submit with the messages in Story 1.
- **FR-003**: The system MUST create every mass-added transaction as single condition, without installments, recurrence, note or split.
- **FR-004**: The system MUST apply the sign convention by type (positive typed amount; expenses stored as outflows, income as inflows) and reject zero or negative amounts.
- **FR-005**: The system MUST create all rows atomically (all or none). The dialog MUST name the row for missing required fields or an invalid amount; a server ownership error for a row's category or person MUST show a generic PT-BR message ("... em uma das transações") without a row number.
- **FR-006**: The system MUST filter selectable categories by the chosen type and MUST require a category per row, in line with the V2 rule that income and expense transactions have a category.
- **FR-007**: The system MUST default each row's person to the user's default person and pre-fill a new row's date from the previous row.
- **FR-008**: The system MUST create non-card rows as pending and credit card rows as billed through the invoice; the invoice period is the one chosen in the dialog or, when none, derived from each row's date.
- **FR-009**: The system MUST warn before closing a dirty dialog and keep at least one row.
- **FR-010**: The system MUST apply the same side effects as a normal single create (invoice recalculation, person notification rules) and report the number created, with correct singular and plural.

**Bulk edit**

- **FR-011**: The system MUST let the user bulk-edit, over a multi-selection, purchase date, invoice period, due date, person, account, card, category, note and amount, in addition to the existing category, name, tag, trip, delete and settlement bulk actions (paid state is changed by the existing settlement action).
- **FR-012**: The system MUST apply only the fields the user explicitly changed and leave every other field untouched.
- **FR-013**: The system MUST reject the whole bulk action, changing nothing, when any selected item is system-managed (invoice payment, initial balance, refund, transfer leg) or incompatible with a requested field.
- **FR-014**: The system MUST reject, with the paid-invoice message and without listing months, any bulk edit that changes card, invoice period, date or amount of a card item whose source or destination invoice is paid, and MUST require undoing settlement before changing any financial field of a settled item (V2 settlement rules).
- **FR-015**: The system MUST preserve the amount sign convention and validate ownership of every referenced person, category, account and card.
- **FR-016**: The system MUST ask for one edit scope (this item, this and following, whole series) when any selected item belongs to an installment series, and apply it to every installment item of the selection.
- **FR-017**: For scopes wider than one item, the system MUST shift purchase date, invoice period and due date by each installment's month offset from the selected installment (installment number difference), clamping to month end.
- **FR-018**: The system MUST reject a bulk edit whose selection contains a recurring item, changing nothing; recurring series keep the existing single scoped edit, and bulk edit never materializes occurrences.
- **FR-019**: The system MUST reject a change of person on a split transaction and apply every other changed field to the whole transaction, reallocating a new amount proportionally across its shares.
- **FR-020**: The system MUST apply the edit atomically across the whole selection and scopes (if any planned row cannot be updated, nothing is written), and return the number of updated transactions.
- **FR-021**: Bulk edit MUST NOT change condition (Story 4 resolution); mass-add creates only single-condition transactions.

**Cross-cutting**

- **FR-022**: Every operation MUST be limited to the authenticated user's data; ids not owned by the user MUST behave as not found without leaking existence.
- **FR-023**: All user-facing messages MUST be in PT-BR and brief, never exposing technical errors.
- **FR-024**: Lists, invoices, balances and dashboard totals MUST reflect mass-add and bulk edit results without a manual reload.

### Key Entities

- **Mass-add batch**: transient set of shared settings plus rows; only the resulting transactions persist.
- **Transaction**: single, installment or recurring item with person, category, account or card, dates, amount and paid state.
- **Installment series / Recurrence rule**: V2 structures that bulk edits respect through edit scopes.
- **Transaction split (shares)**: a transaction divided among several people.
- **Person**: owner of each transaction share; the default person belongs to the user.
- **Invoice**: card statement per period; a paid invoice blocks moves into it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can register 20 transactions through mass-add in under 3 minutes with a single submit.
- **SC-002**: 100% of mass-add submissions with any invalid row create zero transactions.
- **SC-003**: A bulk edit of up to 500 selected transactions completes with one confirmation and shows its result within 5 seconds.
- **SC-004**: For installment series, 100% of affected items end with the V1-defined month-offset dates in acceptance tests and 0 installments outside the chosen scope change; 100% of bulk edits containing a recurring item change nothing.
- **SC-005**: Zero bulk edits succeed on a selection containing a protected item, a paid-invoice target, or a settled item with financial changes; the user always sees the reason in PT-BR.
- **SC-006**: Dashboard and invoice totals after mass-add or bulk edit equal the sum of the underlying transactions in 100% of verification cases.

## Assumptions

- V1 "bulk edit" was a scoped series edit of one record (scopes current, period, future, all); V2 generalizes it to a multi-selection plus an explicit scope for series items, keeping the V1 field list and offset rules.
- V1 scope "period" (all people of the same month) has no V2 counterpart: V2 shared transactions are splits of one record, always edited whole.
- V1 allowed a null category and amount 0 in mass-add; V2 invariants (category required, amount above zero) win.
- V1 attachment propagation on scoped edit is already covered by V2 attachments on transactions and is out of scope.
- Bulk set trip belongs to feature 004; trips are not edited here.
- Bulk delete, category, rename and tags already exist in V2 and are unchanged.
- The mass-add row limit follows the existing V2 bulk limit of 500.
- Existing V2 selection, dialog, category and person pickers are reused.

## Source

- V1 evidence: `src/features/transactions/actions/bulk-actions.ts` (`createMassTransactionsAction`, `updateTransactionBulkAction`, `deleteTransactionBulkAction`), `src/features/transactions/actions/core.ts` (`updateBulkSchema`, `massAddSchema`), `src/features/transactions/components/dialogs/mass-add-dialog.tsx`, `dialogs/bulk-action-dialog.tsx`, `table/transactions-bulk-bar.tsx`, `page/transactions-page.tsx`.
- V2 evidence: `apps/api/src/routes/transactions.ts` (`/bulk/category`, `/bulk/names`, `/bulk/tags`, `/bulk/delete`, scoped `PATCH /{id}`), `packages/validators/src/transactions.ts` (bulk schemas, action scopes), `docs/recurring-transactions.md`, `docs/settlements.md`.
- Inventory rows covered: "Mass-add transactions" (port), "Bulk edit" (port; "V2 lacks date, condition, payer and other fields"). "Bulk delete" is already full.

## Dependencies

- Roadmap lane A sequence: after 003.
- Functional: none on other migration features; uses existing V2 transactions, recurrence, installments, splits, people and invoices.
- Consumed later by 007 (PDF export shares the transactions page filter context).
