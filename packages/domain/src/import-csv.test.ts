import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeImportText,
  parseBrazilianDate,
  parseDecimalToCents,
  splitCsvFields,
  splitCsvLines,
  stripByteOrderMark,
} from "./import-csv";

test("stripByteOrderMark removes only a leading BOM", () => {
  assert.equal(stripByteOrderMark("﻿Data;Valor"), "Data;Valor");
  assert.equal(stripByteOrderMark("Data﻿;Valor"), "Data﻿;Valor");
});

test("splitCsvLines keeps line positions for CRLF and LF and drops only trailing blank lines", () => {
  assert.deepEqual(splitCsvLines("a\r\n\r\nb\n"), ["a", "", "b"]);
  assert.deepEqual(splitCsvLines("a\nb"), ["a", "b"]);
  assert.deepEqual(splitCsvLines("a\n\n\r\n"), ["a"]);
});

test("splitCsvFields honours quoted separators, doubled quotes and empty fields", () => {
  assert.deepEqual(splitCsvFields('a;"b;c";d', ";"), ["a", "b;c", "d"]);
  assert.deepEqual(splitCsvFields('"say ""hi""",2', ","), ['say "hi"', "2"]);
  assert.deepEqual(splitCsvFields("a;;c", ";"), ["a", "", "c"]);
});

test("parseBrazilianDate converts dd/mm/yyyy and rejects impossible or foreign formats", () => {
  assert.equal(parseBrazilianDate("05/07/2026"), "2026-07-05");
  assert.equal(parseBrazilianDate("29/02/2026"), null);
  assert.equal(parseBrazilianDate("2026-07-05"), null);
});

test("parseDecimalToCents parses comma or point decimals to exact integer cents", () => {
  assert.equal(parseDecimalToCents("86,59"), 8659);
  assert.equal(parseDecimalToCents("86.59"), 8659);
  assert.equal(parseDecimalToCents("0,29"), 29);
  assert.equal(parseDecimalToCents("-75,00"), -7500);
  assert.equal(parseDecimalToCents("1234"), 123400);
});

test("parseDecimalToCents rejects thousands separators, currency symbols and empty text", () => {
  assert.equal(parseDecimalToCents("1.234,56"), null);
  assert.equal(parseDecimalToCents("R$ 10,00"), null);
  assert.equal(parseDecimalToCents(""), null);
});

test("decodeImportText decodes UTF-8 and falls back to windows-1252 for legacy bytes", () => {
  assert.equal(decodeImportText(new TextEncoder().encode("Agência")), "Agência");
  assert.equal(
    decodeImportText(Uint8Array.from([0x41, 0x67, 0xea, 0x6e, 0x63, 0x69, 0x61])),
    "Agência",
  );
});
