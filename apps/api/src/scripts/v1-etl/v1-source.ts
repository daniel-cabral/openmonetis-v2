// Read-only access to the restored V1 dump. No statement in this file writes.
import { createHash } from "node:crypto";
import { Pool, type PoolClient, types } from "pg";
import type {
  ExtractedUser,
  V1Index,
  V1Payer,
  V1PayerShare,
  V1Preferences,
} from "./types";
import { V1_SCHEMA_MANIFEST, type V1TableName } from "./v1-schema-manifest";

const PG_DATE_OID = 1082;

// Composite primary keys; every other manifest table is keyed by `id`.
const COMPOSITE_PRIMARY_KEYS: Partial<Record<V1TableName, readonly string[]>> = {
  anotacao_anexos: ["anotacao_id", "anexo_id"],
  establishment_logos: ["user_id", "name_key"],
  import_category_mappings: ["user_id", "description_key"],
  import_name_mappings: ["user_id", "description_key"],
  lancamento_anexos: ["lancamento_id", "anexo_id"],
  reconciliation_ignores: ["user_id", "fingerprint"],
};

// Tables whose ids other rows reference (FK targets), indexed in `V1Index.ownerOf`.
const REFERENCED_TABLES = [
  "anexos",
  "anotacoes",
  "antecipacoes_parcelas",
  "cartoes",
  "categorias",
  "contas",
  "lancamentos",
  "pagadores",
  "subcategorias",
  "viagens",
] as const;

// Non-FK reference: a recurrence series id, keyed `series:<series_id>` in `ownerOf`.
const SERIES_OWNER_PREFIX = "series";

const MANIFEST_TABLES = Object.keys(V1_SCHEMA_MANIFEST).sort() as V1TableName[];

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function columnList(columns: readonly string[]): string {
  return columns.map(quoteIdent).join(", ");
}

function primaryKey(table: V1TableName): readonly string[] {
  return COMPOSITE_PRIMARY_KEYS[table] ?? ["id"];
}

export function openV1(url: string): Pool {
  return new Pool({
    connectionString: url,
    max: 1,
    options: "-c default_transaction_read_only=on",
    // `date` columns stay `YYYY-MM-DD` strings, as the V1 row types declare.
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") =>
        oid === PG_DATE_OID
          ? (value: string) => value
          : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
    },
  });
}

export async function withV1Snapshot<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let releaseError: Error | undefined;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return await fn(client);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch (error) {
      releaseError = error instanceof Error ? error : new Error(String(error));
    }
    client.release(releaseError);
  }
}

export async function readV1Schema(client: PoolClient): Promise<Map<string, string[]>> {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );
  const schema = new Map<string, string[]>();
  for (const row of rows) {
    const columns = schema.get(row.table_name) ?? [];
    columns.push(row.column_name);
    schema.set(row.table_name, columns);
  }
  return schema;
}

export async function computeDumpFingerprint(
  client: PoolClient,
): Promise<{ fingerprint: string; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  const entries: string[] = [];
  for (const table of MANIFEST_TABLES) {
    const orderBy = primaryKey(table)
      .map((column) => `t.${quoteIdent(column)}`)
      .join(", ");
    const { rows } = await client.query<{ count: string; digest: string }>(
      `SELECT count(*)::text AS count,
              coalesce(md5(string_agg(t::text, '|' ORDER BY ${orderBy})), '') AS digest
         FROM public.${quoteIdent(table)} t`,
    );
    const row = rows[0];
    counts[table] = Number(row?.count ?? 0);
    entries.push(`${table}:${counts[table]}:${row?.digest ?? ""}`);
  }
  entries.sort();
  const fingerprint = createHash("sha256").update(entries.join("\n")).digest("hex");
  return { fingerprint, counts };
}

export async function listV1Users(client: PoolClient): Promise<V1Index> {
  const users = (
    await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM public."user" ORDER BY id`,
    )
  ).rows;
  const emailByUser = new Map(users.map((user) => [user.id, user.email]));

  const ownerOf = new Map<string, string>();
  for (const table of REFERENCED_TABLES) {
    const { rows } = await client.query<{ id: string; user_id: string }>(
      `SELECT id::text AS id, user_id FROM public.${quoteIdent(table)}`,
    );
    for (const row of rows) ownerOf.set(`${table}:${row.id}`, row.user_id);
  }
  const series = await client.query<{ series_id: string; user_id: string }>(
    `SELECT DISTINCT series_id::text AS series_id, user_id
       FROM public.lancamentos
      WHERE series_id IS NOT NULL`,
  );
  for (const row of series.rows) {
    ownerOf.set(`${SERIES_OWNER_PREFIX}:${row.series_id}`, row.user_id);
  }

  return { users, emailByUser, ownerOf };
}

// Selected columns per V1 row type (types.ts). Never token hashes, prefixes or IPs.
const USER_COLUMNS = ["id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt"];
const ACCOUNT_COLUMNS = ["id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"];
const PASSKEY_COLUMNS = [
  "id", "name", "publicKey", "userId", "credentialID", "counter", "deviceType", "backedUp",
  "transports", "aaguid", "createdAt",
];
const PAYER_COLUMNS = ["id", "nome", "email", "avatar_url", "status", "anotacao", "role", "created_at", "user_id"];
const CATEGORY_COLUMNS = ["id", "nome", "tipo", "icone", "created_at", "user_id"];
const SUBCATEGORY_COLUMNS = ["id", "nome", "categoria_id", "created_at", "user_id"];
const FINANCIAL_ACCOUNT_COLUMNS = [
  "id", "nome", "tipo_conta", "anotacao", "status", "logo", "saldo_inicial", "excluir_do_saldo",
  "excluir_saldo_inicial_receitas", "created_at", "user_id",
];
const CARD_COLUMNS = [
  "id", "nome", "dt_fechamento", "dt_vencimento", "anotacao", "limite", "bandeira", "logo", "status",
  "created_at", "user_id", "conta_id",
];
const INVOICE_COLUMNS = ["id", "status_pagamento", "periodo", "created_at", "user_id", "cartao_id"];
const TRANSACTION_COLUMNS = V1_SCHEMA_MANIFEST.lancamentos.columns;
const ANTICIPATION_COLUMNS = V1_SCHEMA_MANIFEST.antecipacoes_parcelas.columns;
const TRIP_COLUMNS = ["id", "user_id", "nome", "data_inicio", "data_fim", "anotacao", "created_at"];
const NOTE_COLUMNS = ["id", "titulo", "descricao", "tipo", "tasks", "arquivada", "created_at", "user_id"];
const ATTACHMENT_COLUMNS = ["id", "user_id", "chave_arquivo", "nome_arquivo", "tamanho_bytes", "mime_type", "created_at"];
const BUDGET_COLUMNS = ["id", "valor", "periodo", "created_at", "user_id", "categoria_id"];
const INBOX_COLUMNS = V1_SCHEMA_MANIFEST.pre_lancamentos.columns;
const PREFERENCES_COLUMNS = [
  "user_id", "extrato_note_as_column", "lancamentos_column_order", "attachment_max_size_mb",
  "dashboard_widgets", "mostrar_resumo_lancamento", "agrupar_lancamentos_por_data",
  "ocultar_parcelas_antecipadas",
];
const NOTIFICATION_STATE_COLUMNS = ["user_id", "notification_key", "fingerprint", "read_at", "archived_at", "created_at", "updated_at"];
const LOGO_COLUMNS = ["user_id", "name_key", "domain", "updated_at"];
const CATEGORY_MAPPING_COLUMNS = ["user_id", "description_key", "category_id", "subcategory_id", "updated_at"];
const NAME_MAPPING_COLUMNS = ["user_id", "description_key", "name", "updated_at"];
const API_TOKEN_COLUMNS = ["id", "user_id", "name", "created_at"];
const PAYER_SHARE_COLUMNS = ["id", "pagador_id", "shared_with_user_id", "permission", "created_by_user_id"];

async function selectOwned<Row>(
  client: PoolClient,
  table: V1TableName,
  columns: readonly string[],
  ownerColumn: string,
  v1UserId: string,
): Promise<Row[]> {
  const orderBy = primaryKey(table).map(quoteIdent).join(", ");
  const { rows } = await client.query(
    `SELECT ${columnList(columns)}
       FROM public.${quoteIdent(table)}
      WHERE ${quoteIdent(ownerColumn)} = $1
      ORDER BY ${orderBy}`,
    [v1UserId],
  );
  return rows as Row[];
}

export async function extractUser(
  client: PoolClient,
  v1UserId: string,
  index: V1Index,
): Promise<ExtractedUser> {
  const owned = <Row>(table: V1TableName, columns: readonly string[]) =>
    selectOwned<Row>(client, table, columns, "user_id", v1UserId);

  const users = await selectOwned<ExtractedUser["user"]>(client, "user", USER_COLUMNS, "id", v1UserId);
  const user = users[0];
  if (!user) throw new Error(`V1 user not found: ${v1UserId}`);

  const noteAttachments = (
    await client.query<{ anotacao_id: string; anexo_id: string }>(
      `SELECT na.anotacao_id, na.anexo_id
         FROM public.anotacao_anexos na
         JOIN public.anotacoes n ON n.id = na.anotacao_id
        WHERE n.user_id = $1
        ORDER BY na.anotacao_id, na.anexo_id`,
      [v1UserId],
    )
  ).rows;
  const transactionAttachments = (
    await client.query<{ lancamento_id: string; anexo_id: string }>(
      `SELECT la.lancamento_id, la.anexo_id
         FROM public.lancamento_anexos la
         JOIN public.lancamentos l ON l.id = la.lancamento_id
        WHERE l.user_id = $1
        ORDER BY la.lancamento_id, la.anexo_id`,
      [v1UserId],
    )
  ).rows;
  const preferences = await owned<V1Preferences>("preferencias_usuario", PREFERENCES_COLUMNS);

  return {
    user,
    accounts: await selectOwned(client, "account", ACCOUNT_COLUMNS, "userId", v1UserId),
    passkeys: await selectOwned(client, "passkey", PASSKEY_COLUMNS, "userId", v1UserId),
    payers: await owned<V1Payer>("pagadores", PAYER_COLUMNS),
    categories: await owned("categorias", CATEGORY_COLUMNS),
    subcategories: await owned("subcategorias", SUBCATEGORY_COLUMNS),
    financialAccounts: await owned("contas", FINANCIAL_ACCOUNT_COLUMNS),
    cards: await owned("cartoes", CARD_COLUMNS),
    invoices: await owned("faturas", INVOICE_COLUMNS),
    transactions: await owned("lancamentos", TRANSACTION_COLUMNS),
    anticipations: await owned("antecipacoes_parcelas", ANTICIPATION_COLUMNS),
    trips: await owned("viagens", TRIP_COLUMNS),
    notes: await owned("anotacoes", NOTE_COLUMNS),
    noteAttachments,
    attachments: await owned("anexos", ATTACHMENT_COLUMNS),
    transactionAttachments,
    budgets: await owned("orcamentos", BUDGET_COLUMNS),
    inboxItems: await owned("pre_lancamentos", INBOX_COLUMNS),
    preferences: preferences[0] ?? null,
    notificationStates: await owned("dashboard_notification_states", NOTIFICATION_STATE_COLUMNS),
    logos: await owned("establishment_logos", LOGO_COLUMNS),
    categoryMappings: await owned("import_category_mappings", CATEGORY_MAPPING_COLUMNS),
    nameMappings: await owned("import_name_mappings", NAME_MAPPING_COLUMNS),
    apiTokens: await owned("tokens_api", API_TOKEN_COLUMNS),
    payerShares: await selectOwned<V1PayerShare>(
      client,
      "compartilhamentos_pagador",
      PAYER_SHARE_COLUMNS,
      "created_by_user_id",
      v1UserId,
    ),
    index,
  };
}

export async function countSkipped(
  client: PoolClient,
): Promise<{ table: string; rows: number; decision: string }[]> {
  const skipped: { table: string; rows: number; decision: string }[] = [];
  for (const table of MANIFEST_TABLES) {
    const spec: { decision: string; reason?: string } = V1_SCHEMA_MANIFEST[table];
    if (spec.decision !== "skip") continue;
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.${quoteIdent(table)}`,
    );
    skipped.push({ table, rows: Number(rows[0]?.count ?? 0), decision: spec.reason ?? "skip" });
  }
  return skipped;
}
