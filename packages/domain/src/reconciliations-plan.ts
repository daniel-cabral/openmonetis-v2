import {
  type assignReconciliationBuckets,
  type LineClassification,
  type ReconciliationEntry,
  type ReconciliationLine,
  type ReconciliationTargetType,
  resolveAmountAlignment,
} from "./reconciliations";
import { getImportedDescriptionKey } from "./transactions";

export type LineDecision = {
  lineIndex: number;
  action: "keep" | "create" | "link" | "ignore" | "skip";
  entryKey?: string;
  name?: string;
  categoryId?: string | null;
  personId?: string;
  ignoreReason?: string;
};

export type EntryRef =
  | { kind: "transaction"; id: string }
  | { kind: "occurrence"; ruleId: string; date: string };

export type ReconciliationPlan = {
  releases: { ref: EntryRef; externalId: string }[];
  creations: {
    lineIndex: number;
    name: string;
    signedCents: number;
    purchaseDate: string;
    period: string;
    categoryId: string | null;
    personId: string;
    externalId: string;
  }[];
  stamps: { ref: EntryRef; externalId: string; lineIndex: number }[];
  alignments: { ref: EntryRef; toCents: number }[]; // entries already settled (account) or card entries
  settlements: { ref: EntryRef; cents: number; date: string }[]; // pending account entries (transfer pairs resolved by the repository)
  ignores: { externalId: string; reason: string }[];
  categoryMappings: { descriptionKey: string; categoryId: string }[]; // unique by key
  nameMappings: { descriptionKey: string; name: string }[]; // unique by key
};

export type ReconciliationPlanErrorCode =
  | "RECONCILIATION_STALE"
  | "RECONCILIATION_NOTHING_TO_APPLY"
  | "RECONCILIATION_EMPTY_NAME";

export class ReconciliationPlanError extends Error {
  constructor(public readonly code: ReconciliationPlanErrorCode) {
    super(code);
  }
}

export type ReconciliationPlanInput = {
  lines: ReconciliationLine[];
  classification: LineClassification[];
  buckets: ReturnType<typeof assignReconciliationBuckets>;
  entries: ReconciliationEntry[];
  decisions: LineDecision[];
  targetType: ReconciliationTargetType;
  invoicePeriod: string | null;
  defaultPersonId: string;
};

type LineAction = {
  line: ReconciliationLine;
  classified: LineClassification;
  decision: LineDecision | undefined;
  kind: LineDecision["action"];
  entry: ReconciliationEntry | null; // only for keep and link
};

function stale(): never {
  throw new ReconciliationPlanError("RECONCILIATION_STALE");
}

export function parseEntryKey(entryKey: string): EntryRef | null {
  if (entryKey.startsWith("t:")) {
    const id = entryKey.slice(2);
    return id ? { kind: "transaction", id } : null;
  }

  if (entryKey.startsWith("o:")) {
    const separator = entryKey.lastIndexOf(":");
    const date = entryKey.slice(separator + 1);
    return separator > 1 && date
      ? { kind: "occurrence", ruleId: entryKey.slice(2, separator), date }
      : null;
  }

  return null;
}

/**
 * Translates the review decisions into the writes the apply will run. Lines
 * without a decision keep their match (matched and needs-decision) or stay
 * out (everything else). Pure on purpose: nothing here touches the database.
 */
export function buildReconciliationPlan(input: ReconciliationPlanInput): ReconciliationPlan {
  const { lines, targetType, invoicePeriod, defaultPersonId } = input;
  const linesByIndex = new Map(lines.map((line) => [line.index, line]));
  const classificationByIndex = new Map(
    input.classification.map((classified) => [classified.lineIndex, classified]),
  );
  const bucketByIndex = new Map(input.buckets.map((assigned) => [assigned.lineIndex, assigned.bucket]));
  const entriesByKey = new Map(input.entries.map((entry) => [entry.entryKey, entry]));
  const decisionByIndex = new Map(input.decisions.map((decision) => [decision.lineIndex, decision]));

  for (const decision of input.decisions) {
    const bucket = bucketByIndex.get(decision.lineIndex);
    if (bucket === undefined || bucket === "ignored" || bucket === "informational") stale();
  }

  const entryOf = (entryKey: string): ReconciliationEntry => entriesByKey.get(entryKey) ?? stale();

  const isLinkable = (line: ReconciliationLine, classified: LineClassification, entryKey: string) => {
    if (classified.status === "ambiguous") return classified.candidateKeys.includes(entryKey);
    if (classified.status === "matched" && classified.entryKey === entryKey) return true;

    const linePeriod = invoicePeriod ?? line.purchaseDate.slice(0, 7);
    return entryOf(entryKey).period === linePeriod;
  };

  const resolveEntry = (
    kind: "keep" | "link",
    line: ReconciliationLine,
    classified: LineClassification,
    decision: LineDecision | undefined,
  ): ReconciliationEntry => {
    if (kind === "keep") {
      if (classified.status === "matched") {
        if (decision?.entryKey !== undefined && decision.entryKey !== classified.entryKey) stale();
        return entryOf(classified.entryKey);
      }
      if (classified.status === "ambiguous" && decision?.entryKey !== undefined) {
        if (!classified.candidateKeys.includes(decision.entryKey)) stale();
        return entryOf(decision.entryKey);
      }
      return stale();
    }

    const entryKey = decision?.entryKey;
    if (entryKey === undefined || !isLinkable(line, classified, entryKey)) stale();
    return entryOf(entryKey);
  };

  const actions: LineAction[] = lines.map((line) => {
    const classified = classificationByIndex.get(line.index) ?? stale();
    const bucket = bucketByIndex.get(line.index) ?? stale();
    const decision = decisionByIndex.get(line.index);
    const kind =
      decision?.action ??
      (bucket === "matched" || bucket === "needs-decision" ? "keep" : "skip");

    const entry =
      kind === "keep" || kind === "link" ? resolveEntry(kind, line, classified, decision) : null;

    return { line, classified, decision, kind, entry };
  });

  const consumedKeys = new Set<string>();
  for (const action of actions) {
    if (!action.entry) continue;
    if (consumedKeys.has(action.entry.entryKey)) stale();
    consumedKeys.add(action.entry.entryKey);
  }

  const refOf = (entryKey: string): EntryRef => parseEntryKey(entryKey) ?? stale();

  const plan: ReconciliationPlan = {
    releases: [],
    creations: [],
    stamps: [],
    alignments: [],
    settlements: [],
    ignores: [],
    categoryMappings: [],
    nameMappings: [],
  };
  const categoryByKey = new Map<string, string>();
  const nameByKey = new Map<string, string>();

  const settle = (line: ReconciliationLine, entry: ReconciliationEntry) => {
    const alignment = resolveAmountAlignment({ line, entry, targetType });
    const ref = refOf(entry.entryKey);

    if (targetType === "account" && !entry.isSettled && !entry.isGenerated) {
      plan.settlements.push({
        ref,
        cents: alignment.kind === "align" ? alignment.toCents : entry.signedCents,
        date: line.postedDate ?? line.purchaseDate,
      });
    } else if (alignment.kind === "align") {
      plan.alignments.push({ ref, toCents: alignment.toCents });
    }
  };

  for (const { line, classified, decision, kind, entry } of actions) {
    const descriptionKey = getImportedDescriptionKey(line.name);
    const identityEntryKey =
      classified.status === "matched" && classified.rule === "identity" ? classified.entryKey : null;

    if (identityEntryKey !== null && (kind === "create" || kind === "link" || kind === "skip")) {
      plan.releases.push({
        ref: refOf(identityEntryKey),
        externalId: line.identity.externalId,
      });
    }

    if (kind === "keep" && entry) {
      if (identityEntryKey === null) {
        plan.stamps.push({
          ref: refOf(entry.entryKey),
          externalId: line.identity.externalId,
          lineIndex: line.index,
        });
      }
      settle(line, entry);
      if (entry.categoryId && descriptionKey) categoryByKey.set(descriptionKey, entry.categoryId);
    }

    if (kind === "link" && entry) {
      plan.stamps.push({
        ref: refOf(entry.entryKey),
        externalId: line.identity.externalId,
        lineIndex: line.index,
      });
      settle(line, entry);
      const name = decision?.name?.trim();
      if (name && descriptionKey) nameByKey.set(descriptionKey, name);
      if (entry.categoryId && descriptionKey) categoryByKey.set(descriptionKey, entry.categoryId);
    }

    if (kind === "create") {
      const name = decision?.name?.trim();
      if (!name) throw new ReconciliationPlanError("RECONCILIATION_EMPTY_NAME");

      const categoryId = decision?.categoryId ?? null;
      plan.creations.push({
        lineIndex: line.index,
        name,
        signedCents: line.signedCents,
        purchaseDate: line.purchaseDate,
        period: invoicePeriod ?? line.purchaseDate.slice(0, 7),
        categoryId,
        personId: decision?.personId ?? defaultPersonId,
        externalId: line.identity.externalId,
      });
      if (targetType === "account" && descriptionKey) nameByKey.set(descriptionKey, name);
      if (categoryId && descriptionKey) categoryByKey.set(descriptionKey, categoryId);
    }

    if (kind === "ignore") {
      plan.ignores.push({
        externalId: line.identity.externalId,
        reason: (decision?.ignoreReason ?? "").trim(),
      });
    }
  }

  plan.categoryMappings = [...categoryByKey].map(([descriptionKey, categoryId]) => ({
    descriptionKey,
    categoryId,
  }));
  plan.nameMappings = [...nameByKey].map(([descriptionKey, name]) => ({ descriptionKey, name }));

  const hasWrites = Object.values(plan).some((items) => items.length > 0);
  if (!hasWrites) throw new ReconciliationPlanError("RECONCILIATION_NOTHING_TO_APPLY");

  return plan;
}
