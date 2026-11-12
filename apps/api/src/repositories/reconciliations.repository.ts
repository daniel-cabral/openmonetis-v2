import {
  db,
  importCategoryMappings,
  importNameMappings,
  invoices,
  reconciliationBatches,
  reconciliationIgnores,
  recurringTransactionOccurrences,
  recurringTransactionRules,
  transactionSplits,
  transactions,
} from "@openmonetis/db";
import {
  type EntryRef,
  type ReconciliationPlan,
  ReconciliationPlanError,
} from "@openmonetis/domain/reconciliations-plan";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { listRecurringRulesForReport } from "./recurring-transactions.repository";
import {
  effectiveTransactionAmountSql,
  settlePersistedTransactions,
  settleRecurringTransaction,
} from "./settlements.repository";
import type { RecurringRuleWithRelations } from "./transactions.repository";

export type ReconciliationTransactionRow = {
  id: string;
  name: string;
  purchaseDate: string;
  period: string;
  type: "income" | "expense";
  effectiveAmount: string;
  installmentCount: number | null;
  currentInstallment: number | null;
  importSourceFingerprint: string | null;
  importExternalId: string | null;
  categoryId: string | null;
  isSettled: boolean | null;
  hasSplits: boolean;
  transferId: string | null;
  transferSide: "source" | "destination" | null;
  isGenerated: boolean;
  inPaidInvoice: boolean;
};

export type ReconciliationRecurringRuleRow = RecurringRuleWithRelations & { hasSplits: boolean };

export type ReconciliationOccurrenceRow = {
  seriesId: string;
  date: string;
  isSettled: boolean;
  settledAmount: string | null;
  importSourceFingerprint: string | null;
  importExternalId: string | null;
};

export async function listReconciliationTransactionCandidates(input: {
  userId: string;
  targetType: "account" | "card";
  targetId: string;
  from: string;
  to: string;
  periods: string[];
}): Promise<ReconciliationTransactionRow[]> {
  const { userId, targetType, targetId, from, to, periods } = input;
  if (targetType === "card" && !periods.length) return [];

  const targetFilter =
    targetType === "card"
      ? and(eq(transactions.cardId, targetId), inArray(transactions.period, periods))
      : and(
          eq(transactions.accountId, targetId),
          or(
            sql`${transactions.purchaseDate} between (${from}::date - 3) and (${to}::date + 3)`,
            periods.length ? inArray(transactions.period, periods) : undefined,
          ),
        );

  return db
    .select({
      id: transactions.id,
      name: transactions.name,
      purchaseDate: sql<string>`to_char(${transactions.purchaseDate}, 'YYYY-MM-DD')`,
      period: transactions.period,
      type: sql<
        "income" | "expense"
      >`case when ${transactions.amount} < 0 then 'expense' else 'income' end`,
      effectiveAmount: effectiveTransactionAmountSql.as("effective_amount"),
      installmentCount: transactions.installmentCount,
      currentInstallment: transactions.currentInstallment,
      importSourceFingerprint: transactions.importSourceFingerprint,
      importExternalId: transactions.importExternalId,
      categoryId: transactions.categoryId,
      isSettled: transactions.isSettled,
      // Built with the query builder: a raw correlated subquery in a select list renders
      // transactions.id unqualified, so it binds to the subquery's own id column.
      hasSplits: sql<boolean>`exists (${db
        .select({ one: sql`1` })
        .from(transactionSplits)
        .where(
          and(
            eq(transactionSplits.userId, userId),
            eq(transactionSplits.transactionId, transactions.id),
          ),
        )})`,
      transferId: transactions.transferId,
      transferSide: sql<"source" | "destination" | null>`case
          when ${transactions.transferId} is null then null
          when ${transactions.amount} < 0 then 'source'
          else 'destination'
        end`,
      isGenerated: sql<boolean>`${transactions.origin} in ('invoicePayment', 'invoiceAdjustment', 'personSettlement')`,
      inPaidInvoice: sql<boolean>`exists (${db
        .select({ one: sql`1` })
        .from(invoices)
        .where(
          and(
            eq(invoices.userId, userId),
            eq(invoices.cardId, transactions.cardId),
            eq(invoices.period, transactions.period),
            eq(invoices.paymentStatus, "paid"),
          ),
        )})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        ne(transactions.origin, "accountBalanceAdjustment"),
        targetFilter,
      ),
    )
    .orderBy(asc(transactions.purchaseDate), asc(transactions.id));
}

export async function listReconciliationRecurringRules(input: {
  userId: string;
  targetType: "account" | "card";
  targetId: string;
}): Promise<ReconciliationRecurringRuleRow[]> {
  const [expenseRules, incomeRules] = await Promise.all([
    listRecurringRulesForReport(input.userId, { type: "expense", includeHistory: true }),
    listRecurringRulesForReport(input.userId, { type: "income", includeHistory: true }),
  ]);

  // Rules bound to the target are never transfers, so the transfer account labels stay empty.
  return [...expenseRules, ...incomeRules]
    .filter((rule) =>
      input.targetType === "card"
        ? rule.cardId === input.targetId
        : rule.accountId === input.targetId,
    )
    .map((rule) => ({
      ...rule,
      sourceAccountName: null,
      sourceAccountLogo: null,
      destinationAccountName: null,
      destinationAccountLogo: null,
    }));
}

export async function listReconciliationOccurrences(input: {
  userId: string;
  seriesIds: string[];
  from: string;
  to: string;
}): Promise<ReconciliationOccurrenceRow[]> {
  if (!input.seriesIds.length) return [];

  return db
    .select({
      seriesId: recurringTransactionOccurrences.recurringSeriesId,
      date: sql<string>`to_char(${recurringTransactionOccurrences.purchaseDate}, 'YYYY-MM-DD')`,
      isSettled: recurringTransactionOccurrences.isSettled,
      settledAmount: recurringTransactionOccurrences.settledAmount,
      importSourceFingerprint: recurringTransactionOccurrences.importSourceFingerprint,
      importExternalId: recurringTransactionOccurrences.importExternalId,
    })
    .from(recurringTransactionOccurrences)
    .where(
      and(
        eq(recurringTransactionOccurrences.userId, input.userId),
        inArray(recurringTransactionOccurrences.recurringSeriesId, input.seriesIds),
        sql`${recurringTransactionOccurrences.purchaseDate} between ${input.from}::date and ${input.to}::date`,
      ),
    );
}

export async function listReconciliationIgnores(
  userId: string,
  sourceFingerprint: string,
  externalIds: string[],
): Promise<Map<string, string>> {
  if (!externalIds.length) return new Map();

  const rows = await db
    .select({
      externalId: reconciliationIgnores.externalId,
      reason: reconciliationIgnores.reason,
    })
    .from(reconciliationIgnores)
    .where(
      and(
        eq(reconciliationIgnores.userId, userId),
        eq(reconciliationIgnores.sourceFingerprint, sourceFingerprint),
        inArray(reconciliationIgnores.externalId, externalIds),
      ),
    );

  return new Map(rows.map((row) => [row.externalId, row.reason]));
}

export async function listImportNameMappings(
  userId: string,
  keys: string[],
): Promise<Record<string, string>> {
  if (!keys.length) return {};

  const rows = await db
    .select({
      descriptionKey: importNameMappings.descriptionKey,
      name: importNameMappings.name,
    })
    .from(importNameMappings)
    .where(
      and(eq(importNameMappings.userId, userId), inArray(importNameMappings.descriptionKey, keys)),
    );

  return Object.fromEntries(rows.map((row) => [row.descriptionKey, row.name]));
}

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OccurrenceRef = Extract<EntryRef, { kind: "occurrence" }>;
type PaymentMethod = NonNullable<typeof transactions.$inferInsert.paymentMethod>;

export type ReconciliationAmountChange = { ref: EntryRef } & (
  | { field: "amount"; previous: string }
  | { field: "settledAmount"; previous: string | null }
);

export type ReconciliationJournal = {
  sourceFingerprint: string;
  released: { ref: EntryRef; externalId: string }[];
  created: string[];
  stamped: { ref: EntryRef; externalId: string }[];
  stampOnlyOccurrences: string[];
  settledByApply: { ref: EntryRef; transferId: string | null }[];
  amountChanges: ReconciliationAmountChange[];
};

function toDecimal(cents: number) {
  return (cents / 100).toFixed(2);
}

function toDateValue(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

async function findOccurrenceRow(tx: DatabaseTransaction, userId: string, ref: OccurrenceRef) {
  const [rule] = await tx
    .select({ seriesId: recurringTransactionRules.seriesId })
    .from(recurringTransactionRules)
    .where(
      and(
        eq(recurringTransactionRules.userId, userId),
        eq(recurringTransactionRules.id, ref.ruleId),
      ),
    )
    .limit(1);
  if (!rule) return null;

  const [row] = await tx
    .select()
    .from(recurringTransactionOccurrences)
    .where(
      and(
        eq(recurringTransactionOccurrences.userId, userId),
        eq(recurringTransactionOccurrences.recurringSeriesId, rule.seriesId),
        eq(recurringTransactionOccurrences.purchaseDate, toDateValue(ref.date)),
      ),
    )
    .limit(1);
  return { seriesId: rule.seriesId, row: row ?? null };
}

async function isIdentityTaken(
  tx: DatabaseTransaction,
  userId: string,
  sourceFingerprint: string,
  externalId: string,
) {
  const [transaction] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.importSourceFingerprint, sourceFingerprint),
        eq(transactions.importExternalId, externalId),
      ),
    )
    .limit(1);
  if (transaction) return true;

  const [occurrence] = await tx
    .select({ id: recurringTransactionOccurrences.id })
    .from(recurringTransactionOccurrences)
    .where(
      and(
        eq(recurringTransactionOccurrences.userId, userId),
        eq(recurringTransactionOccurrences.importSourceFingerprint, sourceFingerprint),
        eq(recurringTransactionOccurrences.importExternalId, externalId),
      ),
    )
    .limit(1);
  return Boolean(occurrence);
}

// Clears the identity only while it still equals the one the journal recorded.
async function clearIdentity(
  tx: DatabaseTransaction,
  userId: string,
  ref: EntryRef,
  sourceFingerprint: string,
  externalId: string,
) {
  if (ref.kind === "transaction") {
    await tx
      .update(transactions)
      .set({ importSourceFingerprint: null, importExternalId: null })
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.id, ref.id),
          eq(transactions.importSourceFingerprint, sourceFingerprint),
          eq(transactions.importExternalId, externalId),
        ),
      );
    return;
  }

  const found = await findOccurrenceRow(tx, userId, ref);
  if (!found?.row) return;
  await tx
    .update(recurringTransactionOccurrences)
    .set({ importSourceFingerprint: null, importExternalId: null })
    .where(
      and(
        eq(recurringTransactionOccurrences.userId, userId),
        eq(recurringTransactionOccurrences.id, found.row.id),
        eq(recurringTransactionOccurrences.importSourceFingerprint, sourceFingerprint),
        eq(recurringTransactionOccurrences.importExternalId, externalId),
      ),
    );
}

// Gives a released identity back only when no row holds it anymore.
async function restoreIdentity(
  tx: DatabaseTransaction,
  userId: string,
  ref: EntryRef,
  sourceFingerprint: string,
  externalId: string,
) {
  if (await isIdentityTaken(tx, userId, sourceFingerprint, externalId)) return;

  if (ref.kind === "transaction") {
    await tx
      .update(transactions)
      .set({ importSourceFingerprint: sourceFingerprint, importExternalId: externalId })
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.id, ref.id),
          isNull(transactions.importExternalId),
        ),
      );
    return;
  }

  const found = await findOccurrenceRow(tx, userId, ref);
  if (!found?.row) return;
  await tx
    .update(recurringTransactionOccurrences)
    .set({ importSourceFingerprint: sourceFingerprint, importExternalId: externalId })
    .where(
      and(
        eq(recurringTransactionOccurrences.userId, userId),
        eq(recurringTransactionOccurrences.id, found.row.id),
        isNull(recurringTransactionOccurrences.importExternalId),
      ),
    );
}

export async function applyReconciliationPlan(input: {
  userId: string;
  batchId: string;
  target: { type: "account" | "card"; id: string };
  sourceFingerprint: string;
  plan: ReconciliationPlan;
  paymentMethod: PaymentMethod;
  invoicePeriod: string | null;
}) {
  const { userId, batchId, target, sourceFingerprint, plan } = input;

  return db.transaction(async (tx) => {
    const journal: ReconciliationJournal = {
      sourceFingerprint,
      released: [],
      created: [],
      stamped: [],
      stampOnlyOccurrences: [],
      settledByApply: [],
      amountChanges: [],
    };

    for (const release of plan.releases) {
      await clearIdentity(tx, userId, release.ref, sourceFingerprint, release.externalId);
      journal.released.push(release);
    }

    const creationIds = plan.creations.map((creation) => creation.externalId);
    const occupiedOnOccurrences = new Set(
      creationIds.length
        ? (
            await tx
              .select({ externalId: recurringTransactionOccurrences.importExternalId })
              .from(recurringTransactionOccurrences)
              .where(
                and(
                  eq(recurringTransactionOccurrences.userId, userId),
                  eq(recurringTransactionOccurrences.importSourceFingerprint, sourceFingerprint),
                  inArray(recurringTransactionOccurrences.importExternalId, creationIds),
                ),
              )
          ).map((row) => row.externalId)
        : [],
    );
    const creatable = plan.creations.filter(
      (creation) => !occupiedOnOccurrences.has(creation.externalId),
    );
    let skipped = plan.creations.length - creatable.length;
    if (creatable.length) {
      const inserted = await tx
        .insert(transactions)
        .values(
          creatable.map((creation) => ({
            userId,
            personId: creation.personId,
            type: creation.signedCents < 0 ? ("expense" as const) : ("income" as const),
            origin: "regular" as const,
            condition: "single" as const,
            paymentMethod: input.paymentMethod,
            name: creation.name,
            amount: toDecimal(creation.signedCents),
            purchaseDate: toDateValue(creation.purchaseDate),
            period: creation.period,
            accountId: target.type === "account" ? target.id : null,
            cardId: target.type === "card" ? target.id : null,
            categoryId: creation.categoryId,
            sourceAccountId: null,
            destinationAccountId: null,
            dueDate: null,
            boletoPaymentDate: null,
            installmentCount: null,
            currentInstallment: null,
            seriesId: null,
            transferId: null,
            recurringRuleId: null,
            isSettled: target.type === "card" ? null : true,
            note: null,
            importSourceFingerprint: sourceFingerprint,
            importExternalId: creation.externalId,
            importBatchId: batchId,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: transactions.id });
      journal.created = inserted.map((row) => row.id);
      skipped += creatable.length - inserted.length;
    }

    for (const stamp of plan.stamps) {
      if (stamp.ref.kind === "transaction") {
        const updated = await tx
          .update(transactions)
          .set({ importSourceFingerprint: sourceFingerprint, importExternalId: stamp.externalId })
          .where(and(eq(transactions.userId, userId), eq(transactions.id, stamp.ref.id)))
          .returning({ id: transactions.id });
        if (!updated.length) throw new ReconciliationPlanError("RECONCILIATION_STALE");
      } else {
        const found = await findOccurrenceRow(tx, userId, stamp.ref);
        if (!found) throw new ReconciliationPlanError("RECONCILIATION_STALE");

        if (found.row) {
          await tx
            .update(recurringTransactionOccurrences)
            .set({ importSourceFingerprint: sourceFingerprint, importExternalId: stamp.externalId })
            .where(eq(recurringTransactionOccurrences.id, found.row.id));
        } else {
          const [created] = await tx
            .insert(recurringTransactionOccurrences)
            .values({
              userId,
              recurringRuleId: stamp.ref.ruleId,
              recurringSeriesId: found.seriesId,
              purchaseDate: toDateValue(stamp.ref.date),
              isSettled: false,
              importSourceFingerprint: sourceFingerprint,
              importExternalId: stamp.externalId,
            })
            .returning({ id: recurringTransactionOccurrences.id });
          journal.stampOnlyOccurrences.push(created.id);
        }
      }
      journal.stamped.push({ ref: stamp.ref, externalId: stamp.externalId });
    }

    for (const settlement of plan.settlements) {
      if (settlement.ref.kind === "transaction") {
        const [row] = await tx
          .select({ transferId: transactions.transferId })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), eq(transactions.id, settlement.ref.id)))
          .limit(1);
        if (!row) throw new ReconciliationPlanError("RECONCILIATION_STALE");

        if (row.transferId) {
          await tx
            .update(transactions)
            .set({ isSettled: true })
            .where(
              and(eq(transactions.userId, userId), eq(transactions.transferId, row.transferId)),
            );
        } else {
          const settled = await settlePersistedTransactions({
            ids: [settlement.ref.id],
            userId,
            isSettled: true,
            date: toDateValue(settlement.date),
            amount: Math.abs(settlement.cents) / 100,
            executor: tx,
          });
          if (!settled.length) throw new ReconciliationPlanError("RECONCILIATION_STALE");
        }
        journal.settledByApply.push({ ref: settlement.ref, transferId: row.transferId });
      } else {
        const settled = await settleRecurringTransaction({
          id: settlement.ref.ruleId,
          purchaseDate: toDateValue(settlement.ref.date),
          userId,
          isSettled: true,
          date: toDateValue(settlement.date),
          amount: Math.abs(settlement.cents) / 100,
          executor: tx,
        });
        if (!settled) throw new ReconciliationPlanError("RECONCILIATION_STALE");
        journal.settledByApply.push({ ref: settlement.ref, transferId: null });
      }
    }

    for (const alignment of plan.alignments) {
      const value = toDecimal(alignment.toCents);
      if (alignment.ref.kind === "transaction") {
        const [row] = await tx
          .select({
            amount: transactions.amount,
            settledAmount: transactions.settledAmount,
            isSettled: transactions.isSettled,
          })
          .from(transactions)
          .where(and(eq(transactions.userId, userId), eq(transactions.id, alignment.ref.id)))
          .limit(1);
        if (!row) throw new ReconciliationPlanError("RECONCILIATION_STALE");

        if (row.isSettled === true && row.settledAmount !== null) {
          journal.amountChanges.push({
            ref: alignment.ref,
            field: "settledAmount",
            previous: row.settledAmount,
          });
          await tx
            .update(transactions)
            .set({ settledAmount: value })
            .where(and(eq(transactions.userId, userId), eq(transactions.id, alignment.ref.id)));
        } else {
          journal.amountChanges.push({ ref: alignment.ref, field: "amount", previous: row.amount });
          await tx
            .update(transactions)
            .set({ amount: value })
            .where(and(eq(transactions.userId, userId), eq(transactions.id, alignment.ref.id)));
        }
      } else {
        const found = await findOccurrenceRow(tx, userId, alignment.ref);
        if (!found?.row) throw new ReconciliationPlanError("RECONCILIATION_STALE");
        journal.amountChanges.push({
          ref: alignment.ref,
          field: "settledAmount",
          previous: found.row.settledAmount,
        });
        await tx
          .update(recurringTransactionOccurrences)
          .set({ settledAmount: value })
          .where(eq(recurringTransactionOccurrences.id, found.row.id));
      }
    }

    if (plan.ignores.length) {
      await tx
        .insert(reconciliationIgnores)
        .values(
          plan.ignores.map((ignore) => ({
            userId,
            sourceFingerprint,
            externalId: ignore.externalId,
            reason: ignore.reason,
          })),
        )
        .onConflictDoNothing();
    }

    if (plan.categoryMappings.length) {
      await tx
        .insert(importCategoryMappings)
        .values(
          plan.categoryMappings.map((mapping) => ({
            userId,
            descriptionKey: mapping.descriptionKey,
            categoryId: mapping.categoryId,
          })),
        )
        .onConflictDoUpdate({
          target: [importCategoryMappings.userId, importCategoryMappings.descriptionKey],
          set: { categoryId: sql`excluded.category_id`, updatedAt: new Date() },
        });
    }

    if (plan.nameMappings.length) {
      await tx
        .insert(importNameMappings)
        .values(
          plan.nameMappings.map((mapping) => ({
            userId,
            descriptionKey: mapping.descriptionKey,
            name: mapping.name,
          })),
        )
        .onConflictDoUpdate({
          target: [importNameMappings.userId, importNameMappings.descriptionKey],
          set: { name: sql`excluded.name`, updatedAt: new Date() },
        });
    }

    await tx.insert(reconciliationBatches).values({
      id: batchId,
      userId,
      targetType: target.type,
      targetId: target.id,
      undo: journal,
    });

    return { created: journal.created.length, skipped };
  });
}

export async function undoReconciliationBatch(batchId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ undo: reconciliationBatches.undo })
      .from(reconciliationBatches)
      .where(and(eq(reconciliationBatches.userId, userId), eq(reconciliationBatches.id, batchId)))
      .for("update");
    if (!batch) return null;

    const journal = batch.undo as ReconciliationJournal;
    const { sourceFingerprint } = journal;

    const deleted = await tx
      .delete(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.importBatchId, batchId)))
      .returning({ id: transactions.id });

    for (const change of journal.amountChanges) {
      if (change.ref.kind === "transaction") {
        await tx
          .update(transactions)
          .set(
            change.field === "settledAmount"
              ? { settledAmount: change.previous }
              : { amount: change.previous },
          )
          .where(and(eq(transactions.userId, userId), eq(transactions.id, change.ref.id)));
      } else {
        const found = await findOccurrenceRow(tx, userId, change.ref);
        if (found?.row) {
          await tx
            .update(recurringTransactionOccurrences)
            .set({ settledAmount: change.previous })
            .where(eq(recurringTransactionOccurrences.id, found.row.id));
        }
      }
    }

    for (const settled of journal.settledByApply) {
      if (settled.transferId) {
        await tx
          .update(transactions)
          .set({ isSettled: false })
          .where(
            and(eq(transactions.userId, userId), eq(transactions.transferId, settled.transferId)),
          );
      } else if (settled.ref.kind === "transaction") {
        await settlePersistedTransactions({
          ids: [settled.ref.id],
          userId,
          isSettled: false,
          date: new Date(),
          executor: tx,
        });
      } else {
        await settleRecurringTransaction({
          id: settled.ref.ruleId,
          purchaseDate: toDateValue(settled.ref.date),
          userId,
          isSettled: false,
          date: new Date(),
          executor: tx,
        });
      }
    }

    for (const stamp of journal.stamped) {
      await clearIdentity(tx, userId, stamp.ref, sourceFingerprint, stamp.externalId);
    }

    if (journal.stampOnlyOccurrences.length) {
      await tx
        .delete(recurringTransactionOccurrences)
        .where(
          and(
            eq(recurringTransactionOccurrences.userId, userId),
            inArray(recurringTransactionOccurrences.id, journal.stampOnlyOccurrences),
            eq(recurringTransactionOccurrences.isSettled, false),
          ),
        );
    }

    for (const release of journal.released) {
      await restoreIdentity(tx, userId, release.ref, sourceFingerprint, release.externalId);
    }

    await tx
      .delete(reconciliationBatches)
      .where(and(eq(reconciliationBatches.userId, userId), eq(reconciliationBatches.id, batchId)));

    return { deleted: deleted.length };
  });
}
