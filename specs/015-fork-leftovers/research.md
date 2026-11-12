# Research: Fork Leftovers (015)

All decisions taken autonomously (goal run); no NEEDS CLARIFICATION remained after the spec's
Clarifications session.

## R1. Where "already covered" comes from

- **Decision**: add `creditAmount` (non-negative, sum of `origin = "invoiceCredit"` movements of the
  card in the period, in cents then `fromCents`) to `DashboardInvoiceSchema`. Announcement numbers:
  value = `amount + creditAmount`, covered = `creditAmount + paidAmount`, to record = mode amount,
  remaining after = `remainingAmount - toRecord`. Identity `value - covered = remainingAmount` holds
  because `amount` is already net of credits.
- **Rationale**: 003 (credit lines, origin `invoiceCredit`) is merged; `amount` is net of credits, so
  without a separate figure the dialog could not say "R$ 7.320,62 já abatidos" for SC-002.
- **How**: `invoices.repository.listMovements` also selects `transactions.origin`; domain
  `sumInvoiceCredits(movements)` returns cents; service sets the field. Recurring movements never
  carry credits.
- **Alternatives**: announce net `amount` and only `paidAmount` (rejected: fails SC-002 and FR-001);
  a new endpoint for the announcement (rejected: the dialog already has the invoice).
- **Edge accepted**: a person whose credits exceed their charges is clamped at 0 by
  `calculateInvoicePersonBalances`; the gross value may then differ from the card statement by that
  excess. Recorded/remaining numbers stay exact.

## R2. Announcement math location

- **Decision**: pure `describeInvoicePaymentAnnouncement` in `packages/domain/src/invoices.ts`
  (integer cents in, decimals out), imported by `apps/web/src/features/invoices/invoices.presentation.ts`
  (web already imports pure domain helpers, e.g. `@openmonetis/domain/transactions`). The presentation
  file also owns `buildInvoicePaymentAllocations(invoice, mode, personId, amount)`, extracted from the
  dialog's `onSubmit`, and the PT-BR sentences of FR-005.
- **Rationale**: the partial mode depends on a typed amount, so the announcement must be computed
  client-side per keystroke; keeping the arithmetic in domain satisfies "no financial rule in UI".
  Using one allocation builder for announce and submit makes announced == sent by construction.
- **Alternatives**: server preview endpoint per keystroke (rejected: latency, no gain since the
  server re-validates anyway).

## R3. Stale announcement and over-balance (FR-003, FR-004)

- **Decision**: `validateInvoicePaymentAllocations` throws distinct errors:
  `person_without_balance` (person not in the balances list), `amount_exceeds_person_balance`
  (person listed, amount above its remaining, including remaining 0), `duplicate_person`,
  `payment_amount_required`. The service maps `amount_exceeds_person_balance` to
  `409 invoice_payment_balance_changed`; the others stay `400 invalid_invoice_payment_amount`. The
  existing repository guard (`expectedPaidAmount`, `409 invoice_payment_conflict`) stays.
- **Web**: on 409 with either code the dialog invalidates the invoices queries, keeps itself open,
  and shows the refreshed announcement plus "A fatura mudou. Confira os valores e confirme de novo."
- **Rationale**: the client cannot have typed more than the shown balance (the form validates it),
  so an over-balance on a listed person means the server state moved. Keeping foreign/unknown
  persons on 400 preserves the existing `financial-integrity` assertion.
- **Alternatives**: an `expectedAmount` field (rejected in Clarifications).

## R4. Fully covered invoice (FR-002)

- **Decision**: `card-invoices-page.tsx` shows the payment action whenever the invoice exists and is
  active (`canPay` no longer requires `remainingAmount > 0`); the dialog then shows only the covered
  sentence with confirm disabled. The dashboard `invoices-widget.tsx` is unchanged (it already shows
  the paid state instead of an action). An invoice whose credits make the net amount `<= 0` is not in
  `items` today and keeps that behavior (nothing to pay, no action).
- **Server**: unchanged; zero/no-balance allocations are already rejected (schema `positive`, domain
  errors). Integration test asserts no transaction is created.

## R5. Subcategory breakdown computation (FR-006, FR-007, FR-010)

- **Decision**: pure `buildSubcategoryBreakdown(rows: { categoryId: string | null; name: string | null; cents: number }[])`
  in `packages/domain/src/category-trends.ts`, called inside `calculateCategoryTrends` for each root
  category with children, over the whole requested range (the category page requests one month).
  Input rows come from the same `amountsByCategory` map that builds the combined parent total
  (actual + recurring, same trip filter, same person scope). Rows with 0 cents are dropped; children
  sorted by cents desc then name; the direct row (`categoryId: null`) is last; percentage =
  `Math.round(cents * 1000 / totalCents) / 10`, and 0 when `totalCents <= 0`.
- **Rationale**: sum equals the page total by construction (FR-007); one decimal from integer cents
  (FR-010); the V1 October fixture gives 63,2 / 14,7 / 10,8 / 7,0 / 4,3.
- **Output**: optional `subcategoryBreakdown` on `CategoryTrendCategoryOutputSchema`, present only on
  roots with children. A child category page requests only the child, which is then a root without
  children, so no block (FR-009).
- **Alternatives**: compute in the web from `subcategories` + `directCategory` (rejected: financial
  arithmetic in UI); per-period breakdown arrays (rejected: the page needs one month only; range sum
  is simpler and still correct for single-month requests).

## R6. Filtering the list by subcategory (FR-008)

- **Decision**: route search `subcategory`: `z.union([z.literal("none"), z.uuid()])`, invalid values
  dropped. The page resolves it against the category's children (from `categoriesQueryOptions`);
  an unknown uuid or a child page ignores it. Scope: child uuid -> `categoryIds: [childId]`;
  `none` -> `categoryIds: [parentId]` plus `exactCategories: true`, sent as
  `categoryMatch=exact` on `GET /transactions`; the service skips `listCategoryFamilyIdsForUser` when
  exact. Clicking the active row again sets `subcategory: undefined` (and resets `page`).
- **Rationale**: the list always expands a parent to its family today; `none` needs the direct
  category only. Child ids need no API change (a child has no children).
- **Alternatives**: client-side filtering of the page (rejected: pagination).

## R7. People sharing regression guard (FR-011, FR-012)

- **Decision**: one subtest in `apps/api/src/person-connections.integration.test.ts`: active
  connection over HTTP; owner records an expense for the connected person; recipient `GET
  /external-expenses` sees it (and only it); recipient `PATCH`/`DELETE` the owner's transaction,
  person, account and card by id -> 404 each; owner data unchanged afterwards; after revocation the
  recipient list delivers nothing new. Assert the connection output and invitation inputs have no
  `permission` key (schema shape check through one response).
- **Rationale**: V2 has no permission field (verified: no `permission` in `packages/db/src/schema.ts`
  or `packages/validators/src/person-connections.ts`); `ownership.integration.test.ts` covers
  strangers but not connected recipients.

## R8. Upstream overlap

See plan.md "Upstream overlap check": no functional overlap; textual merge risk in
`card-invoices-page.tsx`, `category-transactions-page.tsx`, `category-trends.ts`.
