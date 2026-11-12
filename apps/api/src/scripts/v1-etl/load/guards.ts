// Target guards checked before any write (research R6). A refusal maps to exit code 2.
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";

type LoadGuardOptions = {
  v1Url: string;
  targetUrl: string;
  scratch: boolean;
  confirmProduction: string | null;
  fingerprint: string;
};

type GuardResult = { ok: true } | { ok: false; reason: string };

const MIGRATIONS_JOURNAL_URL = new URL(
  "../../../../../../packages/db/drizzle/meta/_journal.json",
  import.meta.url,
);

const DEFAULT_POSTGRES_PORT = "5432";
const PRODUCTION_DATABASE_NAME = /prod/i;
const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]"]);

function refuse(reason: string): GuardResult {
  return { ok: false, reason };
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function sameDatabase(a: URL, b: URL): boolean {
  return (
    a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    (a.port || DEFAULT_POSTGRES_PORT) === (b.port || DEFAULT_POSTGRES_PORT) &&
    databaseName(a) === databaseName(b)
  );
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isProductionMarked(target: URL): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    PRODUCTION_DATABASE_NAME.test(databaseName(target)) ||
    !isLoopbackHost(target.hostname)
  );
}

function journalMigrationTimestamps(): string[] {
  const journal = JSON.parse(readFileSync(MIGRATIONS_JOURNAL_URL, "utf8")) as {
    entries: { when: number }[];
  };
  return journal.entries.map((entry) => String(entry.when));
}

async function tableExists(c: PoolClient, qualifiedName: string): Promise<boolean> {
  const result = await c.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [qualifiedName],
  );
  return result.rows[0]?.exists === true;
}

async function hasPendingMigrations(c: PoolClient): Promise<boolean> {
  if (!(await tableExists(c, "drizzle.__drizzle_migrations"))) return true;
  const result = await c.query<{ created_at: string }>(
    "SELECT created_at::text AS created_at FROM drizzle.__drizzle_migrations",
  );
  const applied = new Set(result.rows.map((row) => row.created_at));
  return journalMigrationTimestamps().some((when) => !applied.has(when));
}

async function hasRunWithOtherFingerprint(c: PoolClient, fingerprint: string): Promise<boolean> {
  if (!(await tableExists(c, "v1_etl.runs"))) return false;
  const result = await c.query(
    "SELECT 1 FROM v1_etl.runs WHERE dump_fingerprint <> $1 LIMIT 1",
    [fingerprint],
  );
  return (result.rowCount ?? 0) > 0;
}

async function hasNonMigratedUsers(c: PoolClient, fingerprint: string): Promise<boolean> {
  const stateReady =
    (await tableExists(c, "v1_etl.id_map")) && (await tableExists(c, "v1_etl.user_loads"));
  if (!stateReady) {
    const result = await c.query('SELECT 1 FROM public."user" LIMIT 1');
    return (result.rowCount ?? 0) > 0;
  }
  const result = await c.query(
    `SELECT 1
       FROM public."user" u
      WHERE NOT EXISTS (
        SELECT 1
          FROM v1_etl.id_map m
          JOIN v1_etl.user_loads l ON l.v1_user_id = m.v1_user_id
         WHERE m.v2_table = 'user'
           AND m.v2_id = u.id::text
           AND l.dump_fingerprint = $1
      )
      LIMIT 1`,
    [fingerprint],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function checkLoadGuards(
  c: PoolClient,
  opts: LoadGuardOptions,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const target = new URL(opts.targetUrl);

  if (sameDatabase(target, new URL(opts.v1Url))) {
    return refuse("target URL points to the V1 database");
  }
  if (!opts.scratch) {
    return refuse("--scratch is required: the target must be a scratch database");
  }
  if (isProductionMarked(target) && opts.confirmProduction !== databaseName(target)) {
    return refuse(
      "target looks like production (NODE_ENV, database name or non-loopback host); pass --confirm-production=<database name>",
    );
  }
  if (await hasPendingMigrations(c)) {
    return refuse("target is not fully migrated: apply every Drizzle migration first");
  }
  if (await hasRunWithOtherFingerprint(c, opts.fingerprint)) {
    return refuse("target was loaded from a different V1 dump; reset the scratch database first");
  }
  if (await hasNonMigratedUsers(c, opts.fingerprint)) {
    return refuse("target holds non-migrated data");
  }
  return { ok: true };
}
