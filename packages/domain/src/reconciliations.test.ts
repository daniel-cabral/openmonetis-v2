import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseC6InvoiceCsv, parseC6StatementCsv } from "./import-c6";
import type { ImportedTransaction } from "./transactions";
import {
  assignReconciliationBuckets,
  detectMatchSuspicions,
  filterAppOnlyByScope,
  findCentsCandidates,
  findExactCandidates,
  findIdentityCandidates,
  findInstallmentCandidates,
  findNamePeriodCandidates,
  type LineClassification,
  matchAccountByIdentification,
  matchReconciliationLines,
  type MatchContext,
  type MatchSuspicion,
  type ReconciliationBucket,
  type ReconciliationEntry,
  type ReconciliationLine,
  reclassifyPreviousInvoicePayments,
  resolveAmountAlignment,
  suggestLineName,
} from "./reconciliations";

const LEARNED_KEY = "casa nova locadora ltda - epp - boleto";
const LEARNED_NAMES = { [LEARNED_KEY]: "Aluguel" };

const accountContext: MatchContext = {
  targetType: "account",
  nameMappings: LEARNED_NAMES,
};
const cardContext: MatchContext = { targetType: "card", nameMappings: {} };

function line(overrides: Partial<ReconciliationLine> = {}): ReconciliationLine {
  return {
    index: 0,
    identity: { sourceFingerprint: "source-a", externalId: "ext-linha" },
    purchaseDate: "2026-07-10",
    postedDate: null,
    signedCents: -2590,
    name: "LOJA TESTE",
    installment: null,
    lineKind: "purchase",
    categoryName: null,
    ...overrides,
  };
}

function entry(overrides: Partial<ReconciliationEntry> = {}): ReconciliationEntry {
  return {
    entryKey: "t:tx-1",
    name: "Lançamento teste",
    date: "2026-07-10",
    period: "2026-07",
    signedCents: -2590,
    installmentCount: null,
    currentInstallment: null,
    externalId: null,
    categoryId: null,
    isSettled: false,
    hasSplits: false,
    isTransfer: false,
    isGenerated: false,
    inPaidInvoice: false,
    isRecurring: false,
    ...overrides,
  };
}

function keysOf(entries: ReconciliationEntry[]): string[] {
  return entries.map((candidate) => candidate.entryKey);
}

// Fixture adapter: the service builds lines from the parsed file; here the
// identity is the position so tests can address a line by its external id.
function toLine(row: ImportedTransaction, position: number): ReconciliationLine {
  const cents = Math.round(row.amount * 100);
  return {
    index: position,
    identity: { sourceFingerprint: "fixture", externalId: `row-${position}` },
    purchaseDate: row.purchaseDate,
    postedDate: row.postedDate,
    signedCents: row.type === "expense" ? -cents : cents,
    name: row.name,
    installment: row.installment,
    lineKind: row.lineKind,
    categoryName: row.categoryName,
  };
}

function countBuckets(buckets: { bucket: ReconciliationBucket }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { bucket } of buckets) counts[bucket] = (counts[bucket] ?? 0) + 1;
  return counts;
}

const invoiceFixture = () =>
  readFileSync(new URL("./__fixtures__/c6-fatura.csv", import.meta.url), "utf8");
const statementFixture = () =>
  readFileSync(new URL("./__fixtures__/c6-extrato.csv", import.meta.url), "utf8");

test("findIdentityCandidates matches only the entry carrying the line's external id", async (t) => {
  const cases = [
    {
      name: "finds the entry with the stored external id",
      entries: [
        entry({ entryKey: "t:tx-1", externalId: "ext-a" }),
        entry({ entryKey: "t:tx-2", externalId: "ext-b" }),
      ],
      expected: ["t:tx-1"],
    },
    {
      name: "does not match an entry without external id",
      entries: [entry({ entryKey: "t:tx-1", externalId: null })],
      expected: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const found = findIdentityCandidates(line({ identity: { sourceFingerprint: "source-a", externalId: "ext-a" } }), c.entries);
      assert.deepEqual(keysOf(found), c.expected);
    });
  }
});

test("findInstallmentCandidates matches the same series, installment and signed value", async (t) => {
  const seriesLine = line({ signedCents: -180000, installment: { current: 2, total: 12 } });
  const cases = [
    {
      name: "matches same total, same installment and same value on any date",
      line: seriesLine,
      entries: [
        entry({ entryKey: "t:tx-serie", date: "2026-05-30", signedCents: -180000, installmentCount: 12, currentInstallment: 2 }),
      ],
      expected: ["t:tx-serie"],
    },
    {
      name: "rejects a different installment total",
      line: seriesLine,
      entries: [
        entry({ entryKey: "t:tx-serie", signedCents: -180000, installmentCount: 10, currentInstallment: 2 }),
      ],
      expected: [],
    },
    {
      name: "rejects a different current installment",
      line: seriesLine,
      entries: [
        entry({ entryKey: "t:tx-serie", signedCents: -180000, installmentCount: 12, currentInstallment: 3 }),
      ],
      expected: [],
    },
    {
      name: "ignores a line without installment information",
      line: line({ signedCents: -180000 }),
      entries: [
        entry({ entryKey: "t:tx-serie", signedCents: -180000, installmentCount: 12, currentInstallment: 2 }),
      ],
      expected: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(keysOf(findInstallmentCandidates(c.line, c.entries)), c.expected);
    });
  }
});

test("findExactCandidates matches signed value inside the two-day window", async (t) => {
  const cases = [
    {
      name: "matches earlier and later entries within two days",
      entries: [
        entry({ entryKey: "t:tx-anterior", date: "2026-07-08" }),
        entry({ entryKey: "t:tx-posterior", date: "2026-07-12" }),
        entry({ entryKey: "t:tx-longe", date: "2026-07-13" }),
      ],
      expected: ["t:tx-anterior", "t:tx-posterior"],
    },
    {
      name: "keeps the window at two days, not three",
      entries: [
        entry({ entryKey: "t:tx-borda", date: "2026-07-12" }),
        entry({ entryKey: "t:tx-fora", date: "2026-07-13" }),
      ],
      expected: ["t:tx-borda"],
    },
    {
      name: "also matches against the posted date with the same window",
      line: line({ postedDate: "2026-07-14" }),
      entries: [entry({ entryKey: "t:tx-contabil", date: "2026-07-15" })],
      expected: ["t:tx-contabil"],
    },
    {
      name: "does not match an income of the same absolute value",
      entries: [entry({ entryKey: "t:tx-receita", signedCents: 2590 })],
      expected: [],
    },
    {
      name: "does not match a difference of cents",
      line: line({ signedCents: -8659 }),
      entries: [entry({ entryKey: "t:tx-app", signedCents: -8661 })],
      expected: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const found = findExactCandidates(c.line ?? line(), c.entries);
      assert.deepEqual(keysOf(found), c.expected);
    });
  }
});

test("findCentsCandidates tolerates up to five cents only for installment lines in the same window", async (t) => {
  const installmentLine = line({ signedCents: -8659, installment: { current: 2, total: 3 } });
  const cases = [
    {
      name: "matches a difference of up to five cents when the line has an installment",
      line: installmentLine,
      entries: [entry({ entryKey: "t:tx-app", signedCents: -8661 })],
      expected: ["t:tx-app"],
    },
    {
      name: "ignores a line without installment information",
      line: line({ signedCents: -8659 }),
      entries: [entry({ entryKey: "t:tx-app", signedCents: -8661 })],
      expected: [],
    },
    {
      name: "does not stretch the tolerance beyond five cents",
      line: installmentLine,
      entries: [entry({ entryKey: "t:tx-app", signedCents: -8665 })],
      expected: [],
    },
    {
      name: "applies the same date window as the exact rule",
      line: installmentLine,
      entries: [entry({ entryKey: "t:tx-app", date: "2026-07-13", signedCents: -8661 })],
      expected: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(keysOf(findCentsCandidates(c.line, c.entries)), c.expected);
    });
  }
});

test("findNamePeriodCandidates matches the learned name in the line's period, account targets only", async (t) => {
  const aluguelLine = line({
    name: "CASA NOVA LOCADORA LTDA - EPP - Boleto",
    purchaseDate: "2026-08-11",
    signedCents: -235651,
  });
  const aluguel = (overrides: Partial<ReconciliationEntry> = {}) =>
    entry({ name: "Aluguel", period: "2026-08", ...overrides });
  const cases = [
    {
      name: "matches the recurring entry of the period despite different date and value",
      context: accountContext,
      entries: [aluguel({ entryKey: "t:tx-aluguel", date: "2026-08-15", signedCents: -230000 })],
      expected: ["t:tx-aluguel"],
    },
    {
      name: "produces no candidate when the description has no learned name",
      context: accountContext,
      line: line({ name: "OUTRO CREDOR - Boleto", purchaseDate: "2026-08-11" }),
      entries: [aluguel({ entryKey: "t:tx-aluguel" })],
      expected: [],
    },
    {
      name: "produces no candidate on a card target",
      context: cardContext,
      entries: [aluguel({ entryKey: "t:tx-aluguel" })],
      expected: [],
    },
    {
      name: "does not match an entry from another period",
      context: accountContext,
      line: line({ name: aluguelLine.name, purchaseDate: "2026-08-31" }),
      entries: [aluguel({ entryKey: "t:tx-setembro", period: "2026-09", date: "2026-09-05" })],
      expected: [],
    },
    {
      name: "does not match when the signed direction differs",
      context: accountContext,
      line: line({ name: aluguelLine.name, purchaseDate: "2026-08-11", signedCents: 235651 }),
      entries: [aluguel({ entryKey: "t:tx-aluguel", signedCents: -230000 })],
      expected: [],
    },
    {
      name: "returns both entries of the same name in the period",
      context: accountContext,
      entries: [
        aluguel({ entryKey: "t:tx-a" }),
        aluguel({ entryKey: "t:tx-b" }),
      ],
      expected: ["t:tx-a", "t:tx-b"],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const found = findNamePeriodCandidates(c.line ?? aluguelLine, c.entries, c.context);
      assert.deepEqual(keysOf(found), c.expected);
    });
  }
});

test("matchReconciliationLines decides each line by rule order, one-to-one", async (t) => {
  const cases: {
    name: string;
    lines: ReconciliationLine[];
    entries: ReconciliationEntry[];
    context?: MatchContext;
    expected: { lines: LineClassification[]; appOnlyKeys: string[] };
  }[] = [
    {
      name: "identity beats installment when both find a candidate",
      lines: [line({ identity: { sourceFingerprint: "source-a", externalId: "ext-a" }, signedCents: -180000, installment: { current: 2, total: 12 } })],
      entries: [
        entry({ entryKey: "t:tx-serie", signedCents: -180000, installmentCount: 12, currentInstallment: 2 }),
        entry({ entryKey: "t:tx-conciliado", signedCents: -180000, externalId: "ext-a" }),
      ],
      expected: {
        lines: [{ lineIndex: 0, status: "matched", rule: "identity", entryKey: "t:tx-conciliado", divergence: null }],
        appOnlyKeys: ["t:tx-serie"],
      },
    },
    {
      name: "installment beats exact when both find a candidate",
      lines: [line({ signedCents: -180000, installment: { current: 2, total: 12 } })],
      entries: [
        entry({ entryKey: "t:tx-avista", signedCents: -180000 }),
        entry({ entryKey: "t:tx-serie", date: "2026-01-10", signedCents: -180000, installmentCount: 12, currentInstallment: 2 }),
      ],
      expected: {
        lines: [{ lineIndex: 0, status: "matched", rule: "installment", entryKey: "t:tx-serie", divergence: null }],
        appOnlyKeys: ["t:tx-avista"],
      },
    },
    {
      name: "a single exact candidate matches and consumes it",
      lines: [line()],
      entries: [entry()],
      expected: {
        lines: [{ lineIndex: 0, status: "matched", rule: "exact", entryKey: "t:tx-1", divergence: null }],
        appOnlyKeys: [],
      },
    },
    {
      name: "86,59 with installment matches by cents and reports the divergence",
      lines: [line({ signedCents: -8659, installment: { current: 2, total: 3 } })],
      entries: [entry({ entryKey: "t:tx-app", signedCents: -8661 })],
      context: cardContext,
      expected: {
        lines: [
          {
            lineIndex: 0,
            status: "matched",
            rule: "cents",
            entryKey: "t:tx-app",
            divergence: { appCents: -8661, fileCents: -8659 },
          },
        ],
        appOnlyKeys: [],
      },
    },
    {
      name: "86,59 without installment stays bank-only and the app entry is app-only",
      lines: [line({ signedCents: -8659 })],
      entries: [entry({ entryKey: "t:tx-app", signedCents: -8661 })],
      expected: {
        lines: [{ lineIndex: 0, status: "bank-only" }],
        appOnlyKeys: ["t:tx-app"],
      },
    },
    {
      name: "two equally good candidates make the line ambiguous and nothing is chosen",
      lines: [line()],
      entries: [
        entry({ entryKey: "t:tx-1", date: "2026-07-10" }),
        entry({ entryKey: "t:tx-2", date: "2026-07-11" }),
      ],
      expected: {
        lines: [{ lineIndex: 0, status: "ambiguous", candidateKeys: ["t:tx-1", "t:tx-2"] }],
        appOnlyKeys: [],
      },
    },
    {
      name: "a weaker rule does not resolve a line the stronger rule found ambiguous",
      lines: [line({ signedCents: -180000, installment: { current: 2, total: 12 } })],
      entries: [
        entry({ entryKey: "t:tx-serie-a", date: "2026-01-10", signedCents: -180000, installmentCount: 12, currentInstallment: 2 }),
        entry({ entryKey: "t:tx-serie-b", date: "2026-02-10", signedCents: -180000, installmentCount: 12, currentInstallment: 2 }),
        entry({ entryKey: "t:tx-avista", signedCents: -180000 }),
      ],
      expected: {
        lines: [{ lineIndex: 0, status: "ambiguous", candidateKeys: ["t:tx-serie-a", "t:tx-serie-b"] }],
        appOnlyKeys: ["t:tx-avista"],
      },
    },
    {
      name: "candidates of an ambiguous line are not reported as app-only",
      lines: [line()],
      entries: [
        entry({ entryKey: "t:tx-1", date: "2026-07-10" }),
        entry({ entryKey: "t:tx-2", date: "2026-07-11" }),
        entry({ entryKey: "t:tx-orfao", signedCents: -99900, date: "2026-07-20" }),
      ],
      expected: {
        lines: [{ lineIndex: 0, status: "ambiguous", candidateKeys: ["t:tx-1", "t:tx-2"] }],
        appOnlyKeys: ["t:tx-orfao"],
      },
    },
    {
      name: "an entry with no file line is app-only",
      lines: [line()],
      entries: [
        entry({ entryKey: "t:tx-1" }),
        entry({ entryKey: "t:tx-orfao", signedCents: -4200, date: "2026-07-02" }),
      ],
      expected: {
        lines: [{ lineIndex: 0, status: "matched", rule: "exact", entryKey: "t:tx-1", divergence: null }],
        appOnlyKeys: ["t:tx-orfao"],
      },
    },
    {
      name: "two lines never claim the same entry",
      lines: [
        line({ index: 0, identity: { sourceFingerprint: "source-a", externalId: "ext-a" } }),
        line({ index: 1, identity: { sourceFingerprint: "source-a", externalId: "ext-b" } }),
      ],
      entries: [entry({ entryKey: "t:tx-1" })],
      expected: {
        lines: [
          { lineIndex: 0, status: "matched", rule: "exact", entryKey: "t:tx-1", divergence: null },
          { lineIndex: 1, status: "bank-only" },
        ],
        appOnlyKeys: [],
      },
    },
    {
      name: "a line left with one candidate after another line consumed the disputed one is matched",
      lines: [
        line({ index: 0, purchaseDate: "2026-07-11", identity: { sourceFingerprint: "source-a", externalId: "ext-disputa" } }),
        line({ index: 1, purchaseDate: "2026-07-10", identity: { sourceFingerprint: "source-a", externalId: "ext-unica" } }),
      ],
      entries: [
        entry({ entryKey: "t:tx-1", date: "2026-07-10" }),
        entry({ entryKey: "t:tx-2", date: "2026-07-13" }),
      ],
      expected: {
        lines: [
          { lineIndex: 0, status: "matched", rule: "exact", entryKey: "t:tx-2", divergence: null },
          { lineIndex: 1, status: "matched", rule: "exact", entryKey: "t:tx-1", divergence: null },
        ],
        appOnlyKeys: [],
      },
    },
    {
      name: "a line with no candidate at all is bank-only",
      lines: [line({ signedCents: -1234 })],
      entries: [entry({ entryKey: "t:tx-1", signedCents: -9999 })],
      expected: {
        lines: [{ lineIndex: 0, status: "bank-only" }],
        appOnlyKeys: ["t:tx-1"],
      },
    },
    {
      name: "keeps the line index in the classification",
      lines: [line({ index: 7 })],
      entries: [],
      expected: {
        lines: [{ lineIndex: 7, status: "bank-only" }],
        appOnlyKeys: [],
      },
    },
    {
      name: "learned name matches a recurring entry with different date and value, reporting the divergence",
      lines: [line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto", purchaseDate: "2026-08-11", signedCents: -235651 })],
      entries: [
        entry({ entryKey: "t:tx-aluguel", name: "Aluguel", date: "2026-08-15", period: "2026-08", signedCents: -230000 }),
      ],
      context: accountContext,
      expected: {
        lines: [
          {
            lineIndex: 0,
            status: "matched",
            rule: "name-period",
            entryKey: "t:tx-aluguel",
            divergence: { appCents: -230000, fileCents: -235651 },
          },
        ],
        appOnlyKeys: [],
      },
    },
    {
      name: "learned name with equal value reports no divergence",
      lines: [line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto", purchaseDate: "2026-08-11", signedCents: -235651 })],
      entries: [
        entry({ entryKey: "t:tx-aluguel", name: "Aluguel", date: "2026-08-20", period: "2026-08", signedCents: -235651 }),
      ],
      context: accountContext,
      expected: {
        lines: [{ lineIndex: 0, status: "matched", rule: "name-period", entryKey: "t:tx-aluguel", divergence: null }],
        appOnlyKeys: [],
      },
    },
    {
      name: "exact rule beats the learned name",
      lines: [line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto", purchaseDate: "2026-08-11", signedCents: -235651 })],
      entries: [
        entry({ entryKey: "t:tx-aluguel", name: "Aluguel", date: "2026-08-20", period: "2026-08", signedCents: -230000 }),
        entry({ entryKey: "t:tx-exato", name: "Outro", date: "2026-08-11", period: "2026-08", signedCents: -235651 }),
      ],
      context: accountContext,
      expected: {
        lines: [{ lineIndex: 0, status: "matched", rule: "exact", entryKey: "t:tx-exato", divergence: null }],
        appOnlyKeys: ["t:tx-aluguel"],
      },
    },
    {
      name: "two entries of the learned name in the period make the line ambiguous",
      lines: [line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto", purchaseDate: "2026-08-11", signedCents: -235651 })],
      entries: [
        entry({ entryKey: "t:tx-a", name: "Aluguel", date: "2026-08-20", period: "2026-08", signedCents: -230000 }),
        entry({ entryKey: "t:tx-b", name: "Aluguel", date: "2026-08-22", period: "2026-08", signedCents: -210000 }),
      ],
      context: accountContext,
      expected: {
        lines: [{ lineIndex: 0, status: "ambiguous", candidateKeys: ["t:tx-a", "t:tx-b"] }],
        appOnlyKeys: [],
      },
    },
    {
      name: "learned name is not used on a card target",
      lines: [line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto", purchaseDate: "2026-08-11", signedCents: -235651 })],
      entries: [
        entry({ entryKey: "t:tx-aluguel", name: "Aluguel", date: "2026-08-20", period: "2026-08", signedCents: -230000 }),
      ],
      context: { targetType: "card", nameMappings: LEARNED_NAMES },
      expected: {
        lines: [{ lineIndex: 0, status: "bank-only" }],
        appOnlyKeys: ["t:tx-aluguel"],
      },
    },
    {
      name: "learned name is not used without a mapping",
      lines: [line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto", purchaseDate: "2026-08-11", signedCents: -235651 })],
      entries: [
        entry({ entryKey: "t:tx-aluguel", name: "Aluguel", date: "2026-08-20", period: "2026-08", signedCents: -230000 }),
      ],
      context: { targetType: "account", nameMappings: {} },
      expected: {
        lines: [{ lineIndex: 0, status: "bank-only" }],
        appOnlyKeys: ["t:tx-aluguel"],
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const result = matchReconciliationLines({
        lines: c.lines,
        entries: c.entries,
        context: c.context ?? cardContext,
      });
      assert.deepEqual(result, c.expected);
    });
  }
});

test("matchReconciliationLines pools entries outside the file range without changing a stronger match", () => {
  const installmentLine = line({
    purchaseDate: "2026-08-11",
    signedCents: -180000,
    installment: { current: 2, total: 12 },
  });
  const series = entry({
    entryKey: "t:tx-serie",
    date: "2026-02-10",
    period: "2026-02",
    signedCents: -180000,
    installmentCount: 12,
    currentInstallment: 2,
  });
  const outOfRangePurchase = entry({
    entryKey: "t:tx-periodo",
    name: "Compra antiga",
    date: "2026-07-28",
    period: "2026-08",
    signedCents: -180000,
  });

  const withoutPool = matchReconciliationLines({
    lines: [installmentLine],
    entries: [series],
    context: cardContext,
  });
  const withPool = matchReconciliationLines({
    lines: [installmentLine],
    entries: [series, outOfRangePurchase],
    context: accountContext,
  });

  assert.deepEqual(withoutPool.lines, [
    { lineIndex: 0, status: "matched", rule: "installment", entryKey: "t:tx-serie", divergence: null },
  ]);
  assert.deepEqual(withPool.lines, [
    { lineIndex: 0, status: "matched", rule: "installment", entryKey: "t:tx-serie", divergence: null },
  ]);
  assert.deepEqual(withPool.appOnlyKeys, ["t:tx-periodo"]);
});

test("matchReconciliationLines matches the 86,59 invoice line against the 86,61 app entry", () => {
  const parsed = parseC6InvoiceCsv(invoiceFixture());
  const target = parsed.transactions.find((row) => row.name === "LOJA ESPACO TESTE");
  assert.ok(target);

  const result = matchReconciliationLines({
    lines: [toLine(target, 0)],
    entries: [
      entry({
        entryKey: "t:tx-space",
        date: target.purchaseDate,
        signedCents: -8661,
        installmentCount: 3,
        currentInstallment: 2,
      }),
    ],
    context: cardContext,
  });

  assert.deepEqual(result.lines, [
    {
      lineIndex: 0,
      status: "matched",
      rule: "cents",
      entryKey: "t:tx-space",
      divergence: { appCents: -8661, fileCents: -8659 },
    },
  ]);
});

test("detectMatchSuspicions reports the date and value reasons the operator must check", async (t) => {
  const cases: {
    name: string;
    line: ReconciliationLine;
    rule: "identity" | "installment" | "exact" | "cents" | "name-period";
    entry: ReconciliationEntry;
    fileStartDate: string | null;
    targetType: "account" | "card";
    expected: MatchSuspicion[];
  }[] = [
    {
      name: "Fernanda 26/10 matched with Terapia of 11/10, file from 12/10",
      line: line({ purchaseDate: "2026-10-26", signedCents: -27500 }),
      rule: "name-period",
      entry: entry({ date: "2026-10-11", signedCents: -27500 }),
      fileStartDate: "2026-10-12",
      targetType: "account",
      expected: [{ reason: "before-file-start", entryDate: "2026-10-11", fileStartDate: "2026-10-12" }],
    },
    {
      name: "Colegio 1.560,85 matched by identity with 1.643,00",
      line: line({ purchaseDate: "2026-10-15", signedCents: -156085 }),
      rule: "identity",
      entry: entry({ date: "2026-10-22", signedCents: -164300 }),
      fileStartDate: "2026-10-12",
      targetType: "account",
      expected: [{ reason: "amount-divergence", appCents: -164300, fileCents: -156085 }],
    },
    {
      name: "date reason comes first when both reasons apply",
      line: line({ purchaseDate: "2026-10-16", signedCents: -21000 }),
      rule: "identity",
      entry: entry({ date: "2026-10-09", signedCents: -20000 }),
      fileStartDate: "2026-10-12",
      targetType: "account",
      expected: [
        { reason: "before-file-start", entryDate: "2026-10-09", fileStartDate: "2026-10-12" },
        { reason: "amount-divergence", appCents: -20000, fileCents: -21000 },
      ],
    },
    {
      name: "estimated recurring account matched by name and period is not suspicious (Cemig)",
      line: line({ purchaseDate: "2026-10-16", signedCents: -10628 }),
      rule: "name-period",
      entry: entry({ date: "2026-10-16", signedCents: -11000 }),
      fileStartDate: "2026-10-12",
      targetType: "account",
      expected: [],
    },
    {
      name: "ordinary exact match is not suspicious",
      line: line({ purchaseDate: "2026-10-15", signedCents: -10628 }),
      rule: "exact",
      entry: entry({ date: "2026-10-15", signedCents: -10628 }),
      fileStartDate: "2026-10-12",
      targetType: "account",
      expected: [],
    },
    {
      name: "entry on the file start day is not before the file",
      line: line({ purchaseDate: "2026-10-13", signedCents: -5000 }),
      rule: "exact",
      entry: entry({ date: "2026-10-12", signedCents: -5000 }),
      fileStartDate: "2026-10-12",
      targetType: "account",
      expected: [],
    },
    {
      name: "old card installment is a legitimate match",
      line: line({ purchaseDate: "2025-01-14", signedCents: -180000 }),
      rule: "installment",
      entry: entry({ date: "2025-01-14", signedCents: -180000 }),
      fileStartDate: "2026-09-20",
      targetType: "card",
      expected: [],
    },
    {
      name: "rounding of the cents rule is not suspicious",
      line: line({ purchaseDate: "2026-10-10", signedCents: -8659 }),
      rule: "cents",
      entry: entry({ date: "2026-10-10", signedCents: -8661 }),
      fileStartDate: "2026-10-01",
      targetType: "card",
      expected: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(
        detectMatchSuspicions({
          line: c.line,
          rule: c.rule,
          entry: c.entry,
          fileStartDate: c.fileStartDate,
          targetType: c.targetType,
        }),
        c.expected,
      );
    });
  }
});

test("resolveAmountAlignment aligns to the file value unless the entry must keep its own", async (t) => {
  const fileLine = line({ signedCents: -23565 });
  const cases: {
    name: string;
    entry: Partial<ReconciliationEntry>;
    targetType: "account" | "card";
    expected: ReturnType<typeof resolveAmountAlignment>;
  }[] = [
    { name: "equal value needs no alignment", entry: { signedCents: -23565 }, targetType: "account", expected: { kind: "none" } },
    { name: "person split keeps its value", entry: { signedCents: -23000, hasSplits: true }, targetType: "account", expected: { kind: "kept", reason: "splits" } },
    { name: "transfer keeps its value", entry: { signedCents: -23000, isTransfer: true }, targetType: "account", expected: { kind: "kept", reason: "transfer" } },
    { name: "generated entry keeps its value", entry: { signedCents: -23000, isGenerated: true }, targetType: "account", expected: { kind: "kept", reason: "generated" } },
    { name: "entry of a paid invoice keeps its value", entry: { signedCents: -23000, inPaidInvoice: true }, targetType: "card", expected: { kind: "kept", reason: "paid-invoice" } },
    { name: "card recurring occurrence keeps its value", entry: { signedCents: -23000, isRecurring: true }, targetType: "card", expected: { kind: "kept", reason: "card-recurring" } },
    { name: "account recurring occurrence is aligned", entry: { signedCents: -23000, isRecurring: true }, targetType: "account", expected: { kind: "align", toCents: -23565 } },
    { name: "split takes precedence over transfer", entry: { signedCents: -23000, hasSplits: true, isTransfer: true }, targetType: "account", expected: { kind: "kept", reason: "splits" } },
    { name: "plain difference is aligned to the file", entry: { signedCents: -23000 }, targetType: "account", expected: { kind: "align", toCents: -23565 } },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(
        resolveAmountAlignment({
          line: fileLine,
          entry: entry(c.entry),
          targetType: c.targetType,
        }),
        c.expected,
      );
    });
  }
});

test("assignReconciliationBuckets puts every c6 statement line in bank-only when there are no entries", () => {
  const statement = parseC6StatementCsv(statementFixture());
  const lines = statement.transactions.map(toLine);
  const { lines: classification } = matchReconciliationLines({
    lines,
    entries: [],
    context: accountContext,
  });

  const buckets = assignReconciliationBuckets({
    lines,
    classification,
    entries: [],
    ignoredExternalIds: new Map(),
    fileStartDate: statement.period?.from ?? null,
    targetType: "account",
  });

  assert.equal(buckets.length, 113);
  assert.deepEqual(countBuckets(buckets), { "bank-only": 113 });
});

test("assignReconciliationBuckets keeps invoice credits informational and an ignored line out of bank-only", () => {
  const invoice = parseC6InvoiceCsv(invoiceFixture());
  const lines = invoice.transactions.map(toLine);
  const ignoredLine = lines.find((candidate) => candidate.name === "LOJA ESPACO TESTE");
  assert.ok(ignoredLine);

  const { lines: classification } = matchReconciliationLines({
    lines,
    entries: [],
    context: cardContext,
  });

  const buckets = assignReconciliationBuckets({
    lines,
    classification,
    entries: [],
    ignoredExternalIds: new Map([[ignoredLine.identity.externalId, "Taxa de teste"]]),
    fileStartDate: null,
    targetType: "card",
  });

  assert.deepEqual(countBuckets(buckets), {
    "bank-only": 95,
    ignored: 1,
    informational: 2,
  });
  assert.deepEqual(
    buckets.find((bucket) => bucket.bucket === "ignored"),
    {
      lineIndex: ignoredLine.index,
      bucket: "ignored",
      suspicions: [],
      ignoredReason: "Taxa de teste",
    },
  );
});

test("filterAppOnlyByScope limits account entries to the file range and card entries to the invoice period", async (t) => {
  const entries = [
    entry({ entryKey: "t:dentro", date: "2026-08-15", period: "2026-08" }),
    entry({ entryKey: "t:antes", date: "2026-07-31", period: "2026-07" }),
    entry({ entryKey: "t:depois", date: "2026-09-01", period: "2026-09" }),
  ];
  const cases: {
    name: string;
    entries: ReconciliationEntry[];
    scope: Parameters<typeof filterAppOnlyByScope>[1];
    expected: string[];
  }[] = [
    {
      name: "account keeps entries inside the file date range",
      entries,
      scope: { targetType: "account", from: "2026-08-01", to: "2026-08-31" },
      expected: ["t:dentro"],
    },
    {
      name: "card keeps entries of the invoice period, whatever the purchase date",
      entries: [
        entry({ entryKey: "t:mesmo-periodo", date: "2025-12-01", period: "2026-08" }),
        entry({ entryKey: "t:outro-periodo", period: "2026-07" }),
      ],
      scope: { targetType: "card", invoicePeriod: "2026-08" },
      expected: ["t:mesmo-periodo"],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(keysOf(filterAppOnlyByScope(c.entries, c.scope)), c.expected);
    });
  }
});

test("reclassifyPreviousInvoicePayments turns a payment up to the previous due date into an invoice payment", async (t) => {
  const cases: {
    name: string;
    lines: ReconciliationLine[];
    input: { invoicePeriod: string; dueDay: number };
    expected: (ReconciliationLine["lineKind"])[];
  }[] = [
    {
      name: "payments up to the previous due date settle that invoice, later ones are credits of this one",
      lines: [
        line({ purchaseDate: "2026-09-11", name: "Inclusao de Pagamento    ", lineKind: "credit", signedCents: 10000 }),
        line({ purchaseDate: "2026-09-15", name: "Inclusao de Pagamento", lineKind: "credit", signedCents: 10000 }),
        line({ purchaseDate: "2026-09-27", name: "Inclusao de Pagamento", lineKind: "credit", signedCents: 10000 }),
        line({ purchaseDate: "2026-09-10", name: "Estorno Tarifa", lineKind: "credit", signedCents: 7500 }),
        line({ purchaseDate: "2026-09-10", name: "LOJA", lineKind: "purchase" }),
      ],
      input: { invoicePeriod: "2026-10", dueDay: 15 },
      expected: ["invoice-payment", "invoice-payment", "credit", "credit", "purchase"],
    },
    {
      name: "a due date in the year wrap uses December of the previous year",
      lines: [
        line({ purchaseDate: "2025-12-05", name: "Inclusao de Pagamento", lineKind: "credit", signedCents: 10000 }),
      ],
      input: { invoicePeriod: "2026-01", dueDay: 5 },
      expected: ["invoice-payment"],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const result = reclassifyPreviousInvoicePayments(c.lines, c.input);
      assert.deepEqual(result.map((candidate) => candidate.lineKind), c.expected);
      assert.equal(c.lines[0]?.lineKind, "credit");
    });
  }
});

test("matchAccountByIdentification preselects only the single account whose name carries the file's account digits", async (t) => {
  const accounts = [
    { id: "conta-1", name: "C6 Bank 99999999" },
    { id: "conta-2", name: "Nubank 12345678" },
    { id: "conta-3", name: "Carteira" },
  ];
  const cases: {
    name: string;
    identification: string | null;
    accounts: { id: string; name: string }[];
    expected: string | null;
  }[] = [
    { name: "matches the account named with the file's number", identification: "1/99999999", accounts, expected: "conta-1" },
    { name: "ignores the agency segment", identification: "12345678/99999999", accounts, expected: "conta-1" },
    { name: "chooses nothing without identification", identification: null, accounts, expected: null },
    { name: "chooses nothing when no account matches", identification: "1/55555555", accounts, expected: null },
    {
      name: "chooses nothing when more than one account matches",
      identification: "1/99999999",
      accounts: [...accounts, { id: "conta-4", name: "C6 Bank 99999999 conjunta" }],
      expected: null,
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.equal(matchAccountByIdentification(c.identification, c.accounts), c.expected);
    });
  }
});

test("suggestLineName prefers the learned name for the merchant key and falls back to the description", async (t) => {
  const cases: {
    name: string;
    line: ReconciliationLine;
    nameMappings: Record<string, string>;
    expected: string;
  }[] = [
    {
      name: "uses the learned name when the merchant key was taught",
      line: line({ name: "CASA NOVA LOCADORA LTDA - EPP - Boleto" }),
      nameMappings: LEARNED_NAMES,
      expected: "Aluguel",
    },
    {
      name: "falls back to the raw description without a learned name",
      line: line({ name: "LOJA TESTE" }),
      nameMappings: {},
      expected: "LOJA TESTE",
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.equal(suggestLineName(c.line, c.nameMappings), c.expected);
    });
  }
});
