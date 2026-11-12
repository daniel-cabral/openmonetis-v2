import assert from "node:assert/strict";
import test from "node:test";
import { canAttachToNote, type NoteKind } from "./notes";

test("only text notes accept attachments", () => {
  const cases: Array<[NoteKind, boolean]> = [
    ["text", true],
    ["checklist", false],
    ["task", false],
  ];

  for (const [kind, expected] of cases) {
    assert.equal(canAttachToNote(kind), expected, `kind ${kind}`);
  }
});
