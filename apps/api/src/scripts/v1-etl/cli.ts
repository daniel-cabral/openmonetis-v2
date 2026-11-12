import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { addMonthsToPeriod } from "@openmonetis/domain/transactions";
import type { Pool, PoolClient } from "pg";
import type {
  ExtractedUser,
  LoadReport,
  ReconciliationReport,
  RepairList,
  Resolutions,
  TableCount,
  UserReconciliation,
  WriteResult,
} from "./types";

const COMMANDS = ["validate", "load", "reconcile", "rehearse"] as const;
type CliCommand = (typeof COMMANDS)[number];

const TARGET_COMMANDS: readonly CliCommand[] = ["load", "reconcile", "rehearse"];

const EXIT_CODES = { success: 0, findings: 1, guardRefusal: 2, usage: 3 } as const;

// Same fallback as the API passkey configuration (auth.ts) when WEB_URL is unset.
const DEFAULT_WEB_URL = "http://localhost:7002";

const USAGE = `Usage: pnpm etl:v1 <validate|load|reconcile|rehearse> [options]

Options:
  --v1-url <url>               V1 connection, opened read-only (or V1_DATABASE_URL)
  --target-url <url>           V2 scratch database (load, reconcile, rehearse)
  --scratch                    declare the target a scratch database (load, rehearse)
  --confirm-production=<name>  production override, must equal the target database name
  --resolutions <file>         operator resolution file (load, rehearse)
  --v1-rp-id <host>            V1 passkey relying-party host (load, rehearse)
  --out <dir>                  report directory
  --user <v1 user id>          restrict to one user (validate, reconcile)
  --check-bucket               HEAD attachment keys in S3 (validate)`;

type CliOptions = {
  command: CliCommand;
  v1Url: string;
  targetUrl: string | null;
  scratch: boolean;
  confirmProduction: string | null;
  resolutionsPath: string | null;
  v1RpId: string | null;
  outDir: string | null;
  user: string | null;
  checkBucket: boolean;
};

class UsageError extends Error {}

function parseFlags(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        "v1-url": { type: "string" },
        "target-url": { type: "string" },
        scratch: { type: "boolean" },
        "confirm-production": { type: "string" },
        resolutions: { type: "string" },
        "v1-rp-id": { type: "string" },
        out: { type: "string" },
        user: { type: "string" },
        "check-bucket": { type: "boolean" },
        help: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function isCliCommand(value: string | undefined): value is CliCommand {
  return COMMANDS.some((command) => command === value);
}

function parseCliArgs(
  { values, positionals }: ReturnType<typeof parseFlags>,
  env: NodeJS.ProcessEnv,
): CliOptions {
  const [command] = positionals;
  if (positionals.length !== 1 || !isCliCommand(command)) {
    throw new UsageError("Expected exactly one command: validate, load, reconcile or rehearse.");
  }

  const v1Url = values["v1-url"] ?? env.V1_DATABASE_URL;
  if (!v1Url) {
    throw new UsageError("Missing V1 connection: pass --v1-url or set V1_DATABASE_URL.");
  }

  const targetUrl = values["target-url"] || null;
  if (targetUrl === null && TARGET_COMMANDS.includes(command)) {
    throw new UsageError(`The ${command} command requires --target-url.`);
  }

  return {
    command,
    v1Url,
    targetUrl,
    scratch: values.scratch ?? false,
    confirmProduction: values["confirm-production"] ?? null,
    resolutionsPath: values.resolutions ?? null,
    v1RpId: values["v1-rp-id"] ?? null,
    outDir: values.out ?? null,
    user: values.user ?? null,
    checkBucket: values["check-bucket"] ?? false,
  };
}

async function readResolutions(path: string): Promise<Resolutions> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new UsageError(
      `Cannot read the resolution file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const file = parsed as Partial<Resolutions> | null;
  if (
    typeof file?.dumpFingerprint !== "string" ||
    typeof file.resolutions !== "object" ||
    file.resolutions === null ||
    Object.values(file.resolutions).some((value) => typeof value !== "string")
  ) {
    throw new UsageError(
      "The resolution file must be { dumpFingerprint: string, resolutions: { [key]: string } }.",
    );
  }
  return { dumpFingerprint: file.dumpFingerprint, resolutions: file.resolutions };
}

// Failures to reach the V1 database: SQLSTATE classes 08, 28, 3D and Node socket codes (E...).
function isConnectionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(08|28|3D|E[A-Z]+$)/.test(code);
}

async function runValidate(options: CliOptions): Promise<number> {
  const resolutions =
    options.resolutionsPath === null ? null : await readResolutions(options.resolutionsPath);
  const { openV1, withV1Snapshot } = await import("./v1-source");
  const { validate, unresolvedBlockers, ValidationInputError } = await import(
    "./validate/validator"
  );
  const { defaultOutDir, renderValidationText, writeOutput } = await import("./output/render");

  const pool = openV1(options.v1Url);
  let report: Awaited<ReturnType<typeof validate>>;
  try {
    report = await withV1Snapshot(pool, (client) =>
      validate(client, { resolutions, checkBucket: options.checkBucket, user: options.user }),
    );
  } catch (error) {
    if (error instanceof ValidationInputError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    if (isConnectionError(error)) {
      process.stderr.write(`Cannot reach the V1 database: ${(error as Error).message}\n`);
      return EXIT_CODES.usage;
    }
    throw error;
  } finally {
    await pool.end();
  }

  const text = renderValidationText(report);
  await writeOutput(
    options.outDir ?? defaultOutDir(report.header.dumpFingerprint),
    "validate",
    report,
    text,
  );
  process.stdout.write(`${text}\n`);
  return unresolvedBlockers(report, resolutions).length === 0
    ? EXIT_CODES.success
    : EXIT_CODES.findings;
}

async function runLoad(options: CliOptions, env: NodeJS.ProcessEnv): Promise<number> {
  const targetUrl = options.targetUrl;
  if (targetUrl === null) throw new UsageError("The load command requires --target-url.");
  const resolutions =
    options.resolutionsPath === null ? null : await readResolutions(options.resolutionsPath);
  const targetRpId = new URL(env.WEB_URL ?? DEFAULT_WEB_URL).hostname;
  const { openV1, withV1Snapshot, listV1Users, extractUser } = await import("./v1-source");
  const { validate, unresolvedBlockers, ValidationInputError } = await import(
    "./validate/validator"
  );
  const { defaultOutDir, renderLoadText, renderValidationText, writeOutput } = await import(
    "./output/render"
  );
  const { checkLoadGuards } = await import("./load/guards");
  const { ensureState, finishRun, isUserLoaded, startRun } = await import("./load/etl-state");
  const { mergeCounts, planUser } = await import("./load/plan-user");
  const { openTarget, writeUser } = await import("./load/v2-writer");
  const { v2Id } = await import("./ids");

  const v1Pool = openV1(options.v1Url);
  const target = openTarget(targetUrl);
  try {
    return await withV1Snapshot(v1Pool, async (v1) => {
      let validation: Awaited<ReturnType<typeof validate>>;
      try {
        validation = await validate(v1, { resolutions, checkBucket: false, user: null });
      } catch (error) {
        if (!(error instanceof ValidationInputError)) throw error;
        process.stderr.write(`${error.message}\n`);
        return error.exitCode;
      }
      const fingerprint = validation.header.dumpFingerprint;
      const outDir = options.outDir ?? defaultOutDir(fingerprint);

      const guard = await withTargetClient(target, (c) =>
        checkLoadGuards(c, {
          v1Url: options.v1Url,
          targetUrl,
          scratch: options.scratch,
          confirmProduction: options.confirmProduction,
          fingerprint,
        }),
      );
      if (!guard.ok) {
        process.stderr.write(`Load refused: ${guard.reason}\n`);
        return EXIT_CODES.guardRefusal;
      }

      // US2.4: nothing is written while a blocker is unresolved; print the validation output.
      if (unresolvedBlockers(validation, resolutions).length > 0) {
        const text = renderValidationText(validation);
        await writeOutput(outDir, "validate", validation, text);
        process.stdout.write(`${text}\n`);
        return EXIT_CODES.findings;
      }

      await withTargetClient(target, async (c) => {
        await ensureState(c);
        await startRun(c, fingerprint, validation.v1Counts);
      });

      const index = await listV1Users(v1);
      const users: WriteResult[] = [];
      const counts: TableCount[] = [];
      const appliedRules = new Map<string, number>();
      const repairList: RepairList = {
        companionRepair: [],
        shareReinvite: [],
        passwordReset: [],
        passkeysNotLoaded: [],
      };
      for (const { id: v1UserId } of index.users) {
        // The target pool has max 1: this client is released before the writer checks one out.
        const loaded = await withTargetClient(target, (c) =>
          isUserLoaded(c, v1UserId, fingerprint),
        );
        if (loaded !== null) {
          users.push({ status: "skipped-already-loaded", v1UserId, ...loaded, written: 0 });
          continue;
        }
        const planned = planUser(await extractUser(v1, v1UserId, index), resolutions, {
          v1RpId: options.v1RpId,
          targetRpId,
        });
        if (!planned.ok) {
          // A conversion found a blocker the validator did not: the user is not written.
          users.push({
            status: "failed",
            v1UserId,
            v2UserId: v2Id("user", v1UserId),
            table: "plan",
            cause: "unresolved-blocker",
          });
          continue;
        }
        const { plan } = planned;
        const result = await writeUser(target, plan, fingerprint);
        users.push(result);
        if (result.status !== "loaded") continue;
        counts.push(...plan.counts);
        for (const { rule, rows } of plan.appliedRules) {
          appliedRules.set(rule, (appliedRules.get(rule) ?? 0) + rows);
        }
        for (const key of Object.keys(repairList) as (keyof RepairList)[]) {
          (repairList[key] as unknown[]).push(...plan.repairList[key]);
        }
      }

      const allLoaded = users.every((user) => user.status !== "failed");
      await withTargetClient(target, (c) => finishRun(c, allLoaded ? "loaded" : "failed"));

      const report: LoadReport = {
        header: {
          tool: "v1-etl",
          command: "load",
          dumpFingerprint: fingerprint,
          generatedAt: new Date().toISOString(),
        },
        tables: mergeCounts(counts),
        users: users.sort((a, b) => a.v1UserId.localeCompare(b.v1UserId)),
        appliedRules: [...appliedRules.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([rule, rows]) => ({ rule, rows })),
        repairList,
      };
      const text = renderLoadText(report);
      await writeOutput(outDir, "load", report, text);
      process.stdout.write(`${text}\n`);
      return allLoaded ? EXIT_CODES.success : EXIT_CODES.findings;
    });
  } catch (error) {
    if (isConnectionError(error)) {
      process.stderr.write(`Cannot reach a database: ${(error as Error).message}\n`);
      return EXIT_CODES.usage;
    }
    throw error;
  } finally {
    await target.end();
    await v1Pool.end();
  }
}

async function runReconcile(options: CliOptions, env: NodeJS.ProcessEnv): Promise<number> {
  const targetUrl = options.targetUrl;
  if (targetUrl === null) throw new UsageError("The reconcile command requires --target-url.");
  const resolutions =
    options.resolutionsPath === null ? null : await readResolutions(options.resolutionsPath);
  const targetRpId = new URL(env.WEB_URL ?? DEFAULT_WEB_URL).hostname;
  // The V2 services read through the @openmonetis/db singleton: it must point at the target.
  const { pool: v2Pool } = await import("@openmonetis/db");
  if (v2Pool.options.connectionString !== targetUrl) {
    await v2Pool.end();
    process.stderr.write("Reconcile refused: the V2 database client does not use --target-url.\n");
    return EXIT_CODES.guardRefusal;
  }
  const { openV1, withV1Snapshot, listV1Users, extractUser, computeDumpFingerprint } = await import(
    "./v1-source"
  );
  const { defaultOutDir, renderReconcileText, writeOutput } = await import("./output/render");
  const { getRun } = await import("./load/etl-state");
  const { planUser } = await import("./load/plan-user");
  const { computeUserChecksum, openTarget } = await import("./load/v2-writer");
  const { buildExpectedDifferences, compareUser } = await import("./reconcile/compare");
  const { computeV1Figures } = await import("./reconcile/v1-figures");
  const { computeV2Figures } = await import("./reconcile/v2-figures");

  const v1Pool = openV1(options.v1Url);
  const target = openTarget(targetUrl);
  try {
    return await withV1Snapshot(v1Pool, async (v1) => {
      const { fingerprint } = await computeDumpFingerprint(v1);
      const loads = await withTargetClient(target, async (c) => {
        const { rows: state } = await c.query<{ present: boolean }>(
          "SELECT to_regclass('v1_etl.runs') IS NOT NULL AS present",
        );
        if (!state[0]?.present) return null;
        const run = await getRun(c);
        if (run?.dumpFingerprint !== fingerprint) return null;
        const { rows } = await c.query<{
          v1_user_id: string;
          v2_user_id: string;
          checksum: string;
        }>(
          `SELECT v1_user_id, v2_user_id, checksum FROM v1_etl.user_loads
           WHERE dump_fingerprint = $1 ORDER BY v1_user_id`,
          [fingerprint],
        );
        return rows;
      });
      if (loads === null) {
        process.stderr.write("Reconcile refused: the target holds no load of this V1 dump.\n");
        return EXIT_CODES.guardRefusal;
      }

      const index = await listV1Users(v1);
      const users: UserReconciliation[] = [];
      for (const load of loads) {
        if (options.user !== null && load.v1_user_id !== options.user) continue;
        const x = await extractUser(v1, load.v1_user_id, index);
        const planned = planUser(x, resolutions, { v1RpId: options.v1RpId, targetRpId });
        if (!planned.ok) {
          users.push({
            v1UserId: load.v1_user_id,
            pass: false,
            figures: [],
            informational: [{ reason: "plan-unresolved-blocker", rows: planned.unresolved.length }],
            expectedDifferences: [],
          });
          continue;
        }
        const { plan } = planned;
        const { expected, informational } = buildExpectedDifferences(x, plan, resolutions);
        const v1Figures = await computeV1Figures(v1, load.v1_user_id, resolutions);
        const v2Figures = await computeV2Figures(load.v2_user_id, periodRange(x));
        const result = compareUser(
          load.v1_user_id,
          v1Figures,
          v2Figures,
          plan.counts,
          informational,
          expected,
        );
        const checksum = await withTargetClient(target, (c) =>
          computeUserChecksum(c, load.v2_user_id, plan.checksumColumns),
        );
        if (checksum !== load.checksum) {
          result.pass = false;
          result.informational = [
            ...result.informational,
            { reason: "checksum-mismatch", rows: 1 },
          ];
        }
        users.push(result);
      }

      const figures = users.flatMap((user) => user.figures);
      const passed = users.filter((user) => user.pass).length;
      const report: ReconciliationReport = {
        header: {
          tool: "v1-etl",
          command: "reconcile",
          dumpFingerprint: fingerprint,
          generatedAt: new Date().toISOString(),
        },
        users: users.sort((a, b) => a.v1UserId.localeCompare(b.v1UserId)),
        global: {
          users: users.length,
          passed,
          rehearsalReady: passed === users.length,
          totals: {
            figures: figures.length,
            failingFigures: figures.filter((figure) => !figure.pass).length,
          },
        },
      };
      const text = renderReconcileText(report);
      await writeOutput(options.outDir ?? defaultOutDir(fingerprint), "reconcile", report, text);
      process.stdout.write(`${text}\n`);
      return report.global.rehearsalReady ? EXIT_CODES.success : EXIT_CODES.findings;
    });
  } catch (error) {
    if (isConnectionError(error)) {
      process.stderr.write(`Cannot reach a database: ${(error as Error).message}\n`);
      return EXIT_CODES.usage;
    }
    throw error;
  } finally {
    await target.end();
    await v1Pool.end();
    await v2Pool.end();
  }
}

// Every month from the user's first to last V1 `periodo`, inclusive.
function periodRange(x: ExtractedUser): string[] {
  const sorted = x.transactions.map((row) => row.periodo).sort();
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return [];
  const periods = [first];
  for (let period = first; period < last; ) {
    period = addMonthsToPeriod(period, 1);
    periods.push(period);
  }
  return periods;
}

async function runRehearse(options: CliOptions, env: NodeJS.ProcessEnv): Promise<number> {
  const validated = await runValidate(options);
  if (validated !== EXIT_CODES.success) return validated;
  const loaded = await runLoad(options, env);
  if (loaded !== EXIT_CODES.success) return loaded;
  return runReconcile(options, env);
}

async function withTargetClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function runCommand(options: CliOptions, env: NodeJS.ProcessEnv): Promise<number> {
  if (options.command === "validate") return runValidate(options);
  if (options.command === "load") return runLoad(options, env);
  if (options.command === "reconcile") return runReconcile(options, env);
  return runRehearse(options, env);
}

async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  let options: CliOptions;
  try {
    const flags = parseFlags(argv);
    if (flags.values.help) {
      process.stdout.write(`${USAGE}\n`);
      return EXIT_CODES.success;
    }
    options = parseCliArgs(flags, env);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return EXIT_CODES.usage;
  }

  if (options.targetUrl !== null) {
    // Set before any module importing @openmonetis/db loads; the singleton reads them at import time.
    env.DATABASE_URL = options.targetUrl;
    env.EXTERNAL_DATABASE_URL = options.targetUrl;
    env.DB_POOL_MAX = "1";
  }

  try {
    return await runCommand(options, env);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return EXIT_CODES.usage;
  }
}

main(process.argv.slice(2), process.env).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Unexpected operational failure: exit 3 (contracts/cli.md), never read as "blockers found".
    process.stderr.write(
      `etl:v1 failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = EXIT_CODES.usage;
  },
);
