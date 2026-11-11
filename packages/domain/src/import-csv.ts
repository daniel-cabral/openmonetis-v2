const byteOrderMark = "﻿";
const decimalPattern = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;
const brazilianDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function stripByteOrderMark(content: string) {
  return content.startsWith(byteOrderMark) ? content.slice(byteOrderMark.length) : content;
}

export function splitCsvLines(content: string) {
  const lines = content.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  return lines;
}

export function splitCsvFields(line: string, separator: string) {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

export function parseBrazilianDate(value: string) {
  const match = value.match(brazilianDatePattern);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isReal) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseDecimalToCents(text: string) {
  const match = text.match(decimalPattern);
  if (!match) return null;
  const whole = Number(match[2]);
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(fraction);
  return match[1] && cents !== 0 ? -cents : cents;
}

export function decodeImportText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
