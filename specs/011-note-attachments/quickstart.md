# Quickstart: Attachments on Notes

1. `docker compose -f compose.test.yml up -d s3` (S3 mock on 127.0.0.1:19000).
2. `pnpm test:note-attachments:integration` (lane database from `.env`): attach PDF/PNG to a text
   note, reject checklist note, reject spoofed content, other user gets 404, detach, note delete makes
   download 404 and removes the object, transaction delete does not sweep note attachments,
   library excludes note attachments.
3. Scoped unit tests: `pnpm exec tsx --test packages/domain/src/notes.test.ts apps/api/src/services/attachments.service.test.ts`
   and the web presentation tests touched.
4. Manual (optional, ports 7201-7203): edit a text note, add files, see "Anexo enviado.", card paperclip
   count, details dialog download.
