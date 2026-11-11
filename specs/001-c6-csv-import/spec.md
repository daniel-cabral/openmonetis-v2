# Feature Specification: C6 CSV Import (statement and invoice)

**Feature Branch**: `001-c6-csv-import`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "C6 statement + invoice CSV parsers, parser registry/signature detection, row fingerprint for lines without FITID, merchant-aware description key, `.xls` legacy import" (roadmap feature 001, adapt on the V2 import pipeline, no regression versus the V1 flow).

**Fork-only**: yes. C6 Bank exports are a Brazil/bank-specific format and nothing in upstream signals interest. The deliverable must still be shippable as an upstream PR (constitution II) and must not require unrelated upstream edits.

**Dependencies**: none (001 is the first feature of lane A; 002 and 003 build on it).

## Source

V1 evidence (fork `D:\Repos\daniel-cabral\openmonetis`):

- Parsers and registry: `src/shared/lib/import/parsers/{c6-statement-csv,c6-invoice-csv,registry,detect}.ts` and their `*.test.ts`.
- Row identity: `src/shared/lib/reconciliation/fingerprint.ts`, `fingerprint.test.ts`.
- Description key: `src/features/transactions/lib/import-utils.ts`, `import-utils.test.ts`.
- Fixtures (the no-regression oracle): `src/shared/lib/reconciliation/__fixtures__/c6-extrato.csv`, `c6-fatura.csv`, `fixtures.test.ts`.
- OpenSpec: `openspec/specs/statement-reconciliation` (requirements "Parsing de extrato CSV do C6", "Parsing de fatura CSV do C6", "Perfil de banco e destino do arquivo", "Identidade de linha sem identificador do emissor", "Aprendizado de categoria por descriptor"), `openspec/specs/invoice-closure-correction` (requirement "Classificacao de linha da fatura em tres estados").
- `.xls`: `src/shared/lib/import/xls-parser.ts`, `src/features/transactions/components/import/upload-zone.tsx`.

Inventory rows covered (`.specify/migration/inventory.md`, section 1.2 unless noted): C6 statement CSV parser; C6 invoice CSV parser; row fingerprint for lines without FITID (identity part only, stamping on manual entries is 002); merchant-aware description key; section 1.1 "Import OFX/QFX/XLS/XLSX" (the `.xls` part).

V2 starting point: the import pipeline accepts only OFX, QFX and XLSX, dedupes only by issuer id (FITID) within a source, and learns categories by a trimmed, lowercased description.

### V1 behavior: kept, changed, dropped

| V1 behavior | Decision | Why |
|---|---|---|
| Statement parser: preamble, BOM, sign, account number, period, day balance, posted date | Kept | Closure proofs (003) and matching (002) need exactly these fields. |
| Invoice parser: `;` separator, `N/M` installments, USD FX, original purchase date, 3 line kinds | Kept | Same. |
| Registry of profiles with header signature as a suggestion only | Kept, adapted | Becomes the entry point of the V2 import (extra formats plug in later). |
| Row fingerprint with positional occurrence, destination included | Kept | Required for idempotent re-import and for 002 stamping. |
| Fingerprint written in a dedicated V1 column | Changed | V2 reuses its existing import identity fields; no parallel model. |
| Merchant-aware description key | Kept | V2 only trims and lowercases, so card descriptors rarely hit the learned memory. |
| Naive comma splitting of statement rows | Changed | Quoted fields must stay in one field. |
| Credit and payment invoice lines importable as plain income | Dropped for this feature | That was the V1 bug fixed by a typed credit origin, delivered in 003. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a C6 account statement CSV (Priority: P1)

A user downloads the monthly "Extrato de conta corrente" CSV from C6 and uploads it in the existing import screen. The file is recognized, the lines appear in the review table with correct dates, amounts and types, and the user confirms the import like any OFX import.

**Why this priority**: it is the highest-use file of the V1 flow and the base of reconciliation (002/003).

**Independent Test**: upload `c6-extrato.csv` (113 lines) into the import screen; verify the review table, then import and undo the batch.

**Acceptance Scenarios**:

1. **Given** the fixture `c6-extrato.csv` (BOM, 8 preamble lines, header on line 9), **When** it is parsed, **Then** the preamble is ignored, the account is read as `1/99999999`, the period as 2026-07-04 to 2026-09-02, and 113 lines are produced.
2. **Given** the line `10/07/2026,10/07/2026,BANCO C6 S.A.,Boleto,0.00,12164.10,3147.23`, **When** parsed, **Then** it is an expense of R$ 12.164,10 with date 2026-07-10, posted date 2026-07-10 and day balance R$ 3.147,23.
3. **Given** the line `10/07/2026,...,Pix recebido c6 de Empresa Teste 1 LTDA,...,24867.68,0.00,3147.23`, **When** parsed, **Then** it is an income of R$ 24.867,68.
4. **Given** a line whose launch date is 05/07/2026 and posted date is 06/07/2026, **When** parsed, **Then** both dates are kept distinct (launch date vs accounting date).
5. **Given** a title equal to its description, **When** parsed, **Then** the name shows it once; **Given** an empty description, **Then** the name is the title only; **Given** different title and description, **Then** the name is `Title - Description`.
6. **Given** a file that starts with a byte order mark, **When** parsed, **Then** the mark is dropped and the header is recognized normally.
7. **Given** the file is imported and then the batch is undone, **When** the user checks the transactions, **Then** none of the imported lines remain.

---

### User Story 2 - Import a C6 credit card invoice CSV (Priority: P1)

A user uploads the invoice CSV (`;` separated). Each purchase keeps its original purchase date, installment, card, holder and FX data; negative lines are preserved and labelled, not silently dropped.

**Why this priority**: the invoice file exercises installments, FX and non-purchase lines, which are the riskiest parts of the V1 flow.

**Independent Test**: upload `c6-fatura.csv` (98 lines); verify line kinds, installments, FX and dates in the review table.

**Acceptance Scenarios**:

1. **Given** the fixture `c6-fatura.csv`, **When** parsed, **Then** 98 lines are produced: 96 purchases, 1 credit (`Estorno Tarifa`, R$ 75,00) and 1 previous-invoice payment (`Pag Fatura Boleto`, R$ 9.500,00).
2. **Given** a line with purchase date `14/01/2025` on an invoice due in August 2026, **When** parsed, **Then** the date stays 2025-01-14 (never rewritten to the invoice period) and the first fixture line carries card `1000`, holder `Titular Teste 1`, raw category `Casa / Escritório Mobiliário` and description `LOJA DE FERRAGENS TESTE`.
3. **Given** `Parcela` = `7/8`, **When** parsed, **Then** the installment is 7 of 8; **Given** `Parcela` = `Única`, **Then** the line has no installment.
4. **Given** the line `PLATAFORMA IA TESTE  SA`, US$ 50,00, exchange rate 5,4000, R$ 270,00, **When** parsed, **Then** the line has an FX of USD 50,00 and an amount of R$ 270,00; lines without a USD value have no FX.
5. **Given** `Estorno Tarifa` of -75,00, **When** classified, **Then** it is a credit of this invoice (not a payment); **Given** `Pag Fatura Boleto` of -9.500,00, **Then** it is a payment of the previous invoice; **Given** `ASSINATURA NUVEM TESTE` of 19,90, **Then** it is a purchase of type expense.
6. **Given** the invoice review in the plain import, **When** the user looks at the previous-invoice payment line and the credit line, **Then** neither can be imported as ordinary income (see Assumptions), and both are visible as informational.
7. **Given** an invoice file, **When** parsed, **Then** no account identification and no period are claimed by the file (the user provides the card and the invoice period).

---

### User Story 3 - Format detection is a suggestion, never a decision (Priority: P1)

The import screen suggests the bank profile from the header signature but always lets the user choose another profile; an unrecognized file is not an error.

**Why this priority**: wrong auto-detection must never silently misparse a financial file.

**Independent Test**: upload a statement, an invoice and an unknown CSV; check preselection and the full list of profiles in each case.

**Acceptance Scenarios**:

1. **Given** a file whose header has `Data Lançamento` and `Data Contábil`, **When** uploaded, **Then** "C6 Bank - Extrato de conta corrente" is preselected and the user can switch to any other profile before parsing.
2. **Given** a file whose header has `Data de Compra` and `Parcela`, **When** uploaded, **Then** "C6 Bank - Fatura de cartão" is preselected.
3. **Given** a CSV matching no known signature, **When** uploaded, **Then** no error is shown, the list of profiles is offered, and nothing is parsed until the user picks one.
4. **Given** each profile's header signature, **When** tested against the other profile's header, **Then** it does not claim it.
5. **Given** a statement profile is selected, **Then** the required destination is an account; **Given** an invoice profile is selected, **Then** the required destination is a card.
6. **Given** the statement preamble `Agência: 1 / Conta: 99999999`, **When** the file is peeked before the definitive parse, **Then** the account identification `1/99999999` is available to the screen; an invoice profile returns none.

---

### User Story 4 - Re-importing the same file never duplicates (Priority: P1)

CSV lines have no issuer id, so each line gets a deterministic identity. Uploading the same file again flags every line as already imported, and genuinely identical lines in one file stay importable as separate transactions.

**Why this priority**: without it, a second upload of a statement would double the user's balance.

**Independent Test**: import `c6-extrato.csv`, upload it again, verify 0 new transactions; verify the two identical `Empresa Teste 3 LTDA - Boleto` lines of R$ 2.433,97 on 10/07/2026 both import.

**Acceptance Scenarios**:

1. **Given** the statement fixture was imported, **When** the same file is uploaded again, **Then** all 113 lines are flagged as already imported and importing creates 0 transactions.
2. **Given** the fixture's two identical lines (same date, description and amount), **When** identities are generated, **Then** they differ by occurrence and both can be imported without the uniqueness guard rejecting the second.
3. **Given** an unrelated line is inserted earlier in a re-exported file, **When** identities are generated, **Then** the occurrence is counted inside the group of identical lines, not by file position, so existing identities do not change.
4. **Given** the same file processed twice, **Then** the identities are exactly the same.
5. **Given** the chosen destination changes (another account), **Then** the identity of every line changes.
6. **Given** descriptions that differ only in case and spacing (`PIX ENVIADO - LOJA TESTE` vs `  pix  enviado -  Loja Teste `), **Then** they are the same identity group (occurrence 0 and 1).
7. **Given** statement lines that differ only in posted date, or only in sign of the amount, or invoice lines that differ only in installment or card last four digits, **Then** they have distinct identities.
8. **Given** metadata that is not part of a line's identity (holder name, raw category), **Then** changing it does not change the identity.
9. **Given** OFX, QFX or XLSX imports, **Then** their dedupe by issuer id and spreadsheet source behaves exactly as before.

---

### User Story 5 - Card descriptors share learned categories (Priority: P2)

The same merchant written with different acquirer prefixes, city/country suffixes or store numbers resolves to one category memory key, so a category learned once is suggested for later purchases.

**Why this priority**: raises the hit rate of category suggestions on invoices; no data is at risk.

**Independent Test**: unit-level on the key function plus one import where a learned category is suggested for a variant descriptor.

**Acceptance Scenarios**:

1. **Given** `PG *ABC SUPERMERCADOS CONTAGEM BRA`, **Then** the key is `abc supermercados`.
2. **Given** `DM*hostingercomb`, **Then** `hostingercomb`; **Given** `DM*HOSTINGERCOMB   SAO PAULO   BRA`, **Then** `hostingercomb`.
3. **Given** `CINE RITZ DIVINOPOLI   DIVINOPOLIS   BRA`, **Then** `cine ritz divinopoli` (city separated by a run of spaces is dropped).
4. **Given** `PG *LOJA TESTE   CONTAGEM   BRA` and `PG *LOJA TESTE   BETIM   BRA`, **Then** both have the same key.
5. **Given** `MERCADOLIVRE*MERCADOL`, `MP *ATACADINHOKID` and `B91*PH LANCHES`, **Then** the keys are `mercadolivre`, `atacadinhokid` and `ph lanches` (the side of `*` that identifies the merchant is kept).
6. **Given** `BAR ESQUINA DA SOPA LT` (no country marker), **Then** the key is `bar esquina da sopa lt` (short last word is not dropped).
7. **Given** `DROGASIL2919`, **Then** `drogasil`; **Given** `223 LIV CTBA 23439130`, **Then** `liv ctba`.
8. **Given** categories learned before this feature under the old key, **When** the user imports a file, **Then** those suggestions still appear for the same descriptions (no learned memory is lost).

---

### User Story 6 - Legacy `.xls` spreadsheet accepted (Priority: P3)

The import screen accepts files with the `.xls` extension in addition to `.xlsx`, as the V1 screen does.

**Why this priority**: small convenience; V2 deliberately narrowed to `.xlsx`.

**Independent Test**: upload a `.xls` file following the import template.

**Acceptance Scenarios**:

1. **Given** a spreadsheet file with the `.xls` extension following the import template, **When** uploaded, **Then** it is read like an `.xlsx` and goes to review. Resolved (orchestrator, 2026-11-11): V1 parity. Accept the `.xls` extension for files whose content is `.xlsx` (zip); genuine binary Excel 97-2003 is out of scope and is rejected with a clear PT-BR message.

### Edge Cases

- Empty file, or a statement with the header but no lines: a clear PT-BR message, nothing is imported, no crash.
- A statement without the `Agência/Conta` line or without the `Extrato de ... a ...` line: parse succeeds with null account and null period; the user selects the destination.
- CRLF or LF line endings, trailing blank lines and a final line without newline are all accepted.
- A decimal comma in the invoice amount columns (`86,59`) is read as 86.59; amounts are exact to the cent (R$ 86,59 never becomes 86.58999...).
- A description containing the separator inside quotes stays a single field (V1 split without honoring quotes).
- A non-numeric amount or invalid date in a line: that line is reported as invalid and skipped with a visible message; other lines are unaffected.
- Files above the existing import limits (5 MB or 1000 lines) are rejected with the existing message.
- A statement day with no `Saldo do Dia` value is parsed normally (the balance is simply absent, used later by closure).
- Two cards on the same invoice (final `1000`, `1001`) with the same description, date and amount are distinct identities.
- Foreign-currency purchases with USD value zero have no FX.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST read a C6 account statement CSV, ignoring everything before the header line that starts with `Data Lançamento,Data Contábil`, removing a leading byte order mark, and accepting CRLF and LF.
- **FR-002**: The system MUST extract from the statement preamble the account identification (`Agência: <a> / Conta: <c>` as `<a>/<c>`) and the statement period (`Extrato de <d1> a <d2>`), both optional (null when absent).
- **FR-003**: For each statement line the system MUST produce: launch date, posted date, day balance, description (`Title - Description`, collapsing equal or empty parts), transaction type and a positive amount exact to the cent, derived from `Entrada(R$)` and `Saída(R$)` (income when entry is greater than zero, otherwise expense).
- **FR-004**: The system MUST read a C6 invoice CSV (`;` separator, header on the first line), accepting a decimal comma or point.
- **FR-005**: For each invoice line the system MUST keep the original purchase date, description, positive amount and type (negative values are income-typed), installment (`N/M` as number and total; `Única` as none), card last four digits, holder name, raw issuer category, and an FX value (currency and amount) when the foreign-currency value is non-zero.
- **FR-006**: The system MUST classify every invoice line as `purchase` (value greater than or equal to zero), `invoice-payment` (negative and the description contains "pag fatura", case-insensitive) or `credit` (any other negative). Negative lines MUST be preserved, never dropped.
- **FR-007**: The system MUST keep a registry of bank profiles, each with an identifier, a label, a kind (`statement` or `invoice`) and a header signature, extensible by adding a profile without touching the others. Initial profiles: "C6 Bank - Extrato de conta corrente" (header contains `Data Lançamento` and `Data Contábil`) and "C6 Bank - Fatura de cartão" (header contains `Data de Compra` and `Parcela`).
- **FR-008**: Detection MUST return the detected profile (or none) together with the complete list of profiles. A detected profile is only a default; the user MUST be able to change it before parsing, and an unrecognized file MUST NOT raise an error nor be parsed until a profile is chosen.
- **FR-009**: A profile's kind MUST determine the destination kind (statement requires an account, invoice requires a card), and the account identification MUST be readable cheaply from the file before the definitive parse, for profiles that carry it.
- **FR-010**: The system MUST generate a deterministic identity for every CSV line that has no issuer identifier. Statement identity inputs: source, account identification, destination, launch date, posted date, normalized description (case and spacing ignored) and signed amount. Invoice identity inputs: source, destination, card last four digits, purchase date, normalized description, installment and signed amount. Metadata outside these lists MUST NOT affect identity.
- **FR-011**: Lines with identical identity inputs MUST be separated by an occurrence index counted inside the group of identical lines, in file order. Processing the same file twice MUST yield identical identities.
- **FR-012**: The identity MUST be stored in the existing import identity fields of a transaction, scoped by user, so that re-importing the same file flags every previously imported line as already imported and creates no duplicate. No parallel dedupe model is introduced.
- **FR-013**: C6 files MUST flow through the existing V2 import (review table, destination, person, category suggestions, batch id, undo of the whole batch, file limits) with no change in behavior for OFX, QFX and XLSX.
- **FR-014**: In the plain import, `invoice-payment` lines MUST NOT be importable, and `credit` lines MUST NOT be importable as ordinary income; both are shown as informational until the typed credit origin of feature 003 exists.
- **FR-015**: The category memory key MUST be merchant-aware: lowercase and trim; drop the country marker (`BRA`/`BR`) and the city before it (city delimited by a run of spaces, else the last token), only when the country marker is present; for `ACQUIRER*MERCHANT` keep the longer side of `*`; drop a leading numeric code; drop a numeric store suffix attached to or separated from the name; collapse spaces.
- **FR-016**: Learned category suggestions created before this feature MUST keep being suggested for the same descriptions after the key changes.
- **FR-017**: A category suggested from memory MUST be preselected but editable and MUST NOT be applied without the user confirming the import; the issuer's raw category is used only when no learned memory exists, and learned memory always wins.
- **FR-018**: Invalid or unreadable lines MUST produce a brief PT-BR message and be skipped without aborting the rest of the file; an unreadable file MUST produce a generic PT-BR message without internal detail.
- **FR-019**: The import screen MUST accept the `.xls` extension in addition to `.xlsx` as described in User Story 6 (scope pending clarification).
- **FR-020**: All user-facing text MUST be PT-BR; all identifiers, contracts and stored values MUST be English; amounts MUST be computed in integer cents.

### Key Entities *(include if feature involves data)*

- **Bank profile**: id, label, kind (statement or invoice), header signature, optional account-identification reader.
- **Parsed statement**: source name, account identification, period, kind, list of parsed lines.
- **Parsed line**: launch date, optional posted date, optional day balance, description, positive amount, type, optional installment, card last four, holder, raw category, optional FX, line kind (invoice lines only).
- **Row identity**: deterministic per-line value derived from file content and destination, with an occurrence index; stored in the transaction's existing import identity fields.
- **Category memory entry** (existing): description key to category, per user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No-regression oracle for parsing: the V1 fixtures are ported and the V1 parser, registry, detect and fixture test cases (8 statement, 9 invoice, 4 registry, 3 detect, 8 fixture-shape cases) pass with identical results; the statement fixture yields 113 lines and the invoice fixture 98 lines (96 purchases, 1 credit of R$ 75,00, 1 previous-invoice payment of R$ 9.500,00).
- **SC-002**: Invoice fixture arithmetic is exact to the cent: purchases total R$ 23.440,50; purchases plus the credit total R$ 23.365,50; the payment line is excluded from that sum.
- **SC-003**: Idempotency oracle: all V1 fingerprint test cases (12) pass; importing the statement fixture and then re-uploading it creates 0 new transactions, and the two identical fixture lines both import (113 distinct identities).
- **SC-004**: Description key oracle: all 8 V1 key cases and the remembered-subcategory case (mapped to V2's single child-category selection) give the expected keys; no learned category suggestion existing before the feature disappears.
- **SC-005**: A user can go from choosing a C6 statement or invoice file to the review table with no manual format selection and 100% of fixture lines showing correct date, amount and type.
- **SC-006**: The existing OFX, QFX and XLSX import tests pass unchanged.
- **SC-007**: An unrecognized file never produces an error screen or a partial parse: 100% of the unknown-file cases show the profile list and import nothing until a profile is chosen.

## Assumptions

- Dependencies: none. Credit-line creation, closure, matching and reconciliation are explicitly out of scope (002, 003).
- The destination prefill from the account identification and the matching rule that maps it to one of the user's accounts belong to 002 ("target inference"); 001 only exposes the identification (FR-002, FR-009).
- Credit lines are not importable as income here because doing so would count a card credit as income in reports (the V1 defect corrected by a typed origin); 003 adds that origin and makes them creatable.
- Amounts in files use a point or comma as decimal separator and no thousands separator, as in the V1 fixtures.
- V2 limits stay as they are (5 MB, 1000 lines per file).
- Deliverables follow constitution II (product code, migrations only if the plan proves the existing import identity fields are insufficient, tests, `CHANGELOG.md` `Unreleased` under `### Fork`, `docs/` contract). Row identity storage reuses the existing import fields per the inventory decision.
- Upstream overlap check (CHANGELOG, code) is recorded in the plan, per the roadmap.
