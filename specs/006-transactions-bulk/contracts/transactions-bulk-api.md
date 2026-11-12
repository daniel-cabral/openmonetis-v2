# API contract: Transactions mass-add and bulk edit (006)

Both routes live in `apps/api/src/routes/transactions.ts` (mounted at `/transactions`):
authenticated session, `Cache-Control: private, no-store`, Zod-validated (`validationHook` ->
400 `validation_error`), OpenAPI tag `Transactions`, envelope `{ data, error: null }` /
`{ error: true, message, code }` (unchanged). Amounts are positive BRL numbers; the type decides
the stored sign. All or nothing: any error means zero writes.

## `POST /transactions/bulk/create`

Request `BulkCreateTransactionsInput`:

```json
{
  "type": "expense",
  "paymentMethod": "credit_card",
  "cardId": "uuid",
  "invoicePeriod": "2026-11",
  "rows": [
    { "purchaseDate": "2026-11-03", "name": "Padaria", "amount": 18.5,
      "categoryId": "uuid", "personId": "uuid" }
  ]
}
```

Non-card variant: `"paymentMethod": "pix", "accountId": "uuid"` and no `cardId`/`invoicePeriod`.

| Status | Body / code | When |
| --- | --- | --- |
| 201 | `{ data: { ids: uuid[] } }` in row order | every row created |
| 400 | `validation_error` | shape (rows 0 or > 500, missing field, amount <= 0, card/account mismatch, unknown key) |
| 400 | `INVOICE_ALREADY_PAID` | a resulting card period is paid |
| 400 | `CARD_LIMIT_EXCEEDED` | card used + expense rows > limit |
| 401 | | no session |
| 404 | `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND` | foreign, archived account / foreign, inactive card |
| 404 | `CATEGORY_NOT_FOUND` | a row's category is foreign, of the other type, or the system invoice-payment category |
| 404 | `PERSON_NOT_FOUND` | a row's person is foreign or inactive |

No row number in errors; the dialog names the row for shape errors before sending.

## `PATCH /transactions/bulk/update`

Request `BulkUpdateTransactionsInput`:

```json
{
  "ids": ["uuid", "uuid"],
  "scope": "future",
  "changes": { "dueDate": "2026-12-31", "categoryId": "uuid" }
}
```

`changes` keys: `purchaseDate`, `invoicePeriod`, `dueDate` (nullable), `personId`, `accountId`,
`cardId`, `categoryId`, `note` (nullable), `amount`; at least one. `scope` applies only to
installment items (`single` default; `future` = anchor and later installments; `series` = all).
Anchor per series = lowest selected installment; dates and periods of covered installments shift
by `currentInstallment - anchor` months, clamped to month end.

| Status | Body / code | When |
| --- | --- | --- |
| 200 | `{ data: { ids: uuid[] } }` | every planned row updated (selected rows plus series rows in scope) |
| 400 | `validation_error` | shape, empty `changes`, unknown key (`condition`, `isSettled`, `boletoPaymentDate`, ...) |
| 400 | `BULK_ACTION_UNSUPPORTED` | a target is protected (non-regular origin, transfer leg, balance adjustment) |
| 400 | `BULK_UPDATE_RECURRING` | a target is a stored recurring row |
| 400 | `BULK_UPDATE_FIELD_NOT_APPLICABLE` | a field does not apply to a target's payment method or type |
| 400 | `BULK_UPDATE_SPLIT_PERSON` | `personId` on a split target |
| 400 | `BULK_CATEGORY_INCOMPATIBLE` | category type or system flag incompatible with a target |
| 400 | `SETTLEMENT_REQUIRES_UNDO` | settled target (or settled series row in scope) and a settlement-locked field |
| 400 | `INVOICE_ALREADY_PAID` | card, period, date or amount changes on a card target whose source or destination invoice is paid |
| 401 | | no session |
| 404 | `TRANSACTION_NOT_FOUND` | any id missing or owned by another user, or a planned row vanished before the write (whole transaction rolled back) |
| 404 | `PERSON_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND` | changed reference foreign, inactive or archived |

Check order: ids -> references -> per-target domain rejection -> category compatibility -> series
expansion and settlement -> paid invoices (source and destination) -> write (rolls back unless
every planned row is updated).

## Web client

- `transactions.api.ts`: `createTransactionsBulk(input: BulkCreateTransactionsInput)` and
  `updateTransactionsBulk(input: BulkUpdateTransactionsInput)`, both returning
  `BulkTransactionsOutput`.
- Mutations invalidate through `refreshTransactionQueries` (lists, invoices, dashboard).

## PT-BR copy (`transactions.presentation.ts`)

| Code (context) | Message |
| --- | --- |
| `CATEGORY_NOT_FOUND` (mass-add) | Categoria não encontrada em uma das transações. |
| `PERSON_NOT_FOUND` (mass-add) | Pessoa não encontrada em uma das transações. |
| `BULK_ACTION_UNSUPPORTED` (bulk edit) | Lançamentos protegidos não podem ser atualizados em massa. |
| `BULK_UPDATE_RECURRING` (also local pre-check) | Lançamentos recorrentes devem ser editados individualmente. |
| `BULK_UPDATE_SPLIT_PERSON` | Lançamentos divididos não podem trocar de pessoa em massa. |
| `BULK_UPDATE_FIELD_NOT_APPLICABLE` | Alguns campos não se aplicam à forma de pagamento de todos os lançamentos. |
| `INVOICE_ALREADY_PAID` (bulk edit) | Uma das faturas de destino já está paga. Desfaça o pagamento antes de mover estes lançamentos. |
| `SETTLEMENT_REQUIRES_UNDO` (bulk edit) | Desfaça a baixa dos lançamentos pagos antes de alterar valores, datas, pessoa, conta ou cartão. |
| success (mass-add) | 1 lançamento criado com sucesso. / N lançamentos criados com sucesso. |
| success (bulk edit) | 1 lançamento atualizado. / N lançamentos atualizados. |
