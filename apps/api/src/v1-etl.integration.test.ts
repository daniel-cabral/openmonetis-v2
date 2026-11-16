import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { LoadReport, ReconciliationReport } from "./scripts/v1-etl/types";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixturesFolder = fileURLToPath(new URL("./scripts/v1-etl/__fixtures__/", import.meta.url));
const cliPath = fileURLToPath(new URL("./scripts/v1-etl/cli.ts", import.meta.url));
const require = createRequire(new URL("../../../packages/db/package.json", import.meta.url));
const { Pool } = require("pg") as typeof import("pg");
const { drizzle } =
  require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
const { migrate } =
  require("drizzle-orm/node-postgres/migrator") as typeof import("drizzle-orm/node-postgres/migrator");
const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

type CliRun = { code: number; stdout: string; stderr: string };
type ReportedFinding = { rule: string; severity: string; table: string; v1Id: string };

const createdDatabases: string[] = [];

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
  createdDatabases.push(databaseName);
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

// A fresh, fully migrated V2 database. withIntegrationDatabase binds the @openmonetis/db singleton
// once per process, and the load tests need several independent targets.
async function createV2Target(
  databaseName = `openmonetis_v1_etl_target_${randomUUID().replaceAll("-", "")}`,
): Promise<string> {
  const url = await serverUrl();
  const admin = new Pool({ connectionString: url.toString() });
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }
  createdDatabases.push(databaseName);
  url.pathname = `/${databaseName}`;
  const target = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await migrate(drizzle(target), { migrationsFolder });
  } finally {
    await target.end();
  }
  return url.toString();
}

async function dropTestDatabases(): Promise<void> {
  const admin = new Pool({ connectionString: (await serverUrl()).toString() });
  try {
    for (const databaseName of createdDatabases.splice(0)) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

// One process per command: @openmonetis/db reads its environment once, and exit codes stay real.
function runCli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliRun> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", cliPath, ...args],
      { cwd: repositoryRoot, env: { ...process.env, NODE_ENV: "test", ...env } },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

async function runValidate(v1Url: string, flags: string[] = []) {
  const out = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
  try {
    const run = await runCli(["validate", "--v1-url", v1Url, ...flags, "--out", out]);
    const report =
      run.code === 0 || run.code === 1
        ? (JSON.parse(readFileSync(join(out, "validate.json"), "utf8")) as {
            header: { dumpFingerprint: string };
            findings: ReportedFinding[];
            resolutionTemplate: Record<string, string>;
          })
        : null;
    return { ...run, report };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

async function runLoad(v1Url: string, targetUrl: string, flags = ["--scratch"]) {
  const out = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
  try {
    const run = await runCli([
      "load",
      "--v1-url",
      v1Url,
      "--target-url",
      targetUrl,
      ...flags,
      "--out",
      out,
    ]);
    const report =
      run.code === 0 || run.code === 1
        ? (JSON.parse(readFileSync(join(out, "load.json"), "utf8")) as LoadReport)
        : null;
    return { ...run, report };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// The V2 services read through the @openmonetis/db singleton, so it is pointed at the target.
async function runReconcile(
  v1Url: string,
  targetUrl: string,
  flags: string[] = [],
  env: NodeJS.ProcessEnv = { DATABASE_URL: targetUrl, EXTERNAL_DATABASE_URL: targetUrl },
) {
  const out = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
  try {
    const run = await runCli(
      ["reconcile", "--v1-url", v1Url, "--target-url", targetUrl, ...flags, "--out", out],
      env,
    );
    const report =
      run.code === 0 || run.code === 1
        ? (JSON.parse(readFileSync(join(out, "reconcile.json"), "utf8")) as ReconciliationReport)
        : null;
    return { ...run, report };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// validate -> load -> reconcile in one process, as the operator runs it on the real dump.
async function runRehearse(v1Url: string, targetUrl: string, flags: string[]) {
  const out = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
  try {
    const run = await runCli(
      ["rehearse", "--v1-url", v1Url, "--target-url", targetUrl, ...flags, "--out", out],
      {
        DATABASE_URL: targetUrl,
        EXTERNAL_DATABASE_URL: targetUrl,
        WEB_URL: "http://localhost:7002",
      },
    );
    const read = (command: string) =>
      JSON.parse(readFileSync(join(out, `${command}.json`), "utf8"));
    return {
      ...run,
      validate: read("validate") as { findings: ReportedFinding[] },
      load: read("load") as LoadReport,
      reconcile: read("reconcile") as ReconciliationReport,
    };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// Email sign-in through the V2 app bound to the target. It runs in a child process because the
// @openmonetis/db singleton binds once per process and the guards subtest binds it elsewhere.
async function signInThroughApp(targetUrl: string, email: string, password: string) {
  const apiClientUrl = new URL("./test-support/api-client.ts", import.meta.url).href;
  const script = `
    const { createTestApiClient } = await import(${JSON.stringify(apiClientUrl)});
    const { request } = await createTestApiClient();
    const response = await request("/api/auth/sign-in/email", undefined, "POST", ${JSON.stringify({ email, password })});
    const sessionCookie = response.headers.getSetCookie().some((value) => /session_token=[^;]/.test(value));
    process.stdout.write(JSON.stringify({ status: response.status, sessionCookie }));
    process.exit(0);`;
  const run = await new Promise<CliRun>((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: targetUrl,
          EXTERNAL_DATABASE_URL: targetUrl,
          BETTER_AUTH_URL: "http://localhost:7001",
          BETTER_AUTH_SECRET: "openmonetis-integration-secret-at-least-32-characters",
          WEB_URL: "http://localhost:7002",
          CORS_ORIGIN: "http://localhost:7002",
        },
      },
      (error, stdout, stderr) => resolve({ code: error === null ? 0 : -1, stdout, stderr }),
    );
  });
  assert.equal(run.code, 0, run.stderr);
  return JSON.parse(run.stdout) as { status: number; sessionCookie: boolean };
}

// Checksum of each user's rows as stored in the target, with the column lists of a re-planned dump.
async function storedChecksums(v1Url: string, targetUrl: string): Promise<Record<string, string>> {
  const { openV1, withV1Snapshot, listV1Users, extractUser } = await import(
    "./scripts/v1-etl/v1-source"
  );
  const { planUser } = await import("./scripts/v1-etl/load/plan-user");
  const { computeUserChecksum, openTarget } = await import("./scripts/v1-etl/load/v2-writer");
  const v1Pool = openV1(v1Url);
  const target = openTarget(targetUrl);
  try {
    return await withV1Snapshot(v1Pool, async (v1) => {
      const index = await listV1Users(v1);
      const checksums: Record<string, string> = {};
      for (const { id } of index.users) {
        const planned = planUser(await extractUser(v1, id, index), null, {
          v1RpId: null,
          targetRpId: "localhost",
        });
        assert.ok(planned.ok, `plan of ${id}`);
        const client = await target.connect();
        try {
          checksums[id] = await computeUserChecksum(
            client,
            planned.plan.v2UserId,
            planned.plan.checksumColumns,
          );
        } finally {
          client.release();
        }
      }
      return checksums;
    });
  } finally {
    await target.end();
    await v1Pool.end();
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
        const violationsUrl = await createV1Fixture(["v1-schema.sql", "v1-violations.sql"]);
        const violations = await runValidate(violationsUrl);
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

        // A chosen resolution closes its blocker while the others stay open; a resolution the
        // load cannot apply is refused before anything runs.
        const resolutionDir = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
        try {
          const periodKey =
            "transaction.period-date-mismatch:lancamentos:60000000-0000-4000-8000-000000000004";
          const resolutionFile = (resolutions: Record<string, string>) => {
            const path = join(resolutionDir, `${randomUUID()}.json`);
            const dumpFingerprint = violations.report?.header.dumpFingerprint;
            writeFileSync(path, JSON.stringify({ dumpFingerprint, resolutions }));
            return path;
          };
          assert.equal(violations.report?.resolutionTemplate[periodKey], "use-date | use-period");
          const resolved = await runValidate(violationsUrl, [
            "--resolutions",
            resolutionFile({ [periodKey]: "use-period" }),
          ]);
          assert.equal(resolved.code, 1, resolved.stderr);
          assert.equal(resolved.report?.resolutionTemplate[periodKey], "use-period");

          const unappliable = await runValidate(violationsUrl, [
            "--resolutions",
            resolutionFile({
              "marker.missing-target:lancamentos:60000000-0000-4000-8000-000000000006":
                "as-regular",
            }),
          ]);
          assert.equal(unappliable.code, 3, unappliable.stderr);
          assert.match(unappliable.stderr, /must be one of: none/);
        } finally {
          rmSync(resolutionDir, { recursive: true, force: true });
        }

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
          "credential.incompatible-hash | account | v1-account-b",
          "installment.gap | lancamentos | 61000000-0000-4000-8000-000000000002",
          "note.task-description-as-item | anotacoes | 80000000-0000-4000-8000-000000000002",
          "recurrence.duplicate-occurrence | lancamentos | 60000000-0000-4000-8000-000000000173",
        ]);
      },
    );

    await t.test(
      "load converts the fixture, re-runs without writes and equals a fresh load",
      async () => {
        const v1Url = await createV1Fixture(["v1-schema.sql", "v1-fixture.sql"]);
        const target = await createV2Target();
        const first = await runLoad(v1Url, target);
        assert.equal(first.code, 0, first.stderr);
        assert.deepEqual(
          first.report?.users.map((user) => [user.v1UserId, user.status]),
          [
            ["v1-user-a", "loaded"],
            ["v1-user-b", "loaded"],
          ],
        );

        // US3: every figure of both users reconciles; the boleto paid a month later is expected.
        const reconciled = await runReconcile(v1Url, target);
        assert.equal(reconciled.code, 0, reconciled.stdout + reconciled.stderr);
        assert.deepEqual(
          reconciled.report?.users.map((user) => [
            user.v1UserId,
            user.pass,
            user.figures.filter((figure) => !figure.pass).length,
          ]),
          [
            ["v1-user-a", true, 0],
            ["v1-user-b", true, 0],
          ],
        );
        assert.deepEqual(
          reconciled.report?.users[0]?.expectedDifferences.find(
            (item) => item.reason === "boleto-posting-month",
          ),
          {
            reason: "boleto-posting-month",
            kind: "accountBalance",
            rows: [
              {
                v1Id: "60000000-0000-4000-8000-000000000014",
                period: "2026-01",
                paymentMonth: "2026-02",
                amount: "-300.00",
                differenceVsRawV1: { periodEnd: "2026-01", value: "300.00" },
              },
            ],
          },
        );
        assert.equal(reconciled.report?.global.rehearsalReady, true);

        const db = new Pool({ connectionString: target, max: 1 });
        // One "a | b | c" line per row keeps the expected tables readable.
        const select = async (text: string) =>
          (await db.query({ text, rowMode: "array" })).rows.map((row: unknown[]) =>
            row.map((value) => (value === null ? "null" : String(value))).join(" | "),
          );
        const ana = `(SELECT id FROM "user" WHERE email = 'ana@example.test')`;
        try {
          // US4.1, 2, 7 to 10: type, origin and amount signed as V2 stores it (expense negative).
          assert.deepEqual(
            await select(`
              SELECT t.name, t.type, t.origin, t.payment_method, t.amount, t.purchase_date::text,
                     t.period, coalesce(a.name, k.name), c.name, t.is_settled
              FROM transactions t
              LEFT JOIN financial_accounts a ON a.id = t.account_id
              LEFT JOIN cards k ON k.id = t.card_id
              LEFT JOIN categories c ON c.id = t.category_id
              WHERE t.user_id = ${ana} AND t.condition = 'single'
              ORDER BY t.purchase_date, t.name`),
            [
              "Saldo inicial - Conta Principal | income | regular | pix | 1000.00 | 2026-01-02 | 2026-01 | Conta Principal | Saldo inicial | true",
              "Saldo inicial - Reserva | income | accountBalanceAdjustment | null | 500.00 | 2026-01-02 | 2026-01 | Reserva | Ajuste de saldo | true",
              "Condominio | expense | regular | boleto | -300.00 | 2026-01-05 | 2026-01 | Conta Principal | Aluguel | true",
              "Padaria Sol | expense | regular | debit_card | -25.50 | 2026-01-12 | 2026-01 | Conta Principal | Alimentação | true",
              "Feira Livre | expense | regular | pix | -40.00 | 2026-01-14 | 2026-01 | Conta Principal | Alimentação | true",
              "Lanche | expense | regular | cash | -12.00 | 2026-01-15 | 2026-01 | Dinheiro Vivo | Alimentação | true",
              "Restaurante Vale | expense | regular | benefits | -45.00 | 2026-01-16 | 2026-01 | Vale Refeicao | Alimentação | true",
              "Entrada - Transf. entre contas | transfer | regular | bank_transfer | 100.00 | 2026-01-18 | 2026-01 | Reserva | Transferência interna | true",
              "Saída - Transf. entre contas | transfer | regular | bank_transfer | -100.00 | 2026-01-18 | 2026-01 | Conta Principal | Transferência interna | true",
              "Mercado Central | expense | regular | credit_card | -150.00 | 2026-01-20 | 2026-02 | Cartao Azul | Alimentação | false",
              "Estorno Mercado Central | income | refund | credit_card | 30.00 | 2026-01-22 | 2026-02 | Cartao Azul | Reembolso | false",
              "Jantar | expense | regular | pix | -100.00 | 2026-01-22 | 2026-01 | Conta Principal | Alimentação | true",
              "Pousada Serra | expense | regular | bank_transfer | -600.00 | 2026-02-03 | 2026-02 | Conta Principal | Casa | true",
              "Pagamento fatura - Cartao Azul | expense | invoicePayment | pix | -370.00 | 2026-02-14 | 2026-02 | Conta Principal | Pagamentos | true",
              "Celular (antecipacao de 2 parcelas) | expense | regular | credit_card | -95.00 | 2026-02-15 | 2026-03 | Cartao Azul | Casa | false",
              "Credito na fatura | income | invoiceCredit | credit_card | 20.00 | 2026-02-18 | 2026-03 | Cartao Azul | Reembolso | false",
              // Recurring (h): the second February row, detached as a single.
              "Internet Casa | expense | regular | pix | -100.00 | 2026-02-20 | 2026-02 | Conta Principal | Casa | false",
              "Loja do Bairro | expense | regular | credit_card | -80.00 | 2026-02-20 | 2026-03 | Cartao Verde | Alimentação | false",
              "Pagamento fatura - Cartao Azul | expense | invoicePayment | pix | -100.00 | 2026-03-10 | 2026-03 | Conta Principal | Pagamentos | true",
            ],
          );

          // US4.11: the subcategory is a child of its V1 parent.
          assert.deepEqual(
            await select(`
              SELECT c.name, p.name FROM categories c JOIN categories p ON p.id = c.parent_id
              WHERE c.user_id = ${ana}`),
            ["Aluguel | Casa"],
          );

          // US4.2: both transfer rows share one transfer id and name the source and destination.
          assert.deepEqual(
            await select(`
              SELECT count(DISTINCT t.transfer_id), min(s.name), min(d.name), count(*)
              FROM transactions t
              JOIN financial_accounts s ON s.id = t.source_account_id
              JOIN financial_accounts d ON d.id = t.destination_account_id
              WHERE t.user_id = ${ana} AND t.type = 'transfer' AND t.transfer_id IS NOT NULL`),
            ["1 | Conta Principal | Reserva | 2"],
          );

          // US4.3: one transaction per split group; its splits add up to the V1 group sum.
          assert.deepEqual(
            await select(`
              SELECT t.name, t.amount, p.name, s.amount FROM transaction_splits s
              JOIN transactions t ON t.id = s.transaction_id
              JOIN people p ON p.id = s.person_id
              WHERE t.user_id = ${ana} ORDER BY p.name`),
            [
              "Jantar | -100.00 | Ana Fixture | -60.00",
              "Jantar | -100.00 | Carla Fixture | -40.00",
            ],
          );

          // US4.4: installment series with their numbers, periods, amounts and settled state.
          // The gap series (number 2 missing) prices the missing number at the modal amount.
          assert.deepEqual(
            await select(`
              SELECT t.name, s.total_installments, s.tracked_from_installment, s.original_amount,
                     t.current_installment, t.period, t.amount, t.is_settled
              FROM installment_series s JOIN transactions t ON t.series_id = s.id
              WHERE t.user_id = ${ana} ORDER BY t.name, t.current_installment`),
            [
              "Celular | 4 | 1 | 200.00 | 1 | 2026-02 | -50.00 | false",
              "Celular | 4 | 1 | 200.00 | 2 | 2026-03 | -50.00 | false",
              "Celular | 4 | 1 | 200.00 | 3 | 2026-04 | -50.00 | false",
              "Celular | 4 | 1 | 200.00 | 4 | 2026-05 | -50.00 | false",
              "Curso Online | 3 | 1 | 270.00 | 1 | 2026-01 | -90.00 | true",
              "Curso Online | 3 | 1 | 270.00 | 3 | 2026-03 | -90.00 | false",
              "Notebook | 3 | 1 | 300.00 | 1 | 2026-02 | -100.00 | false",
              "Notebook | 3 | 1 | 300.00 | 2 | 2026-03 | -100.00 | false",
              "Notebook | 3 | 1 | 300.00 | 3 | 2026-04 | -100.00 | false",
            ],
          );

          // US4.5: one anticipation item per anticipated installment with its original period.
          assert.deepEqual(
            await select(`
              SELECT a.target_period, a.discount, adj.name, t.current_installment, i.original_period
              FROM installment_anticipations a
              JOIN transactions adj ON adj.id = a.adjustment_transaction_id
              JOIN installment_anticipation_items i ON i.anticipation_id = a.id
              JOIN transactions t ON t.id = i.transaction_id
              WHERE adj.user_id = ${ana} ORDER BY t.current_installment`),
            [
              "2026-03 | 5.00 | Celular (antecipacao de 2 parcelas) | 3 | 2026-04",
              "2026-03 | 5.00 | Celular (antecipacao de 2 parcelas) | 4 | 2026-05",
            ],
          );

          // US4.6: versions (start, end, anchor, due date, recurrenceEndDate) as the T021 cases
          // expect them; every version leaves settlement to its occurrence rows (is_settled null).
          assert.deepEqual(
            await select(`
              SELECT name, amount, start_date::text, end_date::text, anchor_date::text,
                     due_date::text, recurrence_end_date::text, is_settled
              FROM recurring_transaction_rules WHERE user_id = ${ana}
              ORDER BY name, start_date`),
            [
              "Academia | -100.00 | 2026-01-15 | 2026-01-15 | 2026-01-15 | null | 2026-06-15 | null",
              "Academia | -150.00 | 2026-02-15 | 2026-02-15 | 2026-02-15 | null | 2026-06-15 | null",
              "Academia | -100.00 | 2026-03-15 | 2026-03-15 | 2026-03-15 | null | 2026-06-15 | null",
              "Academia | -100.00 | 2026-04-10 | 2026-04-10 | 2026-04-10 | null | 2026-06-15 | null",
              "Academia | -100.00 | 2026-05-15 | 2026-06-15 | 2026-05-15 | null | 2026-06-15 | null",
              "Aluguel Garagem | -100.00 | 2026-01-15 | 2026-03-15 | 2026-01-15 | null | 2026-05-15 | null",
              "Aluguel Garagem | -120.00 | 2026-04-15 | 2026-05-15 | 2026-04-15 | null | 2026-05-15 | null",
              "Assinatura Musica | -100.00 | 2026-01-08 | 2026-03-08 | 2026-01-08 | null | 2026-03-08 | null",
              "Escola Idiomas | -100.00 | 2026-01-10 | 2026-03-10 | 2026-01-10 | 2026-01-15 | 2026-03-15 | null",
              "Internet Casa | -100.00 | 2026-01-15 | 2026-03-15 | 2026-01-15 | null | 2026-03-15 | null",
              "Seguro Residencial | -100.00 | 2026-01-15 | 2026-02-15 | 2026-01-15 | null | 2026-04-15 | null",
              "Seguro Residencial | -100.00 | 2026-04-15 | 2026-04-15 | 2026-04-15 | null | 2026-04-15 | null",
              "Streaming | -100.00 | 2026-01-15 | 2026-02-15 | 2026-01-15 | null | 2026-06-15 | null",
              "Streaming | -100.00 | 2026-04-15 | 2026-04-15 | 2026-04-15 | null | 2026-06-15 | null",
              "Streaming | -100.00 | 2026-06-15 | 2026-06-15 | 2026-06-15 | null | 2026-06-15 | null",
            ],
          );
          assert.deepEqual(
            await select(`
              SELECT r.name, o.purchase_date::text, o.is_settled, a.name, o.boleto_payment_date::text
              FROM recurring_transaction_occurrences o
              JOIN recurring_transaction_rules r ON r.id = o.recurring_rule_id
              LEFT JOIN financial_accounts a ON a.id = o.account_id
              WHERE o.user_id = ${ana} ORDER BY r.name, o.purchase_date`),
            [
              "Aluguel Garagem | 2026-01-15 | true | Conta Principal | null",
              "Aluguel Garagem | 2026-02-15 | true | Conta Principal | null",
              "Assinatura Musica | 2026-01-08 | true | null | null",
              "Escola Idiomas | 2026-01-10 | true | Conta Principal | 2026-01-14",
            ],
          );

          // US4.7: invoice payments (full and partial), one allocation each to the admin person.
          assert.deepEqual(
            await select(`
              SELECT k.name, ip.period, ip.amount, ip.paid_at::text, a.name, t.origin, p.name,
                     al.amount
              FROM invoice_payments ip
              JOIN cards k ON k.id = ip.card_id
              JOIN financial_accounts a ON a.id = ip.account_id
              JOIN transactions t ON t.id = ip.transaction_id
              JOIN invoice_payment_allocations al ON al.payment_id = ip.id
              JOIN people p ON p.id = al.person_id
              WHERE k.user_id = ${ana} ORDER BY ip.period`),
            [
              "Cartao Azul | 2026-02 | 370.00 | 2026-02-14 | Conta Principal | invoicePayment | Ana Fixture | 370.00",
              "Cartao Azul | 2026-03 | 100.00 | 2026-03-10 | Conta Principal | invoicePayment | Ana Fixture | 100.00",
            ],
          );
          // The pending invoice keeps no payment metadata while its partial payment row exists.
          assert.deepEqual(
            await select(`
              SELECT i.period, i.payment_status, i.paid_at::date::text, a.name
              FROM invoices i
              JOIN cards k ON k.id = i.card_id
              LEFT JOIN financial_accounts a ON a.id = i.payment_account_id
              WHERE k.user_id = ${ana} ORDER BY i.period`),
            ["2026-02 | paid | 2026-02-14 | Conta Principal", "2026-03 | pending | null | null"],
          );

          // US4.8: the refund is linked to the transaction it refunds.
          assert.deepEqual(
            await select(`
              SELECT s.name, r.name, x.amount FROM transaction_refunds x
              JOIN transactions s ON s.id = x.source_transaction_id
              JOIN transactions r ON r.id = x.refund_transaction_id
              WHERE s.user_id = ${ana}`),
            ["Mercado Central | Estorno Mercado Central | 30.00"],
          );

          // US4.12: trip links on a single and on a recurring occurrence.
          assert.deepEqual(
            await select(`
              SELECT 'single', t.name, NULL FROM transaction_trips tt
              JOIN transactions t ON t.id = tt.transaction_id WHERE t.user_id = ${ana}
              UNION ALL
              SELECT 'occurrence', min(r.name), o.occurrence_date::text
              FROM recurring_occurrence_trips o
              JOIN recurring_transaction_rules r ON r.series_id = o.recurring_series_id
              WHERE r.user_id = ${ana} GROUP BY o.recurring_series_id, o.occurrence_date
              ORDER BY 1`),
            ["occurrence | Streaming | 2026-02-15", "single | Pousada Serra | null"],
          );

          // US4.14: notes (task description as item 0), inbox statuses and link, budget with its
          // category remapped, unknown card brand fallback.
          assert.deepEqual(
            await select(`
              SELECT n.title, n.kind, n.content, i.position, i.text, i.is_completed
              FROM notes n LEFT JOIN note_items i ON i.note_id = n.id
              WHERE n.user_id = ${ana} ORDER BY n.title, i.position`),
            [
              "Lista de compras | text | Comprar frutas e pao | null | null | null",
              "Tarefas da casa | checklist | null | 0 | Organizar a garagem | false",
              "Tarefas da casa | checklist | null | 1 | Pagar conta de luz | true",
              "Tarefas da casa | checklist | null | 2 | Trocar lampada | false",
            ],
          );
          assert.deepEqual(
            await select(`
              SELECT i.client_id, i.status, t.name, i.processed_at IS NOT NULL,
                     i.discarded_at IS NOT NULL
              FROM inbox_items i LEFT JOIN transactions t ON t.id = i.transaction_id
              WHERE i.user_id = ${ana} ORDER BY i.client_id`),
            [
              "v1:90000000-0000-4000-8000-000000000001 | pending | null | false | false",
              "v1:90000000-0000-4000-8000-000000000002 | processed | Feira Livre | true | false",
              "v1:90000000-0000-4000-8000-000000000003 | discarded | null | false | true",
            ],
          );
          assert.deepEqual(
            await select(`
              SELECT c.name, b.amount, b.period FROM budgets b
              JOIN categories c ON c.id = b.category_id WHERE c.user_id = ${ana}`),
            ["Alimentação | 800.00 | 2026-03"],
          );
          assert.deepEqual(
            await select(
              `SELECT name, brand, logo FROM cards WHERE user_id = ${ana} ORDER BY name`,
            ),
            [
              "Cartao Azul | mastercard | /logos/card.png",
              "Cartao Verde | other | /logos/card.png",
            ],
          );

          // US4.15: preferences split into user and dashboard preferences.
          assert.deepEqual(
            await select(`
              SELECT u.transaction_note_as_column, u.attachment_max_size_mb,
                     u.show_transaction_summary, u.group_transactions_by_date,
                     u.hide_anticipated_installments, d.hidden_widgets
              FROM user_preferences u JOIN dashboard_preferences d ON d.user_id = u.user_id
              WHERE u.user_id = ${ana}`),
            ["true | 25 | false | true | true | goals"],
          );

          // US6: both category mappings (the subcategory one on the child category) and the
          // name mapping load verbatim.
          assert.deepEqual(
            await select(`
              SELECT m.description_key, c.name FROM import_category_mappings m
              JOIN categories c ON c.id = m.category_id
              WHERE m.user_id = ${ana} ORDER BY m.description_key`),
            ["condominio | Aluguel", "mercado central | Alimentação"],
          );
          assert.deepEqual(
            await select(`
              SELECT description_key, name FROM import_name_mappings WHERE user_id = ${ana}`),
            ["padaria sol centro | Padaria Sol"],
          );

          // US4.13: transaction and note attachments keep their stored file key and link.
          assert.deepEqual(
            await select(`
              SELECT a.file_key, a.file_name, coalesce(t.name, n.title)
              FROM attachments a
              LEFT JOIN transaction_attachments ta ON ta.attachment_id = a.id
              LEFT JOIN transactions t ON t.id = ta.transaction_id
              LEFT JOIN note_attachments na ON na.attachment_id = a.id
              LEFT JOIN notes n ON n.id = na.note_id
              WHERE a.user_id = ${ana} ORDER BY a.file_key`),
            [
              "v1-fixture/note-0001.png | lista.png | Lista de compras",
              "v1-fixture/receipt-0001.pdf | recibo.pdf | Mercado Central",
            ],
          );

          // US4.14: dashboard notification states and establishment logos.
          assert.deepEqual(
            await select(`
              SELECT notification_key, fingerprint, read_at = '2026-03-05T09:00:00Z', archived_at
              FROM notification_states WHERE user_id = ${ana}`),
            ["invoice-due:cartao-azul:2026-03 | fp-invoice-0001 | true | null"],
          );
          assert.deepEqual(
            await select(`SELECT name_key, domain FROM establishment_logos WHERE user_id = ${ana}`),
            ["mercado central | mercado-central.example.test"],
          );

          // US5.2: a hash V2 cannot verify is not copied; the Google account keeps its subject.
          assert.deepEqual(
            await select(`
              SELECT provider_id,
                     CASE WHEN account_id = user_id::text THEN 'v2 user id' ELSE account_id END,
                     password
              FROM account
              WHERE user_id = (SELECT id FROM "user" WHERE email = 'bruno@example.test')
              ORDER BY provider_id`),
            ["credential | v2 user id | null", "google | google-subject-b | null"],
          );

          // US5.3 to US5.5: no session, Companion token or (without --v1-rp-id) passkey is loaded.
          assert.deepEqual(
            await select(`
              SELECT (SELECT count(*) FROM session), (SELECT count(*) FROM device_tokens),
                     (SELECT count(*) FROM passkey)`),
            ["0 | 0 | 0"],
          );
        } finally {
          await db.end();
        }

        // US5.3 to US5.6: the repair list names what each user has to redo.
        assert.deepEqual(first.report?.repairList, {
          companionRepair: [{ v1UserId: "v1-user-a", email: "ana@example.test", tokens: 1 }],
          shareReinvite: [
            {
              ownerEmail: "ana@example.test",
              personName: "Carla Fixture",
              sharedWithEmail: "bruno@example.test",
            },
          ],
          passwordReset: [{ email: "bruno@example.test" }],
          passkeysNotLoaded: [{ email: "ana@example.test", count: 1, reason: "rp-id-mismatch" }],
        });

        // US6 and SC-006: disposable tables are counted as skipped, the reconciliation stamps
        // as dropped, and every table balances (read = written + merged + skipped + collapsed).
        assert.deepEqual(
          first.report?.skippedTables.map((item) => `${item.table} | ${item.rows}`),
          [
            "compartilhamentos_pagador | 1",
            "insights_salvos | 0",
            "reconciliation_ignores | 0",
            "session | 1",
            "tokens_api | 1",
            "verification | 0",
          ],
        );
        assert.deepEqual(
          first.report?.tables.find((table) => table.v1Table === "lancamentos")?.droppedColumns,
          [
            // The split pair collapses into one transaction with splits.
            { column: "dividido", rows: 2 },
            { column: "split_group_id", rows: 2 },
            // The three reconciliation stamps of the stamped single.
            { column: "ofx_fit_id", rows: 1 },
            { column: "ofx_import_fingerprint", rows: 1 },
            { column: "import_batch_id", rows: 1 },
          ],
        );
        const total = (items: { rows: number }[]) =>
          items.reduce((sum, item) => sum + item.rows, 0);
        assert.deepEqual(
          first.report?.tables
            .filter(
              (table) =>
                table.read !==
                table.written + table.merged + total(table.skipped) + total(table.collapsed),
            )
            .map((table) => table.v1Table),
          [],
        );

        // SC-002: a re-run writes nothing and the stored rows keep their checksum.
        const loaded = await storedChecksums(v1Url, target);
        const rerun = await runLoad(v1Url, target);
        assert.equal(rerun.code, 0, rerun.stderr);
        assert.deepEqual(
          rerun.report?.users.map((user) => [
            user.v1UserId,
            user.status,
            "written" in user ? user.written : null,
          ]),
          [
            ["v1-user-a", "skipped-already-loaded", 0],
            ["v1-user-b", "skipped-already-loaded", 0],
          ],
        );
        assert.deepEqual(await storedChecksums(v1Url, target), loaded);

        // US2 independent test: `rehearse` into a fresh target validates, loads and reconciles,
        // and stores the same rows. With --v1-rp-id equal to the target host the passkey loads.
        const fresh = await createV2Target();
        const rehearsed = await runRehearse(v1Url, fresh, ["--scratch", "--v1-rp-id", "localhost"]);
        assert.equal(rehearsed.code, 0, rehearsed.stdout + rehearsed.stderr);
        assert.deepEqual(findingSet(rehearsed.validate.findings, "blocker"), []);
        assert.deepEqual(
          rehearsed.load.users.map((user) => [user.v1UserId, user.status]),
          [
            ["v1-user-a", "loaded"],
            ["v1-user-b", "loaded"],
          ],
        );
        assert.equal(rehearsed.reconcile.global.rehearsalReady, true);
        assert.deepEqual(rehearsed.load.repairList.passkeysNotLoaded, []);
        assert.deepEqual(await storedChecksums(v1Url, fresh), loaded);
        const freshDb = new Pool({ connectionString: fresh, max: 1 });
        try {
          const passkeys = await freshDb.query({
            text: `SELECT p.credential_id, u.email FROM passkey p JOIN "user" u ON u.id = p.user_id`,
            rowMode: "array",
          });
          assert.deepEqual(passkeys.rows, [["synthetic-credential-id", "ana@example.test"]]);
        } finally {
          await freshDb.end();
        }

        // A stored row edited in V2 without moving any figure still fails on the checksum.
        const retitle = new Pool({ connectionString: target, max: 1 });
        try {
          await retitle.query(
            "UPDATE notes SET title = 'Lista editada' WHERE title = 'Lista de compras'",
          );
        } finally {
          await retitle.end();
        }
        const retitled = await runReconcile(v1Url, target);
        assert.equal(retitled.code, 1, retitled.stderr);
        const retitledAna = retitled.report?.users.find((user) => user.v1UserId === "v1-user-a");
        assert.deepEqual(
          [
            retitledAna?.pass,
            retitledAna?.figures.filter((figure) => !figure.pass).length,
            retitledAna?.informational.some((item) => item.reason === "checksum-mismatch"),
          ],
          [false, 0, true],
        );

        // US3.5: a one-cent drift in V2 fails reconcile naming the user, figure and difference.
        const drift = new Pool({ connectionString: target, max: 1 });
        try {
          await drift.query(
            "UPDATE transactions SET amount = amount - 0.01 WHERE name = 'Padaria Sol'",
          );
        } finally {
          await drift.end();
        }
        const drifted = await runReconcile(v1Url, target);
        assert.equal(drifted.code, 1, drifted.stderr);
        assert.deepEqual(
          drifted.report?.users.map((user) => [
            user.v1UserId,
            user.pass,
            user.figures
              .filter((figure) => !figure.pass)
              .map(
                (figure) =>
                  `${figure.kind} | ${figure.key.periodEnd ?? figure.key.period} | ${figure.difference}`,
              ),
          ]),
          [
            [
              "v1-user-a",
              false,
              [
                // The boleto allowance of January no longer matches once the cent drifts.
                "accountBalance | 2026-01 | 299.99",
                "accountBalance | 2026-02 | -0.01",
                "accountBalance | 2026-03 | -0.01",
                "accountBalance | 2026-04 | -0.01",
                "accountBalance | 2026-05 | -0.01",
                "accountBalance | 2026-06 | -0.01",
                "categoryTotal | 2026-01 | 0.01",
                "personTotal | 2026-01 | 0.01",
              ],
            ],
            ["v1-user-b", true, []],
          ],
        );
        assert.equal(drifted.report?.global.rehearsalReady, false);

        // US5.1: the V1 password signs in through the V2 app.
        const signIn = await signInThroughApp(target, "ana@example.test", "v1-fixture-password");
        assert.deepEqual(signIn, { status: 200, sessionCookie: true });
      },
    );

    await t.test(
      "a failing user rolls back alone and a re-run resumes to the uninterrupted state",
      async () => {
        const v1Url = await createV1Fixture(["v1-schema.sql", "v1-fixture.sql"]);
        const target = await createV2Target();
        const db = new Pool({ connectionString: target, max: 1 });
        try {
          // Failure injected at the database boundary: user B's only account cannot be inserted.
          await db.query(`
            CREATE FUNCTION refuse_conta_b() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.name = 'Conta B' THEN RAISE EXCEPTION 'injected failure'; END IF;
              RETURN NEW;
            END $$`);
          await db.query(`
            CREATE TRIGGER refuse_conta_b BEFORE INSERT ON financial_accounts
            FOR EACH ROW EXECUTE FUNCTION refuse_conta_b()`);

          // US2.6: user B fails alone, naming the table and the cause, and leaves no row behind.
          const failed = await runLoad(v1Url, target);
          assert.equal(failed.code, 1, failed.stderr);
          assert.deepEqual(
            failed.report?.users.map((user) => [
              user.v1UserId,
              user.status,
              "table" in user ? user.table : null,
              "cause" in user ? user.cause : null,
            ]),
            [
              ["v1-user-a", "loaded", null, null],
              ["v1-user-b", "failed", "financial_accounts", "P0001"],
            ],
          );
          const bruno = failed.report?.users[1]?.v2UserId;
          const leftovers = await db.query({
            text: `
              SELECT (SELECT count(*) FROM "user" WHERE id = $1),
                     (SELECT count(*) FROM financial_accounts WHERE user_id = $1),
                     (SELECT count(*) FROM people WHERE user_id = $1),
                     (SELECT count(*) FROM v1_etl.user_loads WHERE v2_user_id = $1)`,
            values: [bruno],
            rowMode: "array",
          });
          assert.deepEqual(leftovers.rows, [["0", "0", "0", "0"]]);

          // US3: a V1 user without a load row fails reconcile, so the rehearsal is not ready.
          const partial = await runReconcile(v1Url, target);
          assert.equal(partial.code, 1, partial.stderr);
          const brunoResult = partial.report?.users.find((user) => user.v1UserId === "v1-user-b");
          assert.deepEqual(
            [brunoResult?.pass, brunoResult?.informational],
            [false, [{ reason: "user-not-loaded", rows: 1 }]],
          );
          assert.equal(partial.report?.global.rehearsalReady, false);

          await db.query("DROP TRIGGER refuse_conta_b ON financial_accounts");
        } finally {
          await db.end();
        }

        const resumed = await runLoad(v1Url, target);
        assert.equal(resumed.code, 0, resumed.stderr);
        assert.deepEqual(
          resumed.report?.users.map((user) => [user.v1UserId, user.status]),
          [
            ["v1-user-a", "skipped-already-loaded"],
            ["v1-user-b", "loaded"],
          ],
        );

        // SC-004: the resumed target stores what an uninterrupted load stores.
        const reference = await createV2Target();
        const referenceLoad = await runLoad(v1Url, reference);
        assert.equal(referenceLoad.code, 0, referenceLoad.stderr);
        assert.deepEqual(
          await storedChecksums(v1Url, target),
          await storedChecksums(v1Url, reference),
        );
      },
    );

    await t.test("a resolution file drives load and reconcile end to end", async () => {
      // The clean fixture with one blocker: a cash row bought in February for the January period.
      const v1Url = await createV1Fixture(["v1-schema.sql", "v1-fixture.sql"]);
      const v1 = new Pool({ connectionString: v1Url, max: 1 });
      try {
        await v1.query(
          "UPDATE lancamentos SET data_compra = '2026-02-15' WHERE id = '60000000-0000-4000-8000-000000000013'",
        );
      } finally {
        await v1.end();
      }
      const validation = await runValidate(v1Url);
      const periodKey =
        "transaction.period-date-mismatch:lancamentos:60000000-0000-4000-8000-000000000013";
      assert.deepEqual(findingSet(validation.report?.findings ?? [], "blocker"), [
        "transaction.period-date-mismatch | lancamentos | 60000000-0000-4000-8000-000000000013",
      ]);

      const resolutionDir = mkdtempSync(join(tmpdir(), "openmonetis-v1-etl-"));
      try {
        const resolutions = join(resolutionDir, "resolutions.json");
        writeFileSync(
          resolutions,
          JSON.stringify({
            dumpFingerprint: validation.report?.header.dumpFingerprint,
            resolutions: { [periodKey]: "use-period" },
          }),
        );
        const target = await createV2Target();
        const loaded = await runLoad(v1Url, target, ["--scratch", "--resolutions", resolutions]);
        assert.equal(loaded.code, 0, loaded.stdout + loaded.stderr);

        // use-period keeps the period and moves the purchase date into it.
        const db = new Pool({ connectionString: target, max: 1 });
        try {
          const { rows } = await db.query({
            text: "SELECT period, purchase_date::text FROM transactions WHERE name = 'Lanche'",
            rowMode: "array",
          });
          assert.deepEqual(rows, [["2026-01", "2026-01-15"]]);
        } finally {
          await db.end();
        }

        // Reconcile documents the resolution only when given the load's file. The planner raises
        // no blocker for this rule and use-period moves no figure, so both runs pass.
        const periodResolved = (report: ReconciliationReport | null) =>
          report?.users[0]?.expectedDifferences.find(
            (item) => item.reason === "period-date-resolved",
          );
        const unresolved = await runReconcile(v1Url, target);
        assert.equal(unresolved.code, 0, unresolved.stdout + unresolved.stderr);
        assert.equal(periodResolved(unresolved.report), undefined);

        const resolved = await runReconcile(v1Url, target, ["--resolutions", resolutions]);
        assert.equal(resolved.code, 0, resolved.stdout + resolved.stderr);
        assert.equal(resolved.report?.global.rehearsalReady, true);
        assert.deepEqual(periodResolved(resolved.report)?.rows, [
          {
            v1Id: "60000000-0000-4000-8000-000000000013",
            resolution: "use-period",
            period: "2026-01",
          },
        ]);
      } finally {
        rmSync(resolutionDir, { recursive: true, force: true });
      }
    });

    await t.test("guards refuse unsafe targets", async () => {
      const v1Url = await createV1Fixture(["v1-schema.sql", "v1-fixture.sql"]);
      const loaded = await createV2Target();
      const firstLoad = await runLoad(v1Url, loaded);
      assert.equal(firstLoad.code, 0, firstLoad.stderr);
      const otherDump = await createV1Fixture(["v1-schema.sql"]);
      const fresh = await createV2Target();
      const productionNamed = await createV2Target("openmonetis_prod_test");

      // The registered-user target is the database withIntegrationDatabase binds the API to.
      await withIntegrationDatabase(async () => {
        await (await createTestApiClient()).register();
        const registered = process.env.DATABASE_URL ?? "";
        const cases = [
          { target: fresh, v1: v1Url, flags: [], reason: /--scratch is required/ },
          { target: v1Url, v1: v1Url, flags: ["--scratch"], reason: /points to the V1 database/ },
          { target: registered, v1: v1Url, flags: ["--scratch"], reason: /non-migrated data/ },
          { target: loaded, v1: otherDump, flags: ["--scratch"], reason: /different V1 dump/ },
          {
            target: productionNamed,
            v1: v1Url,
            flags: ["--scratch"],
            reason: /looks like production/,
          },
        ];
        for (const { target, v1, flags, reason } of cases) {
          const userCount = async () => {
            const db = new Pool({ connectionString: target, max: 1 });
            try {
              return (await db.query('SELECT count(*) FROM "user"')).rows[0]?.count;
            } finally {
              await db.end();
            }
          };
          const before = await userCount();
          const run = await runLoad(v1, target, flags);
          assert.equal(run.code, 2, `${reason}: ${run.stderr}`);
          assert.match(run.stderr, reason);
          assert.equal(await userCount(), before, String(reason));
        }

        // Reconcile refuses a target loaded from another V1 dump.
        const otherReconcile = await runReconcile(otherDump, loaded);
        assert.equal(otherReconcile.code, 2, otherReconcile.stderr);
        assert.match(otherReconcile.stderr, /holds no load of this V1 dump/);

        // Reconcile rejects a V1 user the dump does not hold.
        const unknownUser = await runReconcile(v1Url, loaded, ["--user", "v1-user-unknown"]);
        assert.equal(unknownUser.code, 3, unknownUser.stderr);
        assert.match(unknownUser.stderr, /Unknown V1 user: v1-user-unknown/);

        // An inherited DATABASE_URL naming another database does not redirect the V2 services:
        // the CLI binds them to --target-url, so the loaded target reconciles.
        const inherited = await runReconcile(v1Url, loaded, [], {
          DATABASE_URL: registered,
          EXTERNAL_DATABASE_URL: registered,
        });
        assert.equal(inherited.code, 0, inherited.stdout + inherited.stderr);
      });
    });
  } finally {
    await dropTestDatabases();
  }
});
