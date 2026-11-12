export type BalanceStatus = "in-balance" | "unsettled" | "after-end";

export type ProjectionEntry = {
  entryKey: string;
  name: string;
  postingDate: string;
  period: string;
  signedCents: number;
  alignable: boolean;
  status: BalanceStatus | null;
};

export type ProjectionEffect =
  | { kind: "entry"; entryKey: string; lineCents: number }
  | { kind: "create"; lineCents: number; forAdmin: boolean };

export type PaidAfterEnd = { entryKey: string; name: string; date: string; signedCents: number };

export type ProjectionComparison = { differenceCents: number; matches: boolean };

export function toBalanceStatus(
  entry: { isSettled: boolean; isAdmin: boolean; postingDate: string },
  cutoffDate: string,
): BalanceStatus | null {
  if (!entry.isAdmin) return null;
  if (!entry.isSettled) return "unsettled";
  if (entry.postingDate > cutoffDate) return "after-end";
  return "in-balance";
}

export function projectAccountBalance(input: {
  baselineCents: number;
  entries: readonly ProjectionEntry[];
  effects: readonly ProjectionEffect[];
}): { projectedCents: number; paidAfterEnd: PaidAfterEnd[] } {
  const entriesByKey = new Map(input.entries.map((entry) => [entry.entryKey, entry]));
  const linkedKeys = new Set<string>();
  let projectedCents = input.baselineCents;

  for (const effect of input.effects) {
    if (effect.kind === "create") {
      if (effect.forAdmin) projectedCents += effect.lineCents;
      continue;
    }
    linkedKeys.add(effect.entryKey);
    const entry = entriesByKey.get(effect.entryKey);
    if (!entry || entry.status === null) continue;
    const nextCents = entry.alignable ? effect.lineCents : entry.signedCents;
    const currentCents = entry.status === "in-balance" ? entry.signedCents : 0;
    projectedCents += nextCents - currentCents;
  }

  const paidAfterEnd = input.entries
    .filter((entry) => entry.status === "after-end" && !linkedKeys.has(entry.entryKey))
    .map((entry) => ({
      entryKey: entry.entryKey,
      name: entry.name,
      date: entry.postingDate,
      signedCents: entry.signedCents,
    }));

  return { projectedCents, paidAfterEnd };
}

export function projectInvoiceTotal(input: {
  invoicePeriod: string;
  entries: readonly ProjectionEntry[];
  effects: readonly ProjectionEffect[];
}): number {
  const linkedCentsByKey = new Map<string, number>();
  for (const effect of input.effects) {
    if (effect.kind === "entry") linkedCentsByKey.set(effect.entryKey, effect.lineCents);
  }

  let totalCents = 0;
  for (const entry of input.entries) {
    if (entry.period !== input.invoicePeriod) continue;
    const linkedCents = linkedCentsByKey.get(entry.entryKey);
    const cents = linkedCents !== undefined && entry.alignable ? linkedCents : entry.signedCents;
    totalCents -= cents;
  }

  for (const effect of input.effects) {
    if (effect.kind === "create") totalCents -= effect.lineCents;
  }

  return totalCents;
}

export function compareProjection(
  projectedCents: number,
  targetCents: number,
): ProjectionComparison {
  const differenceCents = Math.abs(targetCents - projectedCents);
  return { differenceCents, matches: differenceCents === 0 };
}
