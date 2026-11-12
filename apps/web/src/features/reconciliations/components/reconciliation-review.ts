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

function consumedEntryKey(line: PreviewLine, decision: UiLineDecision): string | null {
  if (decision.action === "keep") return line.entryKey;
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

// The link period follows the target: the invoice period on a card, the purchase month on an account.
export function linkOptions(
  line: PreviewLine,
  preview: Preview,
  consumed: Map<string, number>,
): LinkOption[] {
  const period = preview.invoicePeriod ?? line.purchaseDate.slice(0, 7);
  return preview.entries
    .filter((entry) => entry.period === period)
    .map((entry) => {
      const consumedByLine = consumed.get(entry.entryKey);
      return {
        entryKey: entry.entryKey,
        name: entry.name,
        date: entry.date,
        amount: entry.amount.toFixed(2),
        unavailable: consumedByLine !== undefined && consumedByLine !== line.index,
      };
    });
}

export function applyBlockReason(decisions: UiDecisions): string | null {
  const unnamed = Object.values(decisions).filter(
    (decision) => decision.action === "create" && decision.name.trim() === "",
  ).length;
  return unnamed === 0 ? null : `${unnamed} criação(ões) sem nome`;
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
    payload.push(toWireDecision(decision));
  }
  return payload;
}

function toWireDecision(decision: UiLineDecision): ReconciliationLineDecision {
  const { lineIndex, action } = decision;
  switch (action) {
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

export function defaultProfileId(detection: {
  detectedProfileId: string | null;
  profiles: { id: string }[];
}): string | null {
  return detection.detectedProfileId ?? detection.profiles[0]?.id ?? null;
}
