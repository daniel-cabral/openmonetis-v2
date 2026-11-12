import {
  type CategoryCreateDraft,
  type CategoryType,
  createCategoryDraft,
  createDefaultCategoryDrafts,
} from "@openmonetis/domain/categories";
import { normalizeDashboardWidgetPreferences } from "@openmonetis/domain/dashboard";
import { normalizeUserPreferences } from "@openmonetis/domain/preferences";
import { v2Id } from "../ids";
import type {
  ExtractedUser,
  Finding,
  IdMapRow,
  InsertBatch,
  Resolutions,
  Severity,
  TableCount,
} from "../types";
import { CATEGORY_TYPE_MAP, mapAccountType, mapCardBrand, PERSON_STATUS_MAP } from "./amounts";

export type CatalogRefs = {
  userId: string;
  adminPersonId: string;
  personByPayer: Map<string, string>;
  categoryByV1: Map<string, string>;
  childBySubcategory: Map<string, string>;
  accountByV1: Map<string, string>;
  cardByV1: Map<string, { id: string; closingDay: number; dueDay: number }>;
  tripByV1: Map<string, string>;
  systemCategory: (name: string, type: "income" | "expense") => string;
};

export type CatalogResult = {
  batches: InsertBatch[];
  idMap: IdMapRow[];
  counts: TableCount[];
  findings: Finding[];
  refs: CatalogRefs;
};

const ADMIN_PAYER_ROLE = "admin";
const SEPARATE_ROOT_RESOLUTION = "separate-root";
const SEPARATE_ROOT_SUFFIX = " (V1)";
const TRIP_NAME_MAX = 60;
const TRIP_NOTE_MAX = 500;
const PAYER_DROPPED_COLUMNS = ["share_code", "is_auto_send", "last_mail"];

type Row = Record<string, unknown>;

export function convertCatalog(x: ExtractedUser, r: Resolutions["resolutions"]): CatalogResult {
  const v1UserId = x.user.id;
  const userId = v2Id("user", v1UserId);
  const findings: Finding[] = [];
  const idMap: IdMapRow[] = [];
  const counts: TableCount[] = [];
  const map = (v1Table: string, v1Id: string, v2Table: string, v2: string, role = "") =>
    idMap.push({ v1Table, v1Id, role, v2Table, v2Id: v2, v1UserId });
  const finding = (
    rule: string,
    severity: Severity,
    table: string,
    v1Id: string,
    reason: string,
    resolutions: string[] = [],
    context: Finding["context"] = {},
  ) =>
    findings.push({
      rule,
      severity,
      table,
      v1Id,
      v1UserId,
      reason,
      context,
      resolutions,
      resolutionKey: `${rule}:${table}:${v1Id}`,
    });

  // 1. user
  const userRows: Row[] = [
    {
      id: userId,
      name: x.user.name,
      email: x.user.email,
      emailVerified: x.user.emailVerified,
      image: x.user.image,
      createdAt: x.user.createdAt,
      updatedAt: x.user.updatedAt,
    },
  ];
  map("user", v1UserId, "user", userId);
  counts.push(tableCount("user", 1, 1));

  // 4. people
  const adminPayerId = resolveAdminPayer(x, r, finding);
  const personByPayer = new Map<string, string>();
  const peopleRows: Row[] = [];
  for (const payer of x.payers) {
    const id = v2Id("pagadores", payer.id);
    const name = resolvePayerName(payer.id, payer.nome, r, finding);
    personByPayer.set(payer.id, id);
    peopleRows.push({
      id,
      userId,
      name,
      email: payer.email,
      avatarUrl: payer.avatar_url,
      role: payer.id === adminPayerId ? "admin" : "external",
      status: PERSON_STATUS_MAP[payer.status] ?? "active",
      note: payer.anotacao,
      createdAt: payer.created_at,
    });
    map("pagadores", payer.id, "people", id);
  }
  counts.push({
    ...tableCount("pagadores", x.payers.length, peopleRows.length),
    droppedColumns: x.payers.length
      ? PAYER_DROPPED_COLUMNS.map((column) => ({ column, rows: x.payers.length }))
      : [],
  });
  const adminPersonId = adminPayerId ? v2Id("pagadores", adminPayerId) : "";

  // 5. categories
  const categories = convertCategories(x, userId, r, finding, map);
  counts.push(...categories.counts);

  // 6. financial accounts
  const accountByV1 = new Map<string, string>();
  const accountRows: Row[] = x.financialAccounts.map((account) => {
    const id = v2Id("contas", account.id);
    const mapped = mapAccountType(account.tipo_conta);
    if (mapped.unknown) {
      finding(
        "account.unknown-type",
        "fixable",
        "contas",
        account.id,
        "account type outside the V1 list, loaded as other",
        [],
        { value: account.tipo_conta },
      );
    }
    accountByV1.set(account.id, id);
    map("contas", account.id, "financial_accounts", id);
    return {
      id,
      userId,
      name: account.nome,
      type: mapped.type,
      logo: account.logo,
      note: account.anotacao,
      excludeFromBalance: account.excluir_do_saldo,
      isArchived: PERSON_STATUS_MAP[account.status] === "inactive",
      createdAt: account.created_at,
    };
  });
  counts.push(tableCount("contas", x.financialAccounts.length, accountRows.length));

  // 7. cards
  const cardByV1 = new Map<string, { id: string; closingDay: number; dueDay: number }>();
  const cardRows: Row[] = [];
  for (const card of x.cards) {
    const id = v2Id("cartoes", card.id);
    const closingDay = parseDay(card.dt_fechamento);
    const dueDay = parseDay(card.dt_vencimento);
    if (closingDay === null || dueDay === null) {
      finding(
        "card.day-out-of-range",
        "blocker",
        "cartoes",
        card.id,
        "closing or due day is not 1 to 31",
        [],
        {
          closingDay: card.dt_fechamento,
          dueDay: card.dt_vencimento,
        },
      );
      continue;
    }
    const brand = mapCardBrand(card.bandeira);
    if (brand.unknown) {
      finding(
        "card.unknown-brand",
        "fixable",
        "cartoes",
        card.id,
        "unknown card brand, loaded as other",
        [],
        {
          value: card.bandeira,
        },
      );
    }
    cardByV1.set(card.id, { id, closingDay, dueDay });
    map("cartoes", card.id, "cards", id);
    cardRows.push({
      id,
      userId,
      accountId: accountByV1.get(card.conta_id) ?? null,
      name: card.nome,
      brand: brand.brand,
      closingDayPurchasesNextInvoice: true,
      status: PERSON_STATUS_MAP[card.status] ?? "active",
      closingRuleType: "fixedDay",
      closingDay,
      dueDay,
      limit: card.limite,
      logo: card.logo,
      note: card.anotacao,
      createdAt: card.created_at,
    });
  }
  counts.push(
    tableCount("cartoes", x.cards.length, cardRows.length, [
      { reason: "card.day-out-of-range", rows: x.cards.length - cardRows.length },
    ]),
  );

  // 8. trips (never truncated)
  const tripByV1 = new Map<string, string>();
  const tripRows: Row[] = [];
  for (const trip of x.trips) {
    if (trip.nome.length > TRIP_NAME_MAX || (trip.anotacao?.length ?? 0) > TRIP_NOTE_MAX) {
      finding(
        "trip.length",
        "blocker",
        "viagens",
        trip.id,
        "trip name over 60 or note over 500 characters",
        [],
        {
          nameLength: trip.nome.length,
          noteLength: trip.anotacao?.length ?? 0,
        },
      );
      continue;
    }
    const id = v2Id("viagens", trip.id);
    tripByV1.set(trip.id, id);
    map("viagens", trip.id, "trips", id);
    tripRows.push({
      id,
      userId,
      name: trip.nome,
      startDate: toDate(trip.data_inicio),
      endDate: toDate(trip.data_fim),
      note: trip.anotacao,
      createdAt: trip.created_at,
    });
  }
  counts.push(
    tableCount("viagens", x.trips.length, tripRows.length, [
      { reason: "trip.length", rows: x.trips.length - tripRows.length },
    ]),
  );

  // 9. preferences (V2 defaults when V1 has no row)
  const prefs = x.preferences;
  const userPreferences = normalizeUserPreferences(
    prefs && {
      transactionNoteAsColumn: prefs.extrato_note_as_column,
      transactionsColumnOrder: Array.isArray(prefs.lancamentos_column_order)
        ? (prefs.lancamentos_column_order as string[])
        : null,
      attachmentMaxSizeMb: prefs.attachment_max_size_mb,
      showTransactionSummary: prefs.mostrar_resumo_lancamento,
      groupTransactionsByDate: prefs.agrupar_lancamentos_por_data,
      hideAnticipatedInstallments: prefs.ocultar_parcelas_antecipadas,
    },
  );
  const dashboard = normalizeDashboardWidgetPreferences(
    toWidgetPreferences(prefs?.dashboard_widgets),
  );
  if (prefs) {
    map("preferencias_usuario", v1UserId, "user_preferences", userId);
    map("preferencias_usuario", v1UserId, "dashboard_preferences", userId, "dashboard");
  }
  counts.push(tableCount("preferencias_usuario", prefs ? 1 : 0, prefs ? 1 : 0));

  const refs: CatalogRefs = {
    userId,
    adminPersonId,
    personByPayer,
    categoryByV1: categories.categoryByV1,
    childBySubcategory: categories.childBySubcategory,
    accountByV1,
    cardByV1,
    tripByV1,
    systemCategory: categories.systemCategory,
  };

  return {
    batches: [
      { table: "user", rows: userRows },
      { table: "people", rows: peopleRows },
      { table: "categories", rows: categories.rows },
      { table: "financialAccounts", rows: accountRows },
      { table: "cards", rows: cardRows },
      { table: "trips", rows: tripRows },
      { table: "userPreferences", rows: [{ userId, ...userPreferences }] },
      {
        table: "dashboardPreferences",
        rows: [{ userId, widgetOrder: dashboard.order, hiddenWidgets: dashboard.hidden }],
      },
    ],
    idMap,
    counts,
    findings,
    refs,
  };
}

type AddFinding = (
  rule: string,
  severity: Severity,
  table: string,
  v1Id: string,
  reason: string,
  resolutions?: string[],
  context?: Finding["context"],
) => void;

type AddMap = (v1Table: string, v1Id: string, v2Table: string, v2: string, role?: string) => void;

function resolveAdminPayer(
  x: ExtractedUser,
  r: Resolutions["resolutions"],
  finding: AddFinding,
): string | null {
  const admins = x.payers.filter((payer) => payer.role === ADMIN_PAYER_ROLE);
  if (admins.length === 1) return admins[0].id;

  const resolution = r[`people.admin-cardinality:pagadores:${x.user.id}`];
  const chosen = resolution?.startsWith("admin:") ? resolution.slice("admin:".length) : null;
  if (chosen && x.payers.some((payer) => payer.id === chosen)) return chosen;

  finding(
    "people.admin-cardinality",
    "blocker",
    "pagadores",
    x.user.id,
    "user does not have exactly one admin payer",
    x.payers.map((payer) => `admin:${payer.id}`),
    { admins: admins.length },
  );
  return admins[0]?.id ?? null;
}

function resolvePayerName(
  payerId: string,
  name: string,
  r: Resolutions["resolutions"],
  finding: AddFinding,
): string {
  if (name.trim() !== "") return name;
  const resolution = r[`people.blank-name:pagadores:${payerId}`];
  if (resolution?.startsWith("rename:") && resolution.slice("rename:".length).trim() !== "") {
    return resolution.slice("rename:".length);
  }
  finding("people.blank-name", "blocker", "pagadores", payerId, "payer name is blank", [
    "rename:<text>",
  ]);
  return name;
}

function convertCategories(
  x: ExtractedUser,
  userId: string,
  r: Resolutions["resolutions"],
  finding: AddFinding,
  map: AddMap,
) {
  const v1UserId = x.user.id;
  const rootRows: Row[] = [];
  const childRows: Row[] = [];
  const rootByKey = new Map<string, { id: string; isSystem: boolean }>();
  const categoryByV1 = new Map<string, string>();
  const childBySubcategory = new Map<string, string>();
  const typeByCategoryId = new Map<string, CategoryType>();
  const key = (type: CategoryType, name: string) => `${type}:${name.trim()}`;
  const pushRow = (target: Row[], id: string, draft: CategoryCreateDraft, createdAt: Date) => {
    target.push({ id, ...draft, parentId: draft.parentId ?? null, createdAt });
    typeByCategoryId.set(id, draft.type);
  };

  for (const draft of createDefaultCategoryDrafts(userId)) {
    const id = v2Id("user", v1UserId, `category:${draft.type}:${draft.name}`);
    pushRow(rootRows, id, draft, x.user.createdAt);
    rootByKey.set(key(draft.type, draft.name), { id, isSystem: draft.isSystem });
  }

  const parentsWithChildren = new Set(x.subcategories.map((sub) => sub.categoria_id));
  let created = 0;
  let merged = 0;
  for (const category of x.categories) {
    const type = CATEGORY_TYPE_MAP[category.tipo];
    if (!type) throw new Error(`Unknown V1 category type in categorias ${category.id}`);
    const existing = rootByKey.get(key(type, category.nome));
    const hasChildren = parentsWithChildren.has(category.id);

    if (existing && !(existing.isSystem && hasChildren)) {
      finding(
        "category.name-collision",
        "fixable",
        "categorias",
        category.id,
        "category merged onto the existing category with the same name and type",
      );
      categoryByV1.set(category.id, existing.id);
      typeByCategoryId.set(existing.id, type);
      map("categorias", category.id, "categories", existing.id);
      merged++;
      continue;
    }

    let name = category.nome;
    if (existing) {
      // V2 forbids a system category as parent: the V1 parent becomes a separate root.
      if (r[`category.system-parent:categorias:${category.id}`] !== SEPARATE_ROOT_RESOLUTION) {
        finding(
          "category.system-parent",
          "blocker",
          "categorias",
          category.id,
          "category with subcategories merges onto a V2 system category",
          [SEPARATE_ROOT_RESOLUTION],
        );
      }
      name = `${category.nome.trim()}${SEPARATE_ROOT_SUFFIX}`;
    }
    const id = v2Id("categorias", category.id);
    pushRow(
      rootRows,
      id,
      createCategoryDraft({ userId, name, type, icon: category.icone }),
      category.created_at,
    );
    rootByKey.set(key(type, name), { id, isSystem: false });
    categoryByV1.set(category.id, id);
    map("categorias", category.id, "categories", id);
    created++;
  }
  const counts: TableCount[] = [
    { ...tableCount("categorias", x.categories.length, created), merged },
  ];

  const childByKey = new Map<string, string>();
  let childCreated = 0;
  let childMerged = 0;
  for (const sub of x.subcategories) {
    const parentId = categoryByV1.get(sub.categoria_id);
    const type = parentId ? typeByCategoryId.get(parentId) : undefined;
    if (!parentId || !type) continue; // dangling parent: reported by reference.dangling
    const childKey = `${parentId}:${sub.nome.trim()}`;
    const existing = childByKey.get(childKey);
    if (existing) {
      finding(
        "category.name-collision",
        "fixable",
        "subcategorias",
        sub.id,
        "subcategory merged onto the sibling with the same name",
      );
      childBySubcategory.set(sub.id, existing);
      map("subcategorias", sub.id, "categories", existing);
      childMerged++;
      continue;
    }
    const id = v2Id("subcategorias", sub.id);
    pushRow(
      childRows,
      id,
      { ...createCategoryDraft({ userId, name: sub.nome, type, icon: null }), parentId },
      sub.created_at,
    );
    childByKey.set(childKey, id);
    childBySubcategory.set(sub.id, id);
    map("subcategorias", sub.id, "categories", id);
    childCreated++;
  }
  counts.push({
    ...tableCount("subcategorias", x.subcategories.length, childCreated),
    merged: childMerged,
    skipped: nonZero([
      {
        reason: "reference.dangling",
        rows: x.subcategories.length - childCreated - childMerged,
      },
    ]),
  });

  const systemCategory = (name: string, type: "income" | "expense") => {
    const root = rootByKey.get(key(type, name));
    if (!root?.isSystem) throw new Error(`V2 system category not seeded: ${type}:${name}`);
    return root.id;
  };

  return {
    rows: [...rootRows, ...childRows],
    counts,
    categoryByV1,
    childBySubcategory,
    systemCategory,
  };
}

function tableCount(
  v1Table: string,
  read: number,
  written: number,
  skipped: { reason: string; rows: number }[] = [],
): TableCount {
  return {
    v1Table,
    read,
    written,
    merged: 0,
    skipped: nonZero(skipped),
    collapsed: [],
    detached: [],
    droppedColumns: [],
  };
}

function nonZero(items: { reason: string; rows: number }[]) {
  return items.filter((item) => item.rows > 0);
}

function parseDay(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const day = Number(value.trim());
  return day >= 1 && day <= 31 ? day : null;
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toWidgetPreferences(value: unknown): { order: string[]; hidden: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const { order, hidden } = value as { order?: unknown; hidden?: unknown };
  return {
    order: Array.isArray(order) ? order.filter((id) => typeof id === "string") : [],
    hidden: Array.isArray(hidden) ? hidden.filter((id) => typeof id === "string") : [],
  };
}
