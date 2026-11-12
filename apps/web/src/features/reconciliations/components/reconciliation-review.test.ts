import assert from "node:assert/strict";
import test from "node:test";
import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import {
  applyBlockReason,
  consumedEntryKeys,
  defaultProfileId,
  hasApplicableDecision,
  initialDecisions,
  linkOptions,
  markAllBankOnlyAsCreate,
  type UiDecisions,
  toApplyDecisions,
} from "./reconciliation-review";

type Preview = ReconciliationPreview;
type PreviewLine = Preview["lines"][number];
type PreviewEntry = Preview["entries"][number];

const ADMIN_PERSON_ID = "00000000-0000-4000-8000-000000000004";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000010";

function line(
  overrides: Partial<PreviewLine> & Pick<PreviewLine, "index" | "bucket">,
): PreviewLine {
  return {
    purchaseDate: "2026-08-10",
    postedDate: null,
    amount: 100,
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
  ];
  const preview = review(lines);
  const decisions = initialDecisions(preview, ADMIN_PERSON_ID);
  decisions[1] = { ...decisions[1], action: "link", entryKey: "entry-2" };
  decisions[2] = { ...decisions[2], action: "skip" };

  assert.deepEqual(
    consumedEntryKeys(decisions, preview),
    new Map([
      ["entry-1", 0],
      ["entry-2", 1],
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
  test(`apply is blocked only by creations without a name: ${blankNames} blank`, () => {
    const lines = [0, 1, 2].map((index) => line({ index, bucket: "bank-only" }));
    const preview = review(lines);
    const decisions = markAllBankOnlyAsCreate(initialDecisions(preview, ADMIN_PERSON_ID), preview);
    for (const index of [0, 1, 2]) {
      decisions[index] = { ...decisions[index], name: index < blankNames ? "   " : "Loja" };
    }

    assert.equal(applyBlockReason(decisions), expected);
  });
}

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
  ];
  const preview = review(lines);
  const decisions: UiDecisions = markAllBankOnlyAsCreate(
    initialDecisions(preview, ADMIN_PERSON_ID),
    preview,
  );
  decisions[1] = { ...decisions[1], action: "link", entryKey: "entry-aug" };
  decisions[3] = { ...decisions[3], action: "ignore", ignoreReason: "Pagamento de fatura" };

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
  ]);
});
