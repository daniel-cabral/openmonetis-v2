import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getImportedDescriptionKey } from "@openmonetis/domain/transactions";
import type {
  ReconciliationApplyResult,
  ReconciliationDetection,
  ReconciliationPreview,
} from "@openmonetis/validators/reconciliations";
import type {
  TransactionImportPreview,
  TransactionImportResult,
} from "@openmonetis/validators/transactions";
import { createTestApiClient, type TestIdentity } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

function fixtureBase64(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../packages/domain/src/__fixtures__/${name}`, import.meta.url)),
  ).toString("base64");
}

function linesTotal(counts: ReconciliationPreview["counts"]) {
  return (
    counts.needsDecision +
    counts.matched +
    counts.bankOnly +
    counts.ambiguous +
    counts.ignored +
    counts.informational
  );
}

test("reconciliation detects, previews and isolates owners without writing", {
  skip: process.env.RECONCILIATIONS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const {
      db,
      transactions,
      reconciliationBatches,
      reconciliationIgnores,
      importNameMappings,
      recurringTransactionOccurrences,
    } = await import("@openmonetis/db");
    const { count } = await import("drizzle-orm");

    async function rowCounts() {
      const tables = [
        transactions,
        reconciliationBatches,
        reconciliationIgnores,
        importNameMappings,
        recurringTransactionOccurrences,
      ];
      return Promise.all(
        tables.map(async (table) => (await db.select({ value: count() }).from(table))[0].value),
      );
    }

    const statement = fixtureBase64("c6-extrato.csv");
    const invoice = fixtureBase64("c6-fatura.csv");
    const account = await api.data<{ id: string }>(
      await api.request("/accounts", owner, "POST", {
        name: "Conta C6 99999999",
        type: "checking",
      }),
      201,
    );

    await t.test(
      "detect suggests the account carrying the file's digits, or none when ambiguous",
      async () => {
        const detection = await api.data<ReconciliationDetection>(
          await api.request("/reconciliations/detect", owner, "POST", {
            fileName: "c6-extrato.csv",
            contentBase64: statement,
          }),
        );
        assert.equal(detection.detectedProfileId, "c6-statement");
        assert.equal(detection.suggestedAccountId, account.id);

        await api.request("/accounts", owner, "POST", {
          name: "Conta antiga 99999999",
          type: "checking",
        });
        const ambiguous = await api.data<ReconciliationDetection>(
          await api.request("/reconciliations/detect", owner, "POST", {
            fileName: "c6-extrato.csv",
            contentBase64: statement,
          }),
        );
        assert.equal(ambiguous.suggestedAccountId, null);
      },
    );

    const accountFile = {
      fileName: "c6-extrato.csv",
      contentBase64: statement,
      profileId: "c6-statement",
      targetType: "account",
      targetId: account.id,
    };
    const inRange = await api.expense(owner, {
      accountId: account.id,
      name: "Pix enviado para Pessoa Teste 1",
      amount: 120,
      purchaseDate: "2026-07-05",
    });
    const outOfRange = await api.expense(owner, {
      accountId: account.id,
      name: "Compra antes do extrato",
      amount: 77.77,
      purchaseDate: "2026-07-03",
    });

    await t.test(
      "preview classifies every file line once, matches a seeded entry and keeps out-of-range entries out of app-only",
      async () => {
        const before = await rowCounts();
        const preview = await api.data<ReconciliationPreview>(
          await api.request("/reconciliations/preview", owner, "POST", accountFile),
        );
        assert.deepEqual(await rowCounts(), before);

        assert.equal(preview.lines.length, 113);
        assert.equal(linesTotal(preview.counts), 113);
        assert.equal(preview.fileRange?.start, "2026-07-05");

        const [firstLine] = preview.lines;
        assert.equal(firstLine.bucket, "matched");
        assert.equal(firstLine.rule, "exact");
        assert.equal(firstLine.entryKey, `t:${inRange.id}`);
        assert.equal(firstLine.alignment.kind, "none");

        assert.ok(preview.entries.some((entry) => entry.entryKey === `t:${outOfRange.id}`));
        assert.ok(!preview.appOnlyKeys.includes(`t:${outOfRange.id}`));
        assert.ok(!preview.appOnlyKeys.includes(`t:${inRange.id}`));
      },
    );

    await t.test("a line already imported from the same file matches by identity", async () => {
      const imported = await api.data<TransactionImportPreview>(
        await api.request("/transactions/imports/preview", owner, "POST", {
          fileName: "c6-extrato.csv",
          contentBase64: statement,
          profileId: "c6-statement",
          destinationType: "account",
          destinationId: account.id,
        }),
      );
      const row = imported.transactions.find((transaction) =>
        transaction.name.startsWith("Pix enviado para Pessoa Teste 5"),
      );
      assert.ok(row);
      const result = await api.data<TransactionImportResult>(
        await api.request("/transactions/imports", owner, "POST", {
          sourceFingerprint: imported.sourceFingerprint,
          destinationType: "account",
          destinationId: account.id,
          paymentMethod: "pix",
          rows: [
            {
              externalId: row.externalId,
              name: row.name,
              amount: row.amount,
              type: row.type,
              purchaseDate: row.purchaseDate,
              personId: owner.personId,
              categoryId: owner.expenseCategoryId,
            },
          ],
        }),
        201,
      );
      assert.equal(result.imported, 1);

      const preview = await api.data<ReconciliationPreview>(
        await api.request("/reconciliations/preview", owner, "POST", accountFile),
      );
      const line = preview.lines.find((candidate) =>
        candidate.name.startsWith("Pix enviado para Pessoa Teste 5"),
      );
      assert.equal(line?.bucket, "matched");
      assert.equal(line?.rule, "identity");
    });

    await t.test("another user's account is not found and their entries never appear", async () => {
      const foreignAccount = await api.account(stranger);
      const foreignEntry = await api.expense(stranger, {
        accountId: foreignAccount.id,
        name: "Compra de outro usuario",
        amount: 55.55,
        purchaseDate: "2026-07-06",
      });
      await api.error(
        await api.request("/reconciliations/preview", owner, "POST", {
          ...accountFile,
          targetId: foreignAccount.id,
        }),
        404,
        "ACCOUNT_NOT_FOUND",
      );
      const preview = await api.data<ReconciliationPreview>(
        await api.request("/reconciliations/preview", owner, "POST", accountFile),
      );
      assert.ok(!preview.entries.some((entry) => entry.entryKey === `t:${foreignEntry.id}`));
    });

    await t.test(
      "card preview scopes app-only to the invoice period and matches the invoice line",
      async () => {
        const card = await api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            name: "C6 card",
            accountId: account.id,
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000000,
          }),
          201,
        );
        const cardPurchase = await api.data<{ id: string; period: string }>(
          await api.request("/transactions", owner, "POST", {
            type: "expense",
            paymentMethod: "credit_card",
            condition: "single",
            name: "MERCADOTESTE*MERCADOT",
            amount: 121.68,
            purchaseDate: "2026-07-28",
            personId: owner.personId,
            categoryId: owner.expenseCategoryId,
            cardId: card.id,
          }),
          201,
        );
        assert.equal(cardPurchase.period, "2026-08");
        const oldPurchase = await api.expense(owner, {
          accountId: null,
          cardId: card.id,
          paymentMethod: "credit_card",
          condition: "single",
          name: "Compra antiga do cartao",
          amount: 33.33,
          purchaseDate: "2026-06-15",
        });

        const preview = await api.data<ReconciliationPreview>(
          await api.request("/reconciliations/preview", owner, "POST", {
            fileName: "c6-fatura.csv",
            contentBase64: invoice,
            profileId: "c6-invoice",
            targetType: "card",
            targetId: card.id,
            invoicePeriod: "2026-08",
          }),
        );
        const line = preview.lines.find(
          (candidate) =>
            candidate.name.includes("MERCADOTESTE") && candidate.purchaseDate === "2026-07-28",
        );
        assert.equal(line?.bucket, "matched");
        assert.equal(line?.rule, "exact");
        assert.equal(line?.entryKey, `t:${cardPurchase.id}`);
        assert.ok(!preview.appOnlyKeys.includes(`t:${oldPurchase.id}`));

        await api.error(
          await api.request("/reconciliations/preview", owner, "POST", {
            fileName: "c6-fatura.csv",
            contentBase64: invoice,
            profileId: "c6-invoice",
            targetType: "card",
            targetId: card.id,
          }),
          400,
          "RECONCILIATION_INVOICE_PERIOD_REQUIRED",
        );
      },
    );

    await t.test(
      "apply aligns, settles, creates and ignores, and undo restores the exact snapshot",
      () => applyAndUndoWorkflow(api),
    );
    await t.test(
      "a create decision moves the identity off a paid entry, undo gives it back, and Pular clears it",
      () => identityHandoffWorkflow(api),
    );
    await t.test(
      "apply refuses stale or foreign references without writing, and skips a creation whose identity is held",
      () => rejectionAndSkipWorkflow(api),
    );
    await t.test(
      "card apply refuses creations in a paid invoice, still stamps there, and creates above the card limit",
      () => cardInvoiceWorkflow(api),
    );
    await t.test(
      "a link to a split entry stamps it and keeps its amount, with the splits reason",
      () => splitEntryWorkflow(api),
    );
    await t.test(
      "a name pairing is learned on link, matches the next period, and is replaced by re-learning",
      () => nameLearningWorkflow(api),
    );
    await t.test("category memory and ignores are stored per descriptor and survive undo", () =>
      memoryWorkflow(api),
    );
    await t.test(
      "an account recurring occurrence takes the identity and settlement, undo removes both",
      () => recurringAccountWorkflow(api),
    );
    await t.test(
      "a card recurring occurrence keeps its amount, with the card-recurring reason",
      () => recurringCardWorkflow(api),
    );
    await t.test(
      "a transfer holds one identity per side and keeps its amount, with the transfer reason",
      () => transferWorkflow(api),
    );
  });
});

type TestApi = Awaited<ReturnType<typeof createTestApiClient>>;

const statementHeader = readFileSync(
  fileURLToPath(
    new URL("../../../packages/domain/src/__fixtures__/c6-extrato.csv", import.meta.url),
  ),
  "utf8",
)
  .split(/\r?\n/)
  .slice(0, 9);

type StatementRow = {
  date: string;
  name: string;
  description?: string;
  credit?: string;
  debit?: string;
};

// Same C6 layout as the fixture header, with only the rows the scenario needs.
function statementFile(rows: StatementRow[]) {
  const body = rows.map(
    ({ date, name, description = "", credit = "0.00", debit = "0.00" }) =>
      `${date},${date},${name},${description},${credit},${debit},0.00`,
  );
  return {
    fileName: "c6-extrato.csv",
    contentBase64: Buffer.from(`${[...statementHeader, ...body].join("\r\n")}\r\n`).toString(
      "base64",
    ),
  };
}

function accountTarget(file: ReturnType<typeof statementFile>, accountId: string) {
  return {
    ...file,
    profileId: "c6-statement",
    targetType: "account" as const,
    targetId: accountId,
  };
}

type AccountTarget = ReturnType<typeof accountTarget>;

function lineNamed(preview: ReconciliationPreview, prefix: string) {
  const line = preview.lines.find((candidate) => candidate.name.startsWith(prefix));
  assert.ok(line, `no line starts with ${prefix}`);
  return line;
}

async function loadPersistence() {
  const {
    db,
    transactions,
    reconciliationIgnores,
    importNameMappings,
    importCategoryMappings,
    recurringTransactionOccurrences,
  } = await import("@openmonetis/db");
  const { and, asc, eq } = await import("drizzle-orm");
  return {
    db,
    transactions,
    reconciliationIgnores,
    importNameMappings,
    importCategoryMappings,
    recurringTransactionOccurrences,
    and,
    asc,
    eq,
  };
}

async function transactionRow(id: string) {
  const { db, transactions, eq } = await loadPersistence();
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  assert.ok(row);
  return row;
}

async function transactionsInBatch(batchId: string) {
  const { db, transactions, eq } = await loadPersistence();
  return db.select().from(transactions).where(eq(transactions.importBatchId, batchId));
}

// Every column an apply or undo can touch on the owner's transactions, as stored.
async function transactionSnapshot(userId: string) {
  const { db, transactions, asc, eq } = await loadPersistence();
  return db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      isSettled: transactions.isSettled,
      settledAmount: transactions.settledAmount,
      settledDate: transactions.settledDate,
      importSourceFingerprint: transactions.importSourceFingerprint,
      importExternalId: transactions.importExternalId,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(asc(transactions.id));
}

async function previewOf(api: TestApi, identity: TestIdentity, target: AccountTarget) {
  return api.data<ReconciliationPreview>(
    await api.request("/reconciliations/preview", identity, "POST", target),
  );
}

function applyOf(
  api: TestApi,
  identity: TestIdentity,
  target: AccountTarget,
  preview: ReconciliationPreview,
  decisions: unknown[] = [],
) {
  return api.request("/reconciliations", identity, "POST", {
    ...target,
    classificationDigest: preview.classificationDigest,
    decisions,
  });
}

async function applyAndUndoWorkflow(api: TestApi) {
  const owner = await api.register();
  const stranger = await api.register();
  const { db, transactions, reconciliationIgnores, importNameMappings, and, eq } =
    await loadPersistence();
  const account = await api.account(owner);
  const pix = await api.expense(owner, {
    accountId: account.id,
    name: "Pix enviado para Pessoa Teste 1",
    amount: 120,
    purchaseDate: "2026-07-09",
    isSettled: false,
  });
  const rent = await api.expense(owner, {
    accountId: account.id,
    name: "Aluguel",
    amount: 2300,
    purchaseDate: "2026-08-15",
    isSettled: false,
  });
  const sixth = await api.expense(owner, {
    accountId: account.id,
    name: "Empresa Teste 6 LTDA",
    amount: 213.83,
    purchaseDate: "2026-08-12",
    isSettled: false,
  });
  await api.data(
    await api.request("/transactions/settlement", owner, "PATCH", {
      ids: [sixth.id],
      isSettled: true,
      settledDate: "2026-08-12",
    }),
  );
  // Paid without a settled amount: the file value then lands on the entry amount itself.
  await db
    .update(transactions)
    .set({ isSettled: true, settledDate: new Date("2026-08-15T00:00:00.000Z") })
    .where(eq(transactions.id, rent.id));

  const file = statementFile([
    { date: "09/07/2026", name: "Pix enviado para Pessoa Teste 1", debit: "120.00" },
    { date: "11/08/2026", name: "Empresa Teste 5 LTDA", description: "Boleto", debit: "2356.51" },
    { date: "12/08/2026", name: "Empresa Teste 6 LTDA", description: "Boleto", debit: "213.83" },
    { date: "14/08/2026", name: "Tarifa Pacote de Servicos", debit: "9.90" },
    { date: "15/08/2026", name: "Pix recebido de Pessoa Teste 2", credit: "500.00" },
  ]);
  const target = accountTarget(file, account.id);
  const preview = await previewOf(api, owner, target);
  const pixLine = lineNamed(preview, "Pix enviado");
  const boletoLine = lineNamed(preview, "Empresa Teste 5");
  const tariffLine = lineNamed(preview, "Tarifa");
  const incomeLine = lineNamed(preview, "Pix recebido de Pessoa Teste 2");
  assert.equal(pixLine.bucket, "matched");
  assert.equal(boletoLine.bucket, "bank-only");

  const before = await transactionSnapshot(owner.id);
  const applied = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, preview, [
      { lineIndex: boletoLine.index, action: "link", entryKey: `t:${rent.id}` },
      { lineIndex: tariffLine.index, action: "ignore", ignoreReason: "Tarifa mensal" },
      {
        lineIndex: incomeLine.index,
        action: "create",
        name: "Recebimento Pessoa Teste 2",
        personId: owner.personId,
        categoryId: owner.incomeCategoryId,
      },
    ]),
    201,
  );
  assert.deepEqual(
    {
      created: applied.created,
      reconciled: applied.reconciled,
      ignored: applied.ignored,
      skipped: applied.skipped,
    },
    { created: 1, reconciled: 3, ignored: 1, skipped: 0 },
  );

  const pixAfter = await transactionRow(pix.id);
  assert.equal(pixAfter.isSettled, true);
  assert.equal(pixAfter.settledAmount, "-120.00");
  assert.deepEqual(pixAfter.settledDate, new Date("2026-07-09T00:00:00.000Z"));
  const rentAfter = await transactionRow(rent.id);
  assert.equal(rentAfter.amount, "-2356.51");
  assert.equal(rentAfter.isSettled, true);
  assert.equal(rentAfter.settledAmount, null);
  assert.equal((await transactionRow(sixth.id)).settledAmount, "-213.83");

  const [created] = await transactionsInBatch(applied.batchId);
  assert.equal(created.name, "Recebimento Pessoa Teste 2");
  assert.equal(created.type, "income");
  assert.equal(created.amount, "500.00");

  // Every applied line is identity-matched now: a second apply creates nothing and changes no entry.
  const afterApply = await transactionSnapshot(owner.id);
  const rerun = await previewOf(api, owner, target);
  const rerunResult = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, rerun),
    201,
  );
  assert.equal(rerunResult.created, 0);
  assert.deepEqual(await transactionSnapshot(owner.id), afterApply);

  await api.error(
    await api.request(`/reconciliations/${applied.batchId}`, stranger, "DELETE"),
    404,
    "RECONCILIATION_BATCH_NOT_FOUND",
  );
  assert.deepEqual(
    await api.data(await api.request(`/reconciliations/${applied.batchId}`, owner, "DELETE")),
    { batchId: applied.batchId, undone: true },
  );
  assert.deepEqual(await transactionSnapshot(owner.id), before);
  await api.error(
    await api.request(`/reconciliations/${applied.batchId}`, owner, "DELETE"),
    404,
    "RECONCILIATION_BATCH_NOT_FOUND",
  );

  const [mapping] = await db
    .select()
    .from(importNameMappings)
    .where(
      and(
        eq(importNameMappings.userId, owner.id),
        eq(
          importNameMappings.descriptionKey,
          getImportedDescriptionKey("Empresa Teste 5 LTDA - Boleto"),
        ),
      ),
    );
  assert.equal(mapping?.name, "Aluguel");
  const remainingIgnores = await db
    .select()
    .from(reconciliationIgnores)
    .where(eq(reconciliationIgnores.userId, owner.id));
  assert.deepEqual(
    remainingIgnores.map((ignore) => ignore.reason),
    ["Tarifa mensal"],
  );
}

async function identityHandoffWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  const school = await api.expense(owner, {
    accountId: account.id,
    name: "Mensalidade Colégio Santo Agostinho",
    amount: 1643,
    purchaseDate: "2026-10-15",
    isSettled: false,
  });
  const file = statementFile([
    {
      date: "15/10/2026",
      name: "COLEGIO SANTO AGOSTINHO DIVINO",
      description: "Boleto",
      debit: "1560.85",
    },
  ]);
  const target = accountTarget(file, account.id);

  const first = await previewOf(api, owner, target);
  const line = lineNamed(first, "COLEGIO SANTO AGOSTINHO");
  await api.data(
    await applyOf(api, owner, target, first, [
      { lineIndex: line.index, action: "link", entryKey: `t:${school.id}` },
    ]),
    201,
  );
  const linked = await transactionRow(school.id);
  assert.equal(linked.isSettled, true);
  assert.equal(linked.settledAmount, "-1560.85");
  const externalId = linked.importExternalId;
  assert.ok(externalId);

  const second = await previewOf(api, owner, target);
  assert.equal(lineNamed(second, "COLEGIO SANTO AGOSTINHO").rule, "identity");
  const replaced = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, second, [
      {
        lineIndex: line.index,
        action: "create",
        name: "Mensalidade Colégio nova",
        personId: owner.personId,
        categoryId: owner.expenseCategoryId,
      },
    ]),
    201,
  );
  assert.equal(replaced.created, 1);
  const released = await transactionRow(school.id);
  assert.equal(released.importExternalId, null);
  assert.equal(released.isSettled, true);
  assert.equal(released.settledAmount, "-1560.85");
  const [fresh] = await transactionsInBatch(replaced.batchId);
  assert.equal(fresh.importExternalId, externalId);

  await api.data(await api.request(`/reconciliations/${replaced.batchId}`, owner, "DELETE"));
  assert.equal((await transactionRow(school.id)).importExternalId, externalId);
  assert.deepEqual(await transactionsInBatch(replaced.batchId), []);

  const third = await previewOf(api, owner, target);
  const skipped = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, third, [{ lineIndex: line.index, action: "skip" }]),
    201,
  );
  assert.equal(skipped.created, 0);
  const cleared = await transactionRow(school.id);
  assert.equal(cleared.importExternalId, null);
  assert.equal(cleared.settledAmount, "-1560.85");
}

async function rejectionAndSkipWorkflow(api: TestApi) {
  const owner = await api.register();
  const stranger = await api.register();
  const account = await api.account(owner);
  const { db, transactions, eq } = await loadPersistence();
  const pix = await api.expense(owner, {
    accountId: account.id,
    name: "Pix enviado para Pessoa Teste 1",
    amount: 120,
    purchaseDate: "2026-07-09",
    isSettled: false,
  });
  const file = statementFile([
    { date: "09/07/2026", name: "Pix enviado para Pessoa Teste 1", debit: "120.00" },
    { date: "12/07/2026", name: "Pix recebido de Pessoa Teste 2", credit: "300.00" },
    { date: "13/07/2026", name: "Taxa de Servico Teste", debit: "40.00" },
    { date: "14/07/2026", name: "Pix recebido de Pessoa Teste 3", credit: "77.00" },
  ]);
  const target = accountTarget(file, account.id);

  // The last line's identity already sits on an entry outside the review window.
  const imported = await api.data<TransactionImportPreview>(
    await api.request("/transactions/imports/preview", owner, "POST", {
      fileName: file.fileName,
      contentBase64: file.contentBase64,
      profileId: "c6-statement",
      destinationType: "account",
      destinationId: account.id,
    }),
  );
  const heldRow = imported.transactions.find((row) =>
    row.name.startsWith("Pix recebido de Pessoa Teste 3"),
  );
  assert.ok(heldRow);
  const outside = await api.expense(owner, {
    accountId: account.id,
    name: "Pix recebido de Pessoa Teste 3",
    type: "income",
    categoryId: owner.incomeCategoryId,
    amount: 77,
    purchaseDate: "2025-01-02",
    isSettled: false,
  });
  await db
    .update(transactions)
    .set({
      importSourceFingerprint: imported.sourceFingerprint,
      importExternalId: heldRow.externalId,
    })
    .where(eq(transactions.id, outside.id));

  const first = await previewOf(api, owner, target);
  const earner = lineNamed(first, "Pix recebido de Pessoa Teste 2");
  assert.equal(earner.bucket, "bank-only");

  const beforeForeign = await transactionSnapshot(owner.id);
  await api.error(
    await applyOf(api, owner, target, first, [
      {
        lineIndex: earner.index,
        action: "create",
        name: "Recebimento Pessoa Teste 2",
        personId: stranger.personId,
        categoryId: owner.incomeCategoryId,
      },
    ]),
    404,
    "PERSON_NOT_FOUND",
  );
  await api.error(
    await applyOf(api, owner, target, first, [
      {
        lineIndex: earner.index,
        action: "create",
        name: "Recebimento Pessoa Teste 2",
        personId: owner.personId,
        categoryId: stranger.incomeCategoryId,
      },
    ]),
    404,
    "CATEGORY_NOT_FOUND",
  );
  const foreignEntry = await api.expense(stranger, {
    name: "Pix recebido de Pessoa Teste 2",
    type: "income",
    categoryId: stranger.incomeCategoryId,
    amount: 300,
    purchaseDate: "2026-07-12",
    isSettled: false,
  });
  await api.error(
    await applyOf(api, owner, target, first, [
      { lineIndex: earner.index, action: "link", entryKey: `t:${foreignEntry.id}` },
    ]),
    409,
    "RECONCILIATION_STALE",
  );
  assert.deepEqual(await transactionSnapshot(owner.id), beforeForeign);

  // An entry added after the preview turns a bank-only line into a match: the digest catches it.
  await api.expense(owner, {
    accountId: account.id,
    name: "Taxa de Servico Teste",
    amount: 40,
    purchaseDate: "2026-07-13",
    isSettled: false,
  });
  const beforeAdded = await transactionSnapshot(owner.id);
  await api.error(await applyOf(api, owner, target, first), 409, "RECONCILIATION_STALE");
  assert.deepEqual(await transactionSnapshot(owner.id), beforeAdded);

  // An entry deleted after the preview turns a matched line back into bank-only.
  const second = await previewOf(api, owner, target);
  assert.equal(lineNamed(second, "Pix enviado").rule, "exact");
  await api.data(
    await api.request(`/transactions/${pix.id}`, owner, "DELETE", { scope: "single" }),
  );
  const beforeDeleted = await transactionSnapshot(owner.id);
  await api.error(await applyOf(api, owner, target, second), 409, "RECONCILIATION_STALE");
  assert.deepEqual(await transactionSnapshot(owner.id), beforeDeleted);

  const third = await previewOf(api, owner, target);
  const applied = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, third, [
      {
        lineIndex: lineNamed(third, "Pix recebido de Pessoa Teste 2").index,
        action: "create",
        name: "Recebimento Pessoa Teste 2",
        personId: owner.personId,
        categoryId: owner.incomeCategoryId,
      },
      {
        lineIndex: lineNamed(third, "Pix recebido de Pessoa Teste 3").index,
        action: "create",
        name: "Recebimento Pessoa Teste 3",
        personId: owner.personId,
        categoryId: owner.incomeCategoryId,
      },
    ]),
    201,
  );
  assert.deepEqual(
    { created: applied.created, skipped: applied.skipped },
    { created: 1, skipped: 1 },
  );
  assert.deepEqual(
    (await transactionsInBatch(applied.batchId)).map((row) => row.name),
    ["Recebimento Pessoa Teste 2"],
  );
  assert.equal((await transactionRow(outside.id)).importExternalId, heldRow.externalId);
}

async function cardInvoiceWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  const card = await api.data<{ id: string }>(
    await api.request("/cards", owner, "POST", {
      name: "C6 card",
      accountId: account.id,
      brand: "visa",
      closingDay: 20,
      dueDay: 25,
      limit: 150,
    }),
    201,
  );
  const purchase = await api.data<{ id: string; period: string }>(
    await api.request("/transactions", owner, "POST", {
      type: "expense",
      paymentMethod: "credit_card",
      condition: "single",
      name: "MERCADOTESTE*MERCADOT",
      amount: 121.68,
      purchaseDate: "2026-07-28",
      personId: owner.personId,
      categoryId: owner.expenseCategoryId,
      cardId: card.id,
    }),
    201,
  );
  assert.equal(purchase.period, "2026-08");

  const cardTarget = (invoicePeriod: string) => ({
    fileName: "c6-fatura.csv",
    contentBase64: fixtureBase64("c6-fatura.csv"),
    profileId: "c6-invoice",
    targetType: "card" as const,
    targetId: card.id,
    invoicePeriod,
  });
  const previewCard = async (invoicePeriod: string) =>
    api.data<ReconciliationPreview>(
      await api.request("/reconciliations/preview", owner, "POST", cardTarget(invoicePeriod)),
    );

  await api.data(
    await api.request(`/invoices/${card.id}/2026-08/payments`, owner, "POST", {
      accountId: account.id,
      paidAt: "2026-08-25",
      allocations: [{ personId: owner.personId, amount: 121.68 }],
    }),
    201,
  );

  const paid = await previewCard("2026-08");
  const bankOnly = paid.lines.find(
    (line) => line.bucket === "bank-only" && line.type === "expense" && line.amount > 100,
  );
  assert.ok(bankOnly);
  const purchaseLine = paid.lines.find(
    (line) => line.name.startsWith("MERCADOTESTE") && line.purchaseDate === "2026-07-28",
  );
  assert.equal(purchaseLine?.bucket, "matched");

  const beforeRefused = await transactionSnapshot(owner.id);
  await api.error(
    await api.request("/reconciliations", owner, "POST", {
      ...cardTarget("2026-08"),
      classificationDigest: paid.classificationDigest,
      decisions: [
        {
          lineIndex: bankOnly.index,
          action: "create",
          name: "Compra fora da fatura",
          personId: owner.personId,
          categoryId: owner.expenseCategoryId,
        },
      ],
    }),
    400,
    "INVOICE_ALREADY_PAID",
  );
  assert.deepEqual(await transactionSnapshot(owner.id), beforeRefused);

  // Stamping the existing purchase in the paid period is allowed and never settles a card entry.
  const stamped = await api.data<ReconciliationApplyResult>(
    await api.request("/reconciliations", owner, "POST", {
      ...cardTarget("2026-08"),
      classificationDigest: paid.classificationDigest,
      decisions: [],
    }),
    201,
  );
  assert.equal(stamped.created, 0);
  const stampedPurchase = await transactionRow(purchase.id);
  assert.notEqual(stampedPurchase.importExternalId, null);
  assert.equal(stampedPurchase.isSettled, null);

  // A card creation in an unpaid invoice ignores the card limit (150.00 here).
  const open = await previewCard("2026-09");
  const overLimit = open.lines.find(
    (line) => line.bucket === "bank-only" && line.type === "expense" && line.amount > 150,
  );
  assert.ok(overLimit);
  const created = await api.data<ReconciliationApplyResult>(
    await api.request("/reconciliations", owner, "POST", {
      ...cardTarget("2026-09"),
      classificationDigest: open.classificationDigest,
      decisions: [
        {
          lineIndex: overLimit.index,
          action: "create",
          name: "Compra acima do limite",
          personId: owner.personId,
          categoryId: owner.expenseCategoryId,
        },
      ],
    }),
    201,
  );
  assert.equal(created.created, 1);
  const [inserted] = await transactionsInBatch(created.batchId);
  assert.equal(inserted.cardId, card.id);
  assert.equal(inserted.period, "2026-09");
  assert.equal(inserted.isSettled, null);
}

async function splitEntryWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  const other = await api.data<{ id: string }>(
    await api.request("/people", owner, "POST", { name: "Pessoa Divisao" }),
    201,
  );
  const shared = await api.expense(owner, {
    accountId: account.id,
    name: "Jantar dividido",
    amount: 120,
    purchaseDate: "2026-07-13",
    isSettled: false,
    splitShares: [
      { personId: owner.personId, amount: 60 },
      { personId: other.id, amount: 60 },
    ],
  });
  const file = statementFile([
    { date: "13/07/2026", name: "Jantar Divisao Teste", debit: "100.00" },
  ]);
  const target = accountTarget(file, account.id);

  const first = await previewOf(api, owner, target);
  const dinner = lineNamed(first, "Jantar Divisao");
  await api.data(
    await applyOf(api, owner, target, first, [
      { lineIndex: dinner.index, action: "link", entryKey: `t:${shared.id}` },
    ]),
    201,
  );
  const linked = await transactionRow(shared.id);
  assert.equal(linked.amount, "-120.00");
  assert.equal(linked.isSettled, true);
  assert.equal(linked.settledAmount, "-120.00");
  assert.notEqual(linked.importExternalId, null);

  const second = await previewOf(api, owner, target);
  const matched = lineNamed(second, "Jantar Divisao");
  assert.equal(matched.rule, "identity");
  assert.deepEqual(matched.alignment, { kind: "kept", reason: "splits" });
}

async function nameMappingsFor(userId: string, descriptionKey: string) {
  const { db, importNameMappings, and, eq } = await loadPersistence();
  return db
    .select()
    .from(importNameMappings)
    .where(
      and(
        eq(importNameMappings.userId, userId),
        eq(importNameMappings.descriptionKey, descriptionKey),
      ),
    );
}

async function categoryMappingsFor(userId: string, descriptionKey: string) {
  const { db, importCategoryMappings, and, eq } = await loadPersistence();
  return db
    .select()
    .from(importCategoryMappings)
    .where(
      and(
        eq(importCategoryMappings.userId, userId),
        eq(importCategoryMappings.descriptionKey, descriptionKey),
      ),
    );
}

async function nameLearningWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  const rent = await api.expense(owner, {
    accountId: account.id,
    name: "Aluguel",
    amount: 2300,
    purchaseDate: "2026-08-15",
    isSettled: false,
  });
  const august = accountTarget(
    statementFile([
      {
        date: "11/08/2026",
        name: "CASA NOVA LOCADORA LTDA - EPP",
        description: "Boleto",
        debit: "2356.51",
      },
    ]),
    account.id,
  );
  const augustPreview = await previewOf(api, owner, august);
  const augustLine = lineNamed(augustPreview, "CASA NOVA");
  await api.data(
    await applyOf(api, owner, august, augustPreview, [
      { lineIndex: augustLine.index, action: "link", entryKey: `t:${rent.id}` },
    ]),
    201,
  );
  const key = getImportedDescriptionKey("CASA NOVA LOCADORA LTDA - EPP - Boleto");
  assert.deepEqual(
    (await nameMappingsFor(owner.id, key)).map((mapping) => mapping.name),
    ["Aluguel"],
  );

  // The next month's entry has another value: only the learned name and the period can match it.
  const september = await api.expense(owner, {
    accountId: account.id,
    name: "Aluguel",
    amount: 2350,
    purchaseDate: "2026-09-15",
    isSettled: false,
  });
  const septemberTarget = accountTarget(
    statementFile([
      {
        date: "10/09/2026",
        name: "CASA NOVA LOCADORA LTDA - EPP",
        description: "Boleto",
        debit: "2400.00",
      },
    ]),
    account.id,
  );
  const septemberPreview = await previewOf(api, owner, septemberTarget);
  const septemberLine = lineNamed(septemberPreview, "CASA NOVA");
  assert.equal(septemberLine.rule, "name-period");
  assert.equal(septemberLine.entryKey, `t:${september.id}`);

  await api.data(
    await applyOf(api, owner, septemberTarget, septemberPreview, [
      {
        lineIndex: septemberLine.index,
        action: "link",
        entryKey: `t:${september.id}`,
        name: "Aluguel Sala Comercial",
      },
    ]),
    201,
  );
  assert.deepEqual(
    (await nameMappingsFor(owner.id, key)).map((mapping) => mapping.name),
    ["Aluguel Sala Comercial"],
  );
}

async function memoryWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  const groceries = await api.expense(owner, {
    accountId: account.id,
    name: "Mercado Teste Centro",
    amount: 50,
    purchaseDate: "2026-07-10",
    isSettled: false,
    categoryId: owner.expenseCategoryId,
  });
  const file = statementFile([
    { date: "10/07/2026", name: "Mercado Teste Centro", debit: "50.00" },
    { date: "11/07/2026", name: "Padaria Teste", debit: "30.00" },
    { date: "13/07/2026", name: "Padaria Teste", debit: "12.00" },
    { date: "14/07/2026", name: "Lanchonete Teste", debit: "15.00" },
    { date: "15/07/2026", name: "Tarifa Teste", debit: "9.90" },
  ]);
  const target = accountTarget(file, account.id);
  const preview = await previewOf(api, owner, target);
  const bakery = preview.lines.filter((line) => line.name === "Padaria Teste");
  const snack = lineNamed(preview, "Lanchonete Teste");
  const fee = lineNamed(preview, "Tarifa Teste");
  const expenseCategory = owner.expenseCategoryId;

  const applied = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, preview, [
      {
        lineIndex: bakery[0].index,
        action: "create",
        name: "Padaria Teste",
        personId: owner.personId,
        categoryId: expenseCategory,
      },
      {
        lineIndex: bakery[1].index,
        action: "create",
        name: "Padaria Teste",
        personId: owner.personId,
        categoryId: expenseCategory,
      },
      {
        lineIndex: snack.index,
        action: "create",
        name: "Lanchonete Teste",
        personId: owner.personId,
        categoryId: null,
      },
      { lineIndex: fee.index, action: "ignore", ignoreReason: "Tarifa mensal" },
    ]),
    201,
  );
  assert.equal(applied.created, 3);

  const kept = await categoryMappingsFor(
    owner.id,
    getImportedDescriptionKey("Mercado Teste Centro"),
  );
  assert.deepEqual(
    kept.map((mapping) => mapping.categoryId),
    [groceries.categoryId],
  );
  const bakeryMemory = await categoryMappingsFor(
    owner.id,
    getImportedDescriptionKey("Padaria Teste"),
  );
  assert.deepEqual(
    bakeryMemory.map((mapping) => mapping.categoryId),
    [expenseCategory],
  );
  assert.deepEqual(
    await categoryMappingsFor(owner.id, getImportedDescriptionKey("Lanchonete Teste")),
    [],
  );

  const nextFile = statementFile([{ date: "20/07/2026", name: "Padaria Teste", debit: "7.00" }]);
  const nextPreview = await previewOf(api, owner, accountTarget(nextFile, account.id));
  assert.equal(lineNamed(nextPreview, "Padaria Teste").suggestedCategoryId, expenseCategory);

  // The ignore is stored with its reason: the same file shows the line ignored, undo keeps it.
  const ignoredPreview = await previewOf(api, owner, target);
  assert.equal(lineNamed(ignoredPreview, "Tarifa Teste").bucket, "ignored");
  assert.equal(lineNamed(ignoredPreview, "Tarifa Teste").ignoredReason, "Tarifa mensal");
  await api.data(await api.request(`/reconciliations/${applied.batchId}`, owner, "DELETE"));
  const afterUndo = await previewOf(api, owner, target);
  assert.equal(lineNamed(afterUndo, "Tarifa Teste").bucket, "ignored");
  assert.equal(
    (await categoryMappingsFor(owner.id, getImportedDescriptionKey("Padaria Teste"))).length,
    1,
  );
}

async function recurringAccountWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  await api.data(
    await api.request("/transactions", owner, "POST", {
      type: "expense",
      paymentMethod: "pix",
      condition: "recurring",
      recurrenceFrequency: "monthly",
      name: "Condominio Teste",
      amount: 350,
      purchaseDate: "2026-08-15",
      personId: owner.personId,
      categoryId: owner.expenseCategoryId,
      accountId: account.id,
    }),
    201,
  );
  const target = accountTarget(
    statementFile([{ date: "15/09/2026", name: "Condominio Teste", debit: "350.00" }]),
    account.id,
  );
  const preview = await previewOf(api, owner, target);
  const line = lineNamed(preview, "Condominio Teste");
  const september = preview.entries.find(
    (entry) => entry.entryKey.startsWith("o:") && entry.date === "2026-09-15",
  );
  assert.ok(september);
  assert.equal(line.entryKey, september.entryKey);

  const before = await transactionSnapshot(owner.id);
  const applied = await api.data<ReconciliationApplyResult>(
    await applyOf(api, owner, target, preview),
    201,
  );
  assert.equal(applied.reconciled, 1);

  const { db, recurringTransactionOccurrences, eq } = await loadPersistence();
  const occurrencesOf = () =>
    db
      .select()
      .from(recurringTransactionOccurrences)
      .where(eq(recurringTransactionOccurrences.userId, owner.id));
  const identified = (await occurrencesOf()).filter((row) => row.importExternalId !== null);
  assert.equal(identified.length, 1);
  assert.equal(identified[0].isSettled, true);
  assert.equal(identified[0].settledAmount, "-350.00");

  await api.data(await api.request(`/reconciliations/${applied.batchId}`, owner, "DELETE"));
  assert.equal((await occurrencesOf()).filter((row) => row.importExternalId !== null).length, 0);
  assert.deepEqual(await transactionSnapshot(owner.id), before);
}

async function recurringCardWorkflow(api: TestApi) {
  const owner = await api.register();
  const account = await api.account(owner);
  const card = await api.data<{ id: string }>(
    await api.request("/cards", owner, "POST", {
      name: "C6 card",
      accountId: account.id,
      brand: "visa",
      closingDay: 20,
      dueDay: 25,
      limit: 5000,
    }),
    201,
  );
  await api.data(
    await api.request("/transactions", owner, "POST", {
      type: "expense",
      paymentMethod: "credit_card",
      condition: "recurring",
      recurrenceFrequency: "monthly",
      name: "Assinatura Nuvem Teste",
      amount: 100,
      purchaseDate: "2026-08-10",
      personId: owner.personId,
      categoryId: owner.expenseCategoryId,
      cardId: card.id,
    }),
    201,
  );
  const target = {
    fileName: "c6-fatura.csv",
    contentBase64: fixtureBase64("c6-fatura.csv"),
    profileId: "c6-invoice",
    targetType: "card" as const,
    targetId: card.id,
    invoicePeriod: "2026-09",
  };
  const preview = await api.data<ReconciliationPreview>(
    await api.request("/reconciliations/preview", owner, "POST", target),
  );
  const occurrence = preview.entries.find(
    (entry) => entry.entryKey.startsWith("o:") && entry.period === "2026-09",
  );
  assert.ok(occurrence);
  const line = preview.lines.find(
    (candidate) =>
      candidate.bucket === "bank-only" && candidate.type === "expense" && candidate.amount !== 100,
  );
  assert.ok(line);
  const creation = preview.lines.find(
    (candidate) =>
      candidate.bucket === "bank-only" &&
      candidate.type === "expense" &&
      candidate.amount !== 100 &&
      candidate.index !== line.index,
  );
  assert.ok(creation);

  await api.data(
    await api.request("/reconciliations", owner, "POST", {
      ...target,
      classificationDigest: preview.classificationDigest,
      decisions: [
        { lineIndex: line.index, action: "link", entryKey: occurrence.entryKey },
        {
          lineIndex: creation.index,
          action: "create",
          name: "Compra nova Teste",
          personId: owner.personId,
          categoryId: owner.expenseCategoryId,
        },
      ],
    }),
    201,
  );
  const next = await api.data<ReconciliationPreview>(
    await api.request("/reconciliations/preview", owner, "POST", target),
  );
  const linked = next.lines.find((candidate) => candidate.index === line.index);
  // An identity match with a different value asks for a decision; the card keeps its amount.
  assert.equal(linked?.bucket, "needs-decision");
  assert.deepEqual(linked?.alignment, { kind: "kept", reason: "card-recurring" });
  const kept = next.entries.find((entry) => entry.entryKey === occurrence.entryKey);
  assert.equal(kept?.amount, 100);

  // A card link pairs the descriptor with the entry; a card creation stores no pairing.
  assert.deepEqual(
    (await nameMappingsFor(owner.id, getImportedDescriptionKey(line.name))).map(
      (mapping) => mapping.name,
    ),
    [occurrence.name],
  );
  assert.deepEqual(await nameMappingsFor(owner.id, getImportedDescriptionKey(creation.name)), []);
}

async function transferWorkflow(api: TestApi) {
  const owner = await api.register();
  const source = await api.account(owner);
  const destination = await api.account(owner);
  const { db, transactions, eq } = await loadPersistence();
  await api.data(
    await api.request("/transactions", owner, "POST", {
      type: "transfer",
      paymentMethod: "bank_transfer",
      condition: "single",
      name: "Transferencia Teste",
      amount: 200,
      purchaseDate: "2026-07-14",
      personId: owner.personId,
      categoryId: owner.expenseCategoryId,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
    }),
    201,
  );
  const pair = await db
    .select()
    .from(transactions)
    .where(eq(transactions.name, "Transferencia Teste"));
  const sourceRow = pair.find((row) => Number(row.amount) < 0);
  const destinationRow = pair.find((row) => Number(row.amount) > 0);
  assert.ok(sourceRow && destinationRow);

  // The file shows 205.00 on each side: the amount stays at the transfer's 200.00.
  const outFile = accountTarget(
    statementFile([{ date: "14/07/2026", name: "Transferencia Teste", debit: "205.00" }]),
    source.id,
  );
  const outPreview = await previewOf(api, owner, outFile);
  await api.data(
    await applyOf(api, owner, outFile, outPreview, [
      {
        lineIndex: lineNamed(outPreview, "Transferencia Teste").index,
        action: "link",
        entryKey: `t:${sourceRow.id}`,
      },
    ]),
    201,
  );
  const inFile = accountTarget(
    statementFile([{ date: "14/07/2026", name: "Transferencia Teste", credit: "205.00" }]),
    destination.id,
  );
  const inPreview = await previewOf(api, owner, inFile);
  await api.data(
    await applyOf(api, owner, inFile, inPreview, [
      {
        lineIndex: lineNamed(inPreview, "Transferencia Teste").index,
        action: "link",
        entryKey: `t:${destinationRow.id}`,
      },
    ]),
    201,
  );

  const sourceAfter = await transactionRow(sourceRow.id);
  const destinationAfter = await transactionRow(destinationRow.id);
  assert.notEqual(sourceAfter.importExternalId, null);
  assert.notEqual(destinationAfter.importExternalId, null);
  assert.notEqual(sourceAfter.importExternalId, destinationAfter.importExternalId);
  assert.equal(sourceAfter.amount, "-200.00");
  assert.equal(destinationAfter.amount, "200.00");

  const recheck = await previewOf(api, owner, outFile);
  const outLine = lineNamed(recheck, "Transferencia Teste");
  assert.deepEqual(outLine.alignment, { kind: "kept", reason: "transfer" });
}
