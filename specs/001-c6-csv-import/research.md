# Research: 001 C6 CSV Import

## R1. When the destination is known
- Decision: two-step CSV flow (detect, then preview with profile + destination).
- Rationale: identity includes the destination (FR-010); duplicates can only be flagged at preview if the destination is known. Matches V1.
- Alternatives: preview returning duplicates per destination (complex response); identity without destination (violates US4-5).

## R2. Identity storage
- Decision: `importExternalId = sha256(JSON payload)` (64 hex), `importSourceFingerprint = sha256("csv:<profileId>:<accountIdentification>")`.
- Rationale: fits `varchar(255)`, existing unique index `(user_id, import_source_fingerprint, import_external_id)` and `onConflictDoNothing` give idempotency with no migration.
- Alternatives: new column (rejected by inventory decision).

## R3. Hashing location
- Decision: domain builds payload strings; service hashes with `node:crypto`.
- Rationale: domain has no I/O/platform deps (AGENTS.md section 3).

## R4. CSV parsing
- Decision: own small quote-aware splitter in `import-csv.ts`; no new dependency.
- Rationale: two fixed formats; AGENTS.md section 7 discourages new packages.

## R5. Text encoding
- Decision: decode UTF-8 with `fatal: true`; on failure fall back to windows-1252.
- Rationale: fixtures are UTF-8 with BOM; some bank exports are latin-1.

## R6. Description key compatibility
- Decision: lookup both merchant and legacy key, merchant wins; write merchant key.
- Rationale: FR-016 without a data migration.

## R7. `.xls`
- Decision: route `.xls` to the existing ExcelJS parser; detect OLE2 signature `D0 CF 11 E0` and return `IMPORT_XLS_BINARY_NOT_SUPPORTED`.
- Rationale: V1 parity per the resolved US6.
