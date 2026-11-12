import { CONDITION_MAP } from "../conversions/amounts";
import { convertCatalog } from "../conversions/catalog";
import { convertInstallments } from "../conversions/installments";
import { convertInvoices } from "../conversions/markers";
import { convertRecurrence } from "../conversions/recurrence";
import { convertSideData } from "../conversions/side-data";
import { convertTransactions } from "../conversions/transactions";
import type {
  ExtractedUser,
  Finding,
  IdMapRow,
  InformationalItem,
  InsertBatch,
  PlanResult,
  RepairList,
  Resolutions,
  TableCount,
  V1Transaction,
} from "../types";

const TRANSACTIONS_TABLE = "lancamentos";
// Anticipations reference their V1 adjustment row (a single), so they are written after the
// singles (data-model row 15 after row 12), not with the installment series (row 10).
const ANTICIPATION_TABLES = new Set(["installmentAnticipations", "installmentAnticipationItems"]);

export function planUser(
  x: ExtractedUser,
  r: Resolutions | null,
  // v1RpId and targetRpId are consumed by convertCredentials (T038).
  _opts: { v1RpId: string | null; targetRpId: string },
): PlanResult {
  const resolved = r?.resolutions ?? {};
  const findings: Finding[] = [];
  const unresolvedOf = () =>
    findings.filter(
      (finding) => finding.severity === "blocker" && resolved[finding.resolutionKey] === undefined,
    );

  // Rows 1, 4 to 9. Later conversions need its refs, so stop here on an unresolved blocker.
  const catalog = convertCatalog(x, resolved);
  findings.push(...catalog.findings);
  if (unresolvedOf().length > 0) return { ok: false, unresolved: unresolvedOf() };
  const refs = catalog.refs;

  const recurringRows: V1Transaction[] = [];
  const installmentRows: V1Transaction[] = [];
  const singleRows: V1Transaction[] = [];
  for (const row of x.transactions) {
    const condition = CONDITION_MAP[row.condicao];
    if (condition === "recurring") recurringRows.push(row);
    else if (condition === "installment") installmentRows.push(row);
    else singleRows.push(row);
  }

  const recurrence = convertRecurrence(recurringRows, refs, resolved); // row 11
  const installments = convertInstallments(installmentRows, x.anticipations, refs); // rows 10, 15
  const singles = [...singleRows, ...recurrence.detached];
  const transactions = convertTransactions(singles, x, refs, resolved); // rows 12, 13
  const invoices = convertInvoices(x.invoices, singles, refs); // row 14

  const idMap: IdMapRow[] = [
    ...catalog.idMap,
    ...installments.idMap,
    ...recurrence.idMap,
    ...transactions.idMap,
    ...invoices.idMap,
  ];
  const txByV1 = new Map(
    idMap
      .filter(
        (row) =>
          row.v1Table === TRANSACTIONS_TABLE && row.v2Table === "transactions" && row.role === "",
      )
      .map((row) => [row.v1Id, row.v2Id]),
  );
  const sideData = convertSideData(x, refs, txByV1, resolved); // rows 16 to 21
  idMap.push(...sideData.idMap);

  findings.push(
    ...recurrence.findings,
    ...installments.findings,
    ...transactions.findings,
    ...invoices.findings,
    ...sideData.findings,
  );
  const unresolved = unresolvedOf();
  if (unresolved.length > 0) return { ok: false, unresolved };

  const batches: InsertBatch[] = [
    ...catalog.batches,
    ...installments.batches.filter((batch) => !ANTICIPATION_TABLES.has(batch.table)),
    ...recurrence.batches,
    ...transactions.batches,
    ...invoices.batches,
    ...installments.batches.filter((batch) => ANTICIPATION_TABLES.has(batch.table)),
    ...sideData.batches,
  ].filter((batch) => batch.rows.length > 0);

  const detachedRows = recurrence.detached.length;
  const counts = mergeCounts([
    ...catalog.counts,
    ...installments.counts,
    ...recurrence.counts,
    ...transactions.counts,
    ...sideData.counts,
  ]).map((count) =>
    // Detached recurrence rows are read by both convertRecurrence and convertTransactions: count
    // the read once. They stay in `written` (output-formats "Load output": detached rows count as
    // written); the `detached` list is informational.
    count.v1Table === TRANSACTIONS_TABLE ? { ...count, read: count.read - detachedRows } : count,
  );

  // passwordReset and passkeysNotLoaded come from convertCredentials (T038); they stay empty here.
  const repairList: RepairList = {
    companionRepair:
      x.apiTokens.length > 0
        ? [{ v1UserId: x.user.id, email: x.user.email, tokens: x.apiTokens.length }]
        : [],
    shareReinvite: x.payerShares.map((share) => ({
      ownerEmail: x.user.email,
      personName: x.payers.find((payer) => payer.id === share.pagador_id)?.nome ?? "",
      sharedWithEmail: x.index.emailByUser.get(share.shared_with_user_id) ?? "",
    })),
    passwordReset: [],
    passkeysNotLoaded: [],
  };

  return {
    ok: true,
    plan: {
      v1UserId: x.user.id,
      v2UserId: refs.userId,
      batches,
      idMap,
      counts,
      checksumColumns: checksumColumnsOf(batches),
      appliedRules: tally(
        findings.filter((finding) => finding.severity === "fixable"),
        "rule",
      ).map(({ key, rows }) => ({ rule: key, rows })),
      informational: tally(
        findings.filter((finding) => finding.severity === "informational"),
        "reason",
      ).map(({ key, rows }): InformationalItem => ({ reason: key, rows })),
      repairList,
    },
    findings,
  };
}

function tally(findings: Finding[], field: "rule" | "reason"): { key: string; rows: number }[] {
  const byKey = new Map<string, number>();
  for (const finding of findings) byKey.set(finding[field], (byKey.get(finding[field]) ?? 0) + 1);
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({ key, rows }));
}

// Only the columns every row of a table sets: a column some rows leave to a DB default
// (e.g. `now()`) would make the checksum differ between two loads of the same dump.
function checksumColumnsOf(batches: InsertBatch[]): Record<string, string[]> {
  const columns = new Map<string, Set<string>>();
  for (const batch of batches) {
    for (const row of batch.rows) {
      const keys = Object.keys(row);
      const current = columns.get(batch.table);
      columns.set(
        batch.table,
        current === undefined ? new Set(keys) : new Set(keys.filter((key) => current.has(key))),
      );
    }
  }
  return Object.fromEntries(
    [...columns.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, set]) => [table, [...set].sort()]),
  );
}

// Sums per-table counts by v1Table; also used by the load command to total over users.
export function mergeCounts(counts: TableCount[]): TableCount[] {
  const byTable = new Map<string, TableCount>();
  for (const count of counts) {
    const current = byTable.get(count.v1Table);
    if (current === undefined) {
      byTable.set(count.v1Table, structuredClone(count));
      continue;
    }
    current.read += count.read;
    current.written += count.written;
    current.merged += count.merged;
    current.skipped = mergeBy(current.skipped, count.skipped, (item) => item.reason);
    current.detached = mergeBy(current.detached, count.detached, (item) => item.reason);
    current.droppedColumns = mergeBy(
      current.droppedColumns,
      count.droppedColumns,
      (item) => item.column,
    );
    for (const item of count.collapsed) {
      const same = current.collapsed.find((existing) => existing.reason === item.reason);
      if (same === undefined) current.collapsed.push({ ...item });
      else {
        same.rows += item.rows;
        same.into += item.into;
      }
    }
  }
  return [...byTable.values()].sort((a, b) => a.v1Table.localeCompare(b.v1Table));
}

function mergeBy<T extends { rows: number }>(a: T[], b: T[], key: (item: T) => string): T[] {
  const merged = a.map((item) => ({ ...item }));
  for (const item of b) {
    const same = merged.find((existing) => key(existing) === key(item));
    if (same === undefined) merged.push({ ...item });
    else same.rows += item.rows;
  }
  return merged;
}
