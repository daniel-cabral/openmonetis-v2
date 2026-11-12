# Internal Types and Module Signatures (016)

Binding for the implementation. Task T004a creates `apps/api/src/scripts/v1-etl/types.ts` with the
types below verbatim (names and fields); later tasks implement the listed functions with exactly
these names, parameters and return types. V1 values keep their database form (`numeric` as
string, `date` as `YYYY-MM-DD` string, timestamps as `Date`); V2 rows use the Drizzle insert types of
`@openmonetis/db`.

## Shared types (`types.ts`)

```ts
export type Severity = "blocker" | "fixable" | "informational";
export type Cents = number; // integer

// ---- V1 rows (one type per V1 table, only the columns the tool reads) ----
export type V1User = { id: string; name: string; email: string; emailVerified: boolean; image: string | null; createdAt: Date; updatedAt: Date };
export type V1Account = { id: string; accountId: string; providerId: string; userId: string; password: string | null; createdAt: Date; updatedAt: Date };
export type V1Passkey = { id: string; name: string | null; publicKey: string; userId: string; credentialID: string; counter: number; deviceType: string; backedUp: boolean; transports: string | null; aaguid: string | null; createdAt: Date | null };
export type V1Payer = { id: string; nome: string; email: string | null; avatar_url: string | null; status: string; anotacao: string | null; role: string | null; created_at: Date; user_id: string };
export type V1Category = { id: string; nome: string; tipo: string; icone: string | null; created_at: Date; user_id: string };
export type V1Subcategory = { id: string; nome: string; categoria_id: string; created_at: Date; user_id: string };
export type V1FinancialAccount = { id: string; nome: string; tipo_conta: string; anotacao: string | null; status: string; logo: string; saldo_inicial: string; excluir_do_saldo: boolean; excluir_saldo_inicial_receitas: boolean; created_at: Date; user_id: string };
export type V1Card = { id: string; nome: string; dt_fechamento: string; dt_vencimento: string; anotacao: string | null; limite: string; bandeira: string | null; logo: string | null; status: string; created_at: Date; user_id: string; conta_id: string };
export type V1Invoice = { id: string; status_pagamento: string | null; periodo: string | null; created_at: Date; user_id: string; cartao_id: string | null };
export type V1Transaction = {
  id: string; condicao: string; nome: string; forma_pagamento: string; anotacao: string | null;
  valor: string; data_compra: string; tipo_transacao: string; qtde_parcela: number | null;
  periodo: string; parcela_atual: number | null; qtde_recorrencia: number | null;
  data_vencimento: string | null; dt_pagamento_boleto: string | null; realizado: boolean | null;
  dividido: boolean | null; antecipado: boolean | null; antecipacao_id: string | null;
  created_at: Date; user_id: string; cartao_id: string | null; conta_id: string | null;
  categoria_id: string | null; pagador_id: string | null; series_id: string | null;
  split_group_id: string | null; transfer_id: string | null; ofx_fit_id: string | null;
  import_batch_id: string | null; ofx_import_fingerprint: string | null; viagem_id: string | null;
  subcategoria_id: string | null;
};
export type V1Anticipation = { id: string; series_id: string; periodo_antecipacao: string; data_antecipacao: string; parcelas_antecipadas: string[]; valor_total: string; qtde_parcelas: number; desconto: string; lancamento_id: string; pagador_id: string | null; categoria_id: string | null; anotacao: string | null; user_id: string; created_at: Date };
export type V1Trip = { id: string; user_id: string; nome: string; data_inicio: string; data_fim: string; anotacao: string | null; created_at: Date };
export type V1Note = { id: string; titulo: string | null; descricao: string | null; tipo: string; tasks: string | null; arquivada: boolean; created_at: Date; user_id: string };
export type V1Attachment = { id: string; user_id: string; chave_arquivo: string; nome_arquivo: string; tamanho_bytes: number; mime_type: string; created_at: Date };
export type V1Budget = { id: string; valor: string; periodo: string; created_at: Date; user_id: string; categoria_id: string | null };
export type V1InboxItem = { id: string; user_id: string; source_app: string; source_app_name: string | null; original_title: string | null; original_text: string; notification_timestamp: Date; parsed_name: string | null; parsed_amount: string | null; status: string; lancamento_id: string | null; processed_at: Date | null; discarded_at: Date | null; created_at: Date; updated_at: Date };
export type V1Preferences = { user_id: string; extrato_note_as_column: boolean; lancamentos_column_order: unknown; attachment_max_size_mb: number; dashboard_widgets: unknown; mostrar_resumo_lancamento: boolean; agrupar_lancamentos_por_data: boolean; ocultar_parcelas_antecipadas: boolean };
export type V1NotificationState = { user_id: string; notification_key: string; fingerprint: string; read_at: Date | null; archived_at: Date | null; created_at: Date; updated_at: Date };
export type V1Logo = { user_id: string; name_key: string; domain: string; updated_at: Date };
export type V1CategoryMapping = { user_id: string; description_key: string; category_id: string; subcategory_id: string | null; updated_at: Date };
export type V1NameMapping = { user_id: string; description_key: string; name: string; updated_at: Date };
export type V1ApiToken = { id: string; user_id: string; name: string; created_at: Date }; // never the hash or IP
export type V1PayerShare = { id: string; pagador_id: string; shared_with_user_id: string; permission: string; created_by_user_id: string };

export type ExtractedUser = {
  user: V1User;
  accounts: V1Account[];
  passkeys: V1Passkey[];
  payers: V1Payer[];
  categories: V1Category[];
  subcategories: V1Subcategory[];
  financialAccounts: V1FinancialAccount[];
  cards: V1Card[];
  invoices: V1Invoice[];
  transactions: V1Transaction[];
  anticipations: V1Anticipation[];
  trips: V1Trip[];
  notes: V1Note[];
  noteAttachments: { anotacao_id: string; anexo_id: string }[];
  attachments: V1Attachment[];
  transactionAttachments: { lancamento_id: string; anexo_id: string }[];
  budgets: V1Budget[];
  inboxItems: V1InboxItem[];
  preferences: V1Preferences | null;
  notificationStates: V1NotificationState[];
  logos: V1Logo[];
  categoryMappings: V1CategoryMapping[];
  nameMappings: V1NameMapping[];
  apiTokens: V1ApiToken[];
  payerShares: V1PayerShare[]; // shares created by this user
  /** shared, read-only V1Index built once by listV1Users (never rescanned per user) */
  index: V1Index;
};

export type V1Index = {
  users: { id: string; email: string }[];   // ordered by id
  emailByUser: Map<string, string>;          // for share re-invite lists
  ownerOf: Map<string, string>;              // `${table}:${id}` -> v1 user id, every referenced table, for cross-user reference.dangling
};

// ---- Validation ----
export type Finding = {
  rule: string; severity: Severity; table: string; v1Id: string; v1UserId: string | null;
  reason: string; context: Record<string, string | number | null | string[]>;
  resolutions: string[]; resolutionKey: string; // `${rule}:${table}:${v1Id}`
};
export type Resolutions = { dumpFingerprint: string; resolutions: Record<string, string> };
export type ValidationReport = {
  header: OutputHeader;
  v1Counts: Record<string, number>;
  skippedTables: { table: string; rows: number; decision: string }[];
  droppedStamps: { ofx_import_fingerprint: number; import_batch_id: number };
  findings: Finding[];
  summary: Record<Severity, number>;
  resolutionTemplate: Record<string, string>;
};
export type OutputHeader = { tool: "v1-etl"; command: "validate" | "load" | "reconcile" | "rehearse"; dumpFingerprint: string; generatedAt: string };

export type InformationalItem = { reason: string; rows: number };

// ---- Plan and write ----
export type V2TableName = string; // exported Drizzle table name of @openmonetis/db, e.g. "transactions"
export type InsertBatch = { table: V2TableName; rows: Record<string, unknown>[] }; // inserted in array order
export type IdMapRow = { v1Table: string; v1Id: string; role: string; v2Table: string; v2Id: string; v1UserId: string };
export type TableCount = {
  v1Table: string; read: number; written: number; merged: number;
  skipped: { reason: string; rows: number }[];
  collapsed: { reason: string; rows: number; into: number }[];
  detached: { reason: string; rows: number }[];
  droppedColumns: { column: string; rows: number }[];
};
export type RepairList = {
  companionRepair: { v1UserId: string; email: string; tokens: number }[];
  shareReinvite: { ownerEmail: string; personName: string; sharedWithEmail: string }[];
  passwordReset: { email: string }[];
  passkeysNotLoaded: { email: string; count: number; reason: "rp-id-mismatch" }[];
};
export type UserPlan = {
  v1UserId: string; v2UserId: string;
  batches: InsertBatch[];             // FK order of data-model "V1 -> V2 mapping"
  idMap: IdMapRow[];
  counts: TableCount[];
  checksumColumns: Record<V2TableName, string[]>; // per written table, sorted column names
  appliedRules: { rule: string; rows: number }[];
  informational: InformationalItem[];
  repairList: RepairList;
};
export type PlanResult = { ok: true; plan: UserPlan; findings: Finding[] } | { ok: false; unresolved: Finding[] };
export type WriteResult =
  | { status: "loaded"; v1UserId: string; v2UserId: string; checksum: string; written: number }
  | { status: "skipped-already-loaded"; v1UserId: string; v2UserId: string; checksum: string; written: 0 }
  | { status: "failed"; v1UserId: string; v2UserId: string; table: string; cause: string }; // cause = constraint or error code, never row values

// ---- Reconciliation ----
export type FigureKind = "accountBalance" | "invoiceTotal" | "transactionCount" | "categoryTotal" | "personTotal";
export type FigureKey = Record<string, string>; // e.g. { account, periodEnd } / { card, period } / { period, type } / { period, rootCategory, type } / { person, period }
export type V1Figure = { kind: FigureKind; key: FigureKey; value: Cents | number; valueWithV2Posting?: Cents; status?: "paid" | "pending"; paidAt?: string | null };
export type V2Figure = { kind: FigureKind; key: FigureKey; value: Cents | number; status?: "paid" | "pending"; paidAt?: string | null };
export type Figure = {
  kind: FigureKind; key: FigureKey; v1: string | number; v1WithV2Posting?: string; v2: string | number;
  difference: string | number; status?: { v1: string | null; v2: string | null }; paidAt?: { v1: string | null; v2: string | null }; pass: boolean;
};
export type ExpectedDifference =
  | { reason: "zero-recurrence-skip"; kind: "transactionCount"; count: number }
  | { reason: "split-group"; kind: "transactionCount"; count: number }
  | { reason: "period-date-resolved"; kind: "transactionCount"; rows: { v1Id: string; resolution: "use-date" | "use-period"; period: string }[] }
  | { reason: "boleto-posting-month"; kind: "accountBalance"; rows: { v1Id: string; period: string; paymentMonth: string; amount: string; differenceVsRawV1: { periodEnd: string; value: string } }[] };
export type UserReconciliation = {
  v1UserId: string; pass: boolean; figures: Figure[];
  informational: InformationalItem[];
  expectedDifferences: ExpectedDifference[];
};

// ---- Command outputs (contracts/output-formats.md) ----
export type LoadReport = {
  header: OutputHeader;
  tables: TableCount[];                 // summed over users, sorted by v1Table
  users: WriteResult[];                 // sorted by v1UserId
  appliedRules: { rule: string; rows: number }[];
  repairList: RepairList;               // concatenated over users
};
export type ReconciliationReport = {
  header: OutputHeader;
  users: UserReconciliation[];          // sorted by v1UserId
  global: { users: number; passed: number; rehearsalReady: boolean; totals: Record<string, string | number> };
};
```

## Module signatures

| Module | Export | Signature |
|---|---|---|
| `ids.ts` | `ETL_NAMESPACE`, `v2Id` | `v2Id(v1Table: string, v1Id: string, role?: string): string` |
| `v1-source.ts` | `openV1` | `openV1(url: string): import("pg").Pool` |
| | `withV1Snapshot` | `withV1Snapshot<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T>` |
| | `readV1Schema` | `readV1Schema(client: PoolClient): Promise<Map<string, string[]>>` |
| | `computeDumpFingerprint` | `computeDumpFingerprint(client: PoolClient): Promise<{ fingerprint: string; counts: Record<string, number> }>` |
| | `listV1Users` | `listV1Users(client: PoolClient): Promise<V1Index>` (one global scan builds users, emails and `ownerOf`) |
| | `extractUser` | `extractUser(client: PoolClient, v1UserId: string, index: V1Index): Promise<ExtractedUser>` (reads only that user's rows; `index` is attached, not recomputed) |
| | `countSkipped` | `countSkipped(client: PoolClient): Promise<{ table: string; rows: number; decision: string }[]>` |
| `conversions/amounts.ts` | `toTypedAmount` | `toTypedAmount(valor: string): { ok: true; type: "income" \| "expense"; amountCents: Cents } \| { ok: false; reason: "zero" \| "precision" }` |
| | maps | `PAYMENT_METHOD_MAP`, `CATEGORY_TYPE_MAP`, `ACCOUNT_TYPE_MAP`, `CARD_BRAND_MAP`, `PERSON_STATUS_MAP`, `CONDITION_MAP` (`Record<string, ...>`); `mapAccountType(v: string): { type: AccountType; unknown: boolean }`; `mapCardBrand(v: string \| null): { brand: CardBrand; unknown: boolean }` |
| `conversions/catalog.ts` | `convertCatalog` | `convertCatalog(x: ExtractedUser, r: Resolutions["resolutions"]): CatalogResult` where `CatalogResult = { batches: InsertBatch[]; idMap: IdMapRow[]; counts: TableCount[]; findings: Finding[]; refs: CatalogRefs }` and `CatalogRefs = { userId: string; adminPersonId: string; personByPayer: Map<string, string>; categoryByV1: Map<string, string>; childBySubcategory: Map<string, string>; accountByV1: Map<string, string>; cardByV1: Map<string, { id: string; closingDay: number; dueDay: number }>; tripByV1: Map<string, string>; systemCategory: (name: string, type: "income" \| "expense") => string }` |
| | `convertCredentials` (T038) | `convertCredentials(x: ExtractedUser, refs: CatalogRefs, opts: { v1RpId: string \| null; targetRpId: string }): { batches: InsertBatch[]; idMap: IdMapRow[]; findings: Finding[]; repair: Pick<RepairList, "passwordReset" \| "passkeysNotLoaded"> }` |
| `conversions/markers.ts` | `parseMarker` | `parseMarker(note: string \| null): Marker \| null`, `Marker = { kind: "invoicePayment"; cardId: string; period: string; partialId: string \| null } \| { kind: "invoiceCredit"; cardId: string; period: string } \| { kind: "refund"; sourceId: string }` |
| | `buildInvoicePayment` | `buildInvoicePayment(row: V1Transaction, m: Extract<Marker, { kind: "invoicePayment" }>, refs: CatalogRefs): { batches: InsertBatch[]; idMap: IdMapRow[] }` |
| | `buildInvoiceCredit`, `buildRefund` | same shape as `buildInvoicePayment` for their marker kinds |
| | `convertInvoices` | `convertInvoices(invoices: V1Invoice[], payments: V1Transaction[], refs: CatalogRefs): { batches: InsertBatch[]; idMap: IdMapRow[]; findings: Finding[] }` |
| `conversions/transactions.ts` | `convertTransactions` | `convertTransactions(rows: V1Transaction[], x: ExtractedUser, refs: CatalogRefs, r: Resolutions["resolutions"]): ConversionResult` where `ConversionResult = { batches: InsertBatch[]; idMap: IdMapRow[]; counts: TableCount[]; findings: Finding[] }` (rows = singles plus detached recurrence rows) |
| `conversions/installments.ts` | `convertInstallments` | `convertInstallments(rows: V1Transaction[], anticipations: V1Anticipation[], refs: CatalogRefs): ConversionResult` |
| `conversions/side-data.ts` | `convertSideData` | `convertSideData(x: ExtractedUser, refs: CatalogRefs, txByV1: Map<string, string>, r: Resolutions["resolutions"]): ConversionResult` |
| | `convertImportMappings` (T041) | `convertImportMappings(x: ExtractedUser, refs: CatalogRefs): ConversionResult` |
| `conversions/recurrence.ts` | `convertRecurrence` | `convertRecurrence(rows: V1Transaction[], refs: CatalogRefs, r: Resolutions["resolutions"]): RecurrenceResult` where `RecurrenceResult = ConversionResult & { detached: V1Transaction[]; series: { v1SeriesId: string; versions: RecurrenceVersion[]; recurrenceEndDate: string; occurrences: { date: string; isSettled: true; accountId: string \| null; boletoPaymentDate: string \| null }[] }[] }` and `RecurrenceVersion = { anchorDate: string; startDate: string; endDate: string; dueDate: string \| null; amountCents: Cents; name: string; categoryId: string \| null; isSettled: null }` |
| `load/plan-user.ts` | `planUser` | `planUser(x: ExtractedUser, r: Resolutions \| null, opts: { v1RpId: string \| null; targetRpId: string }): PlanResult` |
| `load/etl-state.ts` | `ensureState`, `getRun`, `startRun`, `finishRun`, `isUserLoaded` | `(client: PoolClient, ...)`: `ensureState(c): Promise<void>`; `getRun(c): Promise<{ dumpFingerprint: string; status: string } \| null>`; `startRun(c, fingerprint: string, counts: Record<string, number>): Promise<void>`; `finishRun(c, status: "loaded" \| "failed"): Promise<void>`; `isUserLoaded(c, v1UserId: string, fingerprint: string): Promise<{ v2UserId: string; checksum: string } \| null>` |
| `load/guards.ts` | `checkLoadGuards` | `checkLoadGuards(c: PoolClient, opts: { v1Url: string; targetUrl: string; scratch: boolean; confirmProduction: string \| null; fingerprint: string }): Promise<{ ok: true } \| { ok: false; reason: string }>` |
| `load/v2-writer.ts` | `openTarget` | `openTarget(targetUrl: string): Pool` (own `pg` Pool, `max: 1`; never the `@openmonetis/db` singleton) |
| | `writeUser` | `writeUser(pool: Pool, plan: UserPlan, fingerprint: string): Promise<WriteResult>`: checks out ONE `PoolClient`, runs `BEGIN`, builds `drizzle(client, { schema })` over that same client (drizzle-orm 0.45.4 `NodePgClient = Pool \| PoolClient \| Client`), inserts every batch, writes `v1_etl.id_map` and `user_loads` and computes the checksum with the same client, then `COMMIT` (or `ROLLBACK` on error) and `release()` |
| | `computeUserChecksum` | `computeUserChecksum(c: PoolClient, v2UserId: string, checksumColumns: UserPlan["checksumColumns"]): Promise<string>` (inside `writeUser` with its client; elsewhere with a client checked out and released by the caller) |
| `reconcile/v1-figures.ts` | `computeV1Figures` | `computeV1Figures(c: PoolClient, v1UserId: string, r: Resolutions \| null): Promise<V1Figure[]>` |
| `reconcile/v2-figures.ts` | `computeV2Figures` | `computeV2Figures(v2UserId: string, periods: string[]): Promise<V2Figure[]>` (uses the `@openmonetis/db` singleton through the V2 repositories) |
| `reconcile/compare.ts` | `buildExpectedDifferences` | `buildExpectedDifferences(x: ExtractedUser, plan: UserPlan, r: Resolutions \| null): { expected: ExpectedDifference[]; informational: InformationalItem[] }` |
| | `compareUser` | `compareUser(v1UserId: string, v1: V1Figure[], v2: V2Figure[], loadCounts: TableCount[], informational: UserPlan["informational"], expected: ExpectedDifference[]): UserReconciliation` |
| `validate/rules.ts` | `RULES`, `runRules` | `RULES: { id: string; severity: Severity; resolutions: string[] }[]`; `runRules(x: ExtractedUser): Finding[]` |
| `validate/check-bucket.ts` | `checkBucketKeys` | `checkBucketKeys(attachments: V1Attachment[]): Promise<Finding[]>` (S3 `HeadObjectCommand` only) |
| `validate/validator.ts` | `validate` | `validate(c: PoolClient, opts: { resolutions: Resolutions \| null; checkBucket: boolean; user: string \| null }): Promise<ValidationReport>` |
| `output/render.ts` | `writeOutput`, `defaultOutDir` | `writeOutput(outDir: string, command: OutputHeader["command"], payload: object, text: string): Promise<void>`; `defaultOutDir(fingerprint: string): string` |
| | text renderers | `renderValidationText(report: ValidationReport): string`; `renderLoadText(report: LoadReport): string`; `renderReconcileText(report: ReconciliationReport): string` |

`checksumColumns` are the sorted column names each batch row sets; `computeUserChecksum` reads
exactly those columns, ordered by primary key, normalized per research R5.
