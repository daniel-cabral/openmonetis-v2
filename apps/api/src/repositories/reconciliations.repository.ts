import {
  db,
  importNameMappings,
  invoices,
  reconciliationIgnores,
  recurringTransactionOccurrences,
  transactionSplits,
  transactions,
} from "@openmonetis/db";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { listRecurringRulesForReport } from "./recurring-transactions.repository";
import { effectiveTransactionAmountSql } from "./settlements.repository";

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

export type ReconciliationRecurringRuleRow = Awaited<
  ReturnType<typeof listRecurringRulesForReport>
>[number];

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
      type: sql<"income" | "expense">`case when ${transactions.amount} < 0 then 'expense' else 'income' end`,
      effectiveAmount: effectiveTransactionAmountSql.as("effective_amount"),
      installmentCount: transactions.installmentCount,
      currentInstallment: transactions.currentInstallment,
      importSourceFingerprint: transactions.importSourceFingerprint,
      importExternalId: transactions.importExternalId,
      categoryId: transactions.categoryId,
      isSettled: transactions.isSettled,
      hasSplits: sql<boolean>`exists (
          select 1 from ${transactionSplits}
          where ${transactionSplits.userId} = ${userId}
            and ${transactionSplits.transactionId} = ${transactions.id}
        )`,
      transferId: transactions.transferId,
      transferSide: sql<"source" | "destination" | null>`case
          when ${transactions.transferId} is null then null
          when ${transactions.amount} < 0 then 'source'
          else 'destination'
        end`,
      isGenerated: sql<boolean>`${transactions.origin} in ('invoicePayment', 'invoiceAdjustment', 'personSettlement')`,
      inPaidInvoice: sql<boolean>`exists (
          select 1 from ${invoices}
          where ${invoices.userId} = ${userId}
            and ${invoices.cardId} = ${transactions.cardId}
            and ${invoices.period} = ${transactions.period}
            and ${invoices.paymentStatus} = 'paid'
        )`,
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

  return [...expenseRules, ...incomeRules].filter((rule) =>
    input.targetType === "card"
      ? rule.cardId === input.targetId
      : rule.accountId === input.targetId,
  );
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
