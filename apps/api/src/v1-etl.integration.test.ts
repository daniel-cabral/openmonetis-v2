import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixturesFolder = fileURLToPath(new URL("./scripts/v1-etl/__fixtures__/", import.meta.url));
const cliPath = fileURLToPath(new URL("./scripts/v1-etl/cli.ts", import.meta.url));
const require = createRequire(new URL("../../../packages/db/package.json", import.meta.url));
const { Pool } = require("pg") as typeof import("pg");

type CliRun = { code: number; stdout: string; stderr: string };
type ReportedFinding = { rule: string; severity: string; table: string; v1Id: string };

const createdFixtures: string[] = [];

async function serverUrl(): Promise<URL> {
  require("dotenv").config({
    path: join(repositoryRoot, ".env"),
    quiet: true,
  });
  const { resolveDatabaseUrl } = await import("../../../packages/db/src/database-url");
  return new URL(process.env.TEST_DATABASE_URL ?? resolveDatabaseUrl());
}

// A uniquely named V1 database on the test server with the given SQL files applied in order.
async function createV1Fixture(files: string[]): Promise<string> {
  const url = await serverUrl();
  const databaseName = `openmonetis_v1_etl_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url.toString() });
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }
  createdFixtures.push(databaseName);
  url.pathname = `/${databaseName}`;
  const fixture = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    for (const file of files) {
      await fixture.query(readFileSync(join(fixturesFolder, file), "utf8"));
    }
  } finally {
    await fixture.end();
  }
  return url.toString();
}

async function dropV1Fixtures(): Promise<void> {
  const admin = new Pool({ connectionString: (await serverUrl()).toString() });
  try {
    for (const databaseName of createdFixtures.splice(0)) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

// One process per command: @openmonetis/db reads its environment once, and exit codes stay real.
function runCli(args: string[]): Promise<CliRun> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", cliPath, ...args],
      { cwd: repositoryRoot, env: { ...process.env, NODE_ENV: "test" } },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

async function runValidate(v1Url: string) {
  const out = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
  try {
    const run = await runCli(["validate", "--v1-url", v1Url, "--out", out]);
    const report =
      run.code === 0 || run.code === 1
        ? (JSON.parse(readFileSync(join(out, "validate.json"), "utf8")) as {
            findings: ReportedFinding[];
          })
        : null;
    return { ...run, report };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function findingSet(findings: ReportedFinding[], severity?: string): string[] {
  return findings
    .filter((item) => severity === undefined || item.severity === severity)
    .map((item) => `${item.rule} | ${item.table} | ${item.v1Id}`)
    .sort();
}

test("v1 etl", { skip: process.env.V1_ETL_INTEGRATION_TEST !== "1" }, async (t) => {
  try {
    await t.test(
      "validator reports exactly the seeded findings and none on the clean fixture",
      async () => {
        const violations = await runValidate(
          await createV1Fixture(["v1-schema.sql", "v1-violations.sql"]),
        );
        assert.equal(violations.code, 1, violations.stderr);
        assert.deepEqual(findingSet(violations.report?.findings ?? []), [
          "account.unknown-type | contas | 20000000-0000-4000-8000-000000000002",
          "amount.zero | lancamentos | 60000000-0000-4000-8000-000000000001",
          "budget.non-positive-amount | orcamentos | a0000000-0000-4000-8000-000000000002",
          "budget.without-category | orcamentos | a0000000-0000-4000-8000-000000000001",
          "card.day-out-of-range | cartoes | 30000000-0000-4000-8000-000000000003",
          "card.unknown-brand | cartoes | 30000000-0000-4000-8000-000000000004",
          "category.subcategory-type-mismatch | lancamentos | 60000000-0000-4000-8000-000000000005",
          "category.system-parent | categorias | 40000000-0000-4000-8000-000000000003",
          "credential.incompatible-hash | account | v1-account-a",
          "inbox.missing-identity | pre_lancamentos | 90000000-0000-4000-8000-000000000001",
          "inbox.non-positive-amount | pre_lancamentos | 90000000-0000-4000-8000-000000000002",
          "installment.count-out-of-range | lancamentos | 61000000-0000-4000-8000-000000000002",
          "installment.duplicate-number | lancamentos | 61000000-0000-4000-8000-000000000003",
          "installment.inconsistent-members | lancamentos | 61000000-0000-4000-8000-000000000001",
          "invoice.paid-without-date | faturas | 70000000-0000-4000-8000-000000000002",
          "invoice.without-card | faturas | 70000000-0000-4000-8000-000000000001",
          "marker.missing-target | lancamentos | 60000000-0000-4000-8000-000000000006",
          "note.blank-content | anotacoes | 80000000-0000-4000-8000-000000000002",
          "note.missing-title | anotacoes | 80000000-0000-4000-8000-000000000001",
          "passkey.duplicate-credential | passkey | v1-passkey-a",
          "passkey.duplicate-credential | passkey | v1-passkey-b",
          "passkey.rp-id-mismatch | passkey | v1-passkey-a",
          "passkey.rp-id-mismatch | passkey | v1-passkey-b",
          "people.admin-cardinality | pagadores | v1-user-b",
          "people.blank-name | pagadores | 10000000-0000-4000-8000-000000000002",
          "recurrence.duplicate-occurrence | lancamentos | 60000000-0000-4000-8000-000000000032",
          "recurrence.not-reproducible | lancamentos | 61000000-0000-4000-8000-000000000011",
          "reference.dangling | lancamentos | 60000000-0000-4000-8000-000000000002",
          "schema.unmapped | tabela_nova | *",
          "text.too-long | lancamentos | 60000000-0000-4000-8000-000000000003",
          "transaction.period-date-mismatch | lancamentos | 60000000-0000-4000-8000-000000000004",
          "trip.length | viagens | 50000000-0000-4000-8000-000000000001",
          "user.email-case-duplicate | user | v1-user-a",
          "user.email-case-duplicate | user | v1-user-b",
        ]);

        // SC-001: no blocker on the clean fixture; its designed fixable findings stay reported.
        const clean = await runValidate(await createV1Fixture(["v1-schema.sql", "v1-fixture.sql"]));
        assert.equal(clean.code, 0, clean.stderr);
        const cleanFindings = clean.report?.findings ?? [];
        assert.deepEqual(findingSet(cleanFindings, "blocker"), []);
        assert.deepEqual(findingSet(cleanFindings, "fixable"), [
          "amount.zero-recurrence | lancamentos | 60000000-0000-4000-8000-000000000133",
          "card.unknown-brand | cartoes | 30000000-0000-4000-8000-000000000002",
          "category.name-collision | categorias | 40000000-0000-4000-8000-000000000001",
          "category.name-collision | categorias | 40000000-0000-4000-8000-000000000004",
          "category.name-collision | categorias | 40000000-0000-4000-8000-000000000005",
          "category.name-collision | categorias | 40000000-0000-4000-8000-000000000006",
          "installment.gap | lancamentos | 61000000-0000-4000-8000-000000000002",
          "note.task-description-as-item | anotacoes | 80000000-0000-4000-8000-000000000002",
          "recurrence.duplicate-occurrence | lancamentos | 60000000-0000-4000-8000-000000000173",
        ]);
      },
    );
  } finally {
    await dropV1Fixtures();
  }
});
