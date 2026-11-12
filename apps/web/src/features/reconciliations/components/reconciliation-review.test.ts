import assert from "node:assert/strict";
import test from "node:test";
import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import {
  applyBlockReason,
  buildClosureView,
  buildProjectionView,
  candidateOptions,
  consumedEntryKeys,
  defaultProfileId,
  hasApplicableDecision,
  initialDecisions,
  linkOptions,
  markAllBankOnlyAsCreate,
  toApplyDecisions,
  type UiDecisions,
} from "./reconciliation-review";

type Preview = ReconciliationPreview;
type PreviewLine = Preview["lines"][number];
type PreviewEntry = Preview["entries"][number];

const ADMIN_PERSON_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_PERSON_ID = "00000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000010";

function line(
  overrides: Partial<PreviewLine> & Pick<PreviewLine, "index" | "bucket">,
): PreviewLine {
  return {
    purchaseDate: "2026-08-10",
    postedDate: null,
    amount: 100,
    signedCents: -10000,
    type: "expense",
    name: "LOJA TESTE",
    installment: null,
    lineKind: "purchase",
    rule: null,
    entryKey: null,
    candidateKeys: [],
    divergence: null,
    alignment: { kind: "none", reason: null },
    suspicions: [],
    ignoredReason: null,
    suggestedName: "Loja teste",
    suggestedCategoryId: null,
    ...overrides,
  };
}

function entry(
  overrides: Pick<PreviewEntry, "entryKey" | "name" | "date" | "period">,
): PreviewEntry {
  return { amount: 100, type: "expense", categoryId: null, ...overrides };
}

function review(
  lines: PreviewLine[],
  entries: PreviewEntry[] = [],
  invoicePeriod: string | null = null,
): Preview {
  return {
    fileRange: null,
    invoicePeriod,
    lines,
    entries,
    closure: null,
    projection: null,
    appOnlyKeys: [],
    counts: {
      needsDecision: 0,
      matched: 0,
      bankOnly: 0,
      ambiguous: 0,
      ignored: 0,
      informational: 0,
      appOnly: 0,
    },
    classificationDigest: "0".repeat(64),
  };
}

test("defaultProfileId prefers the detected profile, then the first one, then null", () => {
  const profiles = [{ id: "c6-statement" }, { id: "c6-invoice" }];
  const cases = [
    {
      detection: { detectedProfileId: "c6-invoice", profiles },
      expected: "c6-invoice",
    },
    {
      detection: { detectedProfileId: null, profiles },
      expected: "c6-statement",
    },
    {
      detection: { detectedProfileId: null, profiles: [] },
      expected: null,
    },
  ];

  for (const { detection, expected } of cases) {
    assert.equal(defaultProfileId(detection), expected);
  }
});

test("untouched lines keep the server default and send no decision", () => {
  const lines = [
    line({ index: 0, bucket: "matched", rule: "exact", entryKey: "entry-1" }),
    line({ index: 1, bucket: "needs-decision", rule: "identity", entryKey: "entry-2" }),
    line({ index: 2, bucket: "bank-only" }),
    line({ index: 3, bucket: "ambiguous", candidateKeys: ["entry-3", "entry-4"] }),
    line({ index: 4, bucket: "ignored", ignoredReason: "Pagamento" }),
    line({ index: 5, bucket: "informational", lineKind: "invoice-payment" }),
  ];
  const preview = review(lines);

  assert.deepEqual(toApplyDecisions(initialDecisions(preview, ADMIN_PERSON_ID), preview), []);
});

test("consumed entries map to the line that consumes them, released matches are free", () => {
  const lines = [
    line({ index: 0, bucket: "matched", rule: "exact", entryKey: "entry-1" }),
    line({ index: 1, bucket: "bank-only" }),
    line({ index: 2, bucket: "matched", rule: "identity", entryKey: "entry-3" }),
    line({ index: 3, bucket: "ambiguous", candidateKeys: ["entry-4", "entry-5"] }),
    line({ index: 4, bucket: "matched", rule: "exact", entryKey: "entry-6" }),
  ];
  const preview = review(lines);
  const decisions = initialDecisions(preview, ADMIN_PERSON_ID);
  decisions[1] = { ...decisions[1], action: "link", entryKey: "entry-2" };
  decisions[2] = { ...decisions[2], action: "skip" };
  decisions[3] = { ...decisions[3], action: "keep", entryKey: "entry-5" };
  decisions[4] = { ...decisions[4], action: "keep", entryKey: "entry-7" };

  assert.deepEqual(
    consumedEntryKeys(decisions, preview),
    new Map([
      ["entry-1", 0],
      ["entry-2", 1],
      ["entry-5", 3],
      ["entry-6", 4],
    ]),
  );
});

const linkPeriodCases = [
  {
    label: "card line lists the invoice period, not the purchase month",
    invoicePeriod: "2026-08",
    purchaseDate: "2026-07-28",
    expectedKeys: ["entry-aug"],
  },
  {
    label: "account line lists the purchase month",
    invoicePeriod: null,
    purchaseDate: "2026-08-11",
    expectedKeys: ["entry-aug"],
  },
];

for (const { label, invoicePeriod, purchaseDate, expectedKeys } of linkPeriodCases) {
  test(`link options: ${label}`, () => {
    const preview = review(
      [line({ index: 0, bucket: "bank-only", purchaseDate })],
      [
        entry({ entryKey: "entry-aug", name: "Mercado", date: "2026-08-05", period: "2026-08" }),
        entry({ entryKey: "entry-jul", name: "Padaria", date: "2026-07-20", period: "2026-07" }),
      ],
      invoicePeriod,
    );

    const options = linkOptions(preview.lines[0], preview, new Map());

    assert.deepEqual(
      options.map((option) => option.entryKey),
      expectedKeys,
    );
  });
}

test("link options flag entries consumed by another line and keep the own pick available", () => {
  const preview = review(
    [line({ index: 3, bucket: "bank-only", purchaseDate: "2026-08-11" })],
    [
      entry({ entryKey: "entry-aug", name: "Mercado", date: "2026-08-05", period: "2026-08" }),
      entry({ entryKey: "entry-aug-2", name: "Farmácia", date: "2026-08-06", period: "2026-08" }),
    ],
  );

  const options = linkOptions(
    preview.lines[0],
    preview,
    new Map([
      ["entry-aug", 3],
      ["entry-aug-2", 9],
    ]),
  );

  assert.deepEqual(options, [
    {
      entryKey: "entry-aug",
      name: "Mercado",
      date: "2026-08-05",
      amount: "100.00",
      unavailable: false,
    },
    {
      entryKey: "entry-aug-2",
      name: "Farmácia",
      date: "2026-08-06",
      amount: "100.00",
      unavailable: true,
    },
  ]);
});

const applyBlockCases = [
  { blankNames: 0, expected: null },
  { blankNames: 1, expected: "1 criação(ões) sem nome" },
  { blankNames: 2, expected: "2 criação(ões) sem nome" },
];

for (const { blankNames, expected } of applyBlockCases) {
  test(`apply block counts creations without a name: ${blankNames} blank`, () => {
    const lines = [0, 1, 2].map((index) => line({ index, bucket: "bank-only" }));
    const preview = review(lines);
    const decisions = markAllBankOnlyAsCreate(initialDecisions(preview, ADMIN_PERSON_ID), preview);
    for (const index of [0, 1, 2]) {
      decisions[index] = { ...decisions[index], name: index < blankNames ? "   " : "Loja" };
    }

    assert.equal(applyBlockReason(decisions), expected);
  });
}

const unfinishedDecisionCases: {
  label: string;
  patch: Partial<UiDecisions[number]>;
  expected: string;
}[] = [
  {
    label: "an ignore without a reason",
    patch: { action: "ignore", ignoreReason: "  " },
    expected: "1 ignorada(s) sem motivo",
  },
  {
    label: "a link without an entry",
    patch: { action: "link", entryKey: null },
    expected: "1 vínculo(s) sem lançamento",
  },
];

for (const { label, patch, expected } of unfinishedDecisionCases) {
  test(`apply is blocked by ${label}`, () => {
    const preview = review([line({ index: 0, bucket: "bank-only" })]);
    const decisions = initialDecisions(preview, ADMIN_PERSON_ID);
    decisions[0] = { ...decisions[0], ...patch };

    assert.equal(applyBlockReason(decisions), expected);
  });
}

test("link options for an ambiguous line come from its candidates, not from the line's period", () => {
  const preview = review(
    [
      line({
        index: 0,
        bucket: "ambiguous",
        purchaseDate: "2026-10-31",
        candidateKeys: ["entry-nov", "entry-nov-2"],
      }),
    ],
    [
      entry({ entryKey: "entry-nov", name: "Mercado", date: "2026-11-01", period: "2026-11" }),
      entry({ entryKey: "entry-nov-2", name: "Padaria", date: "2026-11-02", period: "2026-11" }),
      entry({ entryKey: "entry-oct", name: "Farmácia", date: "2026-10-30", period: "2026-10" }),
    ],
  );

  assert.deepEqual(
    candidateOptions(preview.lines[0], preview, new Map()).map((option) => option.entryKey),
    ["entry-nov", "entry-nov-2"],
  );
});

test("mark all as create turns only skipped bank-only lines into creations", () => {
  const lines = Array.from({ length: 22 }, (_, index) => line({ index, bucket: "bank-only" }));
  const preview = review(lines);
  const decisions = initialDecisions(preview, ADMIN_PERSON_ID);
  decisions[20] = { ...decisions[20], action: "link", entryKey: "entry-1" };
  decisions[21] = { ...decisions[21], action: "ignore", ignoreReason: "Pagamento" };

  const marked = markAllBankOnlyAsCreate(decisions, preview);
  const actions = Object.values(marked).map((decision) => decision.action);

  assert.equal(actions.filter((action) => action === "create").length, 20);
  assert.equal(marked[20].action, "link");
  assert.equal(marked[21].action, "ignore");
});

const applicableCases: {
  label: string;
  bucket: PreviewLine["bucket"];
  rule: PreviewLine["rule"];
  action: UiDecisions[number]["action"];
  expected: boolean;
}[] = [
  {
    label: "a skip on an identity-matched line counts",
    bucket: "matched",
    rule: "identity",
    action: "skip",
    expected: true,
  },
  {
    label: "a keep on an identity-matched line is the default",
    bucket: "matched",
    rule: "identity",
    action: "keep",
    expected: false,
  },
  {
    label: "a skip on a bank-only line is the default",
    bucket: "bank-only",
    rule: null,
    action: "skip",
    expected: false,
  },
];

for (const { label, bucket, rule, action, expected } of applicableCases) {
  test(`applicable decision: ${label}`, () => {
    const preview = review([line({ index: 0, bucket, rule, entryKey: "entry-1" })]);
    const decisions = initialDecisions(preview, ADMIN_PERSON_ID);
    decisions[0] = { ...decisions[0], action };

    assert.equal(hasApplicableDecision(decisions, preview), expected);
  });
}

test("apply sends only the lines that differ from the default, in wire shape", () => {
  const lines = [
    line({
      index: 0,
      bucket: "bank-only",
      suggestedName: "Aluguel",
      suggestedCategoryId: CATEGORY_ID,
    }),
    line({ index: 1, bucket: "bank-only" }),
    line({ index: 2, bucket: "matched", rule: "exact", entryKey: "entry-1" }),
    line({ index: 3, bucket: "bank-only" }),
    line({ index: 4, bucket: "ambiguous", candidateKeys: ["entry-7", "entry-8"] }),
  ];
  const preview = review(lines);
  const decisions: UiDecisions = markAllBankOnlyAsCreate(
    initialDecisions(preview, ADMIN_PERSON_ID),
    preview,
  );
  decisions[1] = { ...decisions[1], action: "link", entryKey: "entry-aug" };
  decisions[3] = { ...decisions[3], action: "ignore", ignoreReason: "Pagamento de fatura" };
  decisions[4] = { ...decisions[4], action: "keep", entryKey: "entry-8" };

  assert.deepEqual(toApplyDecisions(decisions, preview), [
    {
      lineIndex: 0,
      action: "create",
      name: "Aluguel",
      categoryId: CATEGORY_ID,
      personId: ADMIN_PERSON_ID,
    },
    { lineIndex: 1, action: "link", entryKey: "entry-aug" },
    { lineIndex: 3, action: "ignore", ignoreReason: "Pagamento de fatura" },
    { lineIndex: 4, action: "keep", entryKey: "entry-8" },
  ]);
});

const statementClosure = {
  kind: "statement" as const,
  closes: true,
  days: [],
  unverifiedDays: [],
  divergences: [],
  finalBalance: { date: "2026-11-11", cents: 84344 },
};

test("closure view follows the preview kind and waits for a typed invoice total", () => {
  const accountPreviewView = { ...review([]), closure: statementClosure };
  const invoiceClosure = { kind: "invoice" as const, netCents: 2590 };
  const cardPreview = { ...review([], [], "2026-11"), closure: invoiceClosure };

  assert.deepEqual(buildClosureView(accountPreviewView, null), {
    kind: "statement",
    closure: statementClosure,
  });
  assert.equal(buildClosureView(cardPreview, null), null);
  assert.deepEqual(buildClosureView(cardPreview, 2590), {
    kind: "invoice",
    closure: { closes: true, netCents: 2590, expectedCents: 2590, differenceCents: 0 },
  });
  assert.deepEqual(buildClosureView(cardPreview, 1000), {
    kind: "invoice",
    closure: { closes: false, netCents: 2590, expectedCents: 1000, differenceCents: -1590 },
  });
});

const accountPreview: Preview = {
  ...review([
    line({
      index: 0,
      bucket: "matched",
      rule: "exact",
      entryKey: "t:terapia",
      amount: 275,
      signedCents: -27500,
    }),
    line({ index: 1, bucket: "bank-only", amount: 1643, signedCents: -164300 }),
  ]),
  closure: statementClosure,
  projection: {
    kind: "account",
    cutoffDate: "2026-11-11",
    baselineCents: 111844,
    entries: [
      {
        entryKey: "t:terapia",
        name: "Terapia",
        postingDate: "2026-10-16",
        period: "2026-10",
        signedCents: -27500,
        alignable: true,
        status: "in-balance",
      },
      {
        entryKey: "t:mensalidade",
        name: "Mensalidade Colégio Santo Agostinho",
        postingDate: "2026-11-22",
        period: "2026-11",
        signedCents: -164300,
        alignable: true,
        status: "after-end",
      },
    ],
  },
};

test("account projection keeps the app balance until a decision moves it", () => {
  const decisions = initialDecisions(accountPreview, ADMIN_PERSON_ID);
  const pendingAfterEnd = {
    entryKey: "t:mensalidade",
    name: "Mensalidade Colégio Santo Agostinho",
    date: "2026-11-22",
    signedCents: -164300,
  };
  const cases = [
    {
      name: "the line kept against the entry",
      decisions,
      expected: { projectedCents: 111844, differenceCents: 27500, matches: false },
    },
    {
      name: "the line created for the admin",
      decisions: {
        ...decisions,
        0: {
          ...decisions[0],
          action: "create" as const,
          name: "Terapia",
          personId: ADMIN_PERSON_ID,
        },
      },
      expected: { projectedCents: 84344, differenceCents: 0, matches: true },
    },
    {
      name: "the line created for another person",
      decisions: {
        ...decisions,
        0: {
          ...decisions[0],
          action: "create" as const,
          name: "Terapia",
          personId: OTHER_PERSON_ID,
        },
      },
      expected: { projectedCents: 111844, differenceCents: 27500, matches: false },
    },
  ];

  for (const { name, decisions: current, expected } of cases) {
    const view = buildProjectionView({
      preview: accountPreview,
      decisions: current,
      adminPersonId: ADMIN_PERSON_ID,
      invoiceTotalCents: null,
    });
    assert.ok(view?.kind === "account", name);
    assert.equal(view.projectedCents, expected.projectedCents, name);
    assert.deepEqual(view.target, { date: "2026-11-11", cents: 84344 }, name);
    assert.deepEqual(
      view.comparison,
      {
        differenceCents: expected.differenceCents,
        matches: expected.matches,
      },
      name,
    );
    assert.deepEqual(view.paidAfterEnd, [pendingAfterEnd], name);
  }
});

test("a line linked to a paid-after-end entry removes it from the pending list", () => {
  const decisions = initialDecisions(accountPreview, ADMIN_PERSON_ID);
  const view = buildProjectionView({
    preview: accountPreview,
    decisions: {
      ...decisions,
      1: { ...decisions[1], action: "link" as const, entryKey: "t:mensalidade" },
    },
    adminPersonId: ADMIN_PERSON_ID,
    invoiceTotalCents: null,
  });
  assert.ok(view?.kind === "account");
  assert.equal(view.projectedCents, -52456);
  assert.deepEqual(view.paidAfterEnd, []);
});

const cardPreview: Preview = {
  ...review(
    [
      line({
        index: 0,
        bucket: "matched",
        rule: "exact",
        entryKey: "t:b",
        amount: 55,
        signedCents: -5500,
      }),
      line({ index: 1, bucket: "bank-only", amount: 30, signedCents: -3000 }),
    ],
    [],
    "2026-11",
  ),
  projection: {
    kind: "card",
    invoicePeriod: "2026-11",
    entries: [
      {
        entryKey: "t:a",
        name: "A",
        postingDate: "2026-11-05",
        period: "2026-11",
        signedCents: -10000,
        alignable: true,
        status: null,
      },
      {
        entryKey: "t:b",
        name: "B",
        postingDate: "2026-11-06",
        period: "2026-11",
        signedCents: -5000,
        alignable: true,
        status: null,
      },
      {
        entryKey: "t:c",
        name: "C",
        postingDate: "2026-11-07",
        period: "2026-11",
        signedCents: 2000,
        alignable: true,
        status: null,
      },
      {
        entryKey: "t:d",
        name: "D",
        postingDate: "2026-10-07",
        period: "2026-10",
        signedCents: -99900,
        alignable: true,
        status: null,
      },
    ],
  },
};

test("card projection compares against a typed total only when one is present", () => {
  const decisions = initialDecisions(cardPreview, ADMIN_PERSON_ID);
  const withCreate = {
    ...decisions,
    1: { ...decisions[1], action: "create" as const, name: "Compra", personId: ADMIN_PERSON_ID },
  };
  const cases = [
    {
      name: "typed total matched by the created line",
      input: { decisions: withCreate, invoiceTotalCents: 16500 },
      expected: {
        projectedCents: 16500,
        targetCents: 16500,
        comparison: { differenceCents: 0, matches: true },
      },
    },
    {
      name: "no typed total",
      input: { decisions, invoiceTotalCents: null },
      expected: { projectedCents: 13500, targetCents: null, comparison: null },
    },
  ];

  for (const { name, input, expected } of cases) {
    const view = buildProjectionView({
      preview: cardPreview,
      adminPersonId: ADMIN_PERSON_ID,
      ...input,
    });
    assert.ok(view?.kind === "card", name);
    assert.equal(view.projectedCents, expected.projectedCents, name);
    assert.equal(view.targetCents, expected.targetCents, name);
    assert.deepEqual(view.comparison, expected.comparison, name);
  }
});
