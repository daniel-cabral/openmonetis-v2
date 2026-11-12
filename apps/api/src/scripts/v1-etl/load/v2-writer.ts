// Writes one planned V1 user into the target V2 database in a single transaction. Inserts go
// straight to the tables (FR-017): no V2 service, mail, notification, Companion, AI or S3 client.
// Imports `@openmonetis/db/schema` only, never the `@openmonetis/db` client singleton.
import { createHash } from "node:crypto";
import * as schema from "@openmonetis/db/schema";
import { getTableColumns, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";
import type { UserPlan, WriteResult } from "../types";

// Keeps every multi-row INSERT far below the 65535 bind-parameter limit of Postgres.
const INSERT_CHUNK_ROWS = 500;

const ID_MAP_STEP = "v1_etl.id_map";
const USER_LOADS_STEP = "v1_etl.user_loads";
const CHECKSUM_STEP = "checksum";

export function openTarget(targetUrl: string): Pool {
  return new Pool({ connectionString: targetUrl, max: 1 });
}

export async function writeUser(
  pool: Pool,
  plan: UserPlan,
  fingerprint: string,
): Promise<WriteResult> {
  const { v1UserId, v2UserId } = plan;
  const client = await pool.connect();
  let step = "";
  try {
    await client.query("BEGIN");
    const db = drizzle(client, { schema });
    let written = 0;
    for (const batch of plan.batches) {
      const table = schemaTable(batch.table);
      step = getTableConfig(table).name;
      for (let start = 0; start < batch.rows.length; start += INSERT_CHUNK_ROWS) {
        const chunk = batch.rows.slice(start, start + INSERT_CHUNK_ROWS);
        await db.insert(table).values(chunk as never);
      }
      written += batch.rows.length;
    }

    step = ID_MAP_STEP;
    const idMap = plan.idMap;
    await client.query(
      `INSERT INTO v1_etl.id_map (v1_table, v1_id, role, v2_table, v2_id, v1_user_id)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])`,
      [
        idMap.map((row) => row.v1Table),
        idMap.map((row) => row.v1Id),
        idMap.map((row) => row.role),
        idMap.map((row) => row.v2Table),
        idMap.map((row) => row.v2Id),
        idMap.map((row) => row.v1UserId),
      ],
    );

    step = CHECKSUM_STEP;
    const checksum = await computeUserChecksum(client, v2UserId, plan.checksumColumns);

    step = USER_LOADS_STEP;
    await client.query(
      `INSERT INTO v1_etl.user_loads (v1_user_id, v2_user_id, dump_fingerprint, status, checksum)
       VALUES ($1, $2, $3, 'loaded', $4)`,
      [v1UserId, v2UserId, fingerprint, checksum],
    );

    await client.query("COMMIT");
    return { status: "loaded", v1UserId, v2UserId, checksum, written };
  } catch (error) {
    await client.query("ROLLBACK");
    return { status: "failed", v1UserId, v2UserId, table: step, cause: causeOf(error) };
  } finally {
    client.release();
  }
}

// Content checksum of the user's rows as stored (research R5). Values are normalized to text in
// SQL so the result does not depend on the `pg` type parsers registered in the process.
export async function computeUserChecksum(
  c: PoolClient,
  v2UserId: string,
  checksumColumns: UserPlan["checksumColumns"],
): Promise<string> {
  const hash = createHash("sha256");
  for (const tableName of Object.keys(checksumColumns).sort()) {
    const table = schemaTable(tableName);
    const config = getTableConfig(table);
    const columnsByProperty = getTableColumns(table) as Record<string, PgColumn>;
    const columns = [...(checksumColumns[tableName] ?? [])].sort().map((property) => {
      const column = columnsByProperty[property];
      if (column === undefined) throw new Error(`Unknown column ${tableName}.${property}`);
      return column;
    });
    const owner = columnsByProperty.userId ?? columnsByProperty.id;
    if (owner === undefined) throw new Error(`Table ${tableName} has no owner column`);
    const primaryKey = primaryKeyOf(table);
    const select = columns.length > 0 ? columns.map(normalizedText).join(", ") : "NULL";

    const { rows } = await c.query<unknown[]>({
      text: `SELECT ${select} FROM ${quoteIdent(config.name)}
             WHERE ${quoteIdent(owner.name)} = $1
             ORDER BY ${primaryKey.map((column) => quoteIdent(column.name)).join(", ")}`,
      values: [v2UserId],
      rowMode: "array",
    });

    hash.update(`${JSON.stringify([config.name, columns.map((column) => column.name)])}\n`);
    for (const row of rows) {
      const values = row.map((value, index) =>
        value !== null && isJson(columns[index]) ? sortedJson(JSON.parse(value as string)) : value,
      );
      hash.update(`${JSON.stringify(values)}\n`);
    }
  }
  return hash.digest("hex");
}

function schemaTable(name: string): PgTable {
  const table = (schema as Record<string, unknown>)[name];
  if (!is(table, PgTable)) throw new Error(`Unknown V2 table ${name}`);
  return table;
}

function primaryKeyOf(table: PgTable): PgColumn[] {
  const config = getTableConfig(table);
  const single = config.columns.filter((column) => column.primary);
  if (single.length > 0) return single;
  const composite = config.primaryKeys[0];
  if (composite === undefined) throw new Error(`Table ${config.name} has no primary key`);
  return composite.columns;
}

function normalizedText(column: PgColumn): string {
  const name = quoteIdent(column.name);
  const sqlType = column.getSQLType();
  if (sqlType === "date") return `to_char(${name}, 'YYYY-MM-DD')`;
  if (sqlType.startsWith("timestamp")) {
    const utc = sqlType.includes("with time zone") ? `${name} AT TIME ZONE 'UTC'` : name;
    return `to_char(${utc}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  }
  if (sqlType.startsWith("numeric")) return `round(${name}, 2)::text`;
  return `${name}::text`;
}

function isJson(column: PgColumn | undefined): boolean {
  const sqlType = column?.getSQLType();
  return sqlType === "json" || sqlType === "jsonb";
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedJson((value as Record<string, unknown>)[key])]),
  );
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// Constraint name or SQLSTATE only: driver messages and details can carry row values.
function causeOf(error: unknown): string {
  const pgError = findPgError(error);
  return pgError?.constraint ?? pgError?.code ?? "unknown";
}

function findPgError(error: unknown): { constraint?: string; code?: string } | null {
  let current: unknown = error;
  while (current !== null && typeof current === "object") {
    const candidate = current as { constraint?: string; code?: string; cause?: unknown };
    if (typeof candidate.code === "string") return candidate;
    current = candidate.cause;
  }
  return null;
}
