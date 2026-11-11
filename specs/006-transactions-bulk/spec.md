# Feature Specification: Transactions Mass-Add and Full Bulk Edit

**Feature Branch**: `006-transactions-bulk`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 mass-add dialog and the full V1 bulk edit (date, condition, person and the other V1 editable fields) to V2, expressed on top of V2 recurrence rules, installment series, transaction splits and people."

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
9. **Given** any row references a category or person that does not belong to the user, **When** submitted, **Then** nothing is created and the error names the row ("Categoria não encontrada na transação N").

---

### User Story 2 - Edit extra fields on many selected transactions at once (Priority: P1)

A user who selected several transactions in the table wants to change purchase date, invoice period, due date, boleto payment date, person, account or card, category, note, amount or paid state in one action. V2 today only offers category, name and tag bulk actions.

**Why this priority**: Closes the V2 gap listed in the inventory (date, condition, payer and other fields). Independent of mass-add.

**Independent Test**: Select five single-condition transactions, bulk-change person and purchase date, and verify all five changed and no other field did.

**Acceptance Scenarios**:

1. **Given** several selected single transactions, **When** the user changes only the person, **Then** every selected transaction is reassigned to that person and untouched fields keep their values.
2. **Given** selected transactions, **When** the user sets a new purchase date, **Then** every selected transaction takes that date and recomputes its competence period and invoice the same way a single edit does.
3. **Given** selected transactions of mixed payment methods, **When** the user sets account, card, due date or boleto payment date, **Then** the dialog states which fields do not apply to which payment method, and the action is rejected if the combination is invalid for any item.
4. **Given** selected expense and income transactions, **When** the user sets an amount, **Then** the sign convention is preserved per type (the value entered is positive, the type decides direction) and zero or negative is rejected.
5. **Given** a selection where at least one item is system-managed (invoice payment, initial balance, refund, transfer leg), **When** the user confirms any bulk edit, **Then** the whole action is rejected with "Lançamentos protegidos não podem ser atualizados em massa." and nothing changes (all-or-nothing, as in the other V2 bulk actions).
6. **Given** a selected credit card transaction whose destination card and invoice period would land in an already paid invoice, **When** the user submits a change of card, purchase date or period, **Then** the action is rejected with "As faturas dos meses <lista> já estão pagas. Desfaça o pagamento antes de mover este lançamento."
7. **Given** a selected item already settled (paid or received), **When** the change touches amount, date or account, **Then** the action is rejected asking to undo the settlement first, consistent with V2 settlement rules.
8. **Given** the user marks the selection paid or pending, **When** confirmed, **Then** each item follows V2 settlement rules (credit card items stay "pela fatura").

---

### User Story 3 - Apply an edit to a whole series with an explicit scope (Priority: P2)

In V1, editing a transaction of a series asked "apenas este / este e os próximos / todos" and applied the changed fields to those items. The user expects the same when bulk-editing installment or recurring items in V2, expressed on V2 recurrence rules and installment series.

**Why this priority**: Required for V1 parity on series; secondary to the plain multi-select flow.

**Independent Test**: Bulk-edit category and due date of one installment with scope "este e os próximos" and verify earlier installments are untouched and later ones moved by the right month offsets.

**Acceptance Scenarios**:

1. **Given** a selected item that belongs to an installment series or a recurring rule, **When** the user submits a bulk edit, **Then** the user must pick a scope (this item only, this and following, whole series) before anything is applied.
2. **Given** scope "este e os próximos" on an installment series, **When** the user changes the due date, **Then** each affected installment's due date moves by the number of months between its own purchase date and the edited installment's purchase date, preserving the monthly rhythm.
3. **Given** scope "este e os próximos" or "toda a série", **When** the user changes purchase date or invoice period, **Then** every affected item shifts by its own month offset from the edited item (V1 rule), not to the same absolute value.
4. **Given** a recurring rule, **When** the user chooses a scope, **Then** V2 recurrence scopes apply (occurrence, this and following, series), past and confirmed occurrences keep their data, and financial changes on a confirmed occurrence require undoing its settlement first.
5. **Given** a transaction split among several people, **When** the user chooses a scope, **Then** a person choice is offered: this person's share only, or all people sharing the transaction. Changing the owner person of a split transaction is rejected with a clear message; other fields propagate to every share in scope.
6. **Given** the chosen scope would move any affected item into a paid invoice, **When** submitted, **Then** the whole action is rejected with the paid-invoice message and nothing changes.
7. **Given** a selection spanning several series, **When** the user submits, **Then** each series is processed with the scope chosen for its items and the action is atomic across the whole selection.

---

### User Story 4 - Change condition in bulk (Priority: P3)

The roadmap lists "condition" among the V1 fields to port. The user wants to change how selected transactions are paid or repeated (single, installment, recurring) in one action.

**Why this priority**: Rarely used, structurally risky (creates series), and absent from V1 bulk code; delivered last and only for safe transitions.

**Independent Test**: Select single-condition pending transactions, convert them to recurring monthly, and verify each becomes a recurring rule starting at its own date.

**Acceptance Scenarios**:

1. **Given** selected single-condition, pending transactions, **When** the user picks condition "recorrente" with a frequency, **Then** each becomes a recurring rule starting at its own date.
2. **Given** selected items that already belong to an installment series or recurring rule, **When** the user picks a different condition, **Then** the action is rejected with a message explaining the series must be edited individually.
3. **Given** Resolved (orchestrator, 2026-11-11): option (a). V1 never bulk-changed the condition; the roadmap wording was imprecise. Bulk edit does not change condition; mass-add keeps creating single ("à vista") entries., **When** the user opens the condition control, **Then** only the supported transitions are offered.

---

### Edge Cases

- A selection above the V2 bulk limit (500) is rejected before sending; mass-add above the same limit is rejected with a clear message.
- Submitting twice quickly must not duplicate mass-add transactions (submit disabled while pending).
- A mass-add row with a purchase date outside the chosen invoice period is allowed (the chosen period wins, as in V1) and the date stays as typed.
- Without a fixed invoice period (non-card methods), the competence period derives from each row's date.
- Month-end due dates when shifting by month offsets clamp to the last valid day of the month.
- A person removed between opening the dialog and submit produces a row-specific error and no partial creation.
- Bulk delete, category, rename and tag actions already exist and keep working with the same selection UI.
- Mass-added transactions appear immediately in lists, invoices and dashboard totals.
- V2 accepts child categories as ordinary categories, so the dialog has no separate subcategory field.

## Requirements *(mandatory)*

### Functional Requirements

**Mass-add**

- **FR-001**: The system MUST provide a mass-add dialog on the transactions page, and on a card's page with the card locked, where the user sets shared settings once (type, payment method, account or card, invoice period) and enters one or more rows (date, establishment, amount, category, person).
- **FR-002**: The system MUST require a card for credit card payment and an account for any other method, and reject submit with the messages in Story 1.
- **FR-003**: The system MUST create every mass-added transaction as single condition, without installments, recurrence, note or split.
- **FR-004**: The system MUST apply the sign convention by type (positive typed amount; expenses stored as outflows, income as inflows) and reject zero or negative amounts.
- **FR-005**: The system MUST create all rows atomically (all or none), and a row-level validation or ownership error MUST name the row number.
- **FR-006**: The system MUST filter selectable categories by the chosen type and MUST require a category per row, in line with the V2 rule that income and expense transactions have a category.
- **FR-007**: The system MUST default each row's person to the user's default person and pre-fill a new row's date from the previous row.
- **FR-008**: The system MUST create non-card rows as pending and credit card rows as billed through the invoice; the invoice period is the one chosen in the dialog or, when none, derived from each row's date.
- **FR-009**: The system MUST warn before closing a dirty dialog and keep at least one row.
- **FR-010**: The system MUST apply the same side effects as a normal single create (invoice recalculation, person notification rules) and report the number created, with correct singular and plural.

**Bulk edit**

- **FR-011**: The system MUST let the user bulk-edit, over a multi-selection, purchase date, invoice period, due date, boleto payment date, person, account, card, category, note, amount and paid state, in addition to the existing category, name and tag bulk actions.
- **FR-012**: The system MUST apply only the fields the user explicitly changed and leave every other field untouched.
- **FR-013**: The system MUST reject the whole bulk action, changing nothing, when any selected item is system-managed (invoice payment, initial balance, refund, transfer leg) or incompatible with a requested field.
- **FR-014**: The system MUST reject moves into an already paid invoice, listing the affected months, and MUST require undoing settlement before changing amount, date or account of a settled item.
- **FR-015**: The system MUST preserve the amount sign convention and validate ownership of every referenced person, category, account and card.
- **FR-016**: The system MUST ask for an edit scope when any selected item belongs to an installment series, recurring rule or split (this item, this and following, whole series; for splits also this person's share or all people).
- **FR-017**: For scopes wider than one item, the system MUST shift purchase date and invoice period by each item's own month offset from the edited item, and shift due date and boleto payment date by the month difference between each item's purchase date and the edited item's purchase date, clamping to month end.
- **FR-018**: For recurring rules, the system MUST use V2 recurrence scopes, leave past and confirmed occurrences untouched, and never materialize occurrences.
- **FR-019**: The system MUST reject a change of the owner person of a split transaction and propagate every other changed field to all shares in the chosen scope.
- **FR-020**: The system MUST apply the edit atomically across the whole selection and scopes, and return the number of updated transactions.
- **FR-021**: Condition changes MUST be limited to the transitions confirmed in Story 4 and rejected for items already in a series.

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
- **SC-004**: For installment and recurring series, 100% of affected items end with the V1-defined month-offset dates in acceptance tests and 0 past or confirmed occurrences change.
- **SC-005**: Zero bulk edits succeed on a selection containing a protected item, a paid-invoice target, or a settled item with financial changes; the user always sees the reason in PT-BR.
- **SC-006**: Dashboard and invoice totals after mass-add or bulk edit equal the sum of the underlying transactions in 100% of verification cases.

## Assumptions

- V1 "bulk edit" was a scoped series edit of one record (scopes current, period, future, all); V2 generalizes it to a multi-selection plus an explicit scope for series items, keeping the V1 field list and offset rules.
- V1 scope "period" (all people of the same month) maps to V2 "all people sharing this transaction", since V2 models shared transactions as splits.
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
