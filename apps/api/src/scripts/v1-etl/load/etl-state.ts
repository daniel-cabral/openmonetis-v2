// Tool-owned state of the V1 to V2 ETL, kept in schema `v1_etl` of the target database.
// It is not application schema: no packages/db table and no Drizzle migration.
import type { PoolClient } from "pg";

// Idempotent. The unique index on a constant admits one run row per target, so a second
// fingerprint cannot be started in the same database.
const STATE_DDL = `
CREATE SCHEMA IF NOT EXISTS v1_etl;

CREATE TABLE IF NOT EXISTS v1_etl.runs (
  dump_fingerprint text PRIMARY KEY,
  v1_counts jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('loading', 'loaded', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS runs_single_row ON v1_etl.runs ((true));

CREATE TABLE IF NOT EXISTS v1_etl.user_loads (
  v1_user_id text PRIMARY KEY,
  v2_user_id uuid NOT NULL,
  dump_fingerprint text NOT NULL REFERENCES v1_etl.runs (dump_fingerprint),
  status text NOT NULL CHECK (status = 'loaded'),
  checksum text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1_etl.id_map (
  v1_table text NOT NULL,
  v1_id text NOT NULL,
  role text NOT NULL,
  v2_table text NOT NULL,
  v2_id text NOT NULL,
  v1_user_id text NOT NULL,
  PRIMARY KEY (v1_table, v1_id, role)
);
`;

export async function ensureState(c: PoolClient): Promise<void> {
  await c.query(STATE_DDL);
}

export async function getRun(
  c: PoolClient,
): Promise<{ dumpFingerprint: string; status: string } | null> {
  const { rows } = await c.query<{ dump_fingerprint: string; status: string }>(
    "SELECT dump_fingerprint, status FROM v1_etl.runs LIMIT 1",
  );
  const row = rows[0];
  return row ? { dumpFingerprint: row.dump_fingerprint, status: row.status } : null;
}

// Re-running with the same fingerprint resumes the run (data-model: re-run allowed after failed).
export async function startRun(
  c: PoolClient,
  fingerprint: string,
  counts: Record<string, number>,
): Promise<void> {
  await c.query(
    `INSERT INTO v1_etl.runs (dump_fingerprint, v1_counts, status)
     VALUES ($1, $2::jsonb, 'loading')
     ON CONFLICT (dump_fingerprint) DO UPDATE
       SET status = 'loading', started_at = now(), finished_at = NULL`,
    [fingerprint, JSON.stringify(counts)],
  );
}

export async function finishRun(c: PoolClient, status: "loaded" | "failed"): Promise<void> {
  await c.query("UPDATE v1_etl.runs SET status = $1, finished_at = now()", [status]);
}

export async function isUserLoaded(
  c: PoolClient,
  v1UserId: string,
  fingerprint: string,
): Promise<{ v2UserId: string; checksum: string } | null> {
  const { rows } = await c.query<{ v2_user_id: string; checksum: string }>(
    `SELECT v2_user_id, checksum FROM v1_etl.user_loads
     WHERE v1_user_id = $1 AND dump_fingerprint = $2`,
    [v1UserId, fingerprint],
  );
  const row = rows[0];
  return row ? { v2UserId: row.v2_user_id, checksum: row.checksum } : null;
}
