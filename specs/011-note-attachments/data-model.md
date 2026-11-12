# Data Model: Attachments on Notes

## `note_attachments` (NEW)

| Column | Type | Rules |
|---|---|---|
| `user_id` | uuid | not null, FK `user(id)` cascade |
| `note_id` | uuid | not null |
| `attachment_id` | uuid | not null, unique |

- PK `(note_id, attachment_id)`; index `note_attachments_user_id_idx (user_id)`.
- FK `note_attachments_note_user_fk (note_id, user_id) -> notes(id, user_id)` on delete cascade.
- FK `note_attachments_attachment_user_fk (attachment_id, user_id) -> attachments(id, user_id)` on delete cascade.
- Migration: one versioned Drizzle migration (`drizzle-kit generate`), never push.

## `attachments` (unchanged)

Reused as is. File key lifecycle unchanged: `pending/<id>` -> `attachments/<id>` -> `deleting/<key>`.
Invariant added: an attachment has at most one parent link across `transaction_attachments` and
`note_attachments` (enforced by unique `attachment_id` plus the exclusive-parent checks in the
finalize functions, see research R2).

## Note output (changed)

`NoteOutput.attachmentCount: number` (count of `note_attachments` rows whose attachment key is final).

## Rules

- Attach allowed only when the note is owned by the user and `kind = 'text'` (domain `canAttachToNote`).
- List/download/detach require ownership only (attachments survive kind change and archive).
- Note delete -> links cascade -> orphan cleanup tombstones the attachment and removes files.
