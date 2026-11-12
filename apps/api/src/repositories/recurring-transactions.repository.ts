import {
  cards,
  categories,
  db,
  financialAccounts,
  recurringTransactionOccurrences as occurrences,
  people,
  recurringTransactionRules,
  recurringTransactionSplits,
  recurringTransactionRules as rules,
  recurringTransactionSeries as series,
  recurringTransactionSplits as splits,
} from "@openmonetis/db";
import {
  assertRecurringActionHasNoSettledOccurrences,
  planRecurringTransition,
  type RecurringAction,
} from "@openmonetis/domain/recurring-transactions";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { RecurringTransactionsRepository } from "../services/recurring-transactions.service";
import { categoryLabelSql } from "./categories.repository";
import { recurringOccurrenceOverridesSql } from "./settlements.repository";
import { readRecurringRuleTagIds, replaceRecurringRuleTags } from "./tags.repository";

// Version boundaries and the user-defined deadline are independent. PostgreSQL LEAST ignores nulls.
export const effectiveRecurringEndDateSql = sql`least(${rules.endDate}, ${rules.recurrenceEndDate})`
  .mapWith(rules.endDate)
  .as("end_date");

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function lockRecurringVersionsForUser(
  transaction: DatabaseTransaction,
  id: string,
  userId: string,
) {
  const [initial] = await transaction
    .select({ seriesId: rules.seriesId })
    .from(rules)
    .where(and(eq(rules.id, id), eq(rules.userId, userId)));
  if (!initial) return [];
  await transaction
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.id, initial.seriesId), eq(series.userId, userId)))
    .for("update");
  return transaction
    .select()
    .from(rules)
    .where(and(eq(rules.seriesId, initial.seriesId), eq(rules.userId, userId)))
    .for("update");
}

export async function transitionRecurringRuleForUser(
  id: string,
  userId: string,
  action: RecurringAction,
  occurrenceDate: string,
) {
  return db.transaction(async (transaction) => {
    const versions = await lockRecurringVersionsForUser(transaction, id, userId);
    const initial = versions[0];
    if (!initial) return false;
    const plan = planRecurringTransition(
      versions.map((rule) => ({
        ...rule,
        dueDate: rule.dueDate ? date(rule.dueDate) : null,
        startDate: date(rule.startDate),
        endDate: rule.endDate ? date(rule.endDate) : null,
        recurrenceEndDate: rule.recurrenceEndDate ? date(rule.recurrenceEndDate) : null,
        anchorDate: date(rule.anchorDate),
      })),
      action,
      occurrenceDate,
    );
    if (action !== "resume") {
      const [settled] = await transaction
        .select({ id: occurrences.id })
        .from(occurrences)
        .where(
          and(
            eq(occurrences.userId, userId),
            eq(occurrences.recurringSeriesId, initial.seriesId),
            eq(occurrences.isSettled, true),
            action === "skip"
              ? eq(occurrences.purchaseDate, new Date(occurrenceDate))
              : gte(occurrences.purchaseDate, new Date(occurrenceDate)),
          ),
        )
        .limit(1);
      assertRecurringActionHasNoSettledOccurrences(action, Boolean(settled));
    }
    for (const change of plan) {
      const original = versions.find((rule) => rule.id === change.id);
      if (!original) continue;
      await transaction
        .update(rules)
        .set({
          ...(change.endDate ? { endDate: new Date(change.endDate) } : {}),
          ...(change.status ? { status: change.status } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(rules.id, change.id), eq(rules.userId, userId)));
      if (change.clone) {
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...record } = original;
        const [created] = await transaction
          .insert(rules)
          .values({
            ...record,
            startDate: new Date(change.clone.startDate),
            status: change.clone.status,
          })
          .returning({ id: rules.id });
        const shares = await transaction
          .select({ personId: splits.personId, amount: splits.amount })
          .from(splits)
          .where(and(eq(splits.recurringRuleId, original.id), eq(splits.userId, userId)));
        if (shares.length)
          await transaction
            .insert(splits)
            .values(shares.map((share) => ({ ...share, userId, recurringRuleId: created.id })));
        await replaceRecurringRuleTags(
          transaction,
          created.id,
          userId,
          await readRecurringRuleTagIds(transaction, original.id, userId),
        );
        await transaction
          .update(occurrences)
          .set({ recurringRuleId: created.id, updatedAt: new Date() })
          .where(
            and(
              eq(occurrences.userId, userId),
              eq(occurrences.recurringRuleId, original.id),
              gte(occurrences.purchaseDate, new Date(change.clone.startDate)),
            ),
          );
      }
    }
    await transaction
      .delete(occurrences)
      .where(
        and(
          eq(occurrences.userId, userId),
          eq(occurrences.recurringSeriesId, initial.seriesId),
          action === "skip"
            ? eq(occurrences.purchaseDate, new Date(occurrenceDate))
            : gte(occurrences.purchaseDate, new Date(occurrenceDate)),
        ),
      );
    return true;
  });
}

function date(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function listRecurringRulesForReport(
  userId: string,
  options: {
    type: "income" | "expense";
    periodStart?: Date;
    periodEnd?: Date;
    includeHistory?: boolean;
  },
) {
  return db
    .select({
      id: recurringTransactionRules.id,
      userId: recurringTransactionRules.userId,
      seriesId: recurringTransactionRules.seriesId,
      anchorDate: recurringTransactionRules.anchorDate,
      personId: recurringTransactionRules.personId,
      type: recurringTransactionRules.type,
      paymentMethod: recurringTransactionRules.paymentMethod,
      name: recurringTransactionRules.name,
      amount: recurringTransactionRules.amount,
      startDate: recurringTransactionRules.startDate,
      endDate: effectiveRecurringEndDateSql,

      configuredEndDate: sql<
        string | null
      >`to_char(${recurringTransactionRules.recurrenceEndDate}, 'YYYY-MM-DD')`.as(
        "configured_end_date",
      ),
      occurrenceOverrides: recurringOccurrenceOverridesSql,
      versionEndDate: recurringTransactionRules.endDate,
      recurrenceEndDate: recurringTransactionRules.recurrenceEndDate,
      frequency: recurringTransactionRules.frequency,
      accountId: recurringTransactionRules.accountId,
      cardId: recurringTransactionRules.cardId,
      categoryId: recurringTransactionRules.categoryId,
      sourceAccountId: recurringTransactionRules.sourceAccountId,
      destinationAccountId: recurringTransactionRules.destinationAccountId,
      dueDate: recurringTransactionRules.dueDate,
      isSettled: recurringTransactionRules.isSettled,
      note: recurringTransactionRules.note,
      status: recurringTransactionRules.status,
      createdAt: recurringTransactionRules.createdAt,
      updatedAt: recurringTransactionRules.updatedAt,
      personName: people.name,
      personAvatarUrl: people.avatarUrl,
      personRole: people.role,
      accountName: financialAccounts.name,
      accountLogo: financialAccounts.logo,
      categoryName: categoryLabelSql(categories),
      categoryIcon: categories.icon,
      cardName: cards.name,
      cardLogo: cards.logo,
      cardClosingDay: cards.closingDay,
      cardClosingRuleType: cards.closingRuleType,
      cardClosingOffsetDays: cards.closingOffsetDays,
      cardClosingOffsetMode: cards.closingOffsetMode,
      cardClosingDayPurchasesNextInvoice: cards.closingDayPurchasesNextInvoice,
      cardDueDay: cards.dueDay,
      hasSplits: sql<boolean>`exists (
          select 1 from ${recurringTransactionSplits}
          where ${recurringTransactionSplits.userId} = ${userId}
            and ${recurringTransactionSplits.recurringRuleId} = ${recurringTransactionRules.id}
        )`.as("has_splits"),
      adminAmount: sql<string | null>`case
          when exists (
            select 1 from ${recurringTransactionSplits}
            where ${recurringTransactionSplits.userId} = ${userId}
              and ${recurringTransactionSplits.recurringRuleId} = ${recurringTransactionRules.id}
          ) then (
            select ${recurringTransactionSplits.amount}
            from ${recurringTransactionSplits}
            inner join ${people}
              on ${people.id} = ${recurringTransactionSplits.personId}
              and ${people.userId} = ${userId}
              and ${people.role} = 'admin'
            where ${recurringTransactionSplits.userId} = ${userId}
              and ${recurringTransactionSplits.recurringRuleId} = ${recurringTransactionRules.id}
            limit 1
          )
          when ${people.role} = 'admin' then ${recurringTransactionRules.amount}
          else null
        end`.as("admin_amount"),
    })
    .from(recurringTransactionRules)
    .innerJoin(
      people,
      and(eq(recurringTransactionRules.personId, people.id), eq(people.userId, userId)),
    )
    .leftJoin(
      financialAccounts,
      and(
        eq(recurringTransactionRules.accountId, financialAccounts.id),
        eq(financialAccounts.userId, userId),
      ),
    )
    .leftJoin(
      categories,
      and(eq(recurringTransactionRules.categoryId, categories.id), eq(categories.userId, userId)),
    )
    .leftJoin(cards, and(eq(recurringTransactionRules.cardId, cards.id), eq(cards.userId, userId)))
    .where(
      and(
        eq(recurringTransactionRules.userId, userId),
        eq(recurringTransactionRules.type, options.type),
        options.includeHistory
          ? undefined
          : inArray(recurringTransactionRules.status, ["active", "paused"]),
        options.periodEnd ? lte(recurringTransactionRules.startDate, options.periodEnd) : undefined,
        options.periodStart
          ? or(
              isNull(recurringTransactionRules.endDate),
              gte(recurringTransactionRules.endDate, options.periodStart),
            )
          : undefined,
      ),
    );
}

export async function listRecurringSplitPeopleForReport(userId: string, ruleIds: string[]) {
  if (!ruleIds.length) return [];
  return db
    .select({
      recurringRuleId: recurringTransactionSplits.recurringRuleId,
      personId: recurringTransactionSplits.personId,
      personName: people.name,
      personAvatarUrl: people.avatarUrl,
      amount: recurringTransactionSplits.amount,
    })
    .from(recurringTransactionSplits)
    .innerJoin(
      people,
      and(eq(recurringTransactionSplits.personId, people.id), eq(people.userId, userId)),
    )
    .where(
      and(
        eq(recurringTransactionSplits.userId, userId),
        inArray(recurringTransactionSplits.recurringRuleId, ruleIds),
      ),
    );
}

export const recurringTransactionsRepository = {
  listForReport: (userId, type) =>
    listRecurringRulesForReport(userId, { type, includeHistory: true }),
  listSplitPeople: listRecurringSplitPeopleForReport,
} satisfies RecurringTransactionsRepository;
