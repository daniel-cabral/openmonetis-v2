// Pre-flight validation over the V1 snapshot. Reads V1 only: no target connection, no writer.
import type { PoolClient } from "pg";
import type {
  Finding,
  Resolutions,
  Severity,
  V1Attachment,
  V1Passkey,
  ValidationReport,
} from "../types";
import { V1_SCHEMA_MANIFEST } from "../v1-schema-manifest";
import {
  computeDumpFingerprint,
  countSkipped,
  extractUser,
  listV1Users,
  readV1Schema,
} from "../v1-source";
import { checkBucketKeys } from "./check-bucket";
import { duplicateCredentialFindings, finding, runRules } from "./rules";

const WHOLE_TABLE = "*";
const PLACEHOLDER = /<[^>]+>$/;

// Operator input the run refuses: exit 2 for a resolution file of another dump (contracts/cli.md),
// exit 3 for an invalid resolution, an unknown --user or a failed --check-bucket.
export class ValidationInputError extends Error {
  constructor(
    readonly exitCode: 2 | 3,
    message: string,
  ) {
    super(message);
  }
}

export async function validate(
  c: PoolClient,
  opts: { resolutions: Resolutions | null; checkBucket: boolean; user: string | null },
): Promise<ValidationReport> {
  const { fingerprint, counts } = await computeDumpFingerprint(c);
  if (opts.resolutions !== null && opts.resolutions.dumpFingerprint !== fingerprint) {
    throw new ValidationInputError(
      2,
      "The resolution file was written for another dump fingerprint.",
    );
  }

  const findings: Finding[] = [...schemaFindings(await readV1Schema(c))];
  const skippedTables = await countSkipped(c);
  for (const skipped of skippedTables) {
    if (skipped.rows === 0) continue;
    findings.push(
      finding(
        "table.skipped-by-decision",
        skipped.table,
        WHOLE_TABLE,
        null,
        "table not loaded by decision",
        { rows: skipped.rows, decision: skipped.decision },
      ),
    );
  }

  const index = await listV1Users(c);
  const users = index.users.filter((user) => opts.user === null || user.id === opts.user);
  if (opts.user !== null && users.length === 0) {
    throw new ValidationInputError(3, `Unknown V1 user: ${opts.user}`);
  }

  const droppedStamps = { ofx_import_fingerprint: 0, import_batch_id: 0 };
  const passkeys: V1Passkey[] = [];
  const attachments: V1Attachment[] = [];
  for (const user of users) {
    const x = await extractUser(c, user.id, index);
    findings.push(...runRules(x));
    passkeys.push(...x.passkeys);
    attachments.push(...x.attachments);
    for (const row of x.transactions) {
      if (row.ofx_import_fingerprint !== null) droppedStamps.ofx_import_fingerprint += 1;
      if (row.import_batch_id !== null) droppedStamps.import_batch_id += 1;
    }
  }
  findings.push(...duplicateCredentialFindings(passkeys));
  if (opts.checkBucket) {
    try {
      findings.push(...(await checkBucketKeys(attachments)));
    } catch (error) {
      // Missing S3 env, credentials or network: an operational failure (exit 3), not a finding.
      throw new ValidationInputError(
        3,
        `--check-bucket failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  findings.sort(
    (a, b) =>
      a.rule.localeCompare(b.rule) ||
      a.table.localeCompare(b.table) ||
      a.v1Id.localeCompare(b.v1Id),
  );
  const chosen = opts.resolutions?.resolutions ?? {};
  checkResolutions(chosen, findings);

  const summary: Record<Severity, number> = { blocker: 0, fixable: 0, informational: 0 };
  for (const item of findings) summary[item.severity] += 1;

  return {
    header: {
      tool: "v1-etl",
      command: "validate",
      dumpFingerprint: fingerprint,
      generatedAt: new Date().toISOString(),
    },
    v1Counts: counts,
    skippedTables,
    droppedStamps,
    findings,
    summary,
    resolutionTemplate: Object.fromEntries(
      findings
        .filter((item) => item.severity === "blocker")
        .map((item) => [
          item.resolutionKey,
          chosen[item.resolutionKey] ?? item.resolutions.join(" | "),
        ]),
    ),
  };
}

// Blockers the resolution file leaves open; `validate` exits 1 while any remains.
export function unresolvedBlockers(report: ValidationReport, r: Resolutions | null): Finding[] {
  return report.findings.filter(
    (item) => item.severity === "blocker" && r?.resolutions[item.resolutionKey] === undefined,
  );
}

// FR-003: any V1 table or column the manifest does not know blocks the run.
function schemaFindings(schema: Map<string, string[]>): Finding[] {
  const manifest: Record<string, { columns: readonly string[] }> = V1_SCHEMA_MANIFEST;
  const findings: Finding[] = [];
  for (const [table, columns] of schema) {
    const spec = manifest[table];
    if (spec === undefined) {
      findings.push(
        finding("schema.unmapped", table, WHOLE_TABLE, null, "V1 table missing from the manifest"),
      );
      continue;
    }
    for (const column of columns) {
      if (spec.columns.includes(column)) continue;
      findings.push(
        finding("schema.unmapped", table, column, null, "V1 column missing from the manifest", {
          column,
        }),
      );
    }
  }
  return findings;
}

function checkResolutions(chosen: Record<string, string>, findings: Finding[]): void {
  const byKey = new Map(findings.map((item) => [item.resolutionKey, item]));
  for (const [key, value] of Object.entries(chosen)) {
    const target = byKey.get(key);
    if (target === undefined) {
      throw new ValidationInputError(3, `Resolution key matches no finding: ${key}`);
    }
    if (!target.resolutions.some((allowed) => allows(allowed, value))) {
      throw new ValidationInputError(
        3,
        `Resolution for ${key} must be one of: ${target.resolutions.join(", ") || "none"}`,
      );
    }
  }
}

// `rename:<text>` accepts any non-empty value after its prefix; other resolutions match exactly.
function allows(allowed: string, value: string): boolean {
  if (!PLACEHOLDER.test(allowed)) return allowed === value;
  const prefix = allowed.replace(PLACEHOLDER, "");
  return value.startsWith(prefix) && value.slice(prefix.length).trim() !== "";
}
