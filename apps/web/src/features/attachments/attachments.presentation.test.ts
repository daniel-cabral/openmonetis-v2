import assert from "node:assert/strict";
import test from "node:test";
import { formatAttachmentCount } from "./attachments.presentation";

test("attachment count pluralises the total", () => {
  assert.equal(formatAttachmentCount(1), "1 anexo");
  assert.equal(formatAttachmentCount(3), "3 anexos");
});
