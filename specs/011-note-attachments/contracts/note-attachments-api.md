# Contract: Note Attachments API

All routes require a session, return `Cache-Control: private, no-store`, envelope `{ data, error: null }`.
Errors: 404 `note_not_found` / `attachment_not_found` / `attachment_upload_not_found` (also for other users'
ids), 400 `note_attachments_not_allowed` (non-text note), `invalid_attachment`,
`attachment_validation_failed`, `invalid_attachment_content`, 503 `attachment_storage_unavailable`.

| Method | Path | Body / params | `data` |
|---|---|---|---|
| POST | `/attachments/note/prepare` | `{ noteId, fileName, mimeType, fileSize }` (`PrepareNoteAttachmentInput`) | `{ uploadId, uploadUrl }` |
| POST | `/attachments/note/confirm` | `{ noteId, uploadId }` (`ConfirmNoteAttachmentInput`) | `AttachmentOutput` |
| GET | `/attachments/note/{noteId}` | `NoteAttachmentParams` | `AttachmentOutput[]` (oldest first) |
| DELETE | `/attachments/note/{noteId}/{attachmentId}` | `NoteAttachmentItemParams` | `{ id, noteId, deleted }` |

Reused unchanged: `GET /attachments/{id}/download-url?disposition=inline|attachment`.

Notes routes: `NoteOutput` gains `attachmentCount: number` in list and detail responses.
`GET /attachments` (library) and `/attachments/summary` keep returning only transaction attachments.
