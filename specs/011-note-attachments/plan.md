# Implementation Plan: Attachments on Notes

**Branch**: `011-note-attachments` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-note-attachments/spec.md` (clarified, UI option recorded in spec)

## Summary

Text notes gain attachments through a new `note_attachments` link table and note-specific operations
on the existing attachments route/service (prepare, confirm, list, detach), reusing the storage,
MIME/size/signature validation, pending expiry and tombstone deletion already used for transactions.
All attachment sweeps learn about note links so neither parent sweeps the other's files; note deletion
runs the orphan cleanup. Notes output gains `attachmentCount`. The web generalizes the transaction
attachment list into a parent-agnostic list, adds an "Anexos" field to the note form (pending files on
create, live list on edit), a paperclip count on the note card and a read-only list with
preview/download in the details dialog. Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/note-attachments-api.md](contracts/note-attachments-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, Zod, TanStack Start/Query/Form,
shadcn/ui (attachment, alert-dialog already installed), `@aws-sdk/client-s3` (existing storage util)

**Storage**: PostgreSQL (1 new table, 1 migration), private S3 bucket (existing)

**Testing**: `node:test` + `tsx`; domain `packages/domain/src/notes.test.ts`; service unit test
`apps/api/src/services/attachments.service.test.ts`; integration `test:note-attachments:integration`
(`apps/api/src/note-attachments.integration.test.ts`) with the S3 mock of `compose.test.yml` and the
lane database

**Target Platform**: self-hosted web app

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: card count from one grouped subquery in the notes list (no N+1)

**Constraints**: every query filters `userId`; composite FKs forbid cross-user links; no new
dependency; lane B ports 7201-7203 only

**Scale/Scope**: 1 table, 4 endpoints, 1 output field, 1 domain rule, 3 web touch points

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Extends feature `attachments` (route/service/repository/validators) and `notes` (output, cleanup, domain `canAttachToNote`); no barrels; routes thin; repository filters `userId` |
| II. Upstream-compatible | PASS | Additive table/endpoints; `docs/note-attachments.md` + CHANGELOG `Unreleased` `### Fork`; not fork-only |
| III. V1 is reference | PASS | Kept: text-only attach, pending files after create, count on card, read-only details, delete cleanup. Changed: link table instead of V1 column model, V2 expiry (presign TTL + 24 h pending) instead of V1 10 min token, attachments survive kind change. Dropped: nothing |
| IV. Financial integrity | PASS | No money involved; isolation via `userId` filters and composite FKs; versioned migration |
| V. Behavior-verified | PASS | Integration: isolation 404, kind gate, spoofed content, exclusive parent, sweep safety, delete cleanup, library exclusion; domain test for kind rule |

Post-design re-check: PASS (Complexity Tracking empty).

## Upstream overlap check

`upstream/main` is at 0.17.1 (`4b00b83`), 9 commits ahead of fork `main`; none touches note
attachments (`git grep note_attachments upstream/main` empty; CHANGELOG has no note-attachment entry).
Merge risk only: upstream 0.17.0 refactors web screens broadly ("unificar indicadores, buscas e
navegação"), likely touching `notes-page.tsx`/`note-card.tsx`; resolved when the fork merges 0.17.x.

## Project Structure

### Documentation (this feature)

```text
specs/011-note-attachments/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/note-attachments-api.md
├── previews/
└── tasks.md
```

### Source Code (repository root)

```text
packages/db/src/schema.ts                         # + noteAttachments table
packages/db/drizzle/<NNNN>_*.sql + meta           # generated migration
packages/domain/src/notes.ts (+ notes.test.ts)    # + canAttachToNote(kind)
packages/validators/src/attachments.ts            # + PrepareNoteAttachmentInput, ConfirmNoteAttachmentInput, NoteAttachmentParams, NoteAttachmentItemParams, DetachNoteAttachmentOutput
packages/validators/src/notes.ts                  # NoteOutput + attachmentCount
apps/api/src/repositories/attachments.repository.ts  # note methods + note-link guards in sweeps
apps/api/src/services/attachments.service.ts      # prepareForNote/confirmForNote/listForNote/detachFromNote (shared confirm core)
apps/api/src/services/attachments.service.test.ts # unit cases for note gate
apps/api/src/routes/attachments.ts                # 4 note routes
apps/api/src/repositories/notes.repository.ts     # attachmentCount subquery
apps/api/src/services/notes.service.ts            # attachmentCleaner after delete
apps/api/src/app.ts                               # wiring
apps/api/src/note-attachments.integration.test.ts # NEW
apps/web/src/features/attachments/attachments.api.ts / .queries.ts / .mutations.ts  # note functions, keys
apps/web/src/features/attachments/components/attachment-list.tsx  # NEW parent-agnostic list (from transaction-attachments)
apps/web/src/features/attachments/components/transaction-attachments.tsx  # thin wrapper
apps/web/src/features/attachments/components/note-attachments.tsx  # NEW
apps/web/src/features/notes/...                   # form field (pending/edit), card count, details list, busy gating
docs/note-attachments.md, CHANGELOG.md, package.json (+ test script)
```

**Structure Decision**: note attachments are part of feature `attachments` (same storage/service),
with notes only consuming them; no new feature folder.

## Complexity Tracking

None.
