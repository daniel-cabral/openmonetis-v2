# Tasks: Fork Leftovers (Settle Announcement, Subcategory Block, People Sharing Check)

**Input**: Design documents from `specs/015-fork-leftovers/` (spec.md with Clarifications and UI
decisions, plan.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md)

**Tests**: required by the constitution (principle V) and limited by `test-slop-guard`: each test
task carries its declaration. Run only the touched test files while iterating; lint/typecheck once at
the end (T018). Integration scripts run from **bash** (`VAR=1 tsx ...` fails in cmd) against the lane
database already configured in the worktree `.env` (the integration harness loads it).

**Conventions**: AGENTS.md (feature shape, no barrels, UI copy PT-BR, code English, no financial
math in web). No schema change, no migration. Do not commit `apps/web/src/routeTree.gen.ts`
incidental diffs. Never start dev servers on default ports of another lane.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

No setup: all integration scripts used here already exist in `package.json`
(`test:financial-integrity:integration`, `test:connections:integration`, `test:transactions:integration`).

## Phase 2: Foundational

None. The three stories touch disjoint code and can be built in any order.

---

## Phase 3: User Story 1 - Know what a payment will record before confirming (P1) MVP

**Goal**: the payment dialog announces value, covered and to-record amounts; announced == recorded;
stale or over-balance confirmations are refused with a typed 409 and nothing is written.

**Independent test**: quickstart.md "Manual" steps 1-4 plus T001, T003, T004, T005 tests.

- [x] T001 [US1] In `packages/domain/src/invoices.ts` (integer cents via `toCents`/`fromCents`): (a) `validateInvoicePaymentAllocations` throws `RangeError("person_without_balance")` when the allocation's person is not in `balances`, keeping `amount_exceeds_person_balance` for a listed person whose amount is above its remaining (including remaining 0), and keeping `duplicate_person` / `payment_amount_required`; (b) add `sumInvoiceCredits(movements: readonly { origin?: TransactionOrigin | null; amount: number }[]): number` returning the non-negative decimal sum of movements with `origin === "invoiceCredit"` (import `TransactionOrigin` from `./transactions`); (c) add `describeInvoicePaymentAnnouncement(input: { amount; creditAmount; paidAmount; remainingAmount; recordAmount })` returning `{ invoiceAmount: amount + creditAmount, coveredAmount: creditAmount + paidAmount, recordAmount (as given, no clamping), remainingAfterAmount: max(0, remainingAmount - recordAmount), nothingToRecord: remainingAmount === 0 }`, all computed in cents. Test: new `packages/domain/src/invoices.test.ts`, because distinct contract (announcement and credit sum have no test): one parametrised test for `describeInvoicePaymentAnnouncement` with literal expectations: nothing paid (amount 12164.10 -> invoice 12164.10, covered 0, record 12164.10); SC-002 (amount 13813.54, credit 5250.00, paid 2070.62, remaining 11742.92, record 11742.92 -> invoice 19063.54, covered 7320.62, remainingAfter 0); partial (same invoice, record 1000 -> remainingAfter 10742.92); covered (remaining 0 -> nothingToRecord true); and one test for `sumInvoiceCredits` (credit 10.10 + credit 0.20 + an `invoicePayment` 99 + no-origin 5 -> 10.30). Allocation error split is locked by T003.
- [x] T002 [P] [US1] In `packages/validators/src/invoices.ts` add `creditAmount: z.number().nonnegative()` to `DashboardInvoiceSchema`. Test: none, because Zod shape is a framework guarantee; the value is locked by T003.
- [ ] T003 [US1] Depends on T001, T002. API: in `apps/api/src/repositories/invoices.repository.ts` `listMovements` also selects `origin: transactions.origin` (keep every existing `userId` filter); add `origin?: TransactionOrigin | null` to `InvoiceMovementRecord` in `apps/api/src/services/invoices.service.ts`; in `get` set `creditAmount: sumInvoiceCredits(cardMovements...)` per item; in `pay`, catch the domain `RangeError` and map `amount_exceeds_person_balance` to `conflict("Invoice balance changed", "invoice_payment_balance_changed")` (409) and every other message to the existing `badRequest(..., "invalid_invoice_payment_amount")`; document the 409 response (`invoice_payment_balance_changed`, `invoice_payment_conflict`) in `apps/api/src/routes/invoices.ts` for the payments route. Test: extends `apps/api/src/services/invoices.service.test.ts::invalid invoice allocations reject before ownership lookup and writes` (make the expected `{ code, status }` part of each row: the `amount: 1000.01` row expects `invoice_payment_balance_changed`/409, the others keep `invalid_invoice_payment_amount`/400, still asserting no ownership lookup and no write); new test in the same file `invoice snapshot reports credit lines as already covered without changing the open balance`, because distinct contract (credit field): fake repository returns one card with a 100.00 expense movement and a 30.00 `invoiceCredit` movement -> item `amount` 70, `creditAmount` 30, `remainingAmount` 70.
- [ ] T004 [US1] Depends on T003. In `apps/api/src/financial-integrity.integration.test.ts` add `t.test("a repeated full payment on a covered invoice is refused as a balance change and writes nothing", ...)`: owner card + credit-card expense 50.01 in `2020-01`; pay the full allocation (200); repeat the same request -> `api.error(..., 409, "invoice_payment_balance_changed")`; the `/invoices?period=2020-01` body and the existing `snapshot()` are unchanged by the second request. Test: new, because distinct setup and actor (owner's own invoice, stale/covered path); the existing invoice subtest covers foreign actors only.
- [ ] T005 [P] [US1] Depends on T001, T002 (uses `creditAmount`). Signature: `invoice` is the `DashboardInvoice` type inferred from `DashboardInvoiceSchema`; allocations are `{ personId: string; amount: number }[]`. In `apps/web/src/features/invoices/invoices.presentation.ts`: move the allocation building out of the dialog's `onSubmit` into `buildInvoicePaymentAllocations(invoice, mode: "invoice" | "person" | "manual", personId, amount: string)` (same rules as today: invoice -> every person with remaining > 0 at its remaining; person -> that person's remaining; manual -> `parseCurrencyInput(amount)`); add `getInvoicePaymentAnnouncement(invoice, allocations, usesAccount)` that calls `describeInvoicePaymentAnnouncement` with `recordAmount` = sum of allocations and returns the PT-BR text per FR-005: `"Fatura de {valor}, {abatido} já abatidos. Confirmar vai registrar {pagamento}."`, manual mode appends `" Restará {valor}."`, person mode appends whether it debits the chosen account or is an external person's payment without account movement, and covered returns `"Os pagamentos e créditos do período já cobrem esta fatura. Nada será lançado."` (values via `formatCurrency`). Test: new `apps/web/src/features/invoices/invoices.presentation.test.ts`, because distinct contract (announced amount must equal sent allocations): one parametrised test over the three modes on one literal invoice fixture asserting the literal allocations array and the literal sentence for each mode, plus the covered sentence.
- [ ] T006 [US1] Depends on T005. In `apps/web/src/features/invoices/components/invoice-payment-dialog.tsx` per spec UI decision option A: use `buildInvoicePaymentAllocations` in `onSubmit` and a `form.Subscribe` callout `rounded-md bg-muted px-3 py-2 text-sm` above `DialogFooter` showing `getInvoicePaymentAnnouncement`; covered invoice -> only the covered callout, mode fields hidden, confirm disabled; invoice data refetching (new dialog prop `isFetching: boolean`, supplied by `card-invoices-page.tsx` in T007, or `invoice` null) -> `Skeleton` instead of the callout and confirm disabled; invoices query in error -> short PT-BR message "Não foi possível carregar a fatura." with a "Tentar novamente" button that refetches, confirm disabled (spec edge case and UI decision); on `ApiClientError` with code `invoice_payment_balance_changed` or `invoice_payment_conflict` -> invalidate the invoices queries (reuse `refreshFinancialQueries` from `invoices.mutations.ts`), keep the dialog open and show `"A fatura mudou. Confira os valores e confirme de novo."` above the refreshed callout; other errors keep the existing toast. Test: none, because rendering only; the logic is locked by T005 and the server refusal by T004.
- [ ] T007 [US1] In `apps/web/src/features/cards/components/card-invoices-page.tsx` let the "Registrar pagamento" action render when the invoice exists and is active even if `remainingAmount === 0` (`canPay` drops the remaining check), so the dialog can show the covered message (spec Clarification 4). Pass the invoices query `isFetching` to the dialog prop `isFetching: boolean` defined in T006 (T006 and T007 are implemented together in one change). Leave `invoices-widget.tsx` unchanged. Test: none, because UI visibility only; the covered behavior is locked by T005 (copy) and T004 (no write).

**Checkpoint**: US1 complete; scoped tests: `pnpm exec tsx --test packages/domain/src/invoices.test.ts apps/api/src/services/invoices.service.test.ts apps/web/src/features/invoices/invoices.presentation.test.ts`.

---

## Phase 4: User Story 2 - See a category's month broken down by subcategory (P2)

**Goal**: "Por subcategoria" block in the category page header, rows from the server, click filters
the list via `subcategory=<uuid>|none`.

**Independent test**: quickstart.md "Manual" steps 5-6 plus T008, T010 tests.

- [ ] T008 [US2] In `packages/domain/src/category-trends.ts`: add exported type `SubcategoryBreakdownRow = { categoryId: string | null; name: string | null; amount: number; percentage: number }` and pure `buildSubcategoryBreakdown(rows: readonly { categoryId: string | null; name: string | null; cents: number }[]): SubcategoryBreakdownRow[]` per data-model.md: drop rows with 0 cents; children by cents desc, ties by name; the `categoryId: null` row last; `percentage = Math.round((cents * 1000) / totalCents) / 10`, and `0` when `totalCents <= 0`; `amount = fromCents(cents)`. In `calculateCategoryTrends`, for each root with children, add `subcategoryBreakdown` built from `amountsByCategory` summed over `periods` (actual + recurring) for each child (name = child `name`) and for the parent itself (`categoryId: null`, `name: null`); add `subcategoryBreakdown?: SubcategoryBreakdownRow[]` to `CategoryTrendCategoryOutput`; omit it for categories without children. Test: new `packages/domain/src/category-trends.test.ts`, because distinct contract (breakdown has no test): one parametrised test of `buildSubcategoryBreakdown` with literal expectations: V1 October fixture (Aluguel 280000, Condomínio 65000, Faxina 48000, IPTU 31240, direct 18990 -> order Aluguel, Condomínio, Faxina, IPTU, null; percentages 63.2, 14.7, 10.8, 7.0, 4.3; amounts summing to 4432.30); direct only (-> one null row at 100); zero total (-> `[]`); a child with 0 cents omitted. Plus extends `apps/api/src/services/category-trends.service.test.ts::grouped trends count direct, child, refund and recurrence amounts once across overlapping filters` with one assertion that the parent's `subcategoryBreakdown` literal rows sum to the same literal `totalAmount` already asserted there (FR-007: same data set, including recurrence and refunds).
- [ ] T009 [P] [US2] In `packages/validators/src/category-trends.ts` add `CategorySubcategoryBreakdownRowSchema = z.object({ categoryId: z.uuid().nullable(), name: z.string().nullable(), amount: z.number(), percentage: z.number() }).openapi("CategorySubcategoryBreakdownRow")` and `subcategoryBreakdown: z.array(CategorySubcategoryBreakdownRowSchema).optional()` on `CategoryTrendCategoryOutputSchema` (root level only, not on `CategoryTrendDetailOutputSchema`). Test: none, because Zod shape; values locked by T008.
- [ ] T010 [US2] In `packages/validators/src/transactions.ts` add `categoryMatch: z.enum(["family", "exact"]).optional()` to the list query schema; in `apps/api/src/services/transactions.service.ts` `listTransactions` skip `listCategoryFamilyIdsForUser` when `query.categoryMatch === "exact"`. Test: new subtest in `apps/api/src/transactions.integration.test.ts` `t.test("categoryMatch=exact lists only the selected category while the default includes its children", ...)`, because distinct contract (new query option, no existing listing test by category): parent + child category, one expense in each in the same period; `GET /transactions?period=...&categoryIds=<parent>` returns both ids; with `&categoryMatch=exact` returns only the parent's.
- [ ] T011 [P] [US2] Depends on T010. Web plumbing: in `apps/web/src/features/transactions/transactions.api.ts` accept `categoryMatch?: "family" | "exact"` and send it; in `apps/web/src/features/transactions/components/transactions-container.tsx` add `exactCategories?: boolean` to the scope type and pass `categoryMatch: scope?.exactCategories ? "exact" : undefined` to the query. Test: none, because pass-through; locked by T010 and typecheck.
- [x] T012 [P] [US2] In `apps/web/src/routes/categories_.$categoryId.tsx` `validateCategoryTransactionsSearch`: parse `subcategory` with `z.union([z.literal("none"), z.uuid()]).safeParse(search.subcategory)`, `undefined` on failure; add `subcategory?: string` to `CategoryTransactionsSearch` in `category-transactions-page.tsx`. Test: none, because Zod union parsing is a framework guarantee.
- [ ] T013 [US2] Depends on T008, T009, T011, T012. New `apps/web/src/features/categories/components/subcategory-breakdown.tsx` per spec UI decision option A, rendered through the `details` prop of `FinancialSummaryHeader` in `CategoryTransactionsSummary`: title "Por subcategoria"; rows as `button` with `aria-pressed` (name or "Sem subcategoria" for `categoryId: null`, shadcn `Progress` bar at `percentage`, `MoneyValue`, percent formatted with one decimal in pt-BR); active row highlighted; empty rows -> "Sem lançamentos no período."; loading -> `Skeleton` rows; render nothing when the response category has no `subcategoryBreakdown` (no children or child page). In `category-transactions-page.tsx`: read `categoryTrend.subcategoryBreakdown` from the existing trends query (same `personScope`); resolve `search.subcategory` against the category's children from `categoriesQueryOptions()` (unknown uuid or child page -> ignored); scope: child uuid -> `categoryIds: [childId]`, `none` -> `categoryIds: [category.id]` + `exactCategories: true`; row click -> `onSearchChange({ subcategory: active ? undefined : value, page: undefined })`. Test: none, because rendering and wiring; breakdown math locked by T008, `none` filtering by T010.

**Checkpoint**: US2 complete; scoped tests: `pnpm exec tsx --test packages/domain/src/category-trends.test.ts apps/api/src/services/category-trends.service.test.ts`.

---

## Phase 5: User Story 3 - People sharing: no edit rights (P3)

**Goal**: regression guard that a connection recipient cannot mutate owner data (FR-011, FR-012).

**Independent test**: T014 passes.

- [ ] T014 [US3] In `apps/api/src/person-connections.integration.test.ts` add `t.test("an active connection gives the recipient read-only shared items and no write access to owner data", ...)`: create the active connection over HTTP as in the existing "HTTP claim and owner confirmation..." subtest; owner records an expense for the connected person; recipient `GET /external-expenses` lists that item and nothing else of the owner; recipient `PATCH` and `DELETE` on `/transactions/{id}`, `/people/{id}`, `/accounts/{id}` and `/cards/{id}` of the owner each return 404 (one parametrised loop), and recipient `POST /transactions` referencing the owner's `accountId` or `personId` returns 404 (spec US3 scenario 2 "create"); owner's `GET` of those resources is unchanged afterwards; the connection output has no `permission` key; after the recipient revokes, a new owner expense for that person is not delivered. Test: new, because distinct setup and actor (connected recipient; `ownership.integration.test.ts` covers unconnected strangers only).
- [ ] T015 [US3] Confirm FR-013 is satisfied by spec.md "Source" (data mapping row `compartilhamentos_pagador`: recreate shares, do not migrate) and that no permission field exists in `packages/db/src/schema.ts` or `packages/validators/src/person-connections.ts`; no code change. Test: none, because no behavior change (locked by T014).

---

## Phase 6: Polish & Cross-Cutting

- [ ] T016 [P] Docs in maintainer style (English, short): `docs/invoice-payments.md` (announcement numbers: value = amount + creditAmount, covered = credits + payments; refusal codes `invoice_payment_balance_changed` and `invoice_payment_conflict`; announced == recorded) and `docs/category-breakdown.md` (`subcategoryBreakdown` rules, rounding, `subcategory` URL param, `categoryMatch`). Test: none, because documentation.
- [ ] T017 Depends on T001-T016. `CHANGELOG.md`: append PT-BR bullets at the end of the existing `### Fork` section inside `## [Unreleased]` (before `## [0.16.0]`): payment dialog announces value, abatido and valor a registrar (and "já cobrem esta fatura"); typed 409 `invoice_payment_balance_changed` replacing 400 for over-balance; `creditAmount` on invoices; "Por subcategoria" block with URL filter, `subcategoryBreakdown` on category trends and `categoryMatch` on transactions; regression test for connection recipients. No version bump. Test: none, because documentation.
- [ ] T018 Run `pnpm biome check --write` on touched files only if lint reports formatting. Then gate (each must pass; fix and rerun only the failing step):
  - Lint: `pnpm lint`
  - Typecheck: `pnpm typecheck`
  - Scoped unit tests: `pnpm exec tsx --test packages/domain/src/invoices.test.ts packages/domain/src/category-trends.test.ts apps/api/src/services/invoices.service.test.ts apps/api/src/services/category-trends.service.test.ts apps/web/src/features/invoices/invoices.presentation.test.ts`
  - Integration (from bash, lane database from the worktree `.env`, one at a time): `pnpm test:financial-integrity:integration && pnpm test:connections:integration && pnpm test:transactions:integration`
  Test: none, because this is the verification step.
- [ ] T019 Depends on T018. Delete the untracked previews folder `previews/015/` (and `previews/` if it is then empty); confirm with `git status --short` that no preview file remains and only intended paths are modified. Test: none, because cleanup.

---

## Dependencies

- US1: T001 -> T003 -> T004; T002 -> T003; T001, T002 -> T005 -> T006 + T007 (implemented together; T007 supplies the `isFetching` prop).
- US2: T008 -> T013; T009, T012 [P]; T010 -> T011 -> T013.
- US3: T014 independent of US1/US2; T015 independent.
- Polish: T016 any time after design; T017 after all stories; T018 after T017; T019 last.

## Parallel examples

- US1: T002 and T005 (after T001) in parallel; T007 alongside T006 (different files).
- US2: T009, T010, T012 in parallel after T008 starts (different files).
- Across stories: US1, US2 and US3 phases touch disjoint files except `CHANGELOG.md` (T017 only).
- Integration suites run one at a time (heavy processes, shared lane database).

## Implementation strategy

MVP = US1 (financial-integrity risk from V1). Then US2, then US3 (test only). Each story ends with
its scoped tests green; the full gate (T018) runs once at the end.
