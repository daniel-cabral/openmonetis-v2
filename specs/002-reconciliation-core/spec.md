# Feature Specification: Reconciliation Core

**Feature Branch**: `002-reconciliation-core`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Reconciliation screen and target inference, deterministic matcher + buckets, name mappings, file value wins, pending -> paid on match, batch apply/undo, permanent ignores, suspicious bucket, 'Mark all as Create', category memory on reconcile" (roadmap feature 002). Built on the V2 import pipeline, with the hard constraint of no regression versus the V1 reconciliation flow.

**Fork-only**: yes (C6-driven workflow with no upstream signal). It must stay shippable as an upstream PR without fork tooling (constitution II).

**Dependencies**: needs 001 (C6 parsers, profile registry, row identity, merchant-aware key). Closure proofs, projection bar, invoice credits and the "paid but not reconciled" icon are 003.

## Source

V1 evidence (fork `D:\Repos\daniel-cabral\openmonetis`):

- Matcher and rules: `src/shared/lib/reconciliation/matcher.ts`, `matcher.test.ts` (44 cases).
- Plan, review, candidates, origin, action: `src/features/transactions/lib/{reconciliation-plan,reconciliation-review,reconciliation-candidates,reconciliation-origin}.ts` and their tests (20, 35, 8, 11 cases); `src/features/transactions/actions/{reconciliation-action,reconciliation-candidates-action,name-memory-action,category-memory-action}.ts`, `reconciliation-action.test.ts` (10 cases).
- Screen: `src/features/transactions/components/reconciliation/{reconciliation-page,origin-confirmation,reconciliation-summary,reconciliation-review,upload-zone}.tsx`.
- Schema: `src/db/schema.ts` (`reconciliationIgnores`, `importNameMappings`, `importCategoryMappings`).
- OpenSpec: `openspec/specs/statement-reconciliation` (requirements: classification, learned category, ignored lines, batch apply/undo, suspicious match, undo match, bulk create), `openspec/specs/reconciliation-name-mapping`, `openspec/changes/fix-reconciliation-amount-authority`, `openspec/changes/widen-reconciliation-date-window`, `openspec/changes/archive/2026-11-11-harden-reconciliation-review`.
- Oracle fixtures shared with 001: `src/shared/lib/reconciliation/__fixtures__/{c6-extrato.csv,c6-fatura.csv,fixtures.test.ts}`.

Inventory rows covered (section 1.2): reconciliation screen with target inference; deterministic matcher and buckets; name+period match with learned map (`import_name_mappings`), "link to existing", editable name; file value wins on match; matched pending entry becomes paid; batch apply with undo and skipped-line warnings; permanently ignored bank lines; suspicious bucket "Needs your decision" and "Undo match"; "Mark all as Create"; reconciliation feeds category memory; row fingerprint stamping on manual entries (identity generation is 001). Invoice credit lines, closure and projection are NOT covered here (003).

### V1 behavior: kept, changed, dropped

| V1 behavior | Decision | Why |
|---|---|---|
| Five ordered match rules, one-to-one consumption, ambiguity never auto-resolved, +/-2 day window | Kept | This is the core of the no-regression oracle. |
| Bank file is authority on amount (no per-line keep/update choice) | Kept | `fix-reconciliation-amount-authority` is the V1 final state, not the earlier choice. |
| Matched pending account entry becomes paid; undo returns it to pending | Kept, mapped to the V2 settlement model | Observable outcome identical; mechanism is a plan decision. |
| Subcategory as a separate field remembered next to category | Changed | V2 stores a single (possibly child) category; memory stores that one category. |
| Split (divided) entries keep their amount | Kept (V2: entries with person splits) | Totals live per person; changing the total alone would break the distribution. |
| Transfers as two rows | Kept, mapped to V2 | V2 stores a transfer as two posting rows sharing a transfer id; each row is the side of one account and holds that side's identity (FR-024). |
| Recurring entries as materialized rows | Changed | V2 recurrence is a rule expanded per period (see clarification). |
| Ignored lines survive undo | Kept | The decision not to book a line belongs to the user, not to the batch. |
| Reconciliation as a parallel flow with its own parsers | Changed | Built on the V2 import pipeline: shared parsers, registry, row identity, batch id, category memory. |

## Clarifications

### Session 2026-11-11

Answered autonomously by the lane worker from the V1 code, the inventory and the V2 import, settlement and recurrence code.

- Q: Do reconciliation creations on a card go through the card limit check? → A: No. The bank already authorized the purchase (V1 has no limit check on reconciliation). The paid-invoice rule still applies: a creation in a paid invoice period rejects the whole batch with `INVOICE_ALREADY_PAID` and a PT-BR message.
- Q: Where does the screen live, where do classification and the apply plan run, and what does Apply trust from the client? → A: A sibling route `/transactions/reconciliation` ("Conciliar extrato"), reached from a button next to "Importar" in the transactions screen and from the mobile actions menu, as in V1. It is a separate feature (`reconciliations`) that reuses the 001 detect endpoint, profile registry, parsers and row identity; the import screen is unchanged. Classification and the apply plan run on the server (AGENTS.md: no financial rule in the UI). Preview receives the file, profile, target and invoice period and returns lines with buckets, candidates and suggestions. Apply re-sends the same file, profile and target plus one decision per line index; the server re-parses, recomputes identities and re-classifies, so amounts and identities always come from the file. If an entry referenced by a decision is gone, owned by nobody visible, or no longer matches what the review showed, the whole batch is rejected with `RECONCILIATION_STALE` (nothing written) and the user re-reads the file.
- Q: How do batch and undo reuse the import batch id, and how is undo data carried? → A: Apply generates one batch id, stamps it as `import_batch_id` on created entries only, and stores a per-user undo journal row keyed by that id (stamped and released identities, previous amounts, entries settled by the apply). The apply result returns the batch id; Undo sends only the id (`DELETE /reconciliations/{batchId}`), so the client never carries data that could be forged. Undo runs once and deletes the journal row. Pre-existing entries never receive the batch id (the 001 import undo deletes by batch id).
- Q: What is the V2 mechanism for "file value wins" and "pending becomes paid"? → A: The file value is written to the field that is the entry's effective amount. Account target, pending regular entry: it is settled with the file value as settled amount and the line's posted date (launch date when absent) as settled date, through the existing settlement path (settlement event recorded); undo un-settles it, which restores the planned amount. Account target, already-paid entry: the settled amount (or the amount when no settled amount exists) is set to the file value. Card target: the entry amount is set to the file value. Account recurring occurrence: settled as an occurrence with the file value; already settled: its settled amount is aligned. Undo restores each previous value from the journal. Entries whose amount cannot be aligned keep it, are still reconciled, and show the reason on the row: person splits, transfers (the amount belongs to both accounts), generated entries (for example invoice payments), entries in a paid card invoice, and card recurring occurrences (V2 has no per-occurrence amount for cards). The settlement rule "financial changes on confirmed records require undoing the settlement" applies to manual edits, not to this journaled system action. The identity of a recurring occurrence is stored on its row in `recurring_transaction_occurrences` (new nullable identity columns, created as an occurrence exception when the occurrence has none). Identity uniqueness per user spans transactions and occurrences and is checked inside the apply transaction.
- Q: How are lines ignored in an earlier reconciliation shown? → A: In an "Ignoradas (N)" bucket, read-only, with the stored reason and no decision (V1 silently hid them; FR-007 requires every line in exactly one bucket).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a reconciliation and see where the file stands (Priority: P1)

The user opens the reconciliation screen, drops a C6 statement or invoice CSV, confirms the profile and the target (account or card), and sees a summary of how many lines matched, exist only in the bank, exist only in the app, or are ambiguous. Nothing is written yet.

**Why this priority**: the entry point; everything else hangs off it.

**Independent Test**: upload `c6-extrato.csv` for an account and verify profile, target prefill, summary counts, and that the database is untouched.

**Acceptance Scenarios**:

1. **Given** the statement fixture, **When** uploaded, **Then** the profile "C6 Bank - Extrato de conta corrente" is preselected, the required target is an account, and the user can change the profile (and then the target kind changes accordingly).
2. **Given** the preamble `Agência: 1 / Conta: 99999999` and exactly one account of the user whose name contains the digits `99999999`, **When** the file is read, **Then** that account is preselected and remains editable.
3. **Given** account names that contain the agency digits only, fewer than 4 digits, more than one candidate account, or no candidate, **When** the file is read, **Then** no account is preselected.
4. **Given** an invoice file, **When** uploaded, **Then** the file carries no card identification, so the card and the invoice period (YYYY-MM) are required before parsing proceeds.
5. **Given** the user reviews the summary and walks through buckets without confirming, **When** they leave, **Then** nothing was written to the database (no transactions, identities, memories or ignores).
6. **Given** the statement has 113 lines, **When** classified, **Then** the lines in matched + bank-only + ambiguous + ignored + informational buckets add up to exactly 113 (no line lost or duplicated).

---

### User Story 2 - Deterministic matching with explainable buckets (Priority: P1)

Each file line is classified by fixed, ordered rules. The first rule that finds a candidate decides the line; one candidate means matched, two or more means ambiguous (never auto-resolved), none means bank-only. Entries of the target in the file period with no line are app-only.

**Why this priority**: it is the V1 behavior the user relies on and the main regression risk.

**Independent Test**: run the ported V1 matcher cases and the fixtures; compare buckets line by line with V1.

**Acceptance Scenarios**:

1. **Given** a line whose identity is already stored on an entry (re-upload of an applied file), **When** classified, **Then** it is matched by identity and wins over every other rule; applying the same file twice creates no duplicate.
2. **Given** an invoice line `Parcela 2/12`, R$ 1.800,00 and an entry of a 12-installment series, current installment 2, R$ 1.800,00, **When** classified, **Then** it matches by installment regardless of the entry's date; a series with total 10, or current installment 3, or a different amount does not match.
3. **Given** a line of R$ 150,00 on 10/07 and one entry of R$ 150,00 dated 12/07, **When** classified, **Then** it matches by exact value; **Given** the entry is dated 13/07, **Then** it does not (window is +/-2 days, tested against launch date and against posted date).
4. **Given** an expense line and an income entry with the same absolute value, **Then** they do not match; a 1-cent difference does not match by the exact rule.
5. **Given** an invoice line R$ 86,59 with installment `2/3` and an entry of R$ 86,61, **When** classified, **Then** it matches by the cents rule (tolerance up to R$ 0,05); **Given** the same line without installment info, **Then** it does not match; **Given** an entry of R$ 86,65, **Then** it does not match.
6. **Given** one line and two entries of the same value inside the window, **When** classified, **Then** the line is ambiguous with both candidates listed, and neither candidate is reported as app-only.
7. **Given** a line that stopped as ambiguous at a stronger rule, **Then** a weaker rule never resolves it on its own.
8. **Given** two lines competing for two candidates where one line matches only one of them, **When** classified, **Then** matching iterates until stable: the first line takes its only candidate and the second line resolves to the remaining one.
9. **Given** two identical lines and one candidate, **Then** the candidate is consumed by only one line and the other is bank-only.
10. **Given** a line with no candidate by any rule, **Then** it is bank-only (a suggestion to create); an entry in the period with no line is app-only (informational, no action).
11. **Given** an account target and a statement covering 04/07 to 02/09, **When** the app-only bucket is built, **Then** an entry unmatched on 03/07 (reached only by the search margin) is not listed; **Given** a card target and invoice period 2026-08, **Then** an unmatched entry of period 2026-06 is not listed, while an entry of period 2026-08 with purchase date 28/07 is still a valid candidate for matching.
12. **Given** a card target, **When** candidates are searched, **Then** only entries of the invoice period are candidates (an old installment line never matches the previous month's installment).
13. **Given** invoice lines classified as payment of the previous invoice or as credit of this invoice, **Then** they are informational in this feature (no create action, no write); creating credit entries is feature 003.

---

### User Story 3 - Recurring bills match by learned name and period (Priority: P1)

When the user teaches the system that a bank descriptor corresponds to a named entry, later files match that entry by name and period even if the date and amount differ.

**Why this priority**: rent and utility bills never match by value or date; without it they are "bank-only" forever.

**Independent Test**: teach `CASA NOVA LOCADORA LTDA - EPP - Boleto` = `Aluguel`, upload a new statement, and verify the match.

**Acceptance Scenarios**:

1. **Given** the descriptor `CASA NOVA LOCADORA LTDA - EPP - Boleto` of 11/08, R$ 2.356,51 is learned as `Aluguel` and an entry `Aluguel` of period 2026-08 dated 15/08 for R$ 2.300,00 exists, **When** classified, **Then** the line matches that entry and the value will be aligned (User Story 4).
2. **Given** a line that would match both by exact value and by name+period with different entries, **Then** the exact rule wins.
3. **Given** two entries named `Aluguel` in the line's period, **Then** the line is ambiguous with both candidates.
4. **Given** the learned entry is an expense and the line is income, or the entry is in another period (line on 31/08, entry in 2026-09), **Then** no match by this rule.
5. **Given** a card target, or a descriptor with no learned name, **Then** this rule never produces a candidate.
6. **Given** a bank-only line whose descriptor has a learned name `Aluguel`, **Then** the creation form proposes the name `Aluguel`; otherwise it proposes the bank descriptor; a creation with an empty name is blocked.
7. **Given** the user links a bank-only line to an existing entry, **When** applying, **Then** the entry receives the line identity, no entry is created, and (account target) the descriptor to name pairing is learned; entries already consumed by another line of this reconciliation appear in the choice list as unavailable. On a card target the link reconciles and learns no name.
8. **Given** a line matched automatically by any rule without the user confirming a pair or typing a name, **Then** no name pairing is learned.
9. **Given** the descriptor `CASA NOVA ...` is learned again with the name `Aluguel Sala Comercial`, **Then** the single stored pairing for that key is replaced; the key is always the bank descriptor, never the typed name.

---

### User Story 4 - Apply the decisions as one batch, with the file as authority, and undo it (Priority: P1)

On Apply, all decisions are written together: new entries, identities stamped on existing entries, amounts aligned to the file, pending account entries marked paid, ignores recorded, memories updated. The user can undo the whole batch.

**Why this priority**: it is what changes the user's books; correctness here is the regression oracle.

**Independent Test**: apply a mixed set of decisions, verify each write, undo, and verify the exact previous state.

**Acceptance Scenarios**:

1. **Given** a line matched to an entry of R$ 2.300,00 while the file says R$ 2.356,51, **When** the user applies, **Then** the entry's amount is R$ 2.356,51 everywhere amounts are shown (statement, balances, budgets, lists) and it carries the line identity; the review showed `R$ 2.300,00 -> R$ 2.356,51` beforehand and the divergence did not block Apply.
2. **Given** the user manually links a line to the recurring entry `Unimed Mãe` whose value is an estimate, **When** applying, **Then** the entry takes the file value (manual link is not an exception).
3. **Given** a cents-rule match (86,59 file vs 86,61 entry), **When** applying, **Then** the entry becomes R$ 86,59.
4. **Given** the matched entry has person splits, **When** applying, **Then** its amount is left untouched, the reason is shown on the row, and the entry is still reconciled.
5. **Given** a pending entry of R$ 210,00 matched on an account target, **When** applying, **Then** it becomes paid; **Given** an already-paid entry, **Then** it stays paid; **Given** a card target, **Then** no settlement state changes.
6. **Given** the user applies and immediately undoes, **When** undo runs, **Then**: created entries are removed; identities stamped on pre-existing entries are cleared; amounts return to their previous values; entries that the apply made paid return to pending (those already paid stay paid); identities that undone matches had released are given back where still free.
7. **Given** a user with entry "Mensalidade Colégio Santo Agostinho" holding the identity of a line and the user chose "Create new" for it, **When** applying, **Then** the identity is released from the old entry (its value and paid state unchanged) before the new entry is created with it, and undo gives the identity back to the old entry.
8. **Given** a creation whose identity already belongs to an entry outside what the review showed, **When** applying, **Then** that creation is skipped, never partially written, and the result warns "N linha(s) não foram criadas: já estão vinculadas a lançamentos de outro período."
9. **Given** any entry, person, category, account or card id in the request that does not belong to the user, **When** applying, **Then** the whole batch is rejected with nothing written.
10. **Given** ignored lines, **When** the batch is undone, **Then** the ignores remain.
11. **Given** the batch is applied, **Then** it is written atomically: either every write succeeds or none.

---

### User Story 5 - Decide the doubtful cases in review (Priority: P2)

Matches that may be wrong are surfaced before Apply, every match can be undone from the review, and bank lines that are not bookable can be ignored for good.

**Why this priority**: real month-boundary errors in V1 are the origin of these rules.

**Independent Test**: reproduce the five suspicious scenarios and the ignore scenario with fixture-based data.

**Acceptance Scenarios**:

1. **Given** a statement covering 12/10 to 11/11 and line "Pix enviado para FERNANDA M FERNANDES" 26/10 R$ 275,00 matched by name+period with "Terapia - Fernanda" dated 11/10, **When** reviewed, **Then** it appears in the bucket "Precisa da sua decisão (N)" above "Casadas" with the reason "Casou com “Terapia - Fernanda” de 11/10, antes do início do arquivo (12/10). O débito desse lançamento pode ter sido outro.", preselected on "Manter casamento", and "Casadas" does not count it.
2. **Given** line "COLEGIO SANTO AGOSTINHO DIVINO" 15/10 R$ 1.560,85 matched by identity with an entry of R$ 1.643,00, **Then** it appears in the same bucket with reason "Valor diferente: o lançamento “Mensalidade Colégio Santo Agostinho” tem R$ 1.643,00. Manter alinha o valor ao do arquivo."
3. **Given** an invoice line with purchase date 14/01/2025 matched by installment with the same value, **Then** it stays in "Casadas" with no warning (the date rule never applies to cards).
4. **Given** the CEMIG line 16/10 R$ 106,28 matched by name+period with an entry of R$ 110,00, **Then** it stays in "Casadas" with a note that the value will be aligned; **Given** an ordinary exact match, **Then** no warning; **Given** an entry dated on the first day of the file (12/10), **Then** no warning (only strictly earlier dates warn).
5. **Given** a suspicious or ordinary matched line, **When** the user opens the undo match control, **Then** the options are "Manter casamento", "Criar lançamento novo", "Vincular a outro lançamento" and "Pular"; in the suspicious bucket as a selector, in the other matched lines through a "Desfazer casamento" button.
6. **Given** the user chooses "Vincular a outro lançamento" for Fernanda, **When** applying, **Then** the line reconciles with the chosen entry and "Terapia - Fernanda" is unchanged.
7. **Given** the only decision in the whole review is "Pular" on an identity-matched line, **Then** Apply is enabled, and on apply only the old entry's identity is cleared. Suspicion warnings never block Apply.
8. **Given** the user marks a bank line as ignored with a reason, **When** applying, **Then** the identity and reason are stored; on a later reconciliation of the same file the line appears as ignored and asks for no decision.
9. **Given** the "Só no banco" bucket with 22 lines (20 on "Pular", 1 on "Vincular", 1 on "Ignorar"), **When** the user clicks "Marcar todas como Criar", **Then** the 20 become "Criar" and the other two keep their decision.
10. **Given** ambiguous lines marked "Criar", **Then** they offer category selection like the bank-only bucket, pre-filled from memory.

---

### User Story 6 - Reconciling teaches the category memory (Priority: P2)

Matching a line to an entry that already has a category, or creating an entry with a chosen category, remembers that category for the line's descriptor; the suggestion is always shown pre-filled and editable, never applied silently.

**Why this priority**: it reduces the manual work of every following month.

**Independent Test**: reconcile `ADRENALINA NUTRICAO ES` against a "Saúde" entry and verify the suggestion on a later file.

**Acceptance Scenarios**:

1. **Given** line `ADRENALINA NUTRICAO ES` matched with an entry in category "Saúde", **When** applied, **Then** the pair (normalized descriptor, Saúde) is remembered.
2. **Given** the bank-only line "Pix enviado para DOARE" created with category "Doações", **When** applied, **Then** the pair is remembered; a creation with no category remembers nothing.
3. **Given** a bank-only line whose descriptor has a learned category, **Then** the creation form shows it pre-filled and editable and the entry exists only after the user confirms.
4. **Given** an invoice line with an issuer category and a learned category for its descriptor, **Then** the learned category wins; with no learned category, the issuer category (when it maps to a compatible user category by name) is the suggestion.
5. **Given** a child category was chosen for a creation, **Then** the remembered choice is that child category; changing the category of a line replaces what would have been remembered.
6. **Given** two lines of the same applied batch that normalize to the same descriptor key, **Then** a single memory record is written (no conflict).

### Edge Cases

- An invoice period already fully paid: matching and identity stamping must remain possible; creating new entries in a paid period follows the existing V2 rule (rejected with a PT-BR message).
- Card creation exceeding the card limit: the bank already authorized the purchase, so reconciliation creations skip the limit check (the paid-invoice rule still applies).
- File lines on a date outside any open period, or a statement spanning more than one month: each line derives its period from its own date (account) or the chosen invoice period (card).
- A re-uploaded file after partial application: lines already applied match by identity, the rest are classified normally.
- Two bank lines with identical date, description and amount (as in the fixture): they get distinct identities and can match two different entries.
- Concurrent edit of an entry between review and Apply (entry deleted, or the re-classification differs from what the review showed): the whole batch is rejected with nothing written and a PT-BR message asking to read the file again (`RECONCILIATION_STALE`), never silently overwritten. The same rejection applies when any line's classification differs from the reviewed one, even without an explicit decision on it.
- An entry with amount larger than R$ 0,00 only: V2 forbids zero amounts, so there are no zero-value placeholders to fill.
- The user closes the page after Apply: undo is available from the result shown right after Apply (as in V1); a later correction goes through "undo match" in a new reconciliation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a reconciliation screen (reachable from the transactions area) that accepts a C6 statement or invoice CSV using the 001 profile registry, with the profile editable and the target kind derived from the profile.
- **FR-002**: The system MUST preselect the target account from the file's account identification only when exactly one of the user's accounts has a name containing the file's account digits (at least 4 digits, agency ignored); otherwise leave it empty. Card and invoice period MUST be chosen by the user for invoice files.
- **FR-003**: The system MUST NOT write anything (transactions, identities, memories, ignores) until the user explicitly applies.
- **FR-004**: The system MUST generate and use the 001 row identity for each file line, and MUST classify each line, in this fixed order and stopping at the first rule that yields a candidate: (1) identity already stored, (2) installment `N/M` against the entry's series total and current installment with equal signed amount, (3) equal signed amount within +/-2 days of launch date or posted date, (4) amount within R$ 0,05 only when the line carries installment information, (5) learned name plus period (account target only; same sign; ignores date and amount).
- **FR-005**: One candidate MUST mean matched; two or more MUST mean ambiguous, listing every candidate, never auto-resolved by a weaker rule; none MUST mean bank-only. An entry MUST be consumed by at most one line; matching MUST iterate until the result is stable.
- **FR-006**: Entries of the target that no line claimed, and that are not candidates of an ambiguous line, MUST be listed as app-only (informational). For accounts only entries dated inside the real file range are listed; for cards only entries of the invoice period. The search margin used for matching MUST NOT affect what is listed. For cards, only entries of the invoice period are candidates.
- **FR-007**: Each line MUST appear in exactly one bucket: matched, needs-your-decision, bank-only, ambiguous, ignored, or informational (non-purchase invoice lines).
- **FR-008**: Previous-invoice payments and invoice credits MUST be informational with no write action in this feature.
- **FR-009**: The bank file MUST be the authority on amount: whenever a matched or manually linked entry has a different amount, the system MUST show `app -> file` in review and align the entry to the file value on Apply, for every rule and for manual links, without requiring a choice and without blocking Apply. Entries with person splits, transfers, generated entries, entries of a paid card invoice and card recurring occurrences MUST keep their amount with the reason shown on the row (they are still reconciled). The file value is written to the entry's effective amount (settled amount when settled, otherwise the amount; a pending account entry is settled with the file value per FR-010).
- **FR-010**: On Apply with an account target, a matched pending entry MUST become paid with the file value as settled amount and the line's posted date (launch date when absent) as settled date (already-paid entries stay paid); a pending transfer is settled as a pair; with a card target no settlement state changes.
- **FR-011**: The system MUST store the line identity on every matched, linked or created entry on Apply, scoped by user, so the same file reconciles idempotently.
- **FR-012**: The system MUST keep a per-user learned map from the normalized bank descriptor to an entry name, written only on Apply: from manual links and from created entries with a typed name on an account target, and from manual links on a card target; never from automatic matches; one record per key, latest name wins.
- **FR-013**: Bank-only lines MUST offer: Create (editable name pre-filled with the learned name or the descriptor, date, amount, type, category, person defaulting to the admin person), Link to existing entry (entries of the line's period, already-consumed ones shown as unavailable), Ignore (with reason) and Skip (default). A creation with an empty name MUST block Apply with the reason visible; no other condition blocks Apply.
- **FR-014**: The system MUST persist deliberately ignored lines per user (identity and reason) and show them as ignored in later reconciliations without asking again; ignores MUST survive batch undo.
- **FR-015**: The system MUST flag as needing a decision, in a bucket above "Casadas", every matched line (any rule) whose entry (a) is dated strictly before the file start (account target only) or (b) was matched by stored identity with a different amount. Differences in amount from other rules MUST NOT be suspicious. Each flagged line MUST show the PT-BR reason and default to "Manter casamento". Warnings MUST NOT block Apply.
- **FR-016**: Every matched line MUST offer Keep match, Create new entry, Link to another entry, Skip. Choosing anything other than Keep on an identity-matched line MUST clear that identity from the old entry on Apply (before creating or linking) without altering its amount or paid state; undo MUST return it. "Skip" on such a line alone MUST make Apply enabled.
- **FR-017**: The "Só no banco" header MUST offer "Marcar todas como Criar" that switches only lines currently on Skip to Create, preserving other decisions.
- **FR-018**: Ambiguous lines marked Create MUST offer category selection pre-filled from memory.
- **FR-019**: On Apply the system MUST remember (normalized descriptor, category) for matched entries that already have a category and for created entries with a chosen category; a suggestion MUST be pre-filled and editable, never applied without confirmation; learned memory takes precedence over the issuer's category; creations without category write nothing.
- **FR-020**: Apply MUST be atomic and return the batch id and counts (created, reconciled, ignored, skipped) with the warning for skipped creations; it MUST re-parse the file and re-classify on the server, and MUST reject the whole batch if any referenced id is not owned by the user, if an entry/category/account/card is unavailable, if the re-classification no longer supports a decision (`RECONCILIATION_STALE`), or if a creation falls in a paid card invoice (`INVOICE_ALREADY_PAID`). Card creations skip the card limit check.
- **FR-021**: The system MUST provide Undo for the whole applied batch, identified only by the batch id (undo data is kept server-side per user and consumed once): remove created entries, clear stamped identities, restore previous amounts, return to pending only what the Apply itself made paid, give back released identities where still free; ignores and learned memories remain.
- **FR-022**: Every query and write MUST filter by the authenticated user; no internal ids, hashes or stack traces are exposed; all user-facing text is PT-BR and identifiers/contracts are English; amounts are handled in integer cents; financial rules (matching, amount alignment, settlement, projection inputs) live in the domain layer.
- **FR-023**: Recurring-rule occurrences of the target in the reconciled period MUST be eligible match candidates and aligning, settling and stamping MUST affect only the matched occurrence, never its rule or other occurrences. Resolved (orchestrator, 2026-11-11): default confirmed. Recurring occurrences are match candidates; identity, amount alignment and paid state are stored per occurrence (as an occurrence exception where needed).
- **FR-024**: Transfers MUST be reconcilable: a statement line on account A matches a transfer entry when A is its source (outgoing, expense sign) or its destination (incoming, income sign), with the same amount and window rules. Resolved (orchestrator, 2026-11-11): default confirmed. Per-side rule: each side of a V2 transfer holds its own statement identity, so one transfer can be consumed by one line in each of the two account statements.

### Key Entities *(include if feature involves data)*

- **Reconciliation session** (ephemeral): parsed file, profile, target (account or card), invoice period, row identities, classification, user decisions.
- **Match result**: per line, status (matched, ambiguous, bank-only), rule that decided, candidate entry id(s), amount divergence, suspicion reasons.
- **Row identity** (from 001): stamped on entries; the stable key linking a bank line to an entry.
- **Name pairing**: per user, normalized bank descriptor to entry name.
- **Category memory entry** (existing): per user, normalized descriptor to category.
- **Ignored line**: per user, row identity and reason, persistent.
- **Reconciliation batch**: batch id shared by created entries (as their import batch id); a per-user server-side undo journal keyed by it holds the data needed to undo (previous amounts, stamped and released identities, entries settled by the apply); deleted when undone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No-regression oracle (matcher): all V1 matcher test blocks (44, including the 8-row `detectMatchSuspicions` table) are ported and pass; running the statement fixture against the V1 app-side data used by the V1 tests yields the same bucket per line as V1 (the V1 real-data run of 113 lines partitioned 71 + 35 + 7 = 113 is the integrity reference).
- **SC-002**: No-regression oracle (review/plan/action): all V1 review (35), plan (20), candidates (8), origin (11) and action (10) test blocks are ported and pass with the same outcomes (amount authority, name learning rules, release and give-back of identities, settle and un-settle on undo, skipped-line count), except the closure (`deriveReconciliationClosure`, 4) and balance-status (`toBalanceStatus`, 1) blocks and V1 invoice-credit note cases, which belong to 003.
- **SC-003**: Applying the same file twice creates 0 duplicate entries; applying and then undoing restores the exact pre-apply state (amounts, paid state, identities) for 100% of tested decision mixes, except ignores and memories that intentionally remain.
- **SC-004**: Review is read-only: 0 writes before Apply in all tested flows.
- **SC-005**: Every suspicious scenario of User Story 5 shows its exact PT-BR reason and no suspicious scenario blocks Apply; the "ordinary exact match", "old installment on invoice", "CEMIG estimate" and "first day of file" cases show 0 warnings.
- **SC-006**: A user can reconcile a typical month (about 110 statement lines) by walking the buckets, with every needed action reachable without leaving the screen and without any SQL or support intervention.
- **SC-007**: User isolation: in tests with two users, 0 cross-user reads or writes in matching, apply, undo, memories and ignores.
- **SC-008**: Existing V2 import and settlement tests keep passing unchanged.

## Assumptions

- Dependencies: 001 provides parsers, registry, row identity and the merchant-aware key; 003 adds closure, projection and invoice credits.
- The screen is a sibling route of the import screen and the batch/undo mechanism is fixed in Clarifications; the UI choice is recorded in "UI decisions".
- The V2 mechanism for "file value wins" is fixed in Clarifications (effective amount field, settlement path for pending entries, journaled undo); the user never undoes a settlement by hand.
- "Becomes paid" on an account target uses the file line's posted date (launch date when absent) as the effective date and the target account, per V2 settlement conventions.
- The default person of a created entry is the admin person; the user may choose another person per line.
- The +/-2 day window and R$ 0,05 tolerance are fixed constants calibrated on real data (58 lines vs 63 entries: +/-1 left 5 orphans, +/-2 left 0 with 11 ambiguous, +/-3 or more got worse on both axes); they are not user settings.
- Undo is offered from the result of an Apply (as in V1); a durable undo history is out of scope.
- Skipped creations are only those rejected by the identity uniqueness guard; they are counted and warned, never silently dropped.
- Upstream overlap check (CHANGELOG, import and inbox rules code) is recorded in the plan per the roadmap; the existing V2 import review and category-memory code are extended, not duplicated.
- Deliverables follow constitution II: product code, versioned forward-only migrations (new ignores and name pairings tables; no `push`), tests per `docs/testing.md`, `CHANGELOG.md` entry under `### Fork`, and a `docs/` contract.

## UI decisions

Chosen autonomously (mockup-ui, 2026-11-11): **option A**. Previews (local, not committed, outside the repo): `option-a.html`, `option-b.html`, `option-c.html` in the lane worker scratchpad `previews/`, rendered with the app's `apps/web/src/styles/app.css` compiled by Tailwind.

- Route `/transactions/reconciliation`, single column, as in V1: header "Conciliar extrato" with "Voltar para lançamentos"; upload Card (reuses the import upload component) that becomes a file Card with "Perfil do banco" Select, "Conta de destino"/"Cartão de destino" Select (account prefilled per FR-002), and for invoices "Período da fatura" (month picker); action "Ler arquivo" disabled until complete; "Escolher outro arquivo" resets.
- Summary: count tiles "Precisa da sua decisão", "Casadas", "Só no banco", "Ambíguas", "Ignoradas", "Informativas" (V1 had four tiles; the two new tiles follow FR-007).
- Buckets as stacked `Card`s with title "Nome (N)", in this order: "Precisa da sua decisão" (only when N > 0, `Badge` destructive "Suspeito", reason text, Select defaulting to "Manter casamento"), "Casadas" (rule as "casada por ...", divergence `app X → arquivo Y` with the alignment or kept-amount note, ghost Button "Desfazer casamento" revealing the decision Select), "Só no banco" (header outline Button "Marcar todas como Criar"; per-row Select "Criar lançamento" / "Vincular a outro lançamento" / "Ignorar" / "Pular", default Pular; Criar shows name Input, category Select and person Select; Ignorar shows "Motivo…" Input; Vincular shows an entry Select with consumed entries disabled as "já usado"), "Ambíguas" (Select "Escolher candidato…" plus Criar / Ignorar / Pular), "Só no app" (read-only), "Ignoradas" (read-only with reason), "Informativas" (previous-invoice payments and invoice credits, read-only). Empty bucket shows "Nada aqui.".
- Sticky bottom bar: counts of what Apply will do, suspicious and alignment counts, blocking reason (empty names) in destructive text, primary Button "Aplicar" ("Aplicando…").
- After Apply: a `sonner` toast "{criados} criados, {conciliados} conciliados, {ignorados} ignorados." with action "Desfazer" (as V1), plus a warning toast for skipped creations; the screen returns to the upload step.
- Discarded: option B (Tabs per bucket, Apply in the header) hides suspicious and bank-only work behind tabs and breaks the V1 top-to-bottom walk; option C (one dense table with a bucket filter) cannot fit the per-row creation fields and drops the bucket headers that carry "Marcar todas como Criar".

## Execution decisions (2026-11-11)

- Integration test files resolved `packages/db/drizzle` and `.env` with `new URL(...).pathname`, which yields `/D:/...` on Windows and broke every DB integration test in the lane; switched to `fileURLToPath` (test-only change, commit `a74cc97`).
- Lane lint gate: the repo `biome.json` force-ignores `**/.claude`, which contains the worktree path, so `pnpm lint` checks 0 files in a lane worktree. Gate used: Biome over the files this branch changed vs `main`, from the committed tree exported outside `.claude`, with `--line-ending=crlf` (the fork stores CRLF blobs). `pnpm lint:ui` ran normally.
- `pnpm db:migrations:check` hashes working-copy bytes; with `core.autocrlf=true` the baseline hash mismatches. Gate run on an LF export (`git -c core.autocrlf=false archive`): 33 migrations valid. The committed baseline blob matches the stored hash.
- Migration `0032_remarkable_human_fly` collides in number with `main`'s `0032_aromatic_grey_gargoyle` (feature 004); left for the merge protocol (regenerate on top of `main`).
