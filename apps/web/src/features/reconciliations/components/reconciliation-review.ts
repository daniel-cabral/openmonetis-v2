import {
  checkInvoiceClosure,
  type FinalBalance,
  type InvoiceClosure,
} from "@openmonetis/domain/reconciliations-closure";
import {
  compareProjection,
  type PaidAfterEnd,
  type ProjectionComparison,
  type ProjectionEffect,
  projectAccountBalance,
  projectInvoiceTotal,
} from "@openmonetis/domain/reconciliations-projection";
import type {
  ReconciliationLineDecision,
  ReconciliationPreview,
} from "@openmonetis/validators/reconciliations";

type Preview = ReconciliationPreview;
type PreviewLine = Preview["lines"][number];
type UiAction = UiLineDecision["action"];

export type UiLineDecision = {
  lineIndex: number;
  action: "keep" | "create" | "link" | "ignore" | "skip";
  entryKey: string | null;
  name: string;
  categoryId: string | null;
  personId: string | null;
  ignoreReason: string;
};

// Keyed by line index, one decision per line.
export type UiDecisions = Record<number, UiLineDecision>;

export type LinkOption = {
  entryKey: string;
  name: string;
  date: string;
  amount: string;
  unavailable: boolean;
};

// Mirrors the server default: matched and needs-decision lines keep their match,
// every other line is skipped until the user chooses otherwise.
function defaultAction(line: PreviewLine): UiAction {
  return line.bucket === "matched" || line.bucket === "needs-decision" ? "keep" : "skip";
}

export function initialDecisions(preview: Preview, adminPersonId: string | null): UiDecisions {
  const decisions: UiDecisions = {};
  for (const line of preview.lines) {
    decisions[line.index] = {
      lineIndex: line.index,
      action: defaultAction(line),
      entryKey: line.entryKey,
      name: line.suggestedName,
      categoryId: line.suggestedCategoryId,
      personId: adminPersonId,
      ignoreReason: "",
    };
  }
  return decisions;
}

export function markAllBankOnlyAsCreate(decisions: UiDecisions, preview: Preview): UiDecisions {
  const next: UiDecisions = { ...decisions };
  for (const line of preview.lines) {
    const decision = decisions[line.index];
    if (line.bucket === "bank-only" && decision.action === "skip") {
      next[line.index] = { ...decision, action: "create" };
    }
  }
  return next;
}

// A matched line keeps its own entry; an ambiguous line keeps the candidate the user picked.
function keptEntryKey(line: PreviewLine, decision: UiLineDecision): string | null {
  return line.bucket === "ambiguous" ? decision.entryKey : line.entryKey;
}

function consumedEntryKey(line: PreviewLine, decision: UiLineDecision): string | null {
  if (decision.action === "keep") return keptEntryKey(line, decision);
  if (decision.action === "link") return decision.entryKey;
  return null;
}

export function consumedEntryKeys(decisions: UiDecisions, preview: Preview): Map<string, number> {
  const consumed = new Map<string, number>();
  for (const line of preview.lines) {
    const entryKey = consumedEntryKey(line, decisions[line.index]);
    if (entryKey) consumed.set(entryKey, line.index);
  }
  return consumed;
}

type PreviewEntry = Preview["entries"][number];

function toLinkOption(
  entry: PreviewEntry,
  line: PreviewLine,
  consumed: Map<string, number>,
): LinkOption {
  const consumedByLine = consumed.get(entry.entryKey);
  return {
    entryKey: entry.entryKey,
    name: entry.name,
    date: entry.date,
    amount: entry.amount.toFixed(2),
    unavailable: consumedByLine !== undefined && consumedByLine !== line.index,
  };
}

// The link period follows the target: the invoice period on a card, the purchase month on an account.
export function linkOptions(
  line: PreviewLine,
  preview: Preview,
  consumed: Map<string, number>,
): LinkOption[] {
  const period = preview.invoicePeriod ?? line.purchaseDate.slice(0, 7);
  return preview.entries
    .filter((entry) => entry.period === period)
    .map((entry) => toLinkOption(entry, line, consumed));
}

// An ambiguous line picks among its own candidates, which can sit in a neighbouring period.
export function candidateOptions(
  line: PreviewLine,
  preview: Preview,
  consumed: Map<string, number>,
): LinkOption[] {
  return preview.entries
    .filter((entry) => line.candidateKeys.includes(entry.entryKey))
    .map((entry) => toLinkOption(entry, line, consumed));
}

// Each count is reported separately so the user knows which rows to fix before applying.
export function applyBlockReason(decisions: UiDecisions): string | null {
  const values = Object.values(decisions);
  const unnamed = values.filter(
    (decision) => decision.action === "create" && decision.name.trim() === "",
  ).length;
  const ignoredWithoutReason = values.filter(
    (decision) => decision.action === "ignore" && decision.ignoreReason.trim() === "",
  ).length;
  const linkedWithoutEntry = values.filter(
    (decision) => decision.action === "link" && !decision.entryKey,
  ).length;
  const reasons = [
    unnamed > 0 ? `${unnamed} criação(ões) sem nome` : null,
    ignoredWithoutReason > 0 ? `${ignoredWithoutReason} ignorada(s) sem motivo` : null,
    linkedWithoutEntry > 0 ? `${linkedWithoutEntry} vínculo(s) sem lançamento` : null,
  ].filter((reason): reason is string => reason !== null);
  return reasons.length === 0 ? null : reasons.join(", ");
}

// Sparse payload: only the lines that depart from the server default are sent.
export function toApplyDecisions(
  decisions: UiDecisions,
  preview: Preview,
): ReconciliationLineDecision[] {
  const payload: ReconciliationLineDecision[] = [];
  for (const line of preview.lines) {
    const decision = decisions[line.index];
    if (decision.action === defaultAction(line)) continue;
    payload.push(toWireDecision(decision, line));
  }
  return payload;
}

function toWireDecision(decision: UiLineDecision, line: PreviewLine): ReconciliationLineDecision {
  const { lineIndex, action } = decision;
  switch (action) {
    case "keep": {
      const entryKey = keptEntryKey(line, decision);
      return entryKey === null ? { lineIndex, action } : { lineIndex, action, entryKey };
    }
    case "create":
      return {
        lineIndex,
        action,
        name: decision.name,
        categoryId: decision.categoryId,
        personId: decision.personId ?? undefined,
      };
    case "link":
      return { lineIndex, action, entryKey: decision.entryKey ?? undefined };
    case "ignore":
      return { lineIndex, action, ignoreReason: decision.ignoreReason };
    default:
      return { lineIndex, action };
  }
}

export function hasApplicableDecision(decisions: UiDecisions, preview: Preview): boolean {
  return toApplyDecisions(decisions, preview).length > 0;
}

type PreviewClosure = NonNullable<Preview["closure"]>;

export type ClosureView =
  | { kind: "statement"; closure: Extract<PreviewClosure, { kind: "statement" }> }
  | { kind: "invoice"; closure: InvoiceClosure };

// The invoice closes only against a total typed by the user; the statement closes on its own.
export function buildClosureView(
  preview: Preview,
  invoiceTotalCents: number | null,
): ClosureView | null {
  const closure = preview.closure;
  if (!closure) return null;
  if (closure.kind === "statement") return { kind: "statement", closure };
  if (invoiceTotalCents === null) return null;
  return { kind: "invoice", closure: checkInvoiceClosure(closure.netCents, invoiceTotalCents) };
}

// Each decision becomes the effect it has on the app balance or invoice total.
export function projectionEffects(
  decisions: UiDecisions,
  preview: Preview,
  adminPersonId: string | null,
): ProjectionEffect[] {
  const effects: ProjectionEffect[] = [];
  for (const line of preview.lines) {
    const decision = decisions[line.index];
    if (!decision) continue;
    if (decision.action === "keep") {
      const entryKey = keptEntryKey(line, decision);
      if (entryKey !== null) effects.push({ kind: "entry", entryKey, lineCents: line.signedCents });
    } else if (decision.action === "link" && decision.entryKey) {
      effects.push({ kind: "entry", entryKey: decision.entryKey, lineCents: line.signedCents });
    } else if (decision.action === "create") {
      effects.push({
        kind: "create",
        lineCents: line.signedCents,
        forAdmin: adminPersonId !== null && decision.personId === adminPersonId,
      });
    }
  }
  return effects;
}

export type ProjectionView =
  | {
      kind: "account";
      projectedCents: number;
      target: FinalBalance | null;
      comparison: ProjectionComparison | null;
      paidAfterEnd: PaidAfterEnd[];
    }
  | {
      kind: "card";
      projectedCents: number;
      targetCents: number | null;
      comparison: ProjectionComparison | null;
    };

export function buildProjectionView(input: {
  preview: Preview;
  decisions: UiDecisions;
  adminPersonId: string | null;
  invoiceTotalCents: number | null;
}): ProjectionView | null {
  const { preview } = input;
  const projection = preview.projection;
  if (!projection) return null;
  const effects = projectionEffects(input.decisions, preview, input.adminPersonId);

  if (projection.kind === "account") {
    const { projectedCents, paidAfterEnd } = projectAccountBalance({
      baselineCents: projection.baselineCents,
      entries: projection.entries,
      effects,
    });
    const target = preview.closure?.kind === "statement" ? preview.closure.finalBalance : null;
    return {
      kind: "account",
      projectedCents,
      target,
      comparison: target ? compareProjection(projectedCents, target.cents) : null,
      paidAfterEnd,
    };
  }

  const projectedCents = projectInvoiceTotal({
    invoicePeriod: projection.invoicePeriod,
    entries: projection.entries,
    effects,
  });
  const targetCents = input.invoiceTotalCents;
  return {
    kind: "card",
    projectedCents,
    targetCents,
    comparison: targetCents === null ? null : compareProjection(projectedCents, targetCents),
  };
}

export function defaultProfileId(detection: {
  detectedProfileId: string | null;
  profiles: { id: string }[];
}): string | null {
  return detection.detectedProfileId ?? detection.profiles[0]?.id ?? null;
}
