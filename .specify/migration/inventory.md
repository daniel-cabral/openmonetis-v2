# V1 -> V2 migration inventory

Baseline: V2 fork `main` on top of upstream `v0.16.0`; V1 = `D:\Repos\daniel-cabral\openmonetis`
(upstream base `276a679` + 197 fork commits). Produced 2026-11-11 by read-only subagents (static
reading, no runtime checks). Fill the **Decision** column per row (e.g. port / adapt to V2 model /
accept V2 / drop / defer); then each "port" row becomes a spec-kit feature.

Status legend: **full** = parity; **partial** = exists, gap in Notes; **missing** = absent;
**remodelled** = exists with a different model/UX (accept it or adapt). Effort to parity:
S < 1 day, M 1-3 days, L > 3 days, `-` = nothing to do.

## Summary

- Base: 21 gaps (16 missing, 5 partial; 6 are user preferences). Biggest ones are the calendar, the card-usage and
  establishments reports, the spending-overview widget, mass-add, note attachments and PDF exports.
- Fork: 27 gaps (23 missing, 4 partial). Reconciliation + C6 CSV (about 18 rows, L in total) and trips (6 rows, L
  in total) are the two big blocks. Partial payment, forecast, currency input and import category
  memory are already in V2.
- Data: high-risk tables are `lancamentos`, `antecipacoes_parcelas`, `viagens` and
  `compartilhamentos_pagador`.

## Decisions (2026-11-11)

Cross-cutting:

- **Cutover gate: full parity.** V1 production is switched off only when every `port`/`adapt`
  row is done and the ETL is rehearsed on a production dump with reconciled totals.
- **Recurrence in the ETL:** rebuild V2 rules + occurrences; settled/edited V1 rows become
  per-occurrence exceptions.
- **Trips:** own entity (`trips` table), not tags.
- **Reconciliation:** new `reconciliation` feature built on the V2 import pipeline (C6 parsers in
  the import registry, fingerprints in the existing `import_*` fields). Hard constraint: no
  regression versus the current V1 reconciliation flow (same buckets, closure proofs and results
  on the same files).
- **Invoice credit line:** new typed transaction origin, never a note prefix.
- **Subcategories:** accept the V2 child-category model; the ETL turns V1 subcategories into child
  categories.
- **AI:** support both V2 CLI subscriptions and V1-style API-key providers (incl. Ollama).

Execution order (one `/goal` per item, each through spec-kit and the constitution):

1. Reconciliation + C6 CSV (fork block, highest use and risk), including the credit origin,
   merchant-aware key, "paid but not reconciled" icon and the `auditar-conciliacao` skill.
2. Trips (CRUD, link, page, suggestions, bulk, report filter; establishments report lands here).
3. V1 base gaps in this order: transactions (mass-add, bulk edit, exports, `.xls`), reports
   (card usage, report PDF exports), calendar, dashboard widgets and notifications, note
   attachments, preferences, email change, AI API-key providers, landing page.
4. Remaining fork partials (settle announcement, subcategory block).
5. ETL: pre-flight validator over a production dump, then the load, rehearsal and totals
   reconciliation.

## 1. Features

### 1.1 V1 upstream base

| Feature | Origin | V2 status | Evidence | Effort | Decision | Notes |
|---|---|---|---|---|---|---|
| Email/password login and signup | base | full | V1: `src/shared/lib/auth/config.ts:65`; V2: `apps/api/src/auth.ts:169`, `apps/web/src/routes/signup.tsx` | - | - |  |
| Google OAuth login | base | full | V1: `src/shared/lib/auth/config.ts:127`; V2: `apps/web/src/components/auth/google-auth-button.tsx` | - | - |  |
| Passkeys | base | full | V1: `src/features/settings/components/passkeys-form.tsx`; V2: `apps/web/src/features/settings/components/passkey-settings.tsx` | - | - |  |
| Disable signup via env | base | full | V1: `src/shared/lib/auth/signup.ts:1`; V2: `docs/environment-variables.md:81` | - | - |  |
| Update display name | base | remodelled | V1: `src/features/settings/actions.ts:176`; V2: `apps/web/src/features/settings/components/profile-settings.tsx` | - | accept V2 | name comes from the admin person |
| Update email | base | missing | V1: `src/features/settings/actions.ts:318` | S | port | V2 shows email read-only |
| Change password | base | full | V1: `src/features/settings/actions.ts:235`; V2: `apps/web/src/features/settings/settings.api.ts:71` | - | - |  |
| Delete account | base | full | V1: `src/features/settings/actions.ts:443`; V2: `apps/api/src/routes/settings.ts` (DELETE /account) | - | - |  |
| Reset account data | base | full | V1: `src/features/settings/actions.ts:485`; V2: `apps/api/src/routes/settings.ts` (POST /reset) | - | - |  |
| Preferences: theme, privacy mode | base | full | V1: `src/features/settings/actions.ts:554`; V2: `packages/db/src/schema.ts:563` | - | - |  |
| Preference: statement note as column | base | missing | V1: `src/db/schema.ts:144` (`extrato_note_as_column`) | S | port |  |
| Preference: transactions column order | base | missing | V1: `src/features/transactions/lib/column-order.ts:29` | M | port |  |
| Preference: show summary in transaction modal | base | missing | V1: `src/db/schema.ts:144` (`mostrar_resumo_lancamento`) | S | port | V2 summary exists, no toggle |
| Preference: group transactions by date | base | missing | V1: `src/db/schema.ts:144` | S | port |  |
| Preference: hide anticipated installments | base | missing | V1: `src/db/schema.ts:144` | S | port |  |
| Preference: max attachment size | base | missing | V1: `src/db/schema.ts:144` (`attachment_max_size_mb`) | S | port | V2 uses a fixed limit |
| Changelog page | base | full | V1: `src/app/(dashboard)/changelog/page.tsx`; V2: `apps/web/src/routes/changelog.tsx` | - | - |  |
| API tokens | base | remodelled | V1: `src/features/settings/actions.ts:650,710`; V2: `apps/api/src/routes/device-tokens.ts`, `docs/companion-api.md` | - | accept V2 | device tokens with renew/revoke; Companion must be re-paired |
| Companion capture (POST /inbox, batch, device verify) | base | full | V1: `src/app/api/inbox/route.ts:31`; V2: `apps/api/src/routes/inbox.ts` | - | - |  |
| Companion setup guide | base | full | V1: `src/features/settings/components/companion-tab.tsx`; V2: `apps/web/src/features/device-tokens/components` | - | - |  |
| Health endpoint | base | full | V1: `src/app/api/health/route.ts:12`; V2: `apps/api/src/app.ts:839` | - | - |  |
| Landing page | base | missing | V1: `src/app/(landing-page)/page.tsx` | S | port | V2 `/` is login; likely irrelevant for self-hosted |
| Dashboard: period nav, widget grid, hide/reorder, reset | base | full | V1: `src/features/dashboard/widget-registry/widget-actions.ts:43,75`; V2: `apps/web/src/features/dashboard/components/dashboard-widget-grid.tsx` | - | - |  |
| Widget: my accounts (show excluded) | base | full | V1: `widget-actions.ts:57`; V2: `my-accounts-widget.tsx` | - | - |  |
| Widgets: invoices, bills, payment status, inbox | base | full | V2: `dashboard-widget-registry.tsx:88-120` | - | - |  |
| Widget: income/expense/balance chart | base | full | V2: `income-expense-balance-widget.tsx` | - | - |  |
| Widget: budgets progress | base | full | V1: `goals-progress-widget.tsx`; V2: `dashboard-widget-registry.tsx:137` | - | - |  |
| Widget: category trends | base | full | V2: `dashboard-widget-registry.tsx:161` | - | - |  |
| Widgets: expenses/income/purchases by category | base | full | V2: `dashboard-widget-registry.tsx:169-185` | - | - |  |
| Widgets: payment conditions and methods | base | full | V1: `payment-overview-widget.tsx`; V2: `payment-conditions-widget.tsx`, `payment-methods-widget.tsx` | - | - |  |
| Widgets: recurring, installments, people, notes | base | full | V2: `dashboard-widget-registry.tsx:193-233` | - | - |  |
| Widget: spending overview (top expenses + top establishments) | base | missing | V1: `src/features/dashboard/components/widgets/spending-overview-widget.tsx`, `top-establishments-widget.tsx`, `top-expenses-widget.tsx` | M | port | no V2 endpoint either |
| Widget: attachments of the period | base | missing | V1: `widgets/attachments-widget.tsx` | S | port | V2 has the attachments page |
| Widget: category history | base | missing | V1: `widgets/category-history-widget.tsx` | S | port | partly covered by category trends |
| Dashboard notifications (read/unread, archive) | base | partial | V1: `src/features/dashboard/notifications/notifications-actions.ts:53,110,157,204`; V2: `apps/api/src/routes/notifications.ts`, `notification-panel.tsx` | S | port | confirm mark-unread/unarchive in V2 |
| Accounts CRUD, archive, logo | base | full | V1: `src/features/accounts/actions.ts:101,192,239`; V2: `apps/api/src/routes/accounts.ts` | - | - |  |
| Account statement | base | full | V1: `src/app/(dashboard)/accounts/[accountId]/statement/page.tsx`; V2: `apps/web/src/routes/accounts_.$accountId.tsx` | - | - |  |
| Transfer between accounts | base | remodelled | V1: `src/features/accounts/actions.ts:297`; V2: `apps/api/src/services/transactions.service.ts:560` | - | accept V2 | transaction type in the main form |
| Account yield | base | full | V1: `accounts/actions.ts:435`; V2: `apps/api/src/routes/accounts.ts` (POST /{id}/yields) | - | - |  |
| Account balance adjustment | base | full | V1: `accounts/actions.ts:523`; V2: `adjust-account-balance-dialog.tsx` | - | - |  |
| Cards CRUD, archive, limit | base | full | V1: `src/features/cards/actions.ts:72,104,146`; V2: `apps/api/src/routes/cards.ts` | - | - |  |
| Card invoices page | base | full | V1: `src/app/(dashboard)/cards/[cardId]/invoice/page.tsx`; V2: `apps/web/src/routes/cards_.$cardId.tsx` | - | - |  |
| Invoice payment and payment-date edit | base | full | V1: `src/features/invoices/actions.ts:72,248`; V2: `invoice-payment-dialog.tsx`, `invoice-dates-dialog.tsx` | - | - |  |
| Invoice adjustment | base | full | V1: `invoices/actions.ts:318`; V2: `adjust-invoice-dialog.tsx` | - | - |  |
| Categories CRUD | base | full | V1: `src/features/categories/actions.ts:45`; V2: `apps/web/src/features/categories/components` | - | - |  |
| Category detail page | base | full | V1: `src/app/(dashboard)/categories/[categoryId]/page.tsx`; V2: `apps/web/src/routes/categories_.$categoryId.tsx` | - | - |  |
| Categories history page | base | remodelled | V1: `src/app/(dashboard)/categories/history/page.tsx`; V2: `apps/web/src/routes/reports/category-trends.tsx` | - | accept V2 | merged into category trends |
| Budgets CRUD | base | full | V1: `src/features/budgets/actions.ts:99,143,184`; V2: `apps/api/src/routes/budgets.ts` | - | - |  |
| Budgets: copy previous month | base | full | V1: `budgets/actions.ts:245`; V2: `apps/api/src/routes/budgets.ts` (POST /copy-previous) | - | - |  |
| Transactions list, filters, pagination | base | full | V1: `src/features/transactions/lib/page-helpers.ts:380`; V2: `transactions-screen.tsx`, `transactions-filters.tsx` | - | - |  |
| Transaction create/edit/delete with scopes | base | full | V1: `single-actions.ts:54,207,373`; V2: `apps/api/src/routes/transactions.ts`, `recurring-edit-scope-dialog.tsx` | - | - |  |
| Settlement toggle | base | full | V1: `single-actions.ts:959`; V2: `transaction-settlement-dialog.tsx` | - | - |  |
| Convert to installment/recurring | base | remodelled | V1: `single-actions.ts:479,652`; V2: `apps/api/src/services/transactions.service.ts:2086-2092` | - | accept V2 | done by changing the condition on edit |
| Split between people | base | full | V1: `single-actions.ts:830`, `split-pair-dialog.tsx`; V2: `packages/db/src/schema.ts:1231` (`transaction_splits`) | - | - |  |
| Mass-add transactions | base | missing | V1: `bulk-actions.ts:588`, `mass-add-dialog.tsx` | M | port |  |
| Bulk delete | base | full | V1: `bulk-actions.ts:759`; V2: `apps/api/src/routes/transactions.ts` (POST /bulk/delete) | - | - |  |
| Bulk edit | base | partial | V1: `bulk-actions.ts:170`, `core.ts:887` (`updateBulkSchema`); V2: `apps/api/src/routes/transactions.ts` (/bulk/category, /bulk/names, /bulk/tags) | S | port | V2 lacks date, condition, payer and other fields |
| Refund | base | full | V1: `refund-action.ts:36`; V2: `transaction-refund-dialog.tsx` | - | - |  |
| Boleto fields | base | full | V1: `boleto-fields-section.tsx`; V2: `apps/api/src/routes/bills.ts` | - | - |  |
| Export transactions | base | partial | V1: `export-actions.ts:56`; V2: `transactions-export-menu.tsx:34-38` | M | port | V2: CSV/XLSX only, no branded PDF |
| Report export (PDF/Excel) | base | partial | V1: `reports/components/category-report-export.tsx`; V2: category-trends feature | M | port | V2: category-trends CSV and person-report PDF/XLSX only |
| Import OFX/QFX/XLS/XLSX | base | partial | V1: `import/upload-zone.tsx:20-21`; V2: `transaction-import-upload.tsx:81-87` | S | port | legacy `.xls` dropped |
| Import review, category memory, dedupe, undo | base | full | V1: `import-action.ts:237,266,439`; V2: `packages/db/src/schema.ts:1205`, DELETE /imports/{batchId} | - | - |  |
| Installments and anticipation | base | full | V1: `anticipation.ts:135,353`; V2: `installment-anticipation-dialog.tsx`, `apps/api/src/routes/installments.ts` | - | - |  |
| Installment analysis report | base | full | V1: `reports/installment-analysis/page.tsx`; V2: `apps/web/src/routes/reports/installments.tsx` | - | - |  |
| Recurrence | base | remodelled | V1: condition "Recorrente"; V2: `docs/recurring-transactions.md`, `packages/db/src/schema.ts:689-708` | - | accept V2 | rule-based, richer |
| Attachments on transactions | base | full | V1: `transactions/actions/attachments.ts:178-409`; V2: `apps/api/src/routes/attachments.ts` | - | - |  |
| Attachments library page | base | full | V1: `src/app/(dashboard)/attachments/page.tsx`; V2: `apps/web/src/routes/attachments.tsx` | - | - |  |
| Notes (text, checklist, archive) | base | full | V1: `src/features/notes/actions.ts:72,113,149,219`; V2: `apps/api/src/routes/notes.ts` | - | - |  |
| Note attachments | base | missing | V1: `src/features/notes/actions/attachments.ts:120-227` | M | port | no V2 table |
| Payers (people) CRUD | base | remodelled | V1: `payers/actions.ts:86,113,163`; V2: `apps/api/src/routes/people.ts` | - | accept V2 | roles admin/external |
| Payer detail page | base | full | V1: `src/app/(dashboard)/payers/[payerId]/page.tsx`; V2: `apps/web/src/routes/people_.$personId.tsx` | - | - |  |
| Payer sharing (code, join, leave, regenerate) | base | remodelled | V1: `payers/actions.ts:200,251,297`; V2: `apps/api/src/routes/person-connections.ts` | - | accept V2 if it has read-only vs edit rights, else adapt | invitation links; check read-only vs edit rights |
| Payer monthly summary email | base | full | V1: `payers/lib/detail-actions.ts:395`; V2: `packages/db/src/schema.ts:2011` (`person_report_deliveries`) | - | - | V2 adds schedule, PDF, XLSX |
| Calendar | base | missing | V1: `src/app/(dashboard)/calendar/page.tsx`, `monthly-calendar.tsx` | M | port |  |
| Report: category trends | base | full | V1: `reports/category-trends/page.tsx`; V2: `apps/web/src/routes/reports/category-trends.tsx` | - | - |  |
| Report: card usage | base | missing | V1: `reports/card-usage/page.tsx` | M | port | V2 has per-card flow only |
| Report: establishments | base | missing | V1: `reports/establishments/page.tsx` | M | port | fork adds trip filter here (see 1.2) |
| Inbox: list, confirm, process, discard, restore, bulk | base | full | V1: `src/features/inbox/actions.ts:49-301`; V2: `apps/api/src/routes/inbox.ts:156` | - | - |  |
| AI insights | base | remodelled | V1: `src/features/insights/actions/generate.ts:17`; V2: `docs/ai-diagnoses.md` | - | adapt: add API-key providers (incl. Ollama) next to V2 CLIs | V2 uses CLI subscriptions; V1 API-key providers and Ollama gone |
| Logo search and mapping | base | full | V1: `src/app/api/logo/search/route.ts:42`; V2: `establishment-logo-picker.tsx` | - | - |  |

V2-only additions (no action): tags, goals, inbox rules, extra preferences (default account/card,
page size, start page, due-soon days).

### 1.2 Fork delta (197 commits on top of V1 upstream)

| Feature | Origin | V2 status | Evidence | Effort | Decision | Notes |
|---|---|---|---|---|---|---|
| Reconciliation screen: upload statement/invoice, pick profile, infer and confirm target account/card, summary then review buckets | fork | missing | V1: `src/features/transactions/components/reconciliation/reconciliation-page.tsx`, `origin-confirmation.tsx` (3c3e0dc, dc48779) | L | adapt on V2 import, no regression vs V1 flow | V2 import (`/transactions/import`) is a different flow |
| C6 statement CSV parser (preamble, BOM, sign, account number, period) | fork | missing | V1: `src/shared/lib/import/parsers/c6-statement-csv.ts:36`, `detect.ts`; V2: `apps/api/src/services/transactions.service.ts:694` (OFX/QFX/XLSX only) | S | adapt on V2 import, no regression vs V1 flow | parser registry and signature detection also absent |
| C6 invoice CSV parser (line kinds, N/M installments, USD FX, original purchase dates) | fork | missing | V1: `src/shared/lib/import/parsers/c6-invoice-csv.ts:21` (1d1cd32) | S | adapt on V2 import, no regression vs V1 flow | depends on parser registry |
| Row fingerprint for lines without FITID (idempotent re-import, stamps manual entries once reconciled) | fork | partial | V1: `src/shared/lib/reconciliation/fingerprint.ts:72`; V2: `packages/db/src/schema.ts:882,889` | M | adapt on V2 import, no regression vs V1 flow | V2 dedupes only by FITID/external id |
| Deterministic matcher (fingerprint, installment, exact, cents, ±2d window; buckets matched/bank-only/app-only/ambiguous) | fork | missing | V1: `src/shared/lib/reconciliation/matcher.ts:126-285` (2841817, 660464c) | L | adapt on V2 import, no regression vs V1 flow | ±2d window measured on real data |
| Name+period match via learned descriptor map (`import_name_mappings`), "link to existing", editable name | fork | missing | V1: `matcher.ts:198`, `name-memory-action.ts:10` (baf629e, 9389b52) | M | adapt on V2 import, no regression vs V1 flow | accounts only |
| File value wins on match (undo restores; split entries untouched) | fork | missing | V1: `reconciliation-review.ts:458` (0f94360) | S | adapt on V2 import, no regression vs V1 flow |  |
| Closure proof: statement day balance; invoice net sum (purchases + credits - previous payments) | fork | missing | V1: `closure.ts:49,134`, `reconciliation-review.ts:304` (03fadef) | M | adapt on V2 import, no regression vs V1 flow |  |
| Invoice credit lines become entries; payment line info-only; "Inclusao de Pagamento" treated as previous-invoice payment; candidates limited to invoice period | fork | missing | V1: `reconciliation-review.ts:232-274` (9b48d72, c0818b5) | M | adapt on V2 import, no regression vs V1 flow | needs reconciliation core |
| Credit-note rule (`AUTO_FATURA:CREDITO:` excluded from income/expense, survives payment undo, editable) | fork | remodelled | V1: `src/shared/lib/accounts/constants.ts` (c8a7f9f, ce4ca7f); V2: `packages/domain/src/dashboard.ts:379`, `packages/db/src/schema.ts:1862` | S | adapt: new typed origin (e.g. invoiceCredit), no note prefix | V2 uses typed payments; credit-line concept needed with reconciliation |
| Settle announcement on invoice payment (value, already paid, expense to create) | fork | partial | V1: `invoice-summary-card.tsx` (82da8cc); V2: `apps/web/src/features/cards/.../card-invoices-page.tsx:385`, `apps/api/src/services/invoices.service.ts:524-540` | S | port | V2 shows "Restante"; pre-write announcement not confirmed in UI |
| Matched pending account entry becomes paid | fork | missing | V1: `reconciliation-action.ts` (1b1e6a0) | S | adapt on V2 import, no regression vs V1 flow |  |
| Batch apply with undo (amounts, fingerprints, paid state) and warnings for skipped lines | fork | missing | V1: `reconciliation-action.ts:152,518` (ec6cb09, 1089eca) | M | adapt on V2 import, no regression vs V1 flow |  |
| Permanently ignored bank lines (`reconciliation_ignores`) | fork | missing | V1: `src/db/schema.ts` (reconciliationIgnores), `reconciliation-review.ts:193` | S | adapt on V2 import, no regression vs V1 flow |  |
| Suspicious-match bucket "Needs your decision" + "Undo match" | fork | missing | V1: `matcher.ts:244` (ce89c70, 0611282) | M | adapt on V2 import, no regression vs V1 flow |  |
| Sticky apply bar: projected balance vs statement (or invoice total vs file), paid-after-file-end list | fork | missing | V1: `reconciliation-projection.ts:44,91`, `reconciliation-apply-bar.tsx` (37e5540) | M | adapt on V2 import, no regression vs V1 flow |  |
| "Mark all as Create" + category/subcategory on created ambiguous lines | fork | missing | V1: commit ffbd8c8 | S | adapt on V2 import, no regression vs V1 flow |  |
| Reconciliation feeds category memory (with subcategory) | fork | missing | V1: `category-memory-action.ts:13,43` (0442b31) | S | adapt on V2 import, no regression vs V1 flow |  |
| Category memory on import by description | fork | full | V1: `category-memory-action.ts`; V2: `packages/db/src/schema.ts:1205`, `apps/api/src/services/transactions.service.ts:713-722` | - | - |  |
| Merchant-aware description key (strip city/country, `PG *`, store codes) | fork | partial | V1: `import-utils.ts:37` (d46ac2e); V2: `packages/domain/src/transactions.ts:391` | S | port | V2 only trims/lowercases; lower hit rate on card descriptors |
| "Paid but not reconciled" icon on account statement | fork | missing | V1: `src/features/accounts/lib/unreconciled.ts:1`, `statement-queries.ts` (3db4057) | S | adapt on V2 import, no regression vs V1 flow | needs fingerprint stamping |
| Trip CRUD (name, period, note, no overlap, delete unlinks) + "Viagens" menu | fork | missing | V1: `src/features/trips/actions.ts:32-101`, `lib/overlap.ts` | M | port (own entity) | check first whether tags could model trips |
| Trip field on entry (prefill by date; propagates across installments/split; one recurrence occurrence; never transfers) | fork | missing | V1: `src/shared/lib/trips/link.ts:29,43`, `trip-section.tsx` | M | port (own entity) |  |
| Trip page: net cost (expenses - refunds), breakdown by category / card-account / person | fork | missing | V1: `src/features/trips/lib/summary.ts:47`, `trip-detail-page.tsx` | M | port (own entity) |  |
| Trip suggestions (paginated, origin filter, select page/all, batch link) | fork | missing | V1: `trip-suggestions.tsx`, `lib/suggestions.ts` (1daf3e5) | M | port (own entity) |  |
| Bulk set trip | fork | missing | V1: `bulk-actions.ts` (tripId in `updateTransactionBulkAction`) | S | port (own entity) |  |
| Trip filter in reports (category trends, establishments; `viagem=` param; range auto-adjust) | fork | missing | V1: `src/shared/lib/trips/trip-filter-param.ts:15`, `reports/lib/trip-range.ts` | M | port (own entity) | extend V2 `category-trends` and `establishments` |
| Subcategories (one level, optional, parent total unchanged) | fork | remodelled | V1: `src/shared/lib/subcategories/rules.ts`; V2: `packages/db/src/schema.ts:604-641` (`parentId`), `packages/domain/src/categories.ts:43-68` | - | accept V2 | V2: child category row, entry points at the child |
| Category page "By subcategory" block with filter | fork | partial | V1: `categories/lib/subcategory-breakdown.ts:15`; V2: `category-transactions-page.tsx:235`, `category-trends-list.tsx:62` | S | port | V2 lacks the per-subcategory block/filter on the category page |
| Bulk "Set subcategory" | fork | remodelled | V1: `bulk-actions.ts` (`setTransactionsSubcategoryAction`); V2: `transaction-bulk-category-picker.tsx:97` | - | accept V2 | V2 picker lists children; other-category entries are not skipped |
| Subcategory in import review + memory | fork | remodelled | V1: `import-utils.ts:59`, `review-table.tsx`; V2: `transaction-import-category-select.tsx`, `packages/db/src/schema.ts:1205` | - | accept V2 | child category stored in the same mapping |
| Partial invoice payment | fork | full | V1: `invoices/actions.ts` (`payInvoicePartialAction`); V2: `apps/api/src/services/invoices.service.ts:334-375`, `packages/db/src/schema.ts:1862,1917` | - | - | V2 richer: payments + per-person allocations |
| Dashboard "Previsto" (balance + pending income - pending expense to month end) | fork | full | V1: `fetch-dashboard-data.ts` (4575cf3); V2: `packages/domain/src/dashboard.ts:478` | - | - |  |
| Currency input with thousands separator (`12.164,10`) | fork | full | V1: `src/shared/utils/currency.ts:54` (5d541a9); V2: `apps/web/src/lib/money-presentation.ts:5-11` | - | - |  |
| `auditar-conciliacao` dev skill | fork | missing | V1: `.claude/skills/auditar-conciliacao/SKILL.md` | S | port | tooling; only after reconciliation exists |

Out of scope (not user-facing): fork infra (`docker-compose.coolify.yml`, release workflow). V2 has
its own `compose.yml` and `docs/production-deployment.md`.

To verify at runtime: settle announcement UI, bulk subcategory behaviour, import subcategory memory.

## 2. Fork x upstream collision risks

Snapshot: upstream `v0.16.0` (2026-11-07); about 101 commits and 14 tags in the last 2.5 months
(recent releases every 1-7 days). No ROADMAP; only 2 issues (both closed). Issue #1 signals that
the maintainer is adopting people, tags, subcategories and recurrences, so overlap is most likely
there. No upstream signal for reconciliation, C6 CSV or trips.

| Risk | Area/files | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Migration number/timestamp collision | `packages/db/drizzle/NNNN_*.sql`, `meta/_journal.json`, snapshots; `scripts/validate-migrations.mjs` requires sequential `idx` and increasing `when` (last upstream: `0031`) | H | H | Fork migrations stay at the tail; after each upstream merge, regenerate them on top of upstream's last idx; resolve `_journal.json` by hand |
| `schema.ts` conflicts | `packages/db/src/schema.ts` (single 2.7k-line file, frequently touched) | H | M | Append fork tables/enums in one contiguous block at the end of the file |
| Duplicate subcategory model | `categories.parentId` already upstream; upstream reports already have a subcategory breakdown | H | H | Do not port the V1 model; build only missing actions (bulk set) on `parentId` |
| Duplicate import/reconcile model | upstream `transactions_.import.tsx`, import container, `inbox` rules (`inboxRuleMatchMode`) | M | H | Extend import/inbox instead of parallel tables; C6 parsers as new files registered in the existing import entry point |
| CHANGELOG `Unreleased` + versions | `CHANGELOG.md`; `scripts/validate-release.mjs` checks 8 `package.json` versions, changelog and README badge | H | M | Fork entries in a `### Fork` block at the end of `Unreleased`; never bump versions or tag on the fork |
| Transactions/dashboard/domain hotspots | `features/transactions/components`, `apps/api/src/services`, `packages/domain/src`, `features/dashboard/components`, repositories, validators | H | M | Fork features in new feature folders; shared files get 1-3 line hooks only |
| Dashboard forecast overlap | upstream "Compromissos futuros", committed-income widget, forecast balances | M | M | Compare first; if different, ship as a separate widget registered in the layout registry |
| `package.json` script churn | 8 `package.json` files change each release; fork edited api/ai dev scripts | H | L | Fork edits limited to `scripts`; take upstream version lines on conflict; run `pnpm release:check` |
| `routeTree.gen.ts` | `apps/web/src/routeTree.gen.ts` | H | L | Never hand-merge; take upstream and regenerate with `vite dev` |
| Navigation and route registration | `components/navigation/nav-items.tsx`, `navbar-options.ts`, `apps/api/src/app.ts` | M | L | One line each, appended at the end |
| `AGENTS.md`, README, `.env.example`, `docs/` | upstream contract files | M | M | Never edit `AGENTS.md`; fork rules in `CLAUDE.md`; fork docs as `docs/fork-*.md` |
| Trips overlap | no upstream mention | L | M | Check whether `tags` could already model a trip before building |
| Merge fatigue | release cadence of days | H | M | Merge per release tag, soon after it ships, with `git rerere` enabled; validate migrations and release after each merge |

**Fork conventions (recommended)**

- Migrations: `NNNN_fork_<topic>`, always at the tail; regenerate if upstream adds migrations in between.
- One `features/<feature>/` folder per fork feature plus its service/repository/domain/validator files (AGENTS.md shape); shared files only get registration lines.
- Before each feature, run an upstream overlap check (CHANGELOG, issues, code) and record it in the spec.

## 3. V1 -> V2 table mapping and data-loss risks

V1 (fork `main`, `src/db/schema.ts`) has 29 tables. Line numbers refer to V2
`packages/db/src/schema.ts` at `5ea5f65`. Every FK changes from text ids to uuid, so the ETL needs
one global id remap table.

| V1 table | V2 target | Mapping | Risk | Columns lost / transform notes |
|---|---|---|---|---|
| user | user (176) | 1:1, text id -> uuid | M | id remap; `lower(email)` unique (191) fails on case-duplicate emails |
| account | account | 1:1 | L | credential hashes portable only if format matches; id remap |
| session | session | disposable | none | not migrated; users log in again |
| verification | verification | disposable | none | not migrated |
| passkey | passkey (261) | 1:1 | L | unique `credential_id` (`passkey_credential_id_unique`); id remap |
| preferencias_usuario | user_preferences (563), dashboard_preferences (284) | split | M | lost: `extrato_note_as_column`, `lancamentos_column_order`, `attachment_max_size_mb`, `mostrar_resumo_lancamento`, `agrupar_lancamentos_por_data`, `ocultar_parcelas_antecipadas`, `dashboard_widgets.myAccountsShowExcluded`; widget order/hidden map to `widget_order`/`hidden_widgets` |
| contas | financial_accounts (478) | restructured | M | `tipo_conta` PT text -> `account_type` enum; `status` -> `is_archived`; lost `saldo_inicial`, `excluir_saldo_inicial_receitas` (initial balance becomes an `accountBalanceAdjustment` transaction, check 994) |
| categorias | categories (604) | merged with subcategorias | M | `tipo` receita/despesa -> income/expense; name+type unique (624); review V1 system-like categories vs V2 `is_system` |
| subcategorias | categories (`parent_id`) | merged | M | child type must equal parent (FK 636); name unique per parent |
| pagadores | people (319) | restructured | M | role admin/terceiro -> admin/external; one admin per user (342); lost `share_code`, `is_auto_send`, `last_mail`; name not blank (343) |
| compartilhamentos_pagador | person_connection_invitations (347), person_connections (411) | restructured | H | V1 read/write `permission` has no V2 field; V2 has invite/claim/confirm state and distinct-users check (468); recreate shares instead of migrating |
| cartoes | cards (504) | restructured | M | `dt_fechamento`/`dt_vencimento` text -> int (1..31, check 545; closing rule 547); `bandeira` text -> `card_brand` enum (unrecognized -> other) |
| faturas | invoices (1805) | restructured | M | status text -> pending/paid enum; paid requires `paid_at` (1849); `cartao_id` nullable in V1, NOT NULL in V2; period regex; unique user+card+period (1837) |
| orcamentos | budgets (2113) | 1:1 | M | `categoria_id` nullable in V1, NOT NULL in V2 (2140); amount > 0; unique user+category+period |
| anotacoes | notes (2189), note_items (2233) | restructured | M | `tipo` -> text/checklist/task; `tasks` JSON -> `note_items` (position unique, 300 chars); title NOT NULL (120 chars); V2 task requires a due date V1 never had; content/kind check (~2220) |
| anotacao_anexos | none | no target | M | note attachments lost unless V2 gains note attachments |
| insights_salvos | none (ai_diagnoses 1477 / ai_chats 1510 differ) | no target | L | regenerable |
| tokens_api | device_tokens (1047) | non-transferable | L | re-pair Companion (`token_digest` keyed by DEVICE_TOKEN_SECRET); `expires_at` NOT NULL; lost `last_used_ip` |
| pre_lancamentos | inbox_items (1074) | restructured | M | synthesize `client_id`, `payload_fingerprint`; unique user+client (1106); amount > 0 (1128); status metadata check (1132) |
| dashboard_notification_states | notification_states (297) | 1:1 | L | PK (user, key); fingerprint <= 180, key <= 220 chars |
| antecipacoes_parcelas | installment_anticipations (1561), installment_anticipation_items (1593) | restructured | H | lost `valor_total`, `qtde_parcelas`, `data_antecipacao`, `anotacao`, `pagador_id`, `categoria_id`; JSON id list -> item rows with `original_period`; series must exist in `installment_series` |
| viagens | none | no target | H | all trips and `viagem_id` links lost unless trips are ported (or temporarily mapped to tags, 649) |
| lancamentos | transactions (839), recurring_transaction_rules (708) + occurrences + splits, installment_series (808), transaction_refunds (1618), invoice_payments (1862) | split and restructured | H | lost `dividido`, `split_group_id`, `antecipado`, `qtde_recorrencia`, `ofx_fit_id`, `viagem_id`; `subcategoria_id` -> child category; `realizado` -> `is_settled` |
| anexos | attachments (1756) | 1:1 | L | S3 keys carry over; unique (id, user) |
| lancamento_anexos | transaction_attachments (1775) | 1:1 | L | V2 adds `user_id` + composite FK; owner must match |
| import_category_mappings | none (V2 `importCategoryMappings` differs) | no target | L | re-learnable |
| establishment_logos | establishment_logos (673) | 1:1 | L | `name_key` <= 180, `domain` <= 253 chars |
| reconciliation_ignores | none | no target | L | re-doable once reconciliation is ported |
| import_name_mappings | none | no target | L | re-learnable once ported |

**Top data risks**

1. Signed amounts: V1 `valor` is signed, V2 stores positive amount + `type` (`transactions_amount_nonzero_check`, 972).
2. Free-text markers `AUTO_FATURA:...` and `AUTO_REEMBOLSO:<id>` must become `invoice_payments`, `transaction_refunds` and `origin` (origin enum 167, check 994), or they count as plain income/expense.
3. Installments: every V1 series needs an `installment_series` row (count 2..60, 828; metadata check 978; unique series+installment 929).
4. Recurrence: V1 materialized rows -> V2 rules + occurrences; settled/edited rows become per-occurrence exceptions (decision pending: rules vs plain singles).
5. Splits and transfers: `split_group_id` has no home; transfer row pairs collapse to one row with `transfer_id` (922).
6. Initial balances: `saldo_inicial` column -> balance adjustment transaction.
7. Nullable -> required: `faturas.cartao_id`, `orcamentos.categoria_id`, inbox identity fields, note titles, task due dates.
8. No target: trips, note attachments, shares, API tokens, sessions.

Not verified yet: V2 migrations and real V1 data were not read; a pre-flight validator over a production dump must confirm counts before any ETL.
