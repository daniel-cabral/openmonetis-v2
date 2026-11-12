import assert from "node:assert/strict";
import test from "node:test";
import {
  assignReconciliationBuckets,
  type LineClassification,
  type MatchRule,
  type ReconciliationEntry,
  type ReconciliationLine,
  type ReconciliationTargetType,
} from "./reconciliations";
import {
  buildReconciliationPlan,
  type LineDecision,
  parseEntryKey,
  ReconciliationPlanError,
  type ReconciliationPlanErrorCode,
} from "./reconciliations-plan";

const LEARNED_LINE_NAME = "CASA NOVA LOCADORA LTDA - EPP - Boleto";
const LEARNED_KEY = "casa nova locadora ltda - epp - boleto";

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
    name: "Compra teste",
    date: "2026-07-10",
    period: "2026-07",
    signedCents: -2590,
    installmentCount: null,
    currentInstallment: null,
    externalId: null,
    categoryId: null,
    isSettled: true,
    hasSplits: false,
    isTransfer: false,
    isGenerated: false,
    inPaidInvoice: false,
    isRecurring: false,
    ...overrides,
  };
}

function matched(
  lineIndex: number,
  entryKey: string,
  rule: MatchRule = "exact",
  divergence: { appCents: number; fileCents: number } | null = null,
): LineClassification {
  return { lineIndex, status: "matched", rule, entryKey, divergence };
}

function bankOnly(lineIndex: number): LineClassification {
  return { lineIndex, status: "bank-only" };
}

function ambiguous(lineIndex: number, candidateKeys: string[]): LineClassification {
  return { lineIndex, status: "ambiguous", candidateKeys };
}

type Scenario = {
  lines: ReconciliationLine[];
  classification: LineClassification[];
  entries?: ReconciliationEntry[];
  decisions?: LineDecision[];
  targetType?: ReconciliationTargetType;
  invoicePeriod?: string | null;
  ignored?: [string, string][];
};

// Buckets come from the real bucket assignment, so the plan sees what the service would pass.
function planFor(scenario: Scenario) {
  const targetType = scenario.targetType ?? "account";
  const entries = scenario.entries ?? [];
  const buckets = assignReconciliationBuckets({
    lines: scenario.lines,
    classification: scenario.classification,
    entries,
    ignoredExternalIds: new Map<string, string>(scenario.ignored ?? []),
    fileStartDate: null,
    targetType,
  });

  return buildReconciliationPlan({
    lines: scenario.lines,
    classification: scenario.classification,
    buckets,
    entries,
    decisions: scenario.decisions ?? [],
    targetType,
    invoicePeriod: scenario.invoicePeriod ?? null,
    defaultPersonId: "person-admin",
  });
}

function assertPlanError(run: () => unknown, code: ReconciliationPlanErrorCode) {
  assert.throws(
    run,
    (error) => error instanceof ReconciliationPlanError && error.code === code,
  );
}

test("create decisions become creations with the signed value, the period and the person", async (t) => {
  const cases: {
    name: string;
    targetType: ReconciliationTargetType;
    invoicePeriod: string | null;
    personId?: string;
    period: string;
    person: string;
  }[] = [
    {
      name: "account derives the period from the purchase date",
      targetType: "account",
      invoicePeriod: null,
      period: "2026-08",
      person: "person-admin",
    },
    {
      name: "card uses the invoice period over the purchase date",
      targetType: "card",
      invoicePeriod: "2026-09",
      period: "2026-09",
      person: "person-admin",
    },
    {
      name: "an explicit person replaces the default",
      targetType: "account",
      invoicePeriod: null,
      personId: "person-explicit",
      period: "2026-08",
      person: "person-explicit",
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const plan = planFor({
        lines: [
          line({
            purchaseDate: "2026-08-14",
            signedCents: -8659,
            identity: { sourceFingerprint: "source-a", externalId: "ext-create" },
          }),
        ],
        classification: [bankOnly(0)],
        targetType: c.targetType,
        invoicePeriod: c.invoicePeriod,
        decisions: [
          {
            lineIndex: 0,
            action: "create",
            name: "Mercado",
            categoryId: "category-1",
            ...(c.personId ? { personId: c.personId } : {}),
          },
        ],
      });

      assert.deepEqual(plan.creations, [
        {
          lineIndex: 0,
          name: "Mercado",
          signedCents: -8659,
          purchaseDate: "2026-08-14",
          period: c.period,
          categoryId: "category-1",
          personId: c.person,
          externalId: "ext-create",
        },
      ]);
    });
  }
});

test("a create decision with a blank name stops the apply", () => {
  assertPlanError(
    () =>
      planFor({
        lines: [line()],
        classification: [bankOnly(0)],
        decisions: [{ lineIndex: 0, action: "create", name: "   " }],
      }),
    "RECONCILIATION_EMPTY_NAME",
  );
});

test("keeping a matched settled entry only stamps its fingerprint", () => {
  const plan = planFor({
    lines: [line()],
    classification: [matched(0, "t:tx-1")],
    entries: [entry()],
  });

  assert.deepEqual(plan, {
    releases: [],
    creations: [],
    stamps: [
      { ref: { kind: "transaction", id: "tx-1" }, externalId: "ext-linha", lineIndex: 0 },
    ],
    alignments: [],
    settlements: [],
    ignores: [],
    categoryMappings: [],
    nameMappings: [],
  });
});

test("keeping a pending account entry settles it at the aligned value and the posting date", async (t) => {
  const cases: {
    name: string;
    line: Partial<ReconciliationLine>;
    entry: Partial<ReconciliationEntry>;
    divergence: { appCents: number; fileCents: number } | null;
    rule: MatchRule;
    settlements: { ref: { kind: "transaction"; id: string }; cents: number; date: string }[];
  }[] = [
    {
      name: "equal value settles at the entry value on the posting date",
      line: { postedDate: "2026-07-12" },
      entry: { isSettled: false },
      divergence: null,
      rule: "exact",
      settlements: [
        { ref: { kind: "transaction", id: "tx-1" }, cents: -2590, date: "2026-07-12" },
      ],
    },
    {
      name: "divergent value settles at the file value, dated by the purchase without a posting date",
      line: { postedDate: null },
      entry: { isSettled: false, signedCents: -2600 },
      divergence: { appCents: -2600, fileCents: -2590 },
      rule: "cents",
      settlements: [
        { ref: { kind: "transaction", id: "tx-1" }, cents: -2590, date: "2026-07-10" },
      ],
    },
    {
      name: "a kept value (splits) settles at the entry value",
      line: { postedDate: null },
      entry: { isSettled: false, signedCents: -2600, hasSplits: true },
      divergence: { appCents: -2600, fileCents: -2590 },
      rule: "cents",
      settlements: [
        { ref: { kind: "transaction", id: "tx-1" }, cents: -2600, date: "2026-07-10" },
      ],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const plan = planFor({
        lines: [line(c.line)],
        classification: [matched(0, "t:tx-1", c.rule, c.divergence)],
        entries: [entry(c.entry)],
      });

      assert.deepEqual(plan.settlements, c.settlements);
      assert.deepEqual(plan.alignments, []);
    });
  }
});

test("keeping a settled or card entry aligns it to the file value and never settles it", async (t) => {
  const cases: {
    name: string;
    targetType: ReconciliationTargetType;
    invoicePeriod: string | null;
    rule: MatchRule;
    entry: Partial<ReconciliationEntry>;
    alignments: { ref: { kind: "transaction"; id: string }; toCents: number }[];
  }[] = [
    {
      name: "a settled account entry takes the file value",
      targetType: "account",
      invoicePeriod: null,
      rule: "identity",
      entry: { isSettled: true, signedCents: -2600 },
      alignments: [{ ref: { kind: "transaction", id: "tx-1" }, toCents: -2590 }],
    },
    {
      name: "a generated pending account entry keeps its value",
      targetType: "account",
      invoicePeriod: null,
      rule: "cents",
      entry: { isSettled: false, isGenerated: true, signedCents: -2600 },
      alignments: [],
    },
    {
      name: "a pending card entry takes the file value",
      targetType: "card",
      invoicePeriod: "2026-07",
      rule: "cents",
      entry: { isSettled: false, signedCents: -2600 },
      alignments: [{ ref: { kind: "transaction", id: "tx-1" }, toCents: -2590 }],
    },
    {
      name: "a card entry with splits keeps its value",
      targetType: "card",
      invoicePeriod: "2026-07",
      rule: "cents",
      entry: { isSettled: false, signedCents: -2600, hasSplits: true },
      alignments: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const plan = planFor({
        lines: [line()],
        classification: [
          matched(0, "t:tx-1", c.rule, { appCents: -2600, fileCents: -2590 }),
        ],
        entries: [entry({ ...c.entry, period: "2026-07" })],
        targetType: c.targetType,
        invoicePeriod: c.invoicePeriod,
      });

      assert.deepEqual(plan.alignments, c.alignments);
      assert.deepEqual(plan.settlements, []);
    });
  }
});

test("linking stamps the chosen entry and learns its name on both targets", async (t) => {
  const cases: {
    name: string;
    targetType: ReconciliationTargetType;
    invoicePeriod: string | null;
    typedName: string | undefined;
    learnedName: string;
  }[] = [
    { name: "account target", targetType: "account", invoicePeriod: null, typedName: "Aluguel", learnedName: "Aluguel" },
    { name: "card target", targetType: "card", invoicePeriod: "2026-07", typedName: "Aluguel", learnedName: "Aluguel" },
    { name: "account target without a typed name learns the entry name", targetType: "account", invoicePeriod: null, typedName: undefined, learnedName: "Compra teste" },
    { name: "card target without a typed name learns the entry name", targetType: "card", invoicePeriod: "2026-07", typedName: undefined, learnedName: "Compra teste" },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const plan = planFor({
        lines: [line({ name: LEARNED_LINE_NAME })],
        classification: [bankOnly(0)],
        entries: [entry({ entryKey: "t:tx-7" })],
        decisions: [
          { lineIndex: 0, action: "link", entryKey: "t:tx-7", name: c.typedName },
        ],
        targetType: c.targetType,
        invoicePeriod: c.invoicePeriod,
      });

      assert.deepEqual(plan.stamps, [
        { ref: { kind: "transaction", id: "tx-7" }, externalId: "ext-linha", lineIndex: 0 },
      ]);
      assert.deepEqual(plan.nameMappings, [
        { descriptionKey: LEARNED_KEY, name: c.learnedName },
      ]);
    });
  }
});

test("keeping learns the category of the matched entry under the merchant key, never a name", () => {
  const plan = planFor({
    lines: [
      line({ index: 0, identity: { sourceFingerprint: "source-a", externalId: "ext-0" }, name: "DROGASIL2919" }),
      line({ index: 1, identity: { sourceFingerprint: "source-a", externalId: "ext-1" }, name: "DROGASIL 4471" }),
      line({ index: 2, identity: { sourceFingerprint: "source-a", externalId: "ext-2" }, name: "   " }),
    ],
    classification: [matched(0, "t:tx-1"), matched(1, "t:tx-2"), matched(2, "t:tx-3")],
    entries: [
      entry({ entryKey: "t:tx-1", categoryId: "category-1" }),
      entry({ entryKey: "t:tx-2", categoryId: "category-2" }),
      entry({ entryKey: "t:tx-3", categoryId: "category-3" }),
    ],
  });

  assert.deepEqual(plan.categoryMappings, [
    { descriptionKey: "drogasil", categoryId: "category-2" },
  ]);
  assert.deepEqual(plan.nameMappings, []);
});

test("a created name is learned only on account targets, keyed by the file description", async (t) => {
  const cases: {
    name: string;
    targetType: ReconciliationTargetType;
    invoicePeriod: string | null;
    nameMappings: { descriptionKey: string; name: string }[];
  }[] = [
    {
      name: "account target learns the typed name under the description key",
      targetType: "account",
      invoicePeriod: null,
      nameMappings: [{ descriptionKey: LEARNED_KEY, name: "Aluguel" }],
    },
    {
      name: "card target learns no name",
      targetType: "card",
      invoicePeriod: "2026-07",
      nameMappings: [],
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const plan = planFor({
        lines: [line({ name: LEARNED_LINE_NAME })],
        classification: [bankOnly(0)],
        decisions: [{ lineIndex: 0, action: "create", name: "Aluguel" }],
        targetType: c.targetType,
        invoicePeriod: c.invoicePeriod,
      });

      assert.deepEqual(plan.nameMappings, c.nameMappings);
    });
  }
});

test("repeated merchant keys collapse to the last line's name and category", () => {
  const plan = planFor({
    lines: [
      line({ index: 0, identity: { sourceFingerprint: "source-a", externalId: "ext-0" }, name: "DROGASIL2919" }),
      line({ index: 1, identity: { sourceFingerprint: "source-a", externalId: "ext-1" }, name: "DROGASIL 4471" }),
    ],
    classification: [bankOnly(0), bankOnly(1)],
    decisions: [
      { lineIndex: 0, action: "create", name: "Farmacia", categoryId: "category-1" },
      { lineIndex: 1, action: "create", name: "Remedios", categoryId: "category-2" },
    ],
  });

  assert.deepEqual(plan.nameMappings, [{ descriptionKey: "drogasil", name: "Remedios" }]);
  assert.deepEqual(plan.categoryMappings, [{ descriptionKey: "drogasil", categoryId: "category-2" }]);
});

test("a blank merchant name learns no name and no category", () => {
  const plan = planFor({
    lines: [line({ name: "   " })],
    classification: [bankOnly(0)],
    decisions: [
      { lineIndex: 0, action: "create", name: "Mercado", categoryId: "category-1" },
    ],
  });

  assert.equal(plan.creations.length, 1);
  assert.deepEqual(plan.nameMappings, []);
  assert.deepEqual(plan.categoryMappings, []);
});

test("an ignore decision records the trimmed reason against the line's external id", () => {
  const plan = planFor({
    lines: [line()],
    classification: [bankOnly(0)],
    decisions: [
      { lineIndex: 0, action: "ignore", ignoreReason: "  Pagamento de fatura  " },
    ],
  });

  assert.deepEqual(plan.ignores, [
    { externalId: "ext-linha", reason: "Pagamento de fatura" },
  ]);
});

test("create, link and skip on an identity-matched line release the old entry first", async (t) => {
  const cases: { name: string; decision: LineDecision }[] = [
    { name: "create", decision: { lineIndex: 0, action: "create", name: "Mercado" } },
    {
      name: "link",
      decision: { lineIndex: 0, action: "link", entryKey: "t:tx-2", name: "Aluguel" },
    },
    { name: "skip", decision: { lineIndex: 0, action: "skip" } },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const plan = planFor({
        lines: [line()],
        classification: [matched(0, "t:tx-1", "identity")],
        entries: [
          entry({ entryKey: "t:tx-1", externalId: "ext-linha" }),
          entry({ entryKey: "t:tx-2" }),
        ],
        decisions: [c.decision],
      });

      assert.deepEqual(plan.releases, [
        { ref: { kind: "transaction", id: "tx-1" }, externalId: "ext-linha" },
      ]);
    });
  }
});

test("keeping an identity-matched line neither releases nor stamps it again", () => {
  const plan = planFor({
    lines: [line()],
    classification: [matched(0, "t:tx-1", "identity")],
    entries: [entry({ externalId: "ext-linha", categoryId: "category-1" })],
  });

  assert.deepEqual(plan.releases, []);
  assert.deepEqual(plan.stamps, []);
  assert.deepEqual(plan.categoryMappings, [{ descriptionKey: "loja teste", categoryId: "category-1" }]);
});

test("a plan with nothing to write is rejected as nothing to apply", async (t) => {
  const cases: { name: string; scenario: Scenario }[] = [
    {
      name: "a bank-only line that is skipped",
      scenario: {
        lines: [line()],
        classification: [bankOnly(0)],
        decisions: [{ lineIndex: 0, action: "skip" }],
      },
    },
    {
      name: "a matched line skipped without a release",
      scenario: {
        lines: [line()],
        classification: [matched(0, "t:tx-1")],
        entries: [entry()],
        decisions: [{ lineIndex: 0, action: "skip" }],
      },
    },
    {
      name: "a bank-only line with no decision at all",
      scenario: { lines: [line()], classification: [bankOnly(0)] },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assertPlanError(() => planFor(c.scenario), "RECONCILIATION_NOTHING_TO_APPLY");
    });
  }
});

test("a decision that no longer fits the classification is rejected as stale", async (t) => {
  const cases: { name: string; scenario: Scenario }[] = [
    {
      name: "a decision on an ignored line",
      scenario: {
        lines: [line()],
        classification: [bankOnly(0)],
        ignored: [["ext-linha", "Pagamento de fatura"]],
        decisions: [{ lineIndex: 0, action: "create", name: "Mercado" }],
      },
    },
    {
      name: "a decision on an informational invoice line",
      scenario: {
        lines: [line({ lineKind: "credit" })],
        classification: [bankOnly(0)],
        decisions: [{ lineIndex: 0, action: "create", name: "Mercado" }],
      },
    },
    {
      name: "a decision on an unknown line index",
      scenario: {
        lines: [line()],
        classification: [bankOnly(0)],
        decisions: [{ lineIndex: 9, action: "create", name: "Mercado" }],
      },
    },
    {
      name: "keep on an ambiguous line without an entry",
      scenario: {
        lines: [line()],
        classification: [ambiguous(0, ["t:tx-1", "t:tx-2"])],
        entries: [entry({ entryKey: "t:tx-1" }), entry({ entryKey: "t:tx-2" })],
        decisions: [{ lineIndex: 0, action: "keep" }],
      },
    },
    {
      name: "keep on an ambiguous line naming an entry outside its candidates",
      scenario: {
        lines: [line()],
        classification: [ambiguous(0, ["t:tx-1", "t:tx-2"])],
        entries: [entry({ entryKey: "t:tx-1" }), entry({ entryKey: "t:tx-2" })],
        decisions: [{ lineIndex: 0, action: "keep", entryKey: "t:tx-3" }],
      },
    },
    {
      name: "link to an entry another line keeps",
      scenario: {
        lines: [
          line({ index: 0, identity: { sourceFingerprint: "source-a", externalId: "ext-1" } }),
          line({ index: 1, identity: { sourceFingerprint: "source-a", externalId: "ext-2" } }),
        ],
        classification: [matched(0, "t:tx-1"), bankOnly(1)],
        entries: [entry({ entryKey: "t:tx-1" })],
        decisions: [{ lineIndex: 1, action: "link", entryKey: "t:tx-1", name: "Aluguel" }],
      },
    },
    {
      name: "keep on a bank-only line",
      scenario: {
        lines: [line()],
        classification: [bankOnly(0)],
        decisions: [{ lineIndex: 0, action: "keep" }],
      },
    },
    {
      name: "keep naming a different entry than the matched one",
      scenario: {
        lines: [line()],
        classification: [matched(0, "t:tx-1")],
        entries: [entry({ entryKey: "t:tx-1" }), entry({ entryKey: "t:tx-2" })],
        decisions: [{ lineIndex: 0, action: "keep", entryKey: "t:tx-2" }],
      },
    },
    {
      name: "link without an entry key",
      scenario: {
        lines: [line()],
        classification: [bankOnly(0)],
        entries: [entry({ entryKey: "t:tx-1" })],
        decisions: [{ lineIndex: 0, action: "link", name: "Aluguel" }],
      },
    },
    {
      name: "link to an entry outside the line's period",
      scenario: {
        lines: [line()],
        classification: [bankOnly(0)],
        entries: [entry({ entryKey: "t:tx-9", period: "2026-08" })],
        decisions: [{ lineIndex: 0, action: "link", entryKey: "t:tx-9", name: "Aluguel" }],
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assertPlanError(() => planFor(c.scenario), "RECONCILIATION_STALE");
    });
  }
});

test("linking an ambiguous line to one of its candidates stamps that entry", () => {
  const plan = planFor({
    lines: [line()],
    classification: [ambiguous(0, ["t:tx-1", "t:tx-2"])],
    entries: [entry({ entryKey: "t:tx-1" }), entry({ entryKey: "t:tx-2" })],
    decisions: [{ lineIndex: 0, action: "link", entryKey: "t:tx-2", name: "Aluguel" }],
  });

  assert.deepEqual(plan.releases, []);
  assert.deepEqual(plan.stamps, [
    { ref: { kind: "transaction", id: "tx-2" }, externalId: "ext-linha", lineIndex: 0 },
  ]);
});

test("a mixed review writes keep, create, ignore and skip exactly as decided", () => {
  const plan = planFor({
    lines: [
      line({ index: 0, identity: { sourceFingerprint: "source-a", externalId: "ext-0" }, name: "LOJA TESTE" }),
      line({
        index: 1,
        identity: { sourceFingerprint: "source-a", externalId: "ext-1" },
        name: LEARNED_LINE_NAME,
      }),
      line({
        index: 2,
        identity: { sourceFingerprint: "source-a", externalId: "ext-2" },
        name: "PAGAMENTO FATURA",
        signedCents: -10000,
      }),
      line({
        index: 3,
        identity: { sourceFingerprint: "source-a", externalId: "ext-3" },
        name: "PAG BOLETO",
        signedCents: -500,
      }),
    ],
    classification: [matched(0, "t:tx-1"), bankOnly(1), bankOnly(2), bankOnly(3)],
    entries: [entry({ entryKey: "t:tx-1" })],
    decisions: [
      { lineIndex: 1, action: "create", name: "Aluguel" },
      { lineIndex: 2, action: "ignore", ignoreReason: "Pagamento de fatura" },
      { lineIndex: 3, action: "skip" },
    ],
  });

  assert.deepEqual(plan, {
    releases: [],
    creations: [
      {
        lineIndex: 1,
        name: "Aluguel",
        signedCents: -2590,
        purchaseDate: "2026-07-10",
        period: "2026-07",
        categoryId: null,
        personId: "person-admin",
        externalId: "ext-1",
      },
    ],
    stamps: [
      { ref: { kind: "transaction", id: "tx-1" }, externalId: "ext-0", lineIndex: 0 },
    ],
    alignments: [],
    settlements: [],
    ignores: [{ externalId: "ext-2", reason: "Pagamento de fatura" }],
    categoryMappings: [],
    nameMappings: [{ descriptionKey: LEARNED_KEY, name: "Aluguel" }],
  });
});

test("parseEntryKey reads transaction and occurrence keys and rejects anything else", async (t) => {
  const cases: { name: string; entryKey: string; expected: unknown }[] = [
    {
      name: "a transaction key",
      entryKey: "t:tx-1",
      expected: { kind: "transaction", id: "tx-1" },
    },
    {
      name: "an occurrence key carries the rule and the date",
      entryKey: "o:rule-1:2026-07-10",
      expected: { kind: "occurrence", ruleId: "rule-1", date: "2026-07-10" },
    },
    { name: "an unknown prefix", entryKey: "x:tx-1", expected: null },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(parseEntryKey(c.entryKey), c.expected);
    });
  }
});
