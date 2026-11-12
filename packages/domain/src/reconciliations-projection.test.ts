import assert from "node:assert/strict";
import test from "node:test";
import {
  type ProjectionEffect,
  type ProjectionEntry,
  compareProjection,
  projectAccountBalance,
  projectInvoiceTotal,
  toBalanceStatus,
} from "./reconciliations-projection";

const CUTOFF_DATE = "2026-11-11";
const ACCOUNT_BASELINE_CENTS = 111844;

const terapia: ProjectionEntry = {
  entryKey: "terapia",
  name: "Terapia",
  postingDate: "2026-10-16",
  period: "2026-10",
  signedCents: -27500,
  alignable: true,
  status: "in-balance",
};

const danielle: ProjectionEntry = {
  entryKey: "danielle",
  name: "Danielle",
  postingDate: "2026-10-20",
  period: "2026-10",
  signedCents: -21000,
  alignable: true,
  status: "unsettled",
};

const colegio: ProjectionEntry = {
  entryKey: "colegio",
  name: "Colégio",
  postingDate: "2026-11-05",
  period: "2026-11",
  signedCents: -164300,
  alignable: true,
  status: "in-balance",
};

const mensalidade: ProjectionEntry = {
  entryKey: "mensalidade",
  name: "Mensalidade Colégio Santo Agostinho",
  postingDate: "2026-11-22",
  period: "2026-11",
  signedCents: -164300,
  alignable: true,
  status: "after-end",
};

const outro: ProjectionEntry = {
  entryKey: "outro",
  name: "Outro",
  postingDate: "2026-11-03",
  period: "2026-11",
  signedCents: -9000,
  alignable: true,
  status: null,
};

const dividido: ProjectionEntry = {
  entryKey: "dividido",
  name: "Dividido",
  postingDate: "2026-11-04",
  period: "2026-11",
  signedCents: -30000,
  alignable: false,
  status: "in-balance",
};

const accountEntries = [terapia, danielle, colegio, mensalidade, outro, dividido];

test("toBalanceStatus classifies only admin entries by settlement and posting date", () => {
  const cases = [
    {
      name: "settled admin posted on the cutoff is in-balance",
      entry: { isSettled: true, isAdmin: true, postingDate: "2026-11-11" },
      status: "in-balance",
    },
    {
      name: "settled admin posted after the cutoff is after-end",
      entry: { isSettled: true, isAdmin: true, postingDate: "2026-11-22" },
      status: "after-end",
    },
    {
      name: "unsettled admin entry is unsettled",
      entry: { isSettled: false, isAdmin: true, postingDate: "2026-10-16" },
      status: "unsettled",
    },
    {
      name: "non-admin entry has no status",
      entry: { isSettled: true, isAdmin: false, postingDate: "2026-11-11" },
      status: null,
    },
  ] as const;

  for (const current of cases) {
    assert.equal(toBalanceStatus(current.entry, CUTOFF_DATE), current.status, current.name);
  }
});

test("projectAccountBalance applies each line effect against the entry's current contribution", () => {
  const cases: Array<{ name: string; effects: ProjectionEffect[]; projectedCents: number }> = [
    {
      name: "keeping an in-balance entry at its own amount changes nothing",
      effects: [{ kind: "entry", entryKey: "terapia", lineCents: -27500 }],
      projectedCents: 111844,
    },
    {
      name: "creating an admin line subtracts it from the balance",
      effects: [{ kind: "create", lineCents: -27500, forAdmin: true }],
      projectedCents: 84344,
    },
    {
      name: "creating a line for another person leaves the balance untouched",
      effects: [{ kind: "create", lineCents: -27500, forAdmin: false }],
      projectedCents: 111844,
    },
    {
      name: "keeping an unsettled entry subtracts its line amount",
      effects: [{ kind: "entry", entryKey: "danielle", lineCents: -21000 }],
      projectedCents: 90844,
    },
    {
      name: "a bank line that differs from an in-balance entry replaces its contribution",
      effects: [{ kind: "entry", entryKey: "colegio", lineCents: -156085 }],
      projectedCents: 120059,
    },
    {
      name: "linking an entry with no admin status leaves the balance untouched",
      effects: [{ kind: "entry", entryKey: "outro", lineCents: -9000 }],
      projectedCents: 111844,
    },
    {
      name: "a non-alignable entry keeps its own amount whatever the line says",
      effects: [{ kind: "entry", entryKey: "dividido", lineCents: -25000 }],
      projectedCents: 111844,
    },
    {
      name: "no effects keeps the baseline",
      effects: [],
      projectedCents: 111844,
    },
  ];

  for (const current of cases) {
    const result = projectAccountBalance({
      baselineCents: ACCOUNT_BASELINE_CENTS,
      entries: accountEntries,
      effects: current.effects,
    });
    assert.equal(result.projectedCents, current.projectedCents, current.name);
  }
});

test("projectAccountBalance lists after-end entries until a line links them", () => {
  const unlinked = projectAccountBalance({
    baselineCents: ACCOUNT_BASELINE_CENTS,
    entries: accountEntries,
    effects: [],
  });
  assert.deepEqual(unlinked.paidAfterEnd, [
    {
      entryKey: "mensalidade",
      name: "Mensalidade Colégio Santo Agostinho",
      date: "2026-11-22",
      signedCents: -164300,
    },
  ]);

  const linked = projectAccountBalance({
    baselineCents: ACCOUNT_BASELINE_CENTS,
    entries: accountEntries,
    effects: [{ kind: "entry", entryKey: "mensalidade", lineCents: -164300 }],
  });
  assert.deepEqual(linked, { projectedCents: -52456, paidAfterEnd: [] });
});

test("projectInvoiceTotal sums the invoice period with effects applied", () => {
  const invoiceEntries: ProjectionEntry[] = [
    { entryKey: "a", name: "A", postingDate: "2026-11-02", period: "2026-11", signedCents: -10000, alignable: true, status: null },
    { entryKey: "b", name: "B", postingDate: "2026-11-03", period: "2026-11", signedCents: -5000, alignable: true, status: null },
    { entryKey: "c", name: "C", postingDate: "2026-11-04", period: "2026-11", signedCents: 2000, alignable: true, status: null },
    { entryKey: "d", name: "D", postingDate: "2026-10-05", period: "2026-10", signedCents: -99900, alignable: true, status: null },
  ];

  const total = projectInvoiceTotal({
    invoicePeriod: "2026-11",
    entries: invoiceEntries,
    effects: [
      { kind: "entry", entryKey: "b", lineCents: -5500 },
      { kind: "create", lineCents: -3000, forAdmin: false },
    ],
  });

  assert.equal(total, 16500);
});

test("compareProjection reports the absolute difference and whether it matches", () => {
  assert.deepEqual(compareProjection(84344, 84344), { differenceCents: 0, matches: true });
  assert.deepEqual(compareProjection(111844, 84344), { differenceCents: 27500, matches: false });
});
