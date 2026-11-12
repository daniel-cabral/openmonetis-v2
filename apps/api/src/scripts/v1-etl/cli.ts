import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Resolutions } from "./types";

const COMMANDS = ["validate", "load", "reconcile", "rehearse"] as const;
type CliCommand = (typeof COMMANDS)[number];

const TARGET_COMMANDS: readonly CliCommand[] = ["load", "reconcile", "rehearse"];

const EXIT_CODES = { success: 0, findings: 1, guardRefusal: 2, usage: 3 } as const;

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

async function runCommand(options: CliOptions): Promise<number> {
  if (options.command === "validate") return runValidate(options);
  process.stderr.write(`etl:v1 ${options.command} is not wired yet.\n`);
  return EXIT_CODES.usage;
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
    return await runCommand(options);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return EXIT_CODES.usage;
  }
}

main(process.argv.slice(2), process.env).then((code) => {
  process.exitCode = code;
});
