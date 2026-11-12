# Feature Specification: Attachments on Notes

**Feature Branch**: `011-note-attachments`

**Created**: 2026-11-11

**Status**: Clarified

**Input**: User description: "Port the V1 attachments on notes to V2: users can attach PDFs and images to text notes, see them, download them and remove them. V2 has attachments only on transactions and no note attachments."

## Clarifications

### Session 2026-11-12 (lane B worker, decided autonomously from V1/V2 code)

- Q: Where is the note-attachment link stored? → A: New `note_attachments` table (user_id, note_id, attachment_id) mirroring `transaction_attachments`, composite FKs to `notes(id, user_id)` and `attachments(id, user_id)` with cascade, and a unique `attachment_id` so one attachment has exactly one note. An attachment linked to a transaction cannot be confirmed onto a note and vice versa (FR-011).
- Q: API shape? → A: Note-specific operations on the attachments route, mirroring the transaction ones with operation-specific schemas: `POST /attachments/note/prepare`, `POST /attachments/note/confirm`, `GET /attachments/note/{noteId}`, `DELETE /attachments/note/{noteId}/{attachmentId}`. Download/preview reuse `GET /attachments/{id}/download-url`.
- Q: Which kinds accept new attachments? → A: Prepare/confirm require a `text` note (else 400 `note_attachments_not_allowed`). Existing attachments stay listed, downloadable and removable after a kind change (orchestrator edge-case decision).
- Q: Upload authorization expiry (V1: 10 min)? → A: Keep V2's: presigned upload URL TTL from storage and the 24 h pending-upload expiry already used for transaction attachments (FR-010). A confirm after expiry fails and the UI shows "Upload de anexo inválido ou expirado.".
- Q: Card marker for kinds? → A: The notes list output gains `attachmentCount`; the card shows the paperclip whenever the count is > 0 (only text notes can gain attachments, so in practice text notes, plus notes converted afterwards).
- Q: Note deletion cleanup? → A: Deleting a note cascades its links, then the notes service runs the existing attachment orphan cleanup (as transaction deletion does); attachments become `deleting/` tombstones immediately (download returns not found) and files are removed, retried later if storage fails. The orphan sweeps (`markOrphans`, expired pending, tombstone delete, pending reject) MUST treat note links like transaction links so note attachments are never swept.
- Q: Storage failure on remove (Story 3.4)? → A: The link and record become a tombstone in one DB transaction; storage deletion is retried by the existing tombstone retry, so nothing points silently to a deleted file. API failure shows "Não foi possível remover o anexo agora.".
- Q: Does attaching bump the note `version`? → A: No. Attachments are a separate resource; note optimistic concurrency is unchanged.
- Q: Max size? → A: `maximumAttachmentSize` (50 MB) from `packages/domain/src/attachments.ts`; feature 012 replaces it later.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach files to a note (Priority: P1)

A user writing or editing a text note wants to attach PDFs or images (receipts, contracts, photos) to it.

**Why this priority**: The core capability and a standalone MVP.

**Independent Test**: Edit an existing text note, attach a PDF and a PNG, and verify both appear in the note after reload.

**Acceptance Scenarios**:

1. **Given** an existing text note in edit mode, **When** the user picks a PDF, JPEG, PNG or WebP file within the size limit, **Then** it uploads, appears in the note's attachment list with name and size, and "Anexo enviado." is shown; several files at once show "N anexos enviados."
2. **Given** the user is creating a new note, **When** they pick files before saving, **Then** the files are listed as pending, the note is saved first, and then the files are uploaded to the new note.
3. **Given** some pending files fail to upload after the note is saved, **When** the save finishes, **Then** the note exists and the user sees "A nota foi salva, mas N anexos não puderam ser enviados." (singular form for one file) and can retry from the edit form.
4. **Given** a file of an unsupported type, **When** picked, **Then** it is rejected with "Tipo não suportado. Use PDF, JPEG, PNG ou WebP." naming the file, and valid files in the same selection still upload.
5. **Given** a file above the maximum size, **When** picked, **Then** it is rejected with "O arquivo deve ter no máximo <N>MB." naming the file.
6. **Given** uploads are in progress, **When** the user tries to save or close the dialog, **Then** those actions are blocked until the uploads end.
7. **Given** the field helper, **When** displayed, **Then** it reads "PDF ou imagem · máx. <N> MB" and the action "Adicionar anexos" (and "Enviando..." while uploading).

---

### User Story 2 - View and download note attachments (Priority: P1)

The user sees which notes have attachments and opens or downloads them.

**Why this priority**: Attachments are useless if they cannot be retrieved.

**Independent Test**: Open a note with two attachments, download one, and verify the original file is delivered.

**Acceptance Scenarios**:

1. **Given** a text note with attachments, **When** the note card is listed, **Then** it shows a paperclip with the attachment count; notes without attachments show no marker.
2. **Given** a note with attachments, **When** the user opens its details, **Then** the attachments are listed read-only with name, size and a download action.
3. **Given** the user chooses an attachment, **When** download starts, **Then** the original file is delivered with its original name, using a short-lived private link, and a failure shows "Não foi possível baixar o anexo agora."
4. **Given** an image attachment, **When** opened, **Then** the user can preview it as for transaction attachments.
5. **Given** checklist or task notes, **When** displayed, **Then** no attachment picker appears (V1 allowed attachments on text notes only); attachments kept from before a kind change are still listed and counted.
6. **Given** an archived note, **When** the user opens it, **Then** its attachments remain visible and downloadable.

---

### User Story 3 - Remove attachments and clean up (Priority: P2)

The user removes an attachment from a note, and deleting a note removes its files.

**Why this priority**: Required for privacy and storage hygiene; less frequent than adding.

**Independent Test**: Remove one attachment and delete another note; verify the files are no longer retrievable.

**Acceptance Scenarios**:

1. **Given** an attachment on a note in edit mode, **When** the user chooses to remove it, **Then** a confirmation "Remover anexo?" appears; on confirm the attachment disappears from the note and "Anexo removido." is shown ("Removendo..." while pending).
2. **Given** the user cancels the confirmation, **When** closed, **Then** nothing is removed.
3. **Given** a note with attachments, **When** the user deletes the note, **Then** its attachments and stored files are also deleted and no longer retrievable.
4. **Given** a removal fails in storage, **When** it happens, **Then** the user sees an error and the attachment record is not left orphaned or pointing to a deleted file silently.
5. **Given** a pending upload that was never confirmed (tab closed), **When** time passes, **Then** the unconfirmed file is cleaned up by the same expiry used for transaction attachments and never appears in a note.

---

### User Story 4 - Safe, private and bounded (Priority: P2)

The user's note attachments are private and validated like transaction attachments.

**Why this priority**: Security baseline for any file upload.

**Independent Test**: Try to attach a file renamed to .pdf that is not a PDF and try to read another user's attachment; both must fail.

**Acceptance Scenarios**:

1. **Given** a file whose content does not match its declared type, **When** upload is confirmed, **Then** it is rejected and not attached.
2. **Given** another user's note or attachment id, **When** requested, **Then** the response is "not found" and reveals nothing.
3. **Given** a hostile file name (path separators, control characters, very long), **When** stored, **Then** it is normalized and shown safely.
4. **Given** an upload whose authorization expired (V2 presign TTL, 24 h pending expiry), **When** confirmed, **Then** it fails with "Upload de anexo inválido ou expirado." and nothing is attached.

---

### Edge Cases

- Attaching the same file twice creates two independent attachments.
- Editing the note text does not change its attachments, and removing text keeps attachments.
- Converting a text note into a checklist or task note: Resolved (orchestrator, 2026-11-11): attachments belong to the note regardless of kind; changing the kind keeps and shows them. No blocking, no silent removal.
- Offline or interrupted uploads leave no visible partial attachment.
- An attachment shared between a note and a transaction is not supported; each attachment belongs to one parent.
- Large selections upload one by one with per-file feedback; one failure does not cancel the others.
- Note attachments do not appear in the transaction attachments library page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user attach PDF, JPEG, PNG and WebP files to a text note, both when creating (after the first save) and when editing.
- **FR-002**: The system MUST NOT offer attachments on checklist or task notes, and MUST reject the operation if requested for them.
- **FR-003**: The system MUST validate type, size and file content signature, and reject files that do not match, with the PT-BR messages in Story 1 and 4.
- **FR-004**: The system MUST enforce the maximum file size (50 MB by default, matching the V2 limit; the per-user limit from feature 012 applies when it exists) and show the effective limit in the field helper.
- **FR-005**: The system MUST upload files straight to private storage with a short-lived authorization, confirm each upload, and only then attach it to the note.
- **FR-006**: The system MUST stage files chosen during note creation and upload them after the note is saved, reporting any failure without losing the note.
- **FR-007**: The system MUST list a note's attachments with name, size and type, show a paperclip count on the note card whenever the count is > 0, and show them read-only in the details view.
- **FR-008**: The system MUST let the user download or preview an attachment through a short-lived private link, delivering the original name.
- **FR-009**: The system MUST let the user remove an attachment after confirmation, deleting the stored file and the record.
- **FR-010**: The system MUST delete all attachments and files of a note when the note is deleted, and clean up unconfirmed uploads after expiry.
- **FR-011**: The system MUST keep each attachment owned by exactly one note and the same user; every operation MUST verify ownership of the note and of the attachment.
- **FR-012**: The system MUST NOT list note attachments in the transaction attachments library.
- **FR-013**: The system MUST disable save and close actions while uploads or removals are pending.
- **FR-014**: The system MUST normalize file names and never expose storage keys, internal paths or stack traces.
- **FR-015**: All user-facing text MUST be PT-BR and short; the feature MUST reuse the existing V2 attachment pickers, preview and storage services rather than a parallel mechanism.
- **FR-016**: The system MUST preserve note attachments across archive and unarchive.

### Key Entities

- **Note**: text, checklist or task note; only text notes carry attachments.
- **Attachment**: a stored file with name, size, type, owner and private storage key.
- **Note attachment link**: association of one attachment to one note, owned by the same user.
- **Pending upload**: a not yet confirmed file, expiring automatically.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user attaches a file to a note in under 20 seconds for a 5 MB file on a normal connection.
- **SC-002**: 100% of files with a mismatching type, content signature or size are rejected with a PT-BR reason and never appear in a note.
- **SC-003**: 100% of attachments of a deleted note are unretrievable immediately after deletion and absent from storage after cleanup.
- **SC-004**: 0 attachments are readable by a different user in access tests.
- **SC-005**: When one of several uploads fails, 100% of the successful ones remain attached and the user sees how many failed.

## Assumptions

- Only text notes carry attachments (V1 parity); checklist and task notes do not.
- No maximum count per note is imposed beyond the per-file size and the user's storage; V1 had none.
- The allowed types are the same as for transaction attachments (PDF, JPEG, PNG, WebP).
- The per-user maximum size preference belongs to feature 012; until then the fixed V2 limit applies.
- ETL (016) will map V1 note attachments to this feature's target; carrying storage keys over is its concern.
- Archived notes keep their attachments; no automatic expiry of attachments exists.

## Source

- V1 evidence: `src/features/notes/actions/attachments.ts` (presign, confirm, remove; text notes only; token expiry; ownership checks), `src/features/notes/actions.ts` (note delete cleanup of files), `src/features/notes/components/note-attachments-field.tsx`, `note-dialog.tsx` (pending files after create), `note-card.tsx` (count), `note-details-dialog.tsx` (read-only list), `src/shared/lib/attachments/config.ts` (MIME and size options).
- V2 evidence: `apps/api/src/services/attachments.service.ts` (prepare, confirm, pending expiry), `packages/domain/src/attachments.ts` (types, signatures, name normalization), `packages/validators/src/attachments.ts`, `packages/db/src/schema.ts` (`attachments`, `transaction_attachments`; no note link), `packages/validators/src/notes.ts` (note kinds), `apps/web/src/features/attachments/`, `apps/web/src/features/notes/`.
- Inventory rows covered: "Note attachments" (port; "no V2 table"); data map row `anotacao_anexos` (no target today), which this feature provides.

## Dependencies

- Roadmap lane B sequence: after 009 (sequence only).
- Functional: existing V2 attachments service and storage, notes feature. Feature 012 (max attachment size preference) refines the size limit later but is not required.
- Consumed by 016 (ETL of V1 note attachments).

## UI decisions

- Chosen: **Option A (V1 parity)**, preview `specs/011-note-attachments/previews/option-a-form-field.html`
  (real app CSS compiled into the ignored `previews/app.css`).
- "Anexos" field in the note form below the content, only for text notes: create mode lists pending
  files with `AttachmentFilePicker` and uploads them after the save; edit mode uses the same list as
  transactions (preview, download, remove with "Remover anexo?"). Non-text notes with kept attachments
  show the list without the picker.
- Note card: `Paperclip` + count in the card metadata row when the count is > 0.
- Details dialog: read-only list (name, size, preview/download), also for archived notes.
- Discarded: Option B (`previews/option-b-details-dialog.html`, manage attachments only from the
  details dialog), because it diverges from V1 and from the V2 transaction pattern of attaching in the form.
