import { addMonthsToPeriod, getImportedDescriptionKey } from "./transactions";

export const RECONCILIATION_DATE_WINDOW_DAYS = 2;
export const RECONCILIATION_CENTS_TOLERANCE = 5;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MIN_ACCOUNT_DIGITS = 4;
const INCLUSION_OF_PAYMENT = "inclusao de pagamento";

export type ReconciliationTargetType = "account" | "card";
export type MatchRule = "identity" | "installment" | "exact" | "cents" | "name-period";

export type ReconciliationLine = {
  index: number;
  identity: { sourceFingerprint: string; externalId: string };
  purchaseDate: string;
  postedDate: string | null;
  signedCents: number;
  name: string;
  installment: { current: number; total: number } | null;
  lineKind: "purchase" | "credit" | "invoice-payment" | null;
  categoryName: string | null;
};

export type ReconciliationEntry = {
  entryKey: string; // "t:<transactionId>" | "o:<ruleId>:<yyyy-mm-dd>"
  name: string;
  date: string;
  period: string;
  signedCents: number;
  installmentCount: number | null;
  currentInstallment: number | null;
  externalId: string | null;
  categoryId: string | null;
  isSettled: boolean;
  hasSplits: boolean;
  isTransfer: boolean;
  isGenerated: boolean;
  inPaidInvoice: boolean;
  isRecurring: boolean;
};

export type MatchContext = {
  targetType: ReconciliationTargetType;
  nameMappings: Record<string, string>; // key = getImportedDescriptionKey(line.name)
};

export type LineClassification = { lineIndex: number } & (
  | {
      status: "matched";
      rule: MatchRule;
      entryKey: string;
      divergence: { appCents: number; fileCents: number } | null;
    }
  | { status: "ambiguous"; candidateKeys: string[] }
  | { status: "bank-only" }
);

type CandidateFinder = (
  line: ReconciliationLine,
  entries: ReconciliationEntry[],
  context: MatchContext,
) => ReconciliationEntry[];

function daysBetween(left: string, right: string): number {
  const diff = Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`);
  return Math.abs(diff) / DAY_IN_MS;
}

// The line carries two dates; the entry may match either one within the window.
function isWithinDateWindow(line: ReconciliationLine, entry: ReconciliationEntry): boolean {
  const dates = [line.purchaseDate, line.postedDate].filter((date): date is string =>
    Boolean(date),
  );
  return dates.some((date) => daysBetween(date, entry.date) <= RECONCILIATION_DATE_WINDOW_DAYS);
}

/** Rule 1: the line was already reconciled and its external id is stored on the entry. */
export function findIdentityCandidates(
  line: ReconciliationLine,
  entries: ReconciliationEntry[],
): ReconciliationEntry[] {
  return entries.filter(
    (entry) => entry.externalId !== null && entry.externalId === line.identity.externalId,
  );
}

/**
 * Rule 2: installment N/M against the series with the same total. The total
 * narrows the search space, so the date does not take part.
 */
export function findInstallmentCandidates(
  line: ReconciliationLine,
  entries: ReconciliationEntry[],
): ReconciliationEntry[] {
  const installment = line.installment;
  if (!installment) return [];

  return entries.filter(
    (entry) =>
      entry.installmentCount === installment.total &&
      entry.currentInstallment === installment.current &&
      entry.signedCents === line.signedCents,
  );
}

/** Rule 3: identical signed value inside the date window. */
export function findExactCandidates(
  line: ReconciliationLine,
  entries: ReconciliationEntry[],
): ReconciliationEntry[] {
  return entries.filter(
    (entry) => entry.signedCents === line.signedCents && isWithinDateWindow(line, entry),
  );
}

/**
 * Rule 4: exact rule with cents tolerance. Only for lines with installment
 * information, where rounding shows up; for cash purchases it would only add
 * false positives.
 */
export function findCentsCandidates(
  line: ReconciliationLine,
  entries: ReconciliationEntry[],
): ReconciliationEntry[] {
  if (!line.installment) return [];

  return entries.filter(
    (entry) =>
      Math.abs(entry.signedCents - line.signedCents) <= RECONCILIATION_CENTS_TOLERANCE &&
      isWithinDateWindow(line, entry),
  );
}

/**
 * Rule 5: a learned name pairing already decided the pair once; what is left
 * to identify is the month. Date and value are ignored on purpose, since that
 * is why the earlier rules missed the line. Account targets only: on a card the
 * same merchant repeats within a period and the rule would almost always be ambiguous.
 */
export function findNamePeriodCandidates(
  line: ReconciliationLine,
  entries: ReconciliationEntry[],
  context: MatchContext,
): ReconciliationEntry[] {
  if (context.targetType !== "account") return [];

  const learnedName = context.nameMappings[getImportedDescriptionKey(line.name)];
  if (!learnedName) return [];

  const period = line.purchaseDate.slice(0, 7);

  return entries.filter(
    (entry) =>
      entry.name === learnedName &&
      entry.period === period &&
      Math.sign(entry.signedCents) === Math.sign(line.signedCents),
  );
}

const MATCH_RULES: { rule: MatchRule; find: CandidateFinder }[] = [
  { rule: "identity", find: findIdentityCandidates },
  { rule: "installment", find: findInstallmentCandidates },
  { rule: "exact", find: findExactCandidates },
  { rule: "cents", find: findCentsCandidates },
  { rule: "name-period", find: findNamePeriodCandidates },
];

// Credit and invoice-payment lines are informational: they never take an app entry.
function isInformationalLine(line: ReconciliationLine): boolean {
  return line.lineKind === "credit" || line.lineKind === "invoice-payment";
}

/**
 * Classifies every file line against the app entries. Rules run in order and
 * the first rule that finds candidates decides the line: one free candidate
 * matches and consumes it, two or more mark the line ambiguous and nothing
 * weaker resolves it. Passes repeat until stable, since a match frees the
 * candidates another line was competing for.
 */
export function matchReconciliationLines(input: {
  lines: ReconciliationLine[];
  entries: ReconciliationEntry[];
  context: MatchContext;
}): { lines: LineClassification[]; appOnlyKeys: string[] } {
  type Decision = { rule: MatchRule; entry: ReconciliationEntry };

  const decisions = new Map<number, Decision>();
  const consumed = new Set<string>();
  // Ambiguities of the current pass only: a line stops at the first rule that found candidates.
  let ambiguities = new Map<number, string[]>();

  const available = () => input.entries.filter((entry) => !consumed.has(entry.entryKey));

  let changed = true;
  while (changed) {
    changed = false;
    ambiguities = new Map();

    for (const { rule, find } of MATCH_RULES) {
      input.lines.forEach((line, position) => {
        // A line already decided or stopped at a stronger rule is not re-evaluated
        // by weaker rules in this pass, or they would hide the ambiguity.
        if (decisions.has(position) || ambiguities.has(position) || isInformationalLine(line))
          return;

        const candidates = find(line, available(), input.context);
        if (candidates.length === 0) return;

        if (candidates.length > 1) {
          ambiguities.set(
            position,
            candidates.map((entry) => entry.entryKey),
          );
          return;
        }

        decisions.set(position, { rule, entry: candidates[0] });
        consumed.add(candidates[0].entryKey);
        changed = true;
      });
    }
  }

  const ambiguousKeys = new Set<string>();
  for (const entryKeys of ambiguities.values()) {
    for (const entryKey of entryKeys) ambiguousKeys.add(entryKey);
  }

  // The file is the authority on value: any rule can match a different amount.
  const divergenceOf = (
    entry: ReconciliationEntry,
    line: ReconciliationLine,
  ): { appCents: number; fileCents: number } | null =>
    entry.signedCents === line.signedCents
      ? null
      : { appCents: entry.signedCents, fileCents: line.signedCents };

  const lines: LineClassification[] = input.lines.map((line, position) => {
    const decision = decisions.get(position);
    if (decision) {
      return {
        lineIndex: line.index,
        status: "matched",
        rule: decision.rule,
        entryKey: decision.entry.entryKey,
        divergence: divergenceOf(decision.entry, line),
      };
    }

    const candidateKeys = ambiguities.get(position);
    if (!candidateKeys) return { lineIndex: line.index, status: "bank-only" };

    return { lineIndex: line.index, status: "ambiguous", candidateKeys };
  });

  const appOnlyKeys = input.entries
    .filter((entry) => !consumed.has(entry.entryKey) && !ambiguousKeys.has(entry.entryKey))
    .map((entry) => entry.entryKey);

  return { lines, appOnlyKeys };
}

export type MatchSuspicion =
  | { reason: "before-file-start"; entryDate: string; fileStartDate: string }
  | { reason: "amount-divergence"; appCents: number; fileCents: number };

/**
 * Matches that need a human check before apply. A date before the file start
 * only matters for accounts: on a card an old installment is a legitimate match.
 * Value divergence only matters for the identity rule: the other rules match a
 * different value on purpose (estimated recurring account).
 */
export function detectMatchSuspicions(input: {
  line: ReconciliationLine;
  rule: MatchRule;
  entry: ReconciliationEntry;
  fileStartDate: string | null;
  targetType: ReconciliationTargetType;
}): MatchSuspicion[] {
  const { line, rule, entry, fileStartDate, targetType } = input;
  const suspicions: MatchSuspicion[] = [];

  if (targetType === "account" && fileStartDate !== null && entry.date < fileStartDate) {
    suspicions.push({
      reason: "before-file-start",
      entryDate: entry.date,
      fileStartDate,
    });
  }

  if (rule === "identity" && entry.signedCents !== line.signedCents) {
    suspicions.push({
      reason: "amount-divergence",
      appCents: entry.signedCents,
      fileCents: line.signedCents,
    });
  }

  return suspicions;
}

export type AmountAlignment =
  | { kind: "none" }
  | { kind: "align"; toCents: number }
  | {
      kind: "kept";
      reason: "splits" | "transfer" | "generated" | "paid-invoice" | "card-recurring";
    };

/** Decides whether a matched entry takes the file value, and keeps its value when it cannot. */
export function resolveAmountAlignment(input: {
  line: ReconciliationLine;
  entry: ReconciliationEntry;
  targetType: ReconciliationTargetType;
}): AmountAlignment {
  const { line, entry, targetType } = input;
  if (entry.signedCents === line.signedCents) return { kind: "none" };
  if (entry.hasSplits) return { kind: "kept", reason: "splits" };
  if (entry.isTransfer) return { kind: "kept", reason: "transfer" };
  if (entry.isGenerated) return { kind: "kept", reason: "generated" };
  if (entry.inPaidInvoice) return { kind: "kept", reason: "paid-invoice" };
  if (targetType === "card" && entry.isRecurring) return { kind: "kept", reason: "card-recurring" };
  return { kind: "align", toCents: line.signedCents };
}

export type ReconciliationBucket =
  | "needs-decision"
  | "matched"
  | "bank-only"
  | "ambiguous"
  | "ignored"
  | "informational";

/**
 * Puts every line in exactly one bucket. Order: ignored lines first, then
 * informational invoice lines (credits and invoice payments), then the match
 * outcome. A matched line with suspicions needs a decision.
 */
export function assignReconciliationBuckets(input: {
  lines: ReconciliationLine[];
  classification: LineClassification[];
  entries: ReconciliationEntry[];
  ignoredExternalIds: ReadonlyMap<string, string>;
  fileStartDate: string | null;
  targetType: ReconciliationTargetType;
}): {
  lineIndex: number;
  bucket: ReconciliationBucket;
  suspicions: MatchSuspicion[];
  ignoredReason: string | null;
}[] {
  const linesByIndex = new Map(input.lines.map((line) => [line.index, line]));
  const entriesByKey = new Map(input.entries.map((entry) => [entry.entryKey, entry]));

  return input.classification.map((classified) => {
    const line = linesByIndex.get(classified.lineIndex);
    if (!line) throw new Error(`Classified line ${classified.lineIndex} is not in the file`);

    const ignoredReason =
      classified.status === "bank-only"
        ? (input.ignoredExternalIds.get(line.identity.externalId) ?? null)
        : null;
    if (ignoredReason !== null) {
      return { lineIndex: line.index, bucket: "ignored", suspicions: [], ignoredReason };
    }

    if (isInformationalLine(line)) {
      return {
        lineIndex: line.index,
        bucket: "informational",
        suspicions: [],
        ignoredReason: null,
      };
    }

    if (classified.status === "matched") {
      const entry = entriesByKey.get(classified.entryKey);
      if (!entry) throw new Error(`Matched entry ${classified.entryKey} is not loaded`);

      const suspicions = detectMatchSuspicions({
        line,
        rule: classified.rule,
        entry,
        fileStartDate: input.fileStartDate,
        targetType: input.targetType,
      });
      return {
        lineIndex: line.index,
        bucket: suspicions.length > 0 ? "needs-decision" : "matched",
        suspicions,
        ignoredReason: null,
      };
    }

    return {
      lineIndex: line.index,
      bucket: classified.status === "ambiguous" ? "ambiguous" : "bank-only",
      suspicions: [],
      ignoredReason: null,
    };
  });
}

/**
 * Scope of the "only in app" bucket: on a card the entry belongs to the invoice
 * period, not to the purchase month; on an account the file's date range is enough.
 */
export function filterAppOnlyByScope(
  entries: ReconciliationEntry[],
  scope:
    | { targetType: "account"; from: string; to: string }
    | { targetType: "card"; invoicePeriod: string },
): ReconciliationEntry[] {
  if (scope.targetType === "card") {
    return entries.filter((entry) => entry.period === scope.invoicePeriod);
  }
  return entries.filter((entry) => entry.date >= scope.from && entry.date <= scope.to);
}

/**
 * C6 also labels as "Inclusao de Pagamento" the payment of the previous invoice
 * made outside the slip. A payment up to the previous invoice's due date settles
 * that invoice; after it, the payment is an advance on this one.
 */
export function reclassifyPreviousInvoicePayments(
  lines: ReconciliationLine[],
  input: { invoicePeriod: string; dueDay: number },
): ReconciliationLine[] {
  const previousDueDate = `${addMonthsToPeriod(input.invoicePeriod, -1)}-${String(input.dueDay).padStart(2, "0")}`;

  return lines.map((line) =>
    line.lineKind === "credit" &&
    line.name.toLowerCase().replace(/\s+/g, " ").includes(INCLUSION_OF_PAYMENT) &&
    line.purchaseDate <= previousDueDate
      ? { ...line, lineKind: "invoice-payment" }
      : line,
  );
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Preselects the account whose name carries the number written in the file's
 * identification. The agency does not identify the account. Without exactly one
 * match the target stays empty: the file value is a suggestion, never a decision.
 */
export function matchAccountByIdentification(
  identification: string | null,
  accounts: { id: string; name: string }[],
): string | null {
  if (!identification) return null;

  const fileDigits = digitsOf(identification.split("/").at(-1) ?? "");
  if (fileDigits.length < MIN_ACCOUNT_DIGITS) return null;

  const matches = accounts.filter((account) => {
    const nameDigits = digitsOf(account.name);
    if (nameDigits.length < MIN_ACCOUNT_DIGITS) return false;
    return nameDigits.includes(fileDigits) || fileDigits.includes(nameDigits);
  });

  return matches.length === 1 ? matches[0].id : null;
}

/** Pre-filled name of a bank-only line: the learned name when the merchant key was taught, the raw description otherwise. */
export function suggestLineName(
  line: ReconciliationLine,
  nameMappings: Record<string, string>,
): string {
  return nameMappings[getImportedDescriptionKey(line.name)] ?? line.name;
}
