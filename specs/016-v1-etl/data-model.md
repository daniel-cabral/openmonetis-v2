# Data Model: V1 to V2 Data Migration (016)

No application schema change and no Drizzle migration. The tool owns one schema, `v1_etl`, in the
target database (research R4), and reads the V2 application schema as the load target.

## Tool state (`v1_etl` schema, created by the tool, idempotent DDL)

### `v1_etl.runs`

| Column | Type | Rule |
|---|---|---|
| `dump_fingerprint` | text PK | SHA-256 of per-table count + content hash (R5) |
| `v1_counts` | jsonb | `{ table: rowCount }` |
| `started_at`, `finished_at` | timestamptz | `finished_at` null while loading |
| `status` | text | `loading` \| `loaded` \| `failed` |

Only one row may exist per target; a different fingerprint is refused.

### `v1_etl.user_loads`

| Column | Type | Rule |
|---|---|---|
| `v1_user_id` | text PK | |
| `v2_user_id` | uuid | UUIDv5 of `user:<v1 id>` |
| `dump_fingerprint` | text | FK -> `runs` |
| `status` | text | `loaded` (written in the user's own transaction, so a partial user never has a row) |
| `checksum` | text | SHA-256 of the user's V2 rows read back from the database: per table ordered by PK, fixed column list (columns the plan writes; DB defaults like `updated_at` excluded), normalized values (research R5) |
| `loaded_at` | timestamptz | |

Failures are reported, not stored: a failed user simply has no row and is retried next run.

### `v1_etl.id_map`

| Column | Type | Rule |
|---|---|---|
| `v1_table` | text | V1 table, or a synthetic source (`installment_series`, `recurring_series`) |
| `v1_id` | text | V1 id (or V1 series id) |
| `role` | text | `''` for 1:1; otherwise the derived record (`rule:<n>`, `occurrence:<date>`, `payment`, `split:<person>`) |
| `v2_table` | text | V2 table written |
| `v2_id` | text | V2 id, or the composite key for tables without one |
| `v1_user_id` | text | owner |

PK (`v1_table`, `v1_id`, `role`). `v2_id` = UUIDv5(namespace, `v1_table:v1_id[:role]`).

## Operator resolution file (input, JSON)

```json
{
  "dumpFingerprint": "sha256...",
  "resolutions": {
    "recurrence.duplicate-occurrence:lancamentos:<v1 id>": "drop",
    "note.missing-title:anotacoes:<v1 id>": "title-from-content"
  }
}
```

Key = `<rule id>:<v1 table>:<v1 id>`; value must be one of the rule's allowed resolutions
([contracts/output-formats.md](contracts/output-formats.md)). A resolution for another fingerprint is rejected.
The validator prints a template with every blocker key.

## V1 -> V2 mapping (load plan per user)

Order of writes = FK order below. "Plan" is built by pure conversions, then written in one
transaction (research R3, R5).

| # | V1 source | V2 target | Conversion (research ref) |
|---|---|---|---|
| 1 | `user` | `user` | email kept, `lower(email)` unique; timestamps kept (R12) |
| 2 | `account` | `account` | `credential`: `accountId` = V2 user id, hash copied; `google`: subject kept (R13) |
| 3 | `passkey` | `passkey` | 1:1 only when `--v1-rp-id` equals the target host (R13) |
| 4 | `pagadores` | `people` | admin -> `admin` (exactly one), others `external`; dropped `share_code`, `is_auto_send`, `last_mail` |
| 5 | (defaults) + `categorias` + `subcategorias` | `categories` | defaults seeded, V1 merged by name+type, subcategory -> child (R12) |
| 6 | `contas` | `financial_accounts` | type map over all V1 types, `other` only as fallback; status map; initial balance handled in row 12 (R11, R12) |
| 7 | `cartoes` | `cards` | `fixedDay`, ints, `closingDayPurchasesNextInvoice = true`, brand map (R12) |
| 8 | `viagens` | `trips` | 1:1 (R12) |
| 9 | `preferencias_usuario` | `user_preferences`, `dashboard_preferences` | split; defaults when absent (R12) |
| 10 | `lancamentos` "Parcelado" | `installment_series` + `transactions` | series per `series_id` (R9) |
| 11 | `lancamentos` "Recorrente" | `recurring_transaction_series`, `recurring_transaction_rules`, `recurring_transaction_splits`, `recurring_transaction_occurrences`, `recurring_occurrence_trips` | runs -> versions, settled -> occurrences (R8) |
| 12 | `lancamentos` "À vista" (+ detached recurrence duplicates) | `transactions` (+ `transaction_splits`) | sign -> type + positive amount; V2 transfer pairs (signed, shared new `transferId`); initial balance by flag; markers (R10, R11) |
| 13 | marker rows | `invoice_payments`, `invoice_payment_allocations`, `transaction_refunds` | (R10) |
| 14 | `faturas` | `invoices` | status; only when `pago`: `paidAt` and `paymentAccountId` from the latest payment; `pendente`: both null (`invoices_payment_status_metadata_check`) (R10) |
| 15 | `antecipacoes_parcelas` | `installment_anticipations`, `installment_anticipation_items` | (R9) |
| 16 | `viagem_id` links | `transaction_trips` / `recurring_occurrence_trips` | (R12) |
| 17 | `anexos`, `lancamento_anexos`, `anotacao_anexos` | `attachments`, `transaction_attachments`, `note_attachments` | S3 keys referenced, owner match |
| 18 | `anotacoes` | `notes`, `note_items` | `nota` -> `text` (content = `descricao`, must be non-blank); `tarefa` -> `checklist` (content null, tasks JSON -> items, non-blank `descricao` -> first item) (R12) |
| 19 | `orcamentos` | `budgets` | category remapped and required; `amount` > 0; `period` matches `^[1-9][0-9]{3}-(0[1-9]|1[0-2])$` (R12) |
| 20 | `pre_lancamentos` | `inbox_items` | all statuses, synthesized `clientId`, fingerprint (R12) |
| 21 | `dashboard_notification_states`, `establishment_logos` | `notification_states`, `establishment_logos` | 1:1, length limits |
| 22 | `import_category_mappings` | `import_category_mappings` | key verbatim; `categoryId` remapped, `subcategory_id` -> child category (research R13b) |
| 23 | `import_name_mappings` | `import_name_mappings` | key and name verbatim (R13b) |
| - | `session`, `verification`, `tokens_api`, `compartilhamentos_pagador`, `insights_salvos`, `reconciliation_ignores` | none | skipped by decision, counted (FR-014) |

### Transaction row conversion (`lancamentos` -> `transactions`)

| V1 | V2 | Rule |
|---|---|---|
| `valor` signed numeric(12,2) | `type`, `amount` | Despesa -> `expense`, Receita -> `income`, amount = `abs(valor)`; Transferência pair -> `transfer`, signed, shared new `transferId`; more than 2 decimals or 0 outside a recurrence -> blocker |
| `condicao` | `condition` | À vista -> `single`, Parcelado -> `installment` |
| `forma_pagamento` | `paymentMethod` | R12 map; null only for `accountBalanceAdjustment` |
| `periodo` | `period` | kept verbatim (manual invoice periods preserved), except a non-card row resolved by `transaction.period-date-mismatch` (`use-date`: period = purchase month; `use-period`: date moved into the period month) |
| `data_compra`, `data_vencimento`, `dt_pagamento_boleto` | `purchaseDate`, `dueDate`, `boletoPaymentDate` | dates kept, no timezone conversion |
| `realizado` | `isSettled` | null -> null; `settledAmount`, `settledDate` stay null |
| `categoria_id` / `subcategoria_id` | `categoryId` | child category when subcategory set |
| `pagador_id` | `personId` | mapped person; split groups -> owner + `transaction_splits` |
| `anotacao` | `note` or origin | markers become origins (R10); other text kept |
| `created_at` | `createdAt` | kept |
| `dividido`, `split_group_id`, `antecipado`, `qtde_recorrencia`, `ofx_fit_id` | none | dropped (structure carried by V2 relations) |
| `ofx_import_fingerprint`, `import_batch_id` | none | reconciliation stamps dropped and counted (`stamp.dropped`, research R13b) |

### Recurrence conversion state (pure, per V1 series)

| Entity | Fields | Rule |
|---|---|---|
| Occurrence | period, date, dueDate, attributes, settlement, splits, v1Ids | one per period (extra rows detached as singles); zero amount -> skip |
| Run | first/last date, attributes | consecutive months with equal attributes |
| Version | anchorDate = startDate = run first date, endDate = run last date, dueDate, recurrenceEndDate, `isSettled = null` | one per run; same `recurrenceEndDate` on all versions; `is_settled` always null (settlement lives only in occurrence rows) |
| Verification | per period: expected (V1) vs expanded (V2 domain) | any mismatch -> blocker, series not written |

## Reports (output)

Shapes in [contracts/output-formats.md](contracts/output-formats.md): `Finding`, `ValidationReport`,
`LoadReport` (per table read/written/merged/skipped and per user status), `ReconciliationReport`
(per user figures with V1, V2, difference, pass), `RepairList` (Companion re-pair, share
re-invite, password reset, unusable passkeys).

## State transitions

Run: `loading` -> `loaded` (all users loaded) or `failed` (at least one user failed; re-run allowed
with the same fingerprint). User: absent -> `loaded` (atomic). A different fingerprint requires a
fresh scratch database.
