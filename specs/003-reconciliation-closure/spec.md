# Feature Specification: Reconciliation Closure

**Feature Branch**: `003-reconciliation-closure`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Statement/invoice closure proofs, invoice credit lines + new typed credit origin, sticky projection bar, 'paid but not reconciled' icon, `auditar-conciliacao` skill" (roadmap feature 003). Hard constraint: no regression versus the V1 reconciliation flow, with the credit-note rule remodelled as a typed origin instead of a note prefix.

**Fork-only**: yes (the dev skill is tooling that never goes to an upstream PR, and `.claude/` is excluded from PR branches by constitution II). The product behavior must still be shippable without fork tooling.

**Dependencies**: needs 002 (reconciliation screen, buckets, apply/undo, row identity stamping) and, through it, 001.

## Source

V1 evidence (fork `D:\Repos\daniel-cabral\openmonetis`):

- Closure: `src/shared/lib/reconciliation/closure.ts`, `closure.test.ts` (10 test blocks); `src/features/transactions/lib/reconciliation-review.ts` (`deriveReconciliationClosure`, `isInvoicePaymentLine`, `isCreditLine`, `reclassifyPreviousInvoicePayments`).
- Projection: `src/features/transactions/lib/reconciliation-projection.ts`, `reconciliation-projection.test.ts`; `src/features/transactions/components/reconciliation/reconciliation-apply-bar.tsx`, `reconciliation-summary.tsx`.
- Credit lines and note rule: `src/features/transactions/lib/reconciliation-plan.ts` (credit note on creation), `src/shared/lib/accounts/constants.ts` (`AUTO_FATURA:CREDITO:` note builder), `src/features/invoices/actions.ts` (`sumInvoicePartialPayments`).
- Unreconciled icon: `src/features/accounts/lib/unreconciled.ts`, `unreconciled.test.ts`, `src/app/(dashboard)/accounts/[accountId]/statement/page.tsx`.
- Skill: `.claude/skills/auditar-conciliacao/{SKILL.md,confronto.py}`.
- Fixtures (oracle): `src/shared/lib/reconciliation/__fixtures__/{c6-extrato.csv,c6-fatura.csv,fixtures.test.ts}`.
- OpenSpec: `openspec/specs/invoice-closure-correction`, `openspec/specs/statement-reconciliation` (requirements "Verificação aritmética de fechamento", "Saldo previsto antes de aplicar", "Indicador de pago não conciliado no extrato da conta"), `openspec/changes/allow-invoice-credit-lines`, `openspec/changes/invoice-credit-note-scope`.

Inventory rows covered (section 1.2): closure proof (statement day balance; invoice net sum); invoice credit lines become entries, payment line info-only, "Inclusao de Pagamento" as previous-invoice payment, candidates limited to invoice period; credit-note rule remodelled as new typed origin; sticky apply bar with projected balance or invoice total and paid-after-file-end list; "paid but not reconciled" icon; `auditar-conciliacao` skill.

### V1 behavior: kept, changed, dropped

| V1 behavior | Decision | Why |
|---|---|---|
| Statement closure by day balance variation per accounting day | Kept | Independent arithmetic proof; part of the oracle. |
| Invoice closure by net sum (purchases + credits, previous-invoice payment excluded) | Kept | Same. |
| Credit line creates an income entry on the card, hidden from reports by the note prefix `AUTO_FATURA:CREDITO:<card>:<period>:<identity>` | Changed | New typed credit origin; no note prefix, no text matching. |
| Credit survives "undo invoice payment" and is not summed as a payment | Kept | Observable outcomes preserved with the typed origin. |
| Credit note editable and deletable (only the settlement entry stays locked) | Kept | Behavior unchanged. |
| Sticky bar with projected balance (account) or invoice total (card) vs the file | Kept | Core of the "I apply and trust it" promise. |
| Paid-after-file-end list | Kept | Explains most residual differences. |
| "Paid but not reconciled" icon on account statement only | Kept | Exposes forgotten paid flags. |
| `auditar-conciliacao` skill with its method and traps | Kept, updated | Rewritten to the V2 vocabulary and model. |
| Settle announcement on invoice payment | Out of scope | It is feature 015. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prove the statement closes, independently of the matches (Priority: P1)

After reading a statement, the user sees whether every accounting day's balance movement equals the sum of that day's lines, even when every line matched.

**Why this priority**: it is the only check that detects a corrupted or incomplete file.

**Independent Test**: parse the statement fixture and verify the closure panel; alter one line and verify the exact divergence.

**Acceptance Scenarios**:

1. **Given** `c6-extrato.csv`, **When** closure is computed, **Then** all 34 verifiable accounting days close, the panel reads "Todos os dias contábeis batem com o saldo do extrato", and the first accounting day 2026-07-06 is reported as not verifiable (no previous balance inside the file).
2. **Given** the same file with the first line of 2026-07-07 increased by R$ 10,00, **When** computed, **Then** exactly one divergence is reported: day 2026-07-07, balance movement -R$ 320,00, sum of lines -R$ 330,00, difference R$ 10,00.
3. **Given** a file where every line matched an app entry, **When** one day does not close, **Then** the divergence is still reported.
4. **Given** lines whose launch dates differ from their accounting dates, **When** grouped, **Then** grouping uses the accounting date, never the launch date.
5. **Given** a day whose lines carry no balance, **Then** that day is reported as not verifiable instead of failing.
6. **Given** the last accounting day has a balance (fixture: 2026-09-01, -R$ 580,23), **Then** that is the file's final balance; **Given** the last day has no balance, **Then** no final balance exists (the check never falls back to an earlier day).

---

### User Story 2 - Prove the invoice closes against the informed total (Priority: P1)

The invoice CSV has no total, so the user types it. The panel compares it with the net sum of the file (purchases plus credits, never the previous-invoice payment), and recalculates as soon as the total changes.

**Why this priority**: it caught the V1 false alarm where a credit was ignored.

**Independent Test**: use the invoice fixture and the real July/2026 case, edit the total after reaching review.

**Acceptance Scenarios**:

1. **Given** purchases of R$ 13.034,33, a credit of R$ 98,00 and a previous-invoice payment of R$ 12.164,10, **When** the total is R$ 12.936,33, **Then** the invoice closes with difference R$ 0,00.
2. **Given** the same lines and a total of R$ 13.000,00, **Then** the panel reports it does not close, with difference R$ 63,67.
3. **Given** the same lines and a total of R$ 772,23 (which would close if the payment were included), **Then** it does not close: the payment is excluded from the sum.
4. **Given** the fixture `c6-fatura.csv` (purchases R$ 23.440,50, credit R$ 75,00, payment R$ 9.500,00), **When** the total typed is R$ 23.365,50, **Then** it closes.
5. **Given** the user reached review with the total blank, **When** they type 12.936,33 afterwards, **Then** the closure panel appears with its result without re-uploading; **Given** a closure already shown, **When** they edit the total, **Then** it is recalculated.
6. **Given** a blank total, **Then** no closure is shown (nothing to close against).

---

### User Story 3 - Invoice credits become typed entries that do not distort reports (Priority: P1)

Credits of this invoice (advance payments, reversals) can be turned into credit entries on the card, so the invoice total in the app matches the bank. Payments of the previous invoice stay informational. Credit entries use a new typed origin and never count as income, expense or payment.

**Why this priority**: it fixes the V1 defect that created a phantom R$ 6.899,44 expense and, later, R$ 7.320,62 of fake income.

**Independent Test**: reproduce the July/2026 C6 Carbon invoice, create the credit entries and verify invoice total, reports and the payment flow.

**Acceptance Scenarios**:

1. **Given** the invoice lines purchases R$ 19.484,72, `Estorno Tarifa` -R$ 98,00, `Inclusao de Pagamento` 15/06 -R$ 5.222,62 and 26/06 -R$ 2.000,00, with total R$ 12.164,10, **When** the three credits are created, **Then** the invoice total in the app is R$ 12.164,10 and paying it proposes no extra settlement entry.
2. **Given** an invoice for period 2026-10 with due day 15 and `Inclusao de Pagamento` dated 11/09, 15/09 and 27/09, **When** the file is read, **Then** the 11/09 and 15/09 lines (on or before the previous due date) are informational previous-invoice payments and 27/09 is a credit of this invoice; **Given** an `Estorno Tarifa` dated 10/09, **Then** it stays a credit; the original lines are not mutated.
3. **Given** a January invoice with due day 5 and an `Inclusao de Pagamento` dated 05/12 of the previous year, **Then** it is a previous-invoice payment (December of the previous year is the reference).
4. **Given** `Pag Fatura Boleto` R$ 12.164,10, **Then** it is shown only in the informational bucket, with the label "Pagamento da fatura anterior", no create action, because that outflow is already an expense of the checking account.
5. **Given** a credit line left on "Pular", **Then** no entry is created and the invoice total in the app is unchanged.
6. **Given** a credit entry created from `Inclusao de Pagamento` R$ 5.222,62, **Then** it is an income-direction entry on the card, in the invoice period, carrying the typed credit origin, without any marker in its note or name.
7. **Given** credit entries exist in a month, **Then** the month's income, expenses, balance charts, budgets, insights, category and person reports and forecasts do not change (R$ 7.320,62 of credits adds R$ 0,00 of income).
8. **Given** a credit of R$ 5.222,62 on the card and a settlement calculation of the remaining amount, **Then** the credit is counted once (it already lowers the invoice total) and never again as a payment.
9. **Given** the user undoes the payment of an invoice that has credit entries, **Then** the settlement entry is removed and the credit entries remain.
10. **Given** a credit entry, **Then** the user can edit or delete it like any ordinary entry (V1 made only the settlement entry read-only).
11. **Given** applying a reconciliation that creates credits and then undoing the batch, **Then** the credit entries are removed with the batch.

---

### User Story 4 - See the projected result before applying (Priority: P1)

A fixed bar next to Apply shows what the app will say after applying against what the file says, recalculated at every decision. It never blocks Apply.

**Why this priority**: closure only compares the file with itself; this compares the app with the file.

**Independent Test**: build the V1 account scenario (statement ending 11/11 with final balance R$ 843,44) and change decisions.

**Acceptance Scenarios**:

1. **Given** the account card shows -R$ 524,56, "Mensalidade Colégio Santo Agostinho" of R$ 1.643,00 is paid on 22/11, the statement ends 11/11 with final balance R$ 843,44 and the Fernanda line is on "Manter casamento", **When** the bar is computed, **Then** it shows projected app balance R$ 1.118,44 against R$ 843,44 and "Diferença de R$ 275,00" in amber.
2. **Given** the Fernanda line is switched to "Criar lançamento novo" (admin person), **Then** the bar shows R$ 843,44 against R$ 843,44 with "Bate" in green, without a new upload.
3. **Given** the mensalidade paid on 22/11 (after the file's last day), **Then** it is listed under "pagos depois do fim do arquivo" with name, date 22/11 and value -R$ 1.643,00 and is excluded from the projected balance; **When** a line is matched to it, **Then** it leaves the list and the projected balance becomes -R$ 524,56.
4. **Given** the baseline R$ 1.118,44, **Then** each decision moves the projection as follows: confirming a pending R$ 210,00 entry gives R$ 908,44; aligning "Colégio" from R$ 1.643,00 to R$ 1.560,85 gives R$ 1.200,59; creating a R$ 275,00 expense for the admin person gives R$ 843,44; creating one for another person leaves R$ 1.118,44; linking to another person's entry leaves R$ 1.118,44; aligning an entry with person splits is ignored; Skip and Ignore change nothing.
5. **Given** an invoice review with a typed total, entries in the invoice period of R$ 100,00 and R$ 50,00 (expense) and R$ 20,00 (income), another-period entry of R$ 999,00, a created R$ 30,00 expense and an alignment of the R$ 50,00 entry to R$ 55,00, **Then** the projected invoice total is R$ 165,00, compared with the typed total with the difference shown.
6. **Given** a difference of zero, **Then** the badge reads "Bate" in green; any other difference is amber; Apply stays enabled in both cases.
7. **Given** the file has no final balance (last day without balance), **Then** no comparison is claimed.
8. **Given** the projected balance rule, **Then** it reuses the account balance rule of the account screen (initial balance plus settled entries of the admin person), limited to entries dated up to the file's last day.

---

### User Story 5 - See which paid entries were never reconciled (Priority: P2)

On the account statement, a discreet icon marks entries marked as paid that have no reconciliation identity, but only from the date of the account's first reconciled entry onward.

**Why this priority**: it reveals forgotten "paid" flags, the most common cause of balance drift in V1.

**Independent Test**: unit cases of the rule plus the statement screen with a reconciled account.

**Acceptance Scenarios**:

1. **Given** the account's first reconciled entry is dated 01/09 and "Mensalidade Colégio Santo Agostinho" of 22/11 is paid with no identity, **When** the statement is shown, **Then** that line shows the icon with the hint "Pago, mas não conciliado com o extrato".
2. **Given** a paid entry with an identity, a pending entry, a paid entry dated 31/08 (before the first reconciled entry), or an account with no reconciled entry at all, **Then** no icon appears.
3. **Given** a card invoice view, **Then** the icon never appears.

---

### User Story 6 - Audit skill for the fork (Priority: P3)

A maintainer-only skill guides diagnosing balance differences against the bank: locate the month by arithmetic, compare entries and exits separately, only then go line by line, always matching by name and value together.

**Why this priority**: tooling that keeps the hard-won V1 method; no product impact.

**Independent Test**: read the skill; every path, field and screen it cites exists in V2.

**Acceptance Scenarios**:

1. **Given** the skill, **Then** it keeps the principle "match by name AND value, never conclude from value coincidence", the 3-step method, the C6 file formats table, and how C6 composes the invoice (net sum, the two kinds of negative lines).
2. **Given** the skill, **Then** its trap table is rewritten for V2 (no `AUTO_FATURA` note prefix, typed credit origin, V2 settlement and balance rules, V2 export formats) and cites only things that exist in V2.
3. **Given** the helper script that crosses an app export with a statement, **Then** it works on the V2 CSV/XLSX export or is removed from the skill if it cannot.
4. **Given** the skill is fork-only, **Then** it lives under `.claude/skills/` and never appears in an upstream PR branch.

### Edge Cases

- A statement file containing a single accounting day: that day is not verifiable; the panel says so instead of "closes".
- Invoice with only a previous-invoice payment and no purchases: net sum 0,00 against a typed total of 0,00 closes.
- Invoice total typed with thousands separator (`12.936,33`) or decimal comma: read as R$ 12.936,33.
- A credit line whose entry is later paid or edited: the credit stays; editing its amount changes the invoice total like any entry.
- A credit created in one reconciliation and the same file re-uploaded: the line matches the entry by identity, no duplicate credit.
- Two credits of the same amount and date on one invoice: distinct identities, both creatable.
- A projection when the batch has a user-editable amount typed in a creation: the bar uses the typed amount.
- A paid-after-end entry that belongs to another person is not listed (the projection only follows the admin person).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For a statement, the system MUST compute, independently of matching, for each accounting day with a previous balance in the file: movement = day balance minus previous day balance, compared with the signed sum of that day's lines, grouped by accounting date, in integer cents; it MUST report each day that does not close with the day, movement, sum and difference.
- **FR-002**: The first accounting day, and days without a balance, MUST be reported as not verifiable and MUST NOT make the closure fail.
- **FR-003**: The system MUST expose the file's final balance as the balance of the last accounting day, and none when that day has no balance (no fallback to an earlier day).
- **FR-004**: For an invoice, the system MUST compare the typed total with the sum of all lines except previous-invoice payments (purchases add, credits subtract), in integer cents, reporting closes, sum, expected total and difference. With no typed total no closure is shown; changing the total MUST recalculate without a new upload.
- **FR-005**: The system MUST classify invoice lines as purchase, credit or previous-invoice payment (001), and MUST reclassify as previous-invoice payment any credit whose description is `Inclusao de Pagamento` (case-insensitive, spaces collapsed) dated on or before the previous invoice's due date (previous period plus the card's due day; December of the previous year for a January invoice), leaving all other credits unchanged and not mutating the input.
- **FR-006**: Previous-invoice payment lines MUST be shown in an informational bucket labelled "Pagamento da fatura anterior" with no write action; credit lines MUST offer the same Create/Skip/Ignore actions as bank-only lines (creating an income-direction entry on the card in the invoice period, default person admin, name pre-filled as in 002).
- **FR-007**: The system MUST introduce a new typed transaction origin for invoice credits. An entry with this origin MUST NOT count as income or expense in any report, budget, insight, dashboard total, forecast or category/person aggregate; MUST NOT be counted as a payment in the invoice settlement calculation; MUST reduce the invoice total exactly once; MUST survive undoing the invoice payment; MUST be editable and deletable by the user; and MUST NOT depend on any note or name text.
- **FR-008**: Credit entries created by a reconciliation MUST carry the batch id so that undoing the batch removes them, and MUST carry the line identity so that re-uploading the file matches them instead of duplicating.
- **FR-009**: The review MUST show a fixed bar next to Apply with the projected app result against the file, recalculated on every decision and shown as "Bate" in green when the difference is zero and amber ("Diferença de R$ X") otherwise, never blocking Apply.
- **FR-010**: For an account target, the projected balance MUST be the account-screen balance rule (initial balance plus settled entries of the admin person) restricted to entries dated up to the file's last day, plus the effect of the current decisions: creations for the admin person (signed), amount alignments of non-split entries, and confirmations or links that make a pending entry paid (including value alignment); creations for other persons, links to other persons' entries, alignments of split entries, Skip and Ignore MUST NOT change the projection. It is compared with the file's final balance.
- **FR-011**: For an account target, entries of the admin person paid after the file's last day MUST be listed separately with name, date and signed value, excluded from the projected balance, and removed from the list when matched in the batch.
- **FR-012**: For a card target, the projected invoice total MUST be the signed sum of the invoice period's entries (expense positive, income negative) with the current alignments, plus the creations, compared with the typed total with the difference shown; entries of other periods are ignored.
- **FR-013**: On the account statement, the system MUST mark with the icon "Pago, mas não conciliado com o extrato" every entry that is paid, has no reconciliation identity, and whose date is on or after the date of the account's first reconciled entry; never for accounts with no reconciled entry, never for pending or reconciled entries, never on card invoices.
- **FR-014**: The system MUST provide the `auditar-conciliacao` fork skill rewritten for V2 as described in User Story 6.
- **FR-015**: All user-facing text MUST be PT-BR, identifiers and contracts English; all amounts compared and summed in integer cents; financial rules (closure, projection, classification, credit semantics) live in the domain layer; every read and write filters by the authenticated user.
- **FR-016**: Existing reconciliation behavior from 002 (matching, apply, undo, suspicious bucket) MUST remain unchanged except for the bucket handling of invoice credit lines described here.
- **FR-017**: A credit entry's category: Resolved (orchestrator, 2026-11-11): default confirmed. No category prompt; the typed credit origin drives report exclusion.

### Key Entities *(include if feature involves data)*

- **Statement closure result**: per accounting day (balance, previous balance, movement, sum, difference, closes), list of not-verifiable days, list of divergences, overall closes flag.
- **Invoice closure result**: net sum, typed total, difference, closes flag.
- **Invoice line kind**: purchase, credit, previous-invoice payment (from 001), with date-based reclassification.
- **Invoice credit entry**: a transaction of the card with the new typed credit origin, income direction, invoice period, batch id and row identity.
- **Projection result**: projected app balance or invoice total, file balance or typed total, difference, list of entries paid after the file end.
- **Unreconciled-paid indicator**: derived flag per entry of an account statement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No-regression oracle (closure): all V1 closure test blocks (10) are ported and pass; the statement fixture yields 34 verified days that all close with 2026-07-06 unverified, the adulterated-line case yields exactly the divergence in User Story 1, and the final balance of the fixture is -R$ 580,23 on 2026-09-01.
- **SC-002**: No-regression oracle (invoice): the fixture closes against R$ 23.365,50; the July/2026 case closes against R$ 12.164,10; the 13.000,00 and 772,23 cases do not close with the stated differences; the date-based reclassification cases (including year wrap) pass.
- **SC-003**: No-regression oracle (projection): the 8 V1 account projection cases, the paid-after-end case and the invoice projection case give exactly R$ 1.118,44, 843,44, 1.118,44, 908,44, 1.200,59, 1.118,44, 1.118,44, 1.118,44; -524,56; and R$ 165,00 respectively, and the bar is green only at zero difference.
- **SC-004**: With credit entries of R$ 7.320,62 created in a month, the month's reported income, expenses, budgets and insights change by exactly R$ 0,00, and the invoice payment flow proposes no spurious settlement entry (the July/2026 invoice).
- **SC-005**: Undoing the payment of an invoice with credit entries leaves 100% of its credit entries; undoing a reconciliation batch removes 100% of the credits it created.
- **SC-006**: All 6 icon cases (paid and unreconciled after the first reconciliation shows it; reconciled, pending, before first reconciliation, no reconciliation, card invoice do not) pass.
- **SC-007**: A user can open a reconciliation and decide, from the bar alone, whether the result will match the bank before applying, with 0 clicks outside the review screen.
- **SC-008**: The skill cites 0 non-existent V2 paths, fields or screens.
- **SC-009**: 002 acceptance scenarios keep passing unchanged.

## Assumptions

- Dependencies: 003 builds on the 002 review, apply, undo and identity stamping.
- The invoice total typed by the user stays optional and manual because the C6 CSV has no total.
- Existing V1 credit entries marked by the `AUTO_FATURA:CREDITO:` note are converted to the typed origin by the V1 ETL (feature 016), not by this feature.
- The new origin follows the V2 pattern of typed origins already excluded from income/expense aggregates (for example invoice payments); the exact list of aggregates to update is a plan task and is verified by SC-004.
- The V2 account balance rule (settled entries with effective date and value, adjustments) is the reference for FR-010; no second balance rule is introduced.
- "Entry date" for the unreconciled icon follows the date the account statement uses for the entry.
- UI of the bar and of the credit bucket is produced as 2 to 3 mockups with the app's real components before planning; the option closest to V1 within V2 patterns is recorded in the spec.
- Upstream overlap check (CHANGELOG, dashboard and invoice code, "Compromissos futuros" forecast) is recorded in the plan; the typed origin touches shared domain code, so shared-file edits stay minimal per the inventory's collision mitigations.
- Deliverables follow constitution II: product code, versioned forward-only migrations (new origin value), tests per `docs/testing.md`, `CHANGELOG.md` under `### Fork`, and a `docs/` contract.
