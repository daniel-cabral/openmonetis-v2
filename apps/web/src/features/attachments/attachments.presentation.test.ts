import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAttachmentCount,
  formatAttachmentUploadResult,
  formatPendingUploadFailure,
} from "./attachments.presentation";

test("attachment count pluralises the total", () => {
  assert.equal(formatAttachmentCount(1), "1 anexo");
  assert.equal(formatAttachmentCount(3), "3 anexos");
});

test("note upload results and pending failures pluralise in PT-BR", () => {
  assert.equal(formatAttachmentUploadResult(1), "Anexo enviado.");
  assert.equal(formatAttachmentUploadResult(3), "3 anexos enviados.");
  assert.equal(
    formatPendingUploadFailure(1),
    "A nota foi salva, mas 1 anexo não pôde ser enviado.",
  );
  assert.equal(
    formatPendingUploadFailure(3),
    "A nota foi salva, mas 3 anexos não puderam ser enviados.",
  );
});
