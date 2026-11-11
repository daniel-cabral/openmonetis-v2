# Data Model: 001 C6 CSV Import

No schema change. All types below are domain/contract types.

## ImportProfile (domain registry)
- `id`: `"c6-statement" | "c6-invoice"` (extensible string union)
- `label`: PT-BR label ("C6 Bank - Extrato de conta corrente", "C6 Bank - Fatura de cartão")
- `kind`: `"statement" | "invoice"`; `destinationType`: `"account"` for statement, `"card"` for invoice
- `headerSignature`: required header fragments
- `readAccountIdentification(content) -> string | null` (statement only)
- `parse(content) -> ImportedStatement`

## ImportedTransaction (extended)
Existing: `externalId`, `purchaseDate`, `amount` (positive, from cents), `name`, `type`, `categoryName`.
Added (optional, null for OFX/XLSX):
- `postedDate: string | null`, `dayBalance: number | null` (statement)
- `installment: { current: number; total: number } | null`, `cardLastDigits: string | null`, `holderName: string | null`, `fx: { currency: "USD"; amount: number } | null` (invoice)
- `lineKind: "purchase" | "credit" | "invoice-payment" | null` (invoice only)

Statement lines: `type = income` when entry > 0 else expense; `categoryName = null`.
Invoice lines: `type = income` when value < 0; `categoryName` = raw issuer category.

## ImportedStatement (extended)
Added: `profileId: string | null`, `accountIdentification: string | null`, `invalidLines: { lineNumber: number; reason: "invalid_date" | "invalid_amount" }[]`.

## Row identity payload
JSON array `[version, kind, normalize(source), destinationType, destinationId, ...kindFields, occurrence]`
- statement fields: `normalize(accountIdentification)`, `purchaseDate`, `postedDate`, `normalize(name)`, signed amount `"-12164.10"`
- invoice fields: `normalize(cardLastDigits)`, `purchaseDate`, `normalize(name)`, `"N/M" | ""`, signed amount
- `normalize` = trim, lowercase, collapse spaces. Occurrence counted per identical field group, in file order.

## Category memory key
`getImportedDescriptionKey(name)` per FR-015; legacy `normalizeImportedDescriptionKey(name)` kept for lookup only.
