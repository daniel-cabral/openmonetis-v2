# Research: Transactions Mass-Add and Full Bulk Edit (006)

Decisions taken autonomously (goal run). Format: Decision, Rationale, Alternatives.

## R1. Two endpoints, not one generic bulk endpoint

- **Decision**: `POST /transactions/bulk/create` and `PATCH /transactions/bulk/update`, next to the
  existing `/bulk/category`, `/bulk/names`, `/bulk/tags`, `/bulk/trip`, `/bulk/delete`. Both return
  `BulkTransactionsOutput { ids }`.
- **Rationale**: same URL family and response contract as the existing bulk actions; ISP (one
  schema per operation). `ids` gives the web the count for "N lançamentos criados/atualizados".
- **Alternatives**: looping `POST /transactions` from the web (non-atomic, violates FR-005,
  SC-002); one `/bulk` endpoint with an `action` discriminator (one schema for two use cases,
  rejected by ISP).

## R2. Mass-add reuses the create helpers, not the import path

- **Decision**: service `createTransactions(input, userId)` builds one `TransactionInput` per row
  (`condition: "single"`, `isSettled: false`, shared type, payment method, account or card,
  invoice period only for cards) and reuses `buildBaseRecord` and `derivePeriod` from
  `createTransaction`, then writes once with `insertTransactionsWithSplits(records, [])`, which
  already inserts every row, settlement events, tags and external-expense sync in one
  `db.transaction`.
- **Rationale**: exactly the single-create side effects (FR-010): period derivation from the card
  closing rule when no invoice period is chosen (FR-008), pending account rows, card rows billed
  by invoice, external-expense synchronization for connected people.
- **Alternatives**: reuse `importTransactions` (rows are created settled, require a source
  fingerprint and external ids, write category memory and an undoable batch; wrong semantics);
  call `createTransaction` per row inside a loop (N database transactions, partial writes on
  failure, 4-5 ownership queries per row).

## R3. Row errors without changing the error envelope (orchestrator decision)

- **Decision**: the envelope stays `{ error, message, code }` (AGENTS.md section 9). Shape errors
  per row (missing date, name or amount; amount not above zero; missing category or person) are
  caught by the dialog form with the same validators schema and name the row inline. The API
  reads ownership in batch (`listPeopleByIdsForUser`, `listCategoriesByIdsForUser`, one account or
  card lookup) and throws the existing codes `CATEGORY_NOT_FOUND` / `PERSON_NOT_FOUND` without a
  row. The web maps them to "Categoria não encontrada em uma das transações." / "Pessoa não
  encontrada em uma das transações.". A Zod `validation_error` from the API is a generic fallback.
- **Rationale**: no shared contract change; the API remains the source of truth for ownership and
  inactive people (edge case "person removed between opening the dialog and submit").
- **Alternatives**: optional `row` on the error envelope (touches 5 shared files outside the
  feature; rejected by the orchestrator); row number in `message` (web would parse API text,
  forbidden by AGENTS.md section 12).

## R4. Mass-add card checks

- **Decision**: for card batches, collect the distinct resulting periods (chosen invoice period, or
  each row's derived period) and call `listPaidInvoicePeriodsForUser` once -> `INVOICE_ALREADY_PAID`;
  sum expense rows and compare with `getCardExpenseTotalForUser` + limit -> `CARD_LIMIT_EXCEEDED`.
  Both before any write. Inactive card -> `CARD_NOT_FOUND`; archived or foreign account ->
  `ACCOUNT_NOT_FOUND`.
- **Rationale**: parity with `createTransaction` and `importTransactions`.

## R5. Bulk edit eligibility lives in the domain

- **Decision**: `getBulkTransactionUpdateRejection(target, fields)` evaluated per target in this
  order (first match wins, whole request rejected):
  1. `protected`: not `isUserEditableBulkTarget` (origin other than `regular`, transfer leg,
     balance adjustment) -> `BULK_ACTION_UNSUPPORTED` (existing code).
  2. `recurring`: `condition === "recurring"` or recurring occurrence -> `BULK_UPDATE_RECURRING`.
  3. `notApplicable`: any field from `listInapplicableBulkUpdateFields` -> `BULK_UPDATE_FIELD_NOT_APPLICABLE`.
  4. `splitPersonChange`: split transaction and `personId` changed -> `BULK_UPDATE_SPLIT_PERSON`.
  5. `settled`: `settledDate` set and any field in `settlementLockedTransactionFields` ->
     `SETTLEMENT_REQUIRES_UNDO` (existing code).
  Category type compatibility reuses `canAssignBulkCategory` -> `BULK_CATEGORY_INCOMPATIBLE`
  (existing, same rule as `/bulk/category`).
- **Field applicability**: card items accept `cardId`, `invoicePeriod`; non-card items accept
  `accountId`; `dueDate` only for non-card expenses (mirrors `TransactionDueDateField` visibility:
  `type === "expense" && !isCreditCard`); other fields apply to every editable item. Payment method
  never changes in bulk, so account and card can never be swapped across methods.
- **Settlement lock**: V2 semantics are kept. The locked list is the one already used by single
  edit (amount, purchase date, person, account, card, due date, invoice period, and fields bulk
  cannot send); spec Story 2 #7 now says "financial fields (V2 settlement rules)". The repository
  re-checks under row locks (`SettlementError`).
- **Recurring**: recurring occurrences have no `recordId` (ids `ruleId:date`), so the UUID-only
  `ids` cannot address them; the dock blocks a selection containing one with "Lançamentos
  recorrentes devem ser editados individualmente." The domain case also guards any stored row with
  `condition === "recurring"`.
- **Rationale**: one rule source for API and dialog notice (AGENTS.md section 11, OCP: new
  functions, existing `canApplyBulkTransactionAction` cases untouched).
- **Alternatives**: a new `"update"` case in `canApplyBulkTransactionAction` (boolean cannot say
  which reason; the spec needs distinct messages).

## R6. Series anchors and scope

- **Decision**: one `scope` per request (`single | future | series`, default `single`), applied to
  every installment target; non-installment targets ignore it. Per series, the anchor is the
  selected installment with the lowest `currentInstallment` (`selectBulkSeriesAnchors`); other
  selected items of the same series are covered by the anchor's range. Targets: `future` =
  installments `>= anchor`, `series` = all, read with `listTransactionSeriesForUser` once per
  distinct series. Offset = `target.currentInstallment - anchor.currentInstallment` (spec FR-017).
- **Rationale**: two anchors in one series would give conflicting absolute dates; the lowest one
  is deterministic and is the widest `future` range.
- **Alternatives**: reject selections with two items of one series (surprising for "select all");
  apply per selected item (overlapping writes).

## R7. Shifting rule shared with single edit

- **Decision**: extract `shiftInstallmentSeriesValues({ purchaseDate, dueDate, boletoPaymentDate,
  period }, offset)` from the `updateTransaction` series path into the domain; both paths call it.
  Only values that changed are shifted (purchase date when `purchaseDate` changed; due date when
  `dueDate` changed; period when purchase date, due date, invoice period or card changed), from the
  anchor's new values, never cumulatively. Month-end clamp comes from domain `addMonths`.
- **Anchor period**: `resolveEditedTransactionPeriod` with the card context of the resulting card
  (`derivePeriod` for the derived value), the same call single edit makes.
- **Rationale**: zero rule duplication between single and bulk edit (AGENTS.md section 6).

## R8. Splits

- **Decision**: splits are read once with `listTransactionSplitsForUser(targetIds)`. A changed
  amount on a split target sends new shares `allocateAmountProportionally(newAmount,
  currentShareAmounts)` normalized by type; other fields leave shares untouched (`splits:
  undefined`). Person change on a split target is rejected (R5).
- **Rationale**: spec clarification (split = shares of one transaction, edited whole); cents
  conserved by the domain allocator. Single edit requires the client to resend shares; bulk cannot,
  so the service computes them.

## R9. Atomic write through the existing range writer

- **Decision**: after every check passes, the service calls
  `updateTransactionSeriesRangeWithSplitsForUser(userId, updates)` once with every planned target
  (singles and expanded series). Each update carries only the changed columns
  (`TransactionUpdateRecord` is `Partial`): `personId`, `categoryId`, `accountId`, `cardId`,
  `note`, signed `amount`, `purchaseDate`, `period`, `dueDate`, plus `splits` when reallocated. The
  function locks all rows `FOR UPDATE`, re-checks settlement, writes, replaces splits and
  synchronizes external expenses inside one `db.transaction`.
- **All-or-nothing (FR-020, orchestrator decision)**: today the function skips a row that is not
  updated (`continue`), so concurrent deletes leave a partial write. It changes minimally: if the
  locked rows are fewer than the requested ids, or an `update ... returning` yields no row, it
  throws `TransactionTargetMissingError` inside the `db.transaction`, so nothing is committed. The
  service translates it to 404 `TRANSACTION_NOT_FOUND`. The single scoped series edit, the other
  caller, gets the same stricter behavior (a vanished sibling now aborts the edit).
- **Rationale**: no new repository write; despite its name the function takes an arbitrary id list.
- **Alternatives**: new `updateTransactionsForUser` (duplicate of the range writer); a
  `requireAll` flag (two behaviors for one function, and the series edit also wants atomicity);
  calling `updateTransaction` per item (N transactions, conversions path, re-validates the current
  person).

## R10. Paid-invoice guard on bulk edit (source and destination)

- **Decision**: for every planned card target where card, invoice period, purchase date or amount
  changes, check both the stored `(cardId, period)` (source) and the resulting `(cardId, period)`
  (destination). Periods are grouped by card and read with one `listPaidInvoicePeriodsForUser`
  per card -> `INVOICE_ALREADY_PAID` (existing code, no month list) before any write. Changes to
  category, note or person do not change an invoice total and are not blocked.
- **Rationale**: a paid invoice's total must not change, neither by an item entering nor by one
  leaving or changing amount (orchestrator decision; spec Clarifications "Plan-time decisions").
  Single edit has no such check; it is not added there (scope, follow-up candidate).

## R11. Reference checks done once per request

- **Decision**: `changes.personId` (active, owned) -> `PERSON_NOT_FOUND`; `changes.categoryId`
  (owned) -> `CATEGORY_NOT_FOUND` then `canAssignBulkCategory` per target; `changes.accountId`
  (owned, not archived) -> `ACCOUNT_NOT_FOUND`; `changes.cardId` (owned, active) ->
  `CARD_NOT_FOUND`; ids missing or foreign -> `TRANSACTION_NOT_FOUND` via `listBulkTargets`. The
  current person of a target is not re-validated (bulk only touches what changed, FR-012).

## R12. Web behavior

- **Mass-add**: TanStack `useForm` with `BulkCreateTransactionsInputSchema` (rows as array field),
  PT-BR messages from the spec, row errors shown inline and naming the row; submit disabled while
  pending; dirty close asks "Descartar" /
  "Continuar editando"; new row copies the previous date and the default person (admin person from
  the people query); categories filtered by type; card locked when `createDefaults.cardId`.
- **Bulk edit**: sends every selected `recordId` (no client-side skipping, unlike other bulk
  actions, because the spec requires whole rejection); pre-checks recurring occurrences locally;
  the notice lists inapplicable fields per payment method with `listInapplicableBulkUpdateFields`;
  scope radio only when a selected item has `condition === "installment"`.
- **Errors**: three new codes mapped in `transactionMutationErrorMessages`; bulk-edit copy for
  reused codes through `getBulkUpdateErrorMessage`, so other screens keep their current text.

## R13. Documentation

- **Decision**: new `docs/transaction-bulk-actions.md` (maintainer style, PT-BR) covering mass-add
  and bulk edit, with a short table of the existing bulk endpoints. Name follows
  `docs/transaction-imports.md`; no existing doc covers bulk actions (`settlements.md` and
  `recurring-transactions.md` are linked, not extended). `CHANGELOG.md` entry at the end of
  `### Fork` in `Unreleased`.

## R14. Out of scope

- Condition change (Story 4 dropped), boleto payment date and paid state (settlement action),
  trips (004), tags/rename/delete (unchanged), card limit check on bulk edit (single edit has none),
  paid-invoice guards on single edit, row numbers on server errors (R3), mobile.
