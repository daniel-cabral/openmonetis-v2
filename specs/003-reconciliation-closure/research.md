# Research: 003 Reconciliation Closure

## R1. Where closure and projection run
- Decision: pure domain functions in `packages/domain/src/reconciliations-closure.ts` and `reconciliations-projection.ts`. The API preview computes what does not depend on decisions (statement closure, final balance, invoice net sum, projection base: baseline balance and per-entry status/alignability). The web re-runs `projectAccountBalance` / `projectInvoiceTotal` / `checkInvoiceClosure` from `@openmonetis/domain` on each decision or typed total.
- Rationale: FR-009 needs recalculation on every decision and FR-004 on every total change without re-upload; AGENTS.md section 11 keeps the rule in the domain; the web already imports domain functions (`addMonthsToPeriod` in `components/month-navigation.tsx`). No request per decision.
- Alternatives: a `POST /reconciliations/projection` per decision (re-parses the file on every click); rule in web code (violates AGENTS.md).

## R2. Statement closure input
- Decision: the service maps each parsed CSV row to `ClosureLine { accountingDate: postedDate ?? purchaseDate, signedCents, dayBalanceCents }` (001 rows carry `postedDate` = Data Contábil and `dayBalance` in reais). `ReconciliationLine` is not extended.
- Rationale: keeps the 002 types and tests untouched; closure groups by accounting date (US1-4).

## R3. Account projection baseline
- Decision: new `accountsService.getBalanceThroughDate(accountId, userId, date)` that calls the existing `summarizeAccount(account, userId, date.slice(0, 7), date)` and returns `summary.balance`; the reconciliation service converts it to cents. Cutoff = `fileRange.end` (last launch or posted date of the file, as V1 `to`).
- Rationale: FR-010 and the Assumption "no second balance rule": `summarizeAccounts` already supports `throughDate` with the posting-date rule (settled, admin or admin split share, adjustments, settled recurring occurrences).
- Alternatives: V1 SQL (`initialBalance + sum`) re-implemented (second balance rule).

## R4. Per-entry projection status and paid-after-end
- Decision: domain `toBalanceStatus({ isSettled, isAdmin, postingDate }, cutoff)` (V1 `toBalanceStatus`): non-admin -> null; not settled -> `unsettled`; posting date after cutoff -> `after-end`; else `in-balance`. Posting date = `settledDate ?? purchaseDate` (transactions) or occurrence `settledDate ?? date`. `isAdmin` = entry person is the admin person (transactions: `personIsAdmin` from the candidate query; occurrences: `rule.personId === admin.id`). `paidAfterEnd` = preview candidate entries whose status is `after-end` and that no keep/link effect consumes.
- Rationale: same date rule as the baseline (posting date), so an entry is either inside the baseline (`in-balance`) or listed. The candidate window already covers every month of the file, where paid-after-end entries live (statements end close to the upload date).
- Trade-off recorded: an entry paid after the file end in a month later than the file's last month is not listed (V1 listed it); the projection value is unaffected because the baseline is cut at the file end.

## R5. Alignability in the projection
- Decision: extract `amountKeptReason(entry, targetType)` from `resolveAmountAlignment` (behaviour-preserving refactor, locked by the 002 table tests) and send `alignable = amountKeptReason(...) === null` per projection entry. Projection: `next = alignable ? lineCents : entry.signedCents`.
- Rationale: V1 ignored alignments of divided entries; V2 has more kept reasons (transfer, generated, paid invoice, card recurring) and the projection must not predict an alignment the apply will not do.

## R6. Typed credit origin
- Decision: `transaction_origin` pgEnum value `invoiceCredit` (`ALTER TYPE ... ADD VALUE`, precedent `0007_narrow_bastion.sql`), added to `transactionOrigins` in `packages/domain/src/transactions.ts`. Credit = `type income`, `paymentMethod credit_card`, card, invoice period, `isSettled null`. Exclusion: add `invoiceCredit` next to `invoicePayment` in every domain denylist that feeds income/expense/dashboard/budget/tag/selection numbers plus the financial-distribution SQL (list in plan.md "Aggregate exclusion list"). Allowlists already exclude it.
- Rationale: no note prefix (inventory decision); denylists are inline per function in V2 (no shared helper), so the change follows the existing pattern with one token per site.
- Alternatives: a shared `isReportNeutralOrigin` helper replacing the inline lists (touches ~12 upstream functions beyond the one-token change; rejected per constitution II minimal edits); modelling credits as positive `invoiceAdjustment` (counted as expense reduction by `isExpenseReduction`, which changes expenses and violates SC-004).

## R7. Editing and deleting credits
- Decision: `canDeleteTransactionOrigin` adds `invoiceCredit`; new `canEditTransactionOrigin(origin)` (`regular` | `invoiceCredit`) replaces the `origin !== "regular"` guard in `updateTransaction` and the web `canEdit` checks. Editing a credit must keep `type income`, `paymentMethod credit_card` and its `cardId`; otherwise 400 `INVOICE_CREDIT_SHAPE_LOCKED`. Copy stays regular-only.
- Rationale: FR-007 (editable and deletable like V1) without letting an edit turn a report-neutral entry into an expense.

## R8. Credit lines in matching
- Decision: `isInformationalLine` becomes `lineKind === "invoice-payment"`; credit lines go through the five rules. The plan creation gets `origin`: `invoiceCredit` when target is card and `line.lineKind === "credit"`, else `regular`. Creation, batch id and identity are the 002 path, so undo-by-batch and identity re-match work unchanged.
- Rationale: FR-006/FR-008 and the re-upload edge case; V1 offered create on credit lines.

## R9. Unreconciled icon
- Decision: domain `isPaidButUnreconciled({ isSettled, hasIdentity, date }, firstReconciledDate)` (V1 `isUnreconciledSettled`). API: in `listTransactions` with `view = accountStatement`, load `findFirstReconciledDateForAccount(userId, accountId)` (min `coalesce(settled_date, purchase_date)` of the account's transactions with `import_external_id`) and set `isPaidUnreconciled` on each item (`hasIdentity` from the persisted row or the occurrence state `importExternalId`; date `postingDate ?? purchaseDate`). `TransactionOutputSchema` gets optional `isPaidUnreconciled: boolean`. Web renders the icon when true.
- Rationale: the statement already runs only on the account; card invoices never request the view (US5-3).

## R10. Invoice total input and parsing
- Decision: optional input in the origin card for card targets, kept in `useReconciliationReview` state, never sent to the API; parsed by domain `parseAmountInputToCents` (comma decimal with dot thousands, or dot decimal when no comma; null when blank or invalid).
- Rationale: V1 placement and FR-004 recalculation without re-upload.

## R11. Amounts in the new contract fields
- Decision: closure and projection fields are integer cents (`...Cents`), unlike the 002 line amounts in reais.
- Rationale: the web passes them straight to domain functions that work in cents (constitution IV); formatting happens in `reconciliations.presentation.ts`.

## R12. V1 oracle mapping
- `closure.test.ts` 11 cases -> `packages/domain/src/reconciliations-closure.test.ts`.
- `reconciliation-review.test.ts` closure-related: `deriveReconciliationClosure` 4 cases (statement kind, blank total null, 25,90 closes, 10,00 vs 25,90) -> web `buildClosureView` table; `reclassifyPreviousInvoicePayments` cases already ported in 002 (extended with the year-wrap case if missing).
- `reconciliation-projection.test.ts` 8 account cases + paid-after-end + invoice case -> `reconciliations-projection.test.ts`; `toBalanceStatus` 5 cases -> same file.
- `unreconciled.test.ts` 5 cases + card-never case -> `reconciliations.test.ts` table and integration.
- `constants.test.ts` credit-note cases: dropped (no note prefix), replaced by origin exclusion tests.
