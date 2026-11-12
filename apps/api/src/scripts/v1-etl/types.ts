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
