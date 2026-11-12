import {
  db,
  dueDateRuleVersions,
  financialAccounts,
  recurringTransactionOccurrences as occurrences,
  people,
  recurringTransactionSplits,
  recurringTransactionRules as rules,
  settlementEvents,
  transactionSplits,
  transactions,
} from "@openmonetis/db";
import { resolveDueDate } from "@openmonetis/domain/due-date-rules";
import { getRecurringDueDate } from "@openmonetis/domain/recurring-expenses";
import { isActiveRecurringOccurrence } from "@openmonetis/domain/recurring-transactions";
import {
  type OccurrenceOverride,
  planSettlement,
  SettlementError,
} from "@openmonetis/domain/settlements";
import { getCurrentDateInBrazil } from "@openmonetis/shared/date-time";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { synchronizePendingExternalExpensesForTransactions } from "./external-expenses.repository";
import { lockRecurringVersionsForUser } from "./recurring-transactions.repository";

export const effectiveTransactionAmountSql = sql<string>`case when ${transactions.isSettled} then coalesce(${transactions.settledAmount}, ${transactions.amount}) else ${transactions.amount} end`;
export const effectiveSplitAmountSql = sql<string>`coalesce(${transactionSplits.settledAmount}, ${transactionSplits.amount})`;
export const recurringOccurrenceOverridesSql = sql<
  Record<string, OccurrenceOverride>
>`coalesce((select jsonb_object_agg(to_char(o.purchase_date, 'YYYY-MM-DD'), jsonb_build_object('isSettled', o.is_settled, 'frozenDueDate', to_char(o.frozen_due_date, 'YYYY-MM-DD'), 'dueDateAdjustment', o.due_date_adjustment, 'dueDateRuleExcluded', o.due_date_rule_excluded, 'amount', o.settled_amount, 'settledDate', to_char(o.settled_date, 'YYYY-MM-DD'), 'accountId', o.account_id, 'allocations', o.settled_allocations)) from recurring_transaction_occurrences o where o.user_id = ${rules.userId} and o.recurring_series_id = ${rules.seriesId}), '{}'::jsonb)`.as(
  "occurrence_overrides",
);

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function settlePersistedTransactions(input: {
  ids: string[];
  userId: string;
  isSettled: boolean;
  date: Date;
  amount?: number;
  accountId?: string;
  executor?: DatabaseTransaction;
}) {
  const run = async (tx: DatabaseTransaction) => {
    const dueDateVersions = await tx
      .select()
      .from(dueDateRuleVersions)
      .where(eq(dueDateRuleVersions.userId, input.userId));
    const rows = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, input.userId), inArray(transactions.id, input.ids)))
      .orderBy(asc(transactions.id))
      .for("update");
    if (rows.length !== new Set(input.ids).size) return [];
    if (input.amount !== undefined && rows.length !== 1)
      throw new SettlementError("SETTLEMENT_AMOUNT_REQUIRES_SINGLE");
    if (rows.some((row) => row.cardId || row.type === "transfer" || row.origin !== "regular"))
      throw new SettlementError("SETTLEMENT_UNSUPPORTED");
    if (input.accountId) {
      const [account] = await tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.userId, input.userId),
            eq(financialAccounts.id, input.accountId),
            eq(financialAccounts.isArchived, false),
          ),
        );
      if (!account) throw new SettlementError("SETTLEMENT_ACCOUNT_NOT_FOUND");
    }
    for (const row of rows) {
      if (!input.isSettled && row.isSettled !== true) continue;
      if (input.isSettled && row.isSettled === true)
        throw new SettlementError("SETTLEMENT_ALREADY_CONFIRMED");
      const [lastConfirm] = !input.isSettled
        ? await tx
            .select({ snapshot: settlementEvents.snapshot })
            .from(settlementEvents)
            .where(
              and(
                eq(settlementEvents.userId, input.userId),
                eq(settlementEvents.transactionId, row.id),
                eq(settlementEvents.action, "confirm"),
              ),
            )
            .orderBy(desc(settlementEvents.createdAt))
            .limit(1)
        : [];
      const originalAccount = (
        lastConfirm?.snapshot as { before?: { accountId?: string | null } } | undefined
      )?.before?.accountId;
      const shares = await tx
        .select({
          id: transactionSplits.id,
          personId: transactionSplits.personId,
          amount: transactionSplits.amount,
          role: people.role,
        })
        .from(transactionSplits)
        .innerJoin(
          people,
          and(eq(transactionSplits.personId, people.id), eq(people.userId, input.userId)),
        )
        .where(
          and(
            eq(transactionSplits.transactionId, row.id),
            eq(transactionSplits.userId, input.userId),
          ),
        );
      const owner = await tx
        .select({ role: people.role })
        .from(people)
        .where(and(eq(people.id, row.personId), eq(people.userId, input.userId)));
      const plan = input.isSettled
        ? planSettlement({
            expectedAmount: row.amount,
            amount: input.amount,
            date: date(input.date),
            today: getCurrentDateInBrazil(),
            allocations: shares.length
              ? shares
              : [{ personId: row.personId, amount: row.amount, role: owner[0]?.role }],
          })
        : null;
      await tx.insert(settlementEvents).values({
        userId: input.userId,
        transactionId: row.id,
        action: input.isSettled ? "confirm" : "undo",
        snapshot: {
          target: {
            id: row.id,
            name: row.name,
            type: row.type,
            purchaseDate: date(row.purchaseDate),
          },
          before: { amount: row.settledAmount, date: row.settledDate, accountId: row.accountId },
          after: plan,
          expectedAmount: row.amount,
        },
      });
      const resolution = input.isSettled
        ? resolveDueDate(
            {
              dueDate: row.dueDate ? date(row.dueDate) : null,
              type: row.type,
              origin: row.origin,
              paymentMethod: row.paymentMethod,
              transactionId: row.id,
              excluded: row.dueDateRuleExcluded,
            },
            dueDateVersions,
          )
        : null;
      await tx
        .update(transactions)
        .set({
          frozenDueDate: resolution?.dueDate
            ? new Date(`${resolution.dueDate}T00:00:00.000Z`)
            : null,
          dueDateAdjustment: resolution?.dueDateAdjustment ?? null,
          isSettled: input.isSettled,
          settledAmount: plan?.amount ?? null,
          settledDate: plan ? input.date : null,
          ...(input.isSettled
            ? input.accountId
              ? { accountId: input.accountId }
              : {}
            : originalAccount !== undefined
              ? { accountId: originalAccount }
              : {}),
          boletoPaymentDate: input.isSettled && row.paymentMethod === "boleto" ? input.date : null,
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, row.id), eq(transactions.userId, input.userId)));
      for (const share of shares)
        await tx
          .update(transactionSplits)
          .set({
            settledAmount:
              plan?.allocations.find((allocation) => allocation.personId === share.personId)
                ?.amount ?? null,
          })
          .where(
            and(eq(transactionSplits.id, share.id), eq(transactionSplits.userId, input.userId)),
          );
    }
    await synchronizePendingExternalExpensesForTransactions(
      tx,
      input.userId,
      rows.map((row) => row.id),
      new Set(),
    );
    return rows.map(({ id }) => ({ id }));
  };
  return input.executor ? run(input.executor) : db.transaction(run);
}

export async function settleRecurringTransaction(input: {
  id: string;
  purchaseDate: Date;
  userId: string;
  isSettled: boolean;
  date: Date;
  amount?: number;
  accountId?: string;
  executor?: DatabaseTransaction;
}) {
  const run = async (tx: DatabaseTransaction) => {
    const versions = await lockRecurringVersionsForUser(tx, input.id, input.userId);
    const rule = versions.find((row) => row.id === input.id);
    if (
      !rule ||
      !isActiveRecurringOccurrence(
        {
          ...rule,
          dueDate: rule.dueDate ? date(rule.dueDate) : null,
          startDate: date(rule.startDate),
          endDate: rule.endDate ? date(rule.endDate) : null,
          recurrenceEndDate: rule.recurrenceEndDate ? date(rule.recurrenceEndDate) : null,
          anchorDate: date(rule.anchorDate),
        },
        date(input.purchaseDate),
      )
    )
      return null;
    if (rule.paymentMethod === "credit_card" || rule.type === "transfer")
      throw new SettlementError("SETTLEMENT_UNSUPPORTED");
    if (input.accountId) {
      const [account] = await tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.userId, input.userId),
            eq(financialAccounts.id, input.accountId),
            eq(financialAccounts.isArchived, false),
          ),
        );
      if (!account) throw new SettlementError("SETTLEMENT_ACCOUNT_NOT_FOUND");
    }
    const [previous] = await tx
      .select()
      .from(occurrences)
      .where(
        and(
          eq(occurrences.userId, input.userId),
          eq(occurrences.recurringSeriesId, rule.seriesId),
          eq(occurrences.purchaseDate, input.purchaseDate),
        ),
      );
    if (input.isSettled && previous?.isSettled)
      throw new SettlementError("SETTLEMENT_ALREADY_CONFIRMED");
    if (!input.isSettled && (previous?.isSettled ?? rule.isSettled) !== true)
      return { recurringRuleId: rule.id };
    const shares = await tx
      .select({
        personId: recurringTransactionSplits.personId,
        amount: recurringTransactionSplits.amount,
        role: people.role,
      })
      .from(recurringTransactionSplits)
      .innerJoin(
        people,
        and(eq(recurringTransactionSplits.personId, people.id), eq(people.userId, input.userId)),
      )
      .where(
        and(
          eq(recurringTransactionSplits.recurringRuleId, rule.id),
          eq(recurringTransactionSplits.userId, input.userId),
        ),
      );
    const [owner] = await tx
      .select({ role: people.role })
      .from(people)
      .where(and(eq(people.id, rule.personId), eq(people.userId, input.userId)));
    const plan = input.isSettled
      ? planSettlement({
          expectedAmount: rule.amount,
          amount: input.amount,
          date: date(input.date),
          today: getCurrentDateInBrazil(),
          allocations: shares.length
            ? shares
            : [{ personId: rule.personId, amount: rule.amount, role: owner?.role }],
        })
      : null;
    await tx.insert(settlementEvents).values({
      userId: input.userId,
      recurringSeriesId: rule.seriesId,
      occurrenceDate: input.purchaseDate,
      action: input.isSettled ? "confirm" : "undo",
      snapshot: {
        target: {
          seriesId: rule.seriesId,
          ruleId: rule.id,
          name: rule.name,
          type: rule.type,
          purchaseDate: date(input.purchaseDate),
        },
        before: previous ?? null,
        after: plan,
        expectedAmount: rule.amount,
      },
    });
    const dueDateVersions = await tx
      .select()
      .from(dueDateRuleVersions)
      .where(eq(dueDateRuleVersions.userId, input.userId));
    const originalDueDate = getRecurringDueDate(
      rule.dueDate ? date(rule.dueDate) : null,
      date(input.purchaseDate),
    );
    const resolution = input.isSettled
      ? resolveDueDate(
          {
            dueDate: originalDueDate,
            type: rule.type,
            paymentMethod: rule.paymentMethod,
            seriesId: rule.seriesId,
            excluded: previous?.dueDateRuleExcluded ?? rule.dueDateRuleExcluded,
          },
          dueDateVersions,
        )
      : null;
    const values = {
      frozenDueDate: resolution?.dueDate ? new Date(`${resolution.dueDate}T00:00:00.000Z`) : null,
      dueDateAdjustment: resolution?.dueDateAdjustment ?? null,
      userId: input.userId,
      recurringRuleId: rule.id,
      recurringSeriesId: rule.seriesId,
      purchaseDate: input.purchaseDate,
      isSettled: input.isSettled,
      settledDate: plan ? input.date : null,
      settledAmount: plan?.amount ?? null,
      settledAllocations: plan?.allocations ?? null,
      accountId: input.isSettled
        ? (input.accountId ?? previous?.accountId ?? rule.accountId)
        : null,
      boletoPaymentDate: input.isSettled && rule.paymentMethod === "boleto" ? input.date : null,
    };
    const [result] = await tx
      .insert(occurrences)
      .values(values)
      .onConflictDoUpdate({
        target: [occurrences.recurringSeriesId, occurrences.purchaseDate],
        set: { ...values, updatedAt: new Date() },
      })
      .returning({ recurringRuleId: occurrences.recurringRuleId });
    return result;
  };
  return input.executor ? run(input.executor) : db.transaction(run);
}
function date(value: Date) {
  return value.toISOString().slice(0, 10);
}
