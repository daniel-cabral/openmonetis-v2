import { parseArgs } from "node:util";

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

function runCommand(options: CliOptions): number {
  process.stderr.write(`etl:v1 ${options.command} is not wired yet.\n`);
  return EXIT_CODES.usage;
}

function main(argv: readonly string[], env: NodeJS.ProcessEnv): number {
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

  return runCommand(options);
}

process.exitCode = main(process.argv.slice(2), process.env);
