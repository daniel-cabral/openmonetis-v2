# Contract: transaction import API (changes)

All responses use `{ data, error: null }`; errors `{ error: true, message, code }`. Auth required; `Cache-Control: private, no-store`.

## POST /transactions/imports/detect (new)
Request: `{ fileName, contentBase64 }` (same limits as preview). Only `.csv`.
Response `data`:
```json
{
  "detectedProfileId": "c6-statement" | "c6-invoice" | null,
  "profiles": [{ "id": "c6-statement", "label": "C6 Bank - Extrato de conta corrente", "kind": "statement", "destinationType": "account" }],
  "accountIdentification": "1/99999999" | null
}
```
Errors: `IMPORT_FILE_TOO_LARGE`, `IMPORT_FORMAT_NOT_SUPPORTED` (not `.csv`), `IMPORT_FILE_INVALID`.

## POST /transactions/imports/preview (extended)
Request adds optional `profileId`, `destinationType` (`account|card`), `destinationId` (uuid). Required together for `.csv`.
Errors added: `IMPORT_PROFILE_REQUIRED` (csv without profile/destination), `IMPORT_PROFILE_NOT_FOUND`, `IMPORT_DESTINATION_MISMATCH` (destination type != profile destination type), `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND` (not owned), `IMPORT_XLS_BINARY_NOT_SUPPORTED`.
Response adds: `profileId: string|null`, `accountIdentification: string|null`, `invalidLines: [{ lineNumber, reason }]`; each row adds `postedDate`, `dayBalance`, `installment`, `cardLastDigits`, `holderName`, `fx`, `lineKind`, `importable` (false for `credit`/`invoice-payment`).
`.xls` accepted (xlsx content).

## POST /transactions/imports (extended)
Rows accept optional `lineKind`. Any row with `credit` or `invoice-payment` -> 400 `IMPORT_ROW_NOT_IMPORTABLE`, nothing written. Category mappings stored under the merchant-aware key.
