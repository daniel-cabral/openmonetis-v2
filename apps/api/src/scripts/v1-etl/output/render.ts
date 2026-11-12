import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LoadReport,
  OutputHeader,
  ReconciliationReport,
  RepairList,
  ValidationReport,
  WriteResult,
} from "../types";

const FINGERPRINT_PREFIX_LENGTH = 12;

export function defaultOutDir(fingerprint: string): string {
  return `.v1-etl/${fingerprint.slice(0, FINGERPRINT_PREFIX_LENGTH)}`;
}

export async function writeOutput(
  outDir: string,
  command: OutputHeader["command"],
  payload: object,
  text: string,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, `${command}.json`),
    `${JSON.stringify(sortKeys(payload), null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(outDir, `${command}.txt`), `${text}\n`, "utf8");
}

export function renderValidationText(report: ValidationReport): string {
  const { blocker, fixable, informational } = report.summary;
  return [
    ...headerLines(report.header),
    `summary: ${blocker} blocker, ${fixable} fixable, ${informational} informational`,
    "",
    "V1 rows:",
    ...sortedEntries(report.v1Counts).map(([table, rows]) => `  ${table}: ${rows}`),
    "",
    "skipped tables:",
    ...report.skippedTables.map(
      (skipped) => `  ${skipped.table}: ${skipped.rows} rows (${skipped.decision})`,
    ),
    "",
    "dropped stamps:",
    ...sortedEntries(report.droppedStamps).map(([column, rows]) => `  ${column}: ${rows}`),
    "",
    "findings:",
    ...listOrNone(
      report.findings.flatMap((finding) => [
        `  [${finding.severity}] ${finding.resolutionKey}`,
        `      ${finding.reason}`,
        `      resolutions: ${finding.resolutions.join(", ") || "none"}`,
      ]),
    ),
    "",
    "resolution template:",
    JSON.stringify(report.resolutionTemplate, null, 2),
  ].join("\n");
}

export function renderLoadText(report: LoadReport): string {
  return [
    ...headerLines(report.header),
    "",
    "tables (read = written + merged + skipped + collapsed sources; detached count as written):",
    ...report.tables.map((table) => {
      const skipped = sum(table.skipped.map((entry) => entry.rows));
      const collapsed = sum(table.collapsed.map((entry) => entry.rows));
      const balanced = table.read === table.written + table.merged + skipped + collapsed;
      return `  ${table.v1Table}: read ${table.read} = written ${table.written} + merged ${table.merged} + skipped ${skipped} + collapsed ${collapsed} (${balanced ? "balanced" : "UNBALANCED"})`;
    }),
    "",
    "users:",
    ...listOrNone(report.users.map((user) => `  ${user.v1UserId} -> ${describeWrite(user)}`)),
    "",
    "applied rules:",
    ...listOrNone(report.appliedRules.map((rule) => `  ${rule.rule}: ${rule.rows} rows`)),
    "",
    "repair list:",
    ...describeRepairList(report.repairList),
  ].join("\n");
}

export function renderReconcileText(report: ReconciliationReport): string {
  const { global } = report;
  return [
    ...headerLines(report.header),
    `global: ${global.passed}/${global.users} users passed, rehearsal ready: ${global.rehearsalReady ? "yes" : "no"}`,
    ...sortedEntries(global.totals).map(([key, value]) => `  ${key}: ${value}`),
    ...report.users.flatMap((user) => [
      "",
      `user ${user.v1UserId}: ${user.pass ? "PASS" : "FAIL"}`,
      ...user.figures.map(
        (figure) =>
          `  [${figure.pass ? "pass" : "FAIL"}] ${figure.kind} ${formatKey(figure.key)}: v1 ${figure.v1}, v2 ${figure.v2}, difference ${figure.difference}`,
      ),
      ...user.expectedDifferences.map(
        (difference) => `  expected: ${difference.reason} on ${difference.kind}`,
      ),
      ...user.informational.map((item) => `  info: ${item.reason} (${item.rows} rows)`),
    ]),
  ].join("\n");
}

function headerLines(header: OutputHeader): string[] {
  return [
    `v1-etl ${header.command}`,
    `dump: ${header.dumpFingerprint}`,
    `generated: ${header.generatedAt}`,
  ];
}

function describeWrite(result: WriteResult): string {
  switch (result.status) {
    case "loaded":
      return `loaded (${result.written} rows written)`;
    case "skipped-already-loaded":
      return "skipped (already loaded, 0 rows written)";
    case "failed":
      return `failed at ${result.table}: ${result.cause}`;
  }
}

function describeRepairList(repairList: RepairList): string[] {
  return [
    "  companion re-pair:",
    ...listOrNone(
      repairList.companionRepair.map((entry) => `    ${entry.email}: ${entry.tokens} token(s)`),
      "    ",
    ),
    "  share re-invite:",
    ...listOrNone(
      repairList.shareReinvite.map(
        (entry) =>
          `    ${entry.ownerEmail} -> ${entry.sharedWithEmail} (payer ${entry.personName})`,
      ),
      "    ",
    ),
    "  password reset:",
    ...listOrNone(
      repairList.passwordReset.map((entry) => `    ${entry.email}`),
      "    ",
    ),
    "  passkeys not loaded:",
    ...listOrNone(
      repairList.passkeysNotLoaded.map(
        (entry) => `    ${entry.email}: ${entry.count} (${entry.reason})`,
      ),
      "    ",
    ),
  ];
}

function listOrNone(lines: string[], indent = "  "): string[] {
  return lines.length > 0 ? lines : [`${indent}none`];
}

function formatKey(key: Record<string, string>): string {
  return Object.entries(key)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join(" ");
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}
