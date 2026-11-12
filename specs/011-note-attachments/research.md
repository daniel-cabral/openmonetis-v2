# Research: Attachments on Notes

## R1. Link storage

- Decision: new table `note_attachments (user_id, note_id, attachment_id)`, PK `(note_id, attachment_id)`,
  unique `attachment_id`, composite FKs `(note_id, user_id) -> notes(id, user_id)` and
  `(attachment_id, user_id) -> attachments(id, user_id)`, both `ON DELETE CASCADE`.
- Rationale: mirrors `transaction_attachments`; composite FKs make cross-user links impossible in the
  database; unique `attachment_id` enforces "one attachment, one note".
- Alternatives: nullable `note_id` on `attachments` (rejected: mixes parents in one row and breaks the
  existing transaction-link model); polymorphic `parent_type/parent_id` (rejected: no FK integrity).

## R2. Exclusive parent

- Decision: `finalizeAndAttachToNote` refuses an attachment that has any transaction link;
  `finalizeAndAttach` (transactions) refuses an attachment that has a note link. Both inside the
  existing row lock (`FOR UPDATE` on `attachments`).
- Rationale: FR-011 and the spec edge case "shared between a note and a transaction is not supported".

## R3. Service shape

- Decision: extend `createAttachmentsService` with `prepareForNote`, `confirmForNote`, `listForNote`,
  `detachFromNote`, reusing the private validation/commit/tombstone helpers. The shared confirm flow is
  extracted into one internal function parameterized by an "attach" callback so the content checks
  (size, MIME, signature, etag, commit, retry) are not duplicated.
- Rationale: FR-015 (reuse storage and validation); SRP per exported function; no parallel mechanism.
- Alternatives: separate `note-attachments.service.ts` (rejected: would duplicate or export private
  storage helpers).

## R4. Note kind gate

- Decision: repository `noteAcceptsAttachmentsForUser(noteId, userId)` returns `"missing" | "not_text" | "ok"`;
  prepare/confirm map them to 404 `note_not_found` and 400 `note_attachments_not_allowed`. List and
  detach only require ownership (attachments survive kind changes).
- Domain: `canAttachToNote(kind)` in `packages/domain/src/notes.ts` (pure rule, tested).

## R5. Sweeps and deletion

- Decision: every `notExists(transaction_attachments ...)` guard in the attachments repository also
  checks `note_attachments` (orphans, expired pending, pending reject, tombstone delete). `markForDeletionForUser`
  deletes note links too. Note deletion: notes service receives `attachmentCleaner: Pick<AttachmentsService, "cleanupOrphans">`
  and calls it after a successful delete, like `transactions.service.ts`.
- Rationale: without the guard, deleting any transaction would sweep every note attachment (critical
  regression risk, covered by integration test).

## R6. Card count

- Decision: `NoteOutputSchema` gains `attachmentCount: number` (int, >= 0), computed by a grouped
  count subquery in the notes repository list/find queries.
- Alternative: separate request per card (rejected: N+1 requests).

## R7. Web

- Decision: generalize the existing `TransactionAttachments` list into a parent-agnostic
  `AttachmentList` driven by props (query options, upload, detach), keep `TransactionAttachments` as a
  thin wrapper, and add `NoteAttachments`. Create flow reuses `AttachmentFilePicker` for pending files,
  uploaded after the note is created (same as `useTransactionForm`). Details dialog uses `AttachmentList`
  in `readOnly` mode with `AttachmentPreviewDialog` for preview/download.
- Messages follow the spec (PT-BR, with final period).

## R8. Integration environment

- Decision: `apps/api/src/note-attachments.integration.test.ts` with script
  `test:note-attachments:integration`, using the S3 mock from `compose.test.yml` (port 19000) like
  `storage.integration.test.ts`, and the lane database via `withIntegrationDatabase`.
