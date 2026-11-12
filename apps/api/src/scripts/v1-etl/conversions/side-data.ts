import { createHash } from "node:crypto";
import {
  attachments,
  establishmentLogos,
  importCategoryMappings,
  importNameMappings,
  inboxItems,
  notificationStates,
} from "@openmonetis/db/schema";
import { normalizeInboxSingleLine } from "@openmonetis/domain/inbox";
import {
  noteItemsMaximumCount,
  noteItemTextMaximumLength,
  noteTitleMaximumLength,
} from "@openmonetis/domain/notes";
import { isCalendarPeriod } from "@openmonetis/shared/date-time";
import { type PgColumn, PgVarchar } from "drizzle-orm/pg-core";
import { v2Id } from "../ids";
import type {
  ExtractedUser,
  Finding,
  IdMapRow,
  InsertBatch,
  Severity,
  TableCount,
  V1InboxItem,
  V1Note,
} from "../types";
import { CONDITION_MAP } from "./amounts";
import type { CatalogRefs } from "./catalog";
import type { ConversionResult } from "./transactions";

type Resolved = Record<string, string>;
type V1Task = { text?: unknown; completed?: unknown };
type ItemDraft = { text: string; isCompleted: boolean };

const T = {
  notes: "anotacoes",
  attachments: "anexos",
  noteAttachments: "anotacao_anexos",
  transactionAttachments: "lancamento_anexos",
  transactions: "lancamentos",
  budgets: "orcamentos",
  inbox: "pre_lancamentos",
  notificationStates: "dashboard_notification_states",
  logos: "establishment_logos",
  categoryMappings: "import_category_mappings",
  nameMappings: "import_name_mappings",
} as const;

const TEXT_TOO_LONG = ["truncate", "drop"];
const DROP = ["drop"];

function charLength(value: string): number {
  return [...value].length;
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

// Collects findings, counts and id-map rows for one user's side tables.
class Collector {
  readonly findings: Finding[] = [];
  readonly idMap: IdMapRow[] = [];
  private readonly counts = new Map<string, TableCount>();

  constructor(
    private readonly v1UserId: string,
    private readonly r: Resolved,
  ) {}

  read(v1Table: string, rows: number): void {
    this.count(v1Table).read += rows;
  }

  written(v1Table: string, v1Id: string, role: string, v2Table: string, v2IdValue: string): void {
    this.count(v1Table).written += 1;
    this.idMap.push({ v1Table, v1Id, role, v2Table, v2Id: v2IdValue, v1UserId: this.v1UserId });
  }

  skipped(v1Table: string, reason: string): void {
    const skipped = this.count(v1Table).skipped;
    const entry = skipped.find((item) => item.reason === reason);
    if (entry) entry.rows += 1;
    else skipped.push({ reason, rows: 1 });
  }

  // Reports the finding and returns the operator's resolution when it is an allowed one.
  report(
    rule: string,
    severity: Severity,
    table: string,
    v1Id: string,
    reason: string,
    context: Finding["context"],
    resolutions: string[],
  ): string | null {
    const resolutionKey = `${rule}:${table}:${v1Id}`;
    this.findings.push({
      rule,
      severity,
      table,
      v1Id,
      v1UserId: this.v1UserId,
      reason,
      context,
      resolutions,
      resolutionKey,
    });
    const chosen = this.r[resolutionKey];
    return chosen !== undefined && resolutions.includes(chosen) ? chosen : null;
  }

  // Returns the value fitted to `limit` characters, or null when the row must not load.
  fit(table: string, v1Id: string, column: string, value: string, limit: number): string | null {
    const length = charLength(value);
    if (length <= limit) return value;
    const chosen = this.report(
      "text.too-long",
      "blocker",
      table,
      v1Id,
      "value longer than the V2 column",
      { column, length, limit },
      TEXT_TOO_LONG,
    );
    return chosen === "truncate" ? [...value].slice(0, limit).join("") : null;
  }

  tableCounts(): TableCount[] {
    return [...this.counts.values()];
  }

  private count(v1Table: string): TableCount {
    let entry = this.counts.get(v1Table);
    if (!entry) {
      entry = {
        v1Table,
        read: 0,
        written: 0,
        merged: 0,
        skipped: [],
        collapsed: [],
        detached: [],
        droppedColumns: [],
      };
      this.counts.set(v1Table, entry);
    }
    return entry;
  }
}

// Limit read from the Drizzle schema, so it follows the V2 column instead of a copied number.
function limitOf(column: PgColumn): number {
  if (!(column instanceof PgVarchar) || column.length === undefined) {
    throw new Error(`not a bounded varchar column: ${column.name}`);
  }
  return column.length;
}

function parseTasks(note: V1Note): ItemDraft[] | null {
  if (isBlank(note.tasks)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(note.tasks as string);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const items: ItemDraft[] = [];
  for (const task of parsed as V1Task[]) {
    if (typeof task?.text !== "string") return null;
    items.push({ text: task.text, isCompleted: task.completed === true });
  }
  return items;
}

function titleFromContent(note: V1Note, items: ItemDraft[]): string | null {
  const source = [note.descricao ?? "", ...items.map((item) => item.text)]
    .flatMap((text) => text.split("\n"))
    .map((line) => line.trim())
    .find((line) => line !== "");
  return source === undefined ? null : [...source].slice(0, noteTitleMaximumLength).join("");
}

function convertNotes(
  x: ExtractedUser,
  refs: CatalogRefs,
  c: Collector,
): { notes: Record<string, unknown>[]; items: Record<string, unknown>[]; loaded: Set<string> } {
  const noteRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const loaded = new Set<string>();
  c.read(T.notes, x.notes.length);

  for (const note of x.notes) {
    const tasks = parseTasks(note);
    if (tasks === null) {
      c.report(
        "note.invalid-tasks",
        "blocker",
        T.notes,
        note.id,
        "tasks is not a V1 task list",
        {},
        DROP,
      );
      c.skipped(T.notes, "note.invalid-tasks");
      continue;
    }

    let title = note.titulo;
    if (isBlank(title)) {
      const chosen = c.report(
        "note.missing-title",
        "blocker",
        T.notes,
        note.id,
        "note without title",
        {},
        ["title-from-content", "drop"],
      );
      title = chosen === "title-from-content" ? titleFromContent(note, tasks) : null;
      if (title === null) {
        c.skipped(T.notes, "note.missing-title");
        continue;
      }
    }
    const fittedTitle = c.fit(T.notes, note.id, "title", title as string, noteTitleMaximumLength);
    if (fittedTitle === null) {
      c.skipped(T.notes, "text.too-long");
      continue;
    }

    let kind: "text" | "checklist" = note.tipo === "tarefa" ? "checklist" : "text";
    let items = tasks.filter((item) => item.text.trim() !== "");
    if (kind === "text" && isBlank(note.descricao)) {
      const chosen = c.report(
        "note.blank-content",
        "blocker",
        T.notes,
        note.id,
        "text note without content",
        {},
        ["as-checklist", "drop"],
      );
      if (chosen !== "as-checklist") {
        c.skipped(T.notes, "note.blank-content");
        continue;
      }
      kind = "checklist";
    }
    if (note.tipo === "tarefa" && !isBlank(note.descricao)) {
      c.report(
        "note.task-description-as-item",
        "fixable",
        T.notes,
        note.id,
        "task description becomes the first unchecked item",
        {},
        [],
      );
      items = [{ text: note.descricao as string, isCompleted: false }, ...items];
    }
    if (kind === "text") items = [];

    if (items.length > noteItemsMaximumCount) {
      c.report(
        "note.too-many-items",
        "blocker",
        T.notes,
        note.id,
        "more checklist items than V2 allows",
        { items: items.length, limit: noteItemsMaximumCount },
        DROP,
      );
      c.skipped(T.notes, "note.too-many-items");
      continue;
    }
    const fittedItems: ItemDraft[] = [];
    for (const item of items) {
      const text = c.fit(T.notes, note.id, "note_items.text", item.text, noteItemTextMaximumLength);
      if (text === null) break;
      fittedItems.push({ text, isCompleted: item.isCompleted });
    }
    if (fittedItems.length !== items.length) {
      c.skipped(T.notes, "text.too-long");
      continue;
    }

    const noteId = v2Id(T.notes, note.id);
    noteRows.push({
      id: noteId,
      userId: refs.userId,
      title: fittedTitle,
      kind,
      content: kind === "text" ? note.descricao : null,
      isArchived: note.arquivada,
      createdAt: note.created_at,
    });
    c.written(T.notes, note.id, "", "notes", noteId);
    loaded.add(note.id);
    fittedItems.forEach((item, position) => {
      const role = `item:${position}`;
      const itemId = v2Id(T.notes, note.id, role);
      itemRows.push({
        id: itemId,
        userId: refs.userId,
        noteId,
        text: item.text,
        isCompleted: item.isCompleted,
        position,
        createdAt: note.created_at,
      });
      c.idMap.push({
        v1Table: T.notes,
        v1Id: note.id,
        role,
        v2Table: "note_items",
        v2Id: itemId,
        v1UserId: x.user.id,
      });
    });
  }
  return { notes: noteRows, items: itemRows, loaded };
}

function convertAttachments(
  x: ExtractedUser,
  refs: CatalogRefs,
  txByV1: Map<string, string>,
  loadedNotes: Set<string>,
  c: Collector,
): {
  attachments: Record<string, unknown>[];
  transactionLinks: Record<string, unknown>[];
  noteLinks: Record<string, unknown>[];
} {
  const attachmentRows: Record<string, unknown>[] = [];
  const loaded = new Set<string>();
  c.read(T.attachments, x.attachments.length);

  for (const attachment of x.attachments) {
    if (attachment.user_id !== x.user.id) {
      c.report(
        "reference.dangling",
        "blocker",
        T.attachments,
        attachment.id,
        "attachment owned by another user",
        { column: "user_id" },
        DROP,
      );
      c.skipped(T.attachments, "reference.dangling");
      continue;
    }
    const fileName = c.fit(
      T.attachments,
      attachment.id,
      "file_name",
      attachment.nome_arquivo,
      limitOf(attachments.fileName),
    );
    const mimeType = c.fit(
      T.attachments,
      attachment.id,
      "mime_type",
      attachment.mime_type,
      limitOf(attachments.mimeType),
    );
    if (fileName === null || mimeType === null) {
      c.skipped(T.attachments, "text.too-long");
      continue;
    }
    const id = v2Id(T.attachments, attachment.id);
    attachmentRows.push({
      id,
      userId: refs.userId,
      fileKey: attachment.chave_arquivo,
      fileName,
      fileSize: attachment.tamanho_bytes,
      mimeType,
      createdAt: attachment.created_at,
    });
    c.written(T.attachments, attachment.id, "", "attachments", id);
    loaded.add(attachment.id);
  }

  const owned = new Set(x.attachments.map((attachment) => attachment.id));
  const link = (
    v1Table: string,
    parentId: string,
    anexoId: string,
    parentV2Id: string | null,
    v2Table: string,
    build: (parent: string, attachment: string) => Record<string, unknown>,
    out: Record<string, unknown>[],
  ) => {
    const v1Id = `${parentId}:${anexoId}`;
    if (!owned.has(anexoId)) {
      c.report(
        "reference.dangling",
        "blocker",
        v1Table,
        v1Id,
        "attachment missing or owned by another user",
        { column: "anexo_id" },
        DROP,
      );
      c.skipped(v1Table, "reference.dangling");
      return;
    }
    if (!loaded.has(anexoId)) {
      c.skipped(v1Table, "attachment-not-loaded");
      return;
    }
    if (parentV2Id === null) {
      c.skipped(v1Table, "parent-not-loaded");
      return;
    }
    const attachmentId = v2Id(T.attachments, anexoId);
    out.push(build(parentV2Id, attachmentId));
    c.written(v1Table, v1Id, "", v2Table, `${parentV2Id}:${attachmentId}`);
  };

  const transactionLinks: Record<string, unknown>[] = [];
  c.read(T.transactionAttachments, x.transactionAttachments.length);
  for (const row of x.transactionAttachments) {
    link(
      T.transactionAttachments,
      row.lancamento_id,
      row.anexo_id,
      txByV1.get(row.lancamento_id) ?? null,
      "transaction_attachments",
      (transactionId, attachmentId) => ({ userId: refs.userId, transactionId, attachmentId }),
      transactionLinks,
    );
  }

  const noteLinks: Record<string, unknown>[] = [];
  c.read(T.noteAttachments, x.noteAttachments.length);
  for (const row of x.noteAttachments) {
    link(
      T.noteAttachments,
      row.anotacao_id,
      row.anexo_id,
      loadedNotes.has(row.anotacao_id) ? v2Id(T.notes, row.anotacao_id) : null,
      "note_attachments",
      (noteId, attachmentId) => ({ userId: refs.userId, noteId, attachmentId }),
      noteLinks,
    );
  }

  return { attachments: attachmentRows, transactionLinks, noteLinks };
}

function convertTripLinks(
  x: ExtractedUser,
  refs: CatalogRefs,
  txByV1: Map<string, string>,
  c: Collector,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const tx of x.transactions) {
    if (tx.viagem_id === null || CONDITION_MAP[tx.condicao] === "recurring") continue;
    const transactionId = txByV1.get(tx.id);
    if (transactionId === undefined) continue;
    const tripId = refs.tripByV1.get(tx.viagem_id);
    if (tripId === undefined) {
      c.report(
        "reference.dangling",
        "blocker",
        T.transactions,
        tx.id,
        "trip missing or owned by another user",
        { column: "viagem_id" },
        ["drop", "null-reference"],
      );
      continue;
    }
    rows.push({ transactionId, userId: refs.userId, tripId });
    c.idMap.push({
      v1Table: T.transactions,
      v1Id: tx.id,
      role: "trip",
      v2Table: "transaction_trips",
      v2Id: transactionId,
      v1UserId: x.user.id,
    });
  }
  return rows;
}

function convertBudgets(
  x: ExtractedUser,
  refs: CatalogRefs,
  c: Collector,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  c.read(T.budgets, x.budgets.length);
  for (const budget of x.budgets) {
    if (budget.categoria_id === null) {
      c.report(
        "budget.without-category",
        "blocker",
        T.budgets,
        budget.id,
        "budget without category",
        {},
        DROP,
      );
      c.skipped(T.budgets, "budget.without-category");
      continue;
    }
    const categoryId = refs.categoryByV1.get(budget.categoria_id);
    if (categoryId === undefined) {
      c.report(
        "reference.dangling",
        "blocker",
        T.budgets,
        budget.id,
        "category missing or owned by another user",
        { column: "categoria_id" },
        DROP,
      );
      c.skipped(T.budgets, "reference.dangling");
      continue;
    }
    if (!(Number(budget.valor) > 0)) {
      c.report(
        "budget.non-positive-amount",
        "blocker",
        T.budgets,
        budget.id,
        "budget amount is not positive",
        {},
        DROP,
      );
      c.skipped(T.budgets, "budget.non-positive-amount");
      continue;
    }
    if (!isCalendarPeriod(budget.periodo)) {
      c.report(
        "budget.invalid-period",
        "blocker",
        T.budgets,
        budget.id,
        "budget period is not YYYY-MM",
        { period: budget.periodo },
        DROP,
      );
      c.skipped(T.budgets, "budget.invalid-period");
      continue;
    }
    const id = v2Id(T.budgets, budget.id);
    rows.push({
      id,
      userId: refs.userId,
      categoryId,
      period: budget.periodo,
      amount: budget.valor,
      createdAt: budget.created_at,
    });
    c.written(T.budgets, budget.id, "", "budgets", id);
  }
  return rows;
}

// Same payload and SHA-256 construction as `buildInboxItemDraft` in apps/api/src/services/inbox.service.ts.
function inboxFingerprint(item: {
  sourceApp: string;
  sourceAppName: string | null;
  originalTitle: string | null;
  originalText: string;
  notificationTimestamp: Date;
  parsedName: string | null;
  parsedAmount: number | null;
}): string {
  const normalized = {
    sourceApp: item.sourceApp,
    sourceAppName: item.sourceAppName,
    originalTitle: item.originalTitle,
    originalText: item.originalText,
    notificationTimestamp: item.notificationTimestamp.toISOString(),
    parsedName: item.parsedName,
    parsedAmount: item.parsedAmount,
  };
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

function convertInboxItem(
  item: V1InboxItem,
  refs: CatalogRefs,
  txByV1: Map<string, string>,
  c: Collector,
): Record<string, unknown> | null {
  const sourceApp = item.source_app.trim();
  const originalText = normalizeInboxSingleLine(item.original_text);
  if (sourceApp === "" || originalText === "") {
    c.report(
      "inbox.missing-identity",
      "blocker",
      T.inbox,
      item.id,
      "inbox item without source app or text",
      {},
      DROP,
    );
    c.skipped(T.inbox, "inbox.missing-identity");
    return null;
  }

  let parsedAmount = item.parsed_amount === null ? null : Number(item.parsed_amount);
  if (parsedAmount !== null && !(parsedAmount > 0)) {
    const chosen = c.report(
      "inbox.non-positive-amount",
      "blocker",
      T.inbox,
      item.id,
      "inbox amount is not positive",
      {},
      ["drop", "null-amount"],
    );
    if (chosen !== "null-amount") {
      c.skipped(T.inbox, "inbox.non-positive-amount");
      return null;
    }
    parsedAmount = null;
  }

  const single = (value: string | null) => (value ? normalizeInboxSingleLine(value) : null);
  const fitOptional = (column: string, value: string | null, limit: number) =>
    value === null ? { value: null } : { value: c.fit(T.inbox, item.id, column, value, limit) };
  const fittedSourceApp = c.fit(
    T.inbox,
    item.id,
    "source_app",
    sourceApp,
    limitOf(inboxItems.sourceApp),
  );
  const sourceAppName = fitOptional(
    "source_app_name",
    single(item.source_app_name),
    limitOf(inboxItems.sourceAppName),
  );
  const originalTitle = fitOptional(
    "original_title",
    single(item.original_title),
    limitOf(inboxItems.originalTitle),
  );
  const parsedName = fitOptional(
    "parsed_name",
    single(item.parsed_name),
    limitOf(inboxItems.parsedName),
  );
  if (
    fittedSourceApp === null ||
    (sourceAppName.value === null && item.source_app_name) ||
    (originalTitle.value === null && item.original_title) ||
    (parsedName.value === null && item.parsed_name)
  ) {
    c.skipped(T.inbox, "text.too-long");
    return null;
  }

  const payload = {
    sourceApp: fittedSourceApp,
    sourceAppName: sourceAppName.value,
    originalTitle: originalTitle.value,
    originalText,
    notificationTimestamp: item.notification_timestamp,
    parsedName: parsedName.value,
    parsedAmount,
  };
  const transactionId =
    item.status === "processed" && item.lancamento_id !== null
      ? (txByV1.get(item.lancamento_id) ?? null)
      : null;
  const id = v2Id(T.inbox, item.id);
  c.written(T.inbox, item.id, "", "inbox_items", id);
  return {
    id,
    userId: refs.userId,
    deviceTokenId: null,
    ...payload,
    parsedAmount: parsedAmount === null ? null : parsedAmount.toFixed(2),
    clientId: `v1:${item.id}`,
    payloadFingerprint: inboxFingerprint(payload),
    status: item.status,
    transactionId,
    processedAt: item.processed_at,
    discardedAt: item.discarded_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function convertNotificationStates(
  x: ExtractedUser,
  refs: CatalogRefs,
  c: Collector,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  c.read(T.notificationStates, x.notificationStates.length);
  for (const state of x.notificationStates) {
    const v1Id = state.notification_key;
    const notificationKey = c.fit(
      T.notificationStates,
      v1Id,
      "notification_key",
      state.notification_key,
      limitOf(notificationStates.notificationKey),
    );
    const fingerprint = c.fit(
      T.notificationStates,
      v1Id,
      "fingerprint",
      state.fingerprint,
      limitOf(notificationStates.fingerprint),
    );
    if (notificationKey === null || fingerprint === null) {
      c.skipped(T.notificationStates, "text.too-long");
      continue;
    }
    rows.push({
      userId: refs.userId,
      notificationKey,
      fingerprint,
      readAt: state.read_at,
      archivedAt: state.archived_at,
      createdAt: state.created_at,
      updatedAt: state.updated_at,
    });
    c.written(
      T.notificationStates,
      v1Id,
      "",
      "notification_states",
      `${refs.userId}:${notificationKey}`,
    );
  }
  return rows;
}

function convertLogos(
  x: ExtractedUser,
  refs: CatalogRefs,
  c: Collector,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  c.read(T.logos, x.logos.length);
  for (const logo of x.logos) {
    const v1Id = logo.name_key;
    const nameKey = c.fit(
      T.logos,
      v1Id,
      "name_key",
      logo.name_key,
      limitOf(establishmentLogos.nameKey),
    );
    const domain = c.fit(T.logos, v1Id, "domain", logo.domain, limitOf(establishmentLogos.domain));
    if (nameKey === null || domain === null) {
      c.skipped(T.logos, "text.too-long");
      continue;
    }
    rows.push({ userId: refs.userId, nameKey, domain, updatedAt: logo.updated_at });
    c.written(T.logos, v1Id, "", "establishment_logos", `${refs.userId}:${nameKey}`);
  }
  return rows;
}

export function convertSideData(
  x: ExtractedUser,
  refs: CatalogRefs,
  txByV1: Map<string, string>,
  r: Resolved,
): ConversionResult {
  const c = new Collector(x.user.id, r);
  const tripLinks = convertTripLinks(x, refs, txByV1, c);
  const noteData = convertNotes(x, refs, c);
  const attachmentData = convertAttachments(x, refs, txByV1, noteData.loaded, c);
  const budgetRows = convertBudgets(x, refs, c);
  c.read(T.inbox, x.inboxItems.length);
  const inboxRows = x.inboxItems
    .map((item) => convertInboxItem(item, refs, txByV1, c))
    .filter((row): row is Record<string, unknown> => row !== null);
  const stateRows = convertNotificationStates(x, refs, c);
  const logoRows = convertLogos(x, refs, c);

  // FK order: attachments and notes before the link tables that reference them.
  const batches: InsertBatch[] = [
    { table: "transactionTrips", rows: tripLinks },
    { table: "attachments", rows: attachmentData.attachments },
    { table: "transactionAttachments", rows: attachmentData.transactionLinks },
    { table: "notes", rows: noteData.notes },
    { table: "noteItems", rows: noteData.items },
    { table: "noteAttachments", rows: attachmentData.noteLinks },
    { table: "budgets", rows: budgetRows },
    { table: "inboxItems", rows: inboxRows },
    { table: "notificationStates", rows: stateRows },
    { table: "establishmentLogos", rows: logoRows },
  ].filter((batch) => batch.rows.length > 0);

  return { batches, idMap: c.idMap, counts: c.tableCounts(), findings: c.findings };
}

// Import mappings (data-model rows 22 and 23). The key is copied verbatim: the validator owns
// `mapping.key-not-normalized`, so it is not re-emitted here.
export function convertImportMappings(
  x: ExtractedUser,
  refs: CatalogRefs,
  r: Resolved,
): ConversionResult {
  const c = new Collector(x.user.id, r);
  const categoryRows = convertCategoryMappings(x, refs, c);
  const nameRows = convertNameMappings(x, refs, c);
  const batches: InsertBatch[] = [
    { table: "importCategoryMappings", rows: categoryRows },
    { table: "importNameMappings", rows: nameRows },
  ].filter((batch) => batch.rows.length > 0);
  return { batches, idMap: c.idMap, counts: c.tableCounts(), findings: c.findings };
}

function convertCategoryMappings(
  x: ExtractedUser,
  refs: CatalogRefs,
  c: Collector,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  c.read(T.categoryMappings, x.categoryMappings.length);
  for (const mapping of x.categoryMappings) {
    const v1Id = mapping.description_key;
    const categoryId =
      mapping.subcategory_id === null
        ? refs.categoryByV1.get(mapping.category_id)
        : refs.childBySubcategory.get(mapping.subcategory_id);
    if (categoryId === undefined) {
      c.report(
        "reference.dangling",
        "blocker",
        T.categoryMappings,
        v1Id,
        "mapped category missing or owned by another user",
        { column: mapping.subcategory_id === null ? "category_id" : "subcategory_id" },
        DROP,
      );
      c.skipped(T.categoryMappings, "reference.dangling");
      continue;
    }
    const descriptionKey = c.fit(
      T.categoryMappings,
      v1Id,
      "description_key",
      mapping.description_key,
      limitOf(importCategoryMappings.descriptionKey),
    );
    if (descriptionKey === null) {
      c.skipped(T.categoryMappings, "text.too-long");
      continue;
    }
    rows.push({
      userId: refs.userId,
      descriptionKey,
      categoryId,
      updatedAt: mapping.updated_at,
    });
    c.written(
      T.categoryMappings,
      v1Id,
      "",
      "import_category_mappings",
      `${refs.userId}:${descriptionKey}`,
    );
  }
  return rows;
}

function convertNameMappings(
  x: ExtractedUser,
  refs: CatalogRefs,
  c: Collector,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  c.read(T.nameMappings, x.nameMappings.length);
  for (const mapping of x.nameMappings) {
    const v1Id = mapping.description_key;
    const descriptionKey = c.fit(
      T.nameMappings,
      v1Id,
      "description_key",
      mapping.description_key,
      limitOf(importNameMappings.descriptionKey),
    );
    const name = c.fit(
      T.nameMappings,
      v1Id,
      "name",
      mapping.name,
      limitOf(importNameMappings.name),
    );
    if (descriptionKey === null || name === null) {
      c.skipped(T.nameMappings, "text.too-long");
      continue;
    }
    rows.push({ userId: refs.userId, descriptionKey, name, updatedAt: mapping.updated_at });
    c.written(T.nameMappings, v1Id, "", "import_name_mappings", `${refs.userId}:${descriptionKey}`);
  }
  return rows;
}
