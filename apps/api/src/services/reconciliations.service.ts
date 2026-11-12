import { createHash } from "node:crypto";
import { moneyToCents } from "@openmonetis/domain/installments";
import {
  assignReconciliationBuckets,
  filterAppOnlyByScope,
  matchAccountByIdentification,
  matchReconciliationLines,
  type MatchContext,
  type MatchSuspicion,
  type ReconciliationEntry,
  type ReconciliationLine,
  reclassifyPreviousInvoicePayments,
  resolveAmountAlignment,
  suggestLineName,
} from "@openmonetis/domain/reconciliations";
import { addMonthsToPeriod, getImportedDescriptionKey } from "@openmonetis/domain/transactions";
import type {
  DetectReconciliationInput,
  ReconciliationDetection,
  ReconciliationFileInput,
  ReconciliationPreview,
} from "@openmonetis/validators/reconciliations";
import type { TransactionOutput } from "@openmonetis/validators/transactions";
import type * as reconciliationsRepository from "../repositories/reconciliations.repository";
import type * as transactionsRepository from "../repositories/transactions.repository";
import { badRequest, notFound } from "../utils/errors";
import { importMemoryKeys, type TransactionsService } from "./transactions.service";

export type ReconciliationsServiceDependencies = {
  repository: Pick<
    typeof reconciliationsRepository,
    | "listReconciliationTransactionCandidates"
    | "listReconciliationRecurringRules"
    | "listReconciliationOccurrences"
    | "listReconciliationIgnores"
    | "listImportNameMappings"
  >;
  transactions: Pick<
    TransactionsService,
    "detectTransactionImport" | "readCsvImportLines" | "expandScheduledRecurringRules"
  >;
  listImportCategoryMappingsForUser: typeof transactionsRepository.listImportCategoryMappingsForUser;
  listPaidInvoicePeriodsForUser: typeof transactionsRepository.listPaidInvoicePeriodsForUser;
  findCardByIdForUser: (
    id: string,
    userId: string,
  ) => Promise<{ dueDay: number | string } | null | undefined>;
  listAccountsForUser: (
    userId: string,
  ) => Promise<{ id: string; name: string; isArchived: boolean }[]>;
  listCategoriesForUser: (
    userId: string,
  ) => Promise<{ id: string; name: string; type: "income" | "expense" }[]>;
};

const accountReadMarginDays = 3;
const unboundedStartDate = "1900-01-01";

function shiftDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function periodsBetween(startPeriod: string, endPeriod: string) {
  const periods: string[] = [];
  for (let period = startPeriod; period <= endPeriod; period = addMonthsToPeriod(period, 1)) {
    periods.push(period);
  }
  return periods;
}

function periodEndDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// moneyToCents ignores the sign of its input, so the sign is restored here.
function toSignedCents(value: string | number) {
  const cents = moneyToCents(Math.abs(Number(value)));
  return Number(value) < 0 ? -cents : cents;
}

function signedToDisplay(cents: number) {
  return Math.abs(cents) / 100;
}

function lineTypeOf(cents: number): "income" | "expense" {
  return cents < 0 ? "expense" : "income";
}

function toSuspicionOutput(suspicion: MatchSuspicion) {
  return suspicion.reason === "before-file-start"
    ? {
        reason: suspicion.reason,
        entryDate: suspicion.entryDate,
        fileStartDate: suspicion.fileStartDate,
      }
    : {
        reason: suspicion.reason,
        appAmount: signedToDisplay(suspicion.appCents),
        fileAmount: signedToDisplay(suspicion.fileCents),
      };
}

export function createReconciliationsService(dependencies: ReconciliationsServiceDependencies) {
  const { repository, transactions } = dependencies;

  async function detectReconciliation(
    input: DetectReconciliationInput,
    userId: string,
  ): Promise<ReconciliationDetection> {
    const detection = await transactions.detectTransactionImport(input);
    const accounts = await dependencies.listAccountsForUser(userId);
    return {
      ...detection,
      suggestedAccountId: matchAccountByIdentification(
        detection.accountIdentification,
        accounts.filter((account) => !account.isArchived),
      ),
    };
  }

  async function previewReconciliation(
    input: ReconciliationFileInput,
    userId: string,
  ): Promise<ReconciliationPreview> {
    if (input.targetType === "card" && !input.invoicePeriod) {
      throw badRequest("Cards require invoicePeriod", "RECONCILIATION_INVOICE_PERIOD_REQUIRED");
    }
    const cardPeriod = input.invoicePeriod ?? "";
    const isCard = input.targetType === "card";

    const csv = await transactions.readCsvImportLines(
      {
        fileName: input.fileName,
        contentBase64: input.contentBase64,
        profileId: input.profileId,
        destinationType: input.targetType,
        destinationId: input.targetId,
      },
      userId,
    );

    let lines: ReconciliationLine[] = csv.rows.map((row, index) => ({
      index,
      identity: { sourceFingerprint: csv.sourceFingerprint, externalId: row.externalId ?? "" },
      purchaseDate: row.purchaseDate,
      postedDate: row.postedDate,
      signedCents: row.type === "expense" ? -moneyToCents(row.amount) : moneyToCents(row.amount),
      name: row.name,
      installment: row.installment,
      lineKind: row.lineKind,
      categoryName: row.categoryName,
    }));

    if (isCard) {
      const card = await dependencies.findCardByIdForUser(input.targetId, userId);
      if (!card) throw notFound("Card not found", "CARD_NOT_FOUND");
      lines = reclassifyPreviousInvoicePayments(lines, {
        invoicePeriod: cardPeriod,
        dueDay: Number(card.dueDay),
      });
    }

    const fileDates = lines
      .flatMap((line) => [line.purchaseDate, line.postedDate])
      .filter((date): date is string => Boolean(date))
      .sort();
    const fileRange =
      !isCard && fileDates.length > 0
        ? { start: fileDates[0], end: fileDates[fileDates.length - 1] }
        : null;
    const from = fileRange?.start ?? unboundedStartDate;
    const to = fileRange?.end ?? from;

    const periodsInScope = isCard
      ? [cardPeriod]
      : [...new Set(lines.map((line) => line.purchaseDate.slice(0, 7)))];
    const occurrenceBounds = [
      ...periodsInScope,
      ...(isCard ? [] : [from.slice(0, 7), to.slice(0, 7)]),
    ].sort();
    const occurrencePeriods = periodsBetween(
      addMonthsToPeriod(occurrenceBounds[0] ?? cardPeriod, -1),
      addMonthsToPeriod(occurrenceBounds[occurrenceBounds.length - 1] ?? cardPeriod, 1),
    );

    const isInWindow = ({
      purchaseDate,
      occurrencePeriod,
    }: {
      purchaseDate: string;
      occurrencePeriod: string;
    }) => {
      if (isCard) return periodsInScope.includes(occurrencePeriod);
      return (
        (purchaseDate >= shiftDays(from, -accountReadMarginDays) &&
          purchaseDate <= shiftDays(to, accountReadMarginDays)) ||
        periodsInScope.includes(occurrencePeriod)
      );
    };

    const memoryKeys = [...new Set(lines.flatMap((line) => importMemoryKeys(line.name)))];
    const rules = await repository.listReconciliationRecurringRules({
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    const seriesIds = [...new Set(rules.map((rule) => rule.seriesId))];

    const [
      transactionRows,
      occurrenceRows,
      ignoredExternalIds,
      learnedNames,
      learnedCategories,
      categories,
      paidPeriods,
    ] = await Promise.all([
      repository.listReconciliationTransactionCandidates({
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
        from,
        to,
        periods: periodsInScope,
      }),
      repository.listReconciliationOccurrences({
        userId,
        seriesIds,
        from: `${occurrencePeriods[0] ?? cardPeriod}-01`,
        to: periodEndDate(occurrencePeriods[occurrencePeriods.length - 1] ?? cardPeriod),
      }),
      repository.listReconciliationIgnores(userId, csv.sourceFingerprint, csv.externalIds),
      repository.listImportNameMappings(userId, memoryKeys),
      dependencies.listImportCategoryMappingsForUser(userId, memoryKeys),
      dependencies.listCategoriesForUser(userId),
      isCard
        ? dependencies.listPaidInvoicePeriodsForUser(input.targetId, periodsInScope, userId)
        : Promise.resolve([]),
    ]);
    const paidPeriodSet = new Set(paidPeriods.map((paid) => paid.period));

    const occurrenceStates = new Map(
      occurrenceRows.map((occurrence) => [
        `${occurrence.seriesId}:${occurrence.date}`,
        occurrence,
      ]),
    );
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    const expandedOccurrences = transactions.expandScheduledRecurringRules(
      rules,
      occurrencePeriods,
      isInWindow,
    );

    const entries: ReconciliationEntry[] = [
      ...transactionRows.map(
        (row): ReconciliationEntry => ({
          entryKey: `t:${row.id}`,
          name: row.name,
          date: row.purchaseDate,
          period: row.period,
          signedCents: toSignedCents(row.effectiveAmount),
          installmentCount: row.installmentCount,
          currentInstallment: row.currentInstallment,
          externalId:
            row.importSourceFingerprint === csv.sourceFingerprint ? row.importExternalId : null,
          categoryId: row.categoryId,
          isSettled: Boolean(row.isSettled),
          hasSplits: row.hasSplits,
          isTransfer: row.transferId !== null,
          isGenerated: row.isGenerated,
          inPaidInvoice: row.inPaidInvoice,
          isRecurring: false,
        }),
      ),
      ...expandedOccurrences.flatMap((output: TransactionOutput): ReconciliationEntry[] => {
        const rule = rulesById.get(output.recurringRuleId ?? "");
        if (!rule) return [];
        const state = occurrenceStates.get(`${rule.seriesId}:${output.purchaseDate}`);
        const settledCents =
          state?.isSettled && state.settledAmount !== null
            ? Math.sign(output.amount) * moneyToCents(Math.abs(Number(state.settledAmount)))
            : toSignedCents(output.amount);
        return [
          {
            entryKey: `o:${rule.id}:${output.purchaseDate}`,
            name: output.name,
            date: output.purchaseDate,
            period: output.period,
            signedCents: settledCents,
            installmentCount: null,
            currentInstallment: null,
            externalId:
              state?.importSourceFingerprint === csv.sourceFingerprint
                ? state.importExternalId
                : null,
            categoryId: output.categoryId,
            isSettled: state?.isSettled ?? false,
            hasSplits: rule.hasSplits,
            isTransfer: rule.sourceAccountId !== null && rule.destinationAccountId !== null,
            isGenerated: false,
            inPaidInvoice: isCard && paidPeriodSet.has(output.period),
            isRecurring: true,
          },
        ];
      }),
    ];

    const learnedNameByKey: Record<string, string> = {};
    const learnedCategoryByKey = new Map(
      learnedCategories.map((mapping) => [mapping.descriptionKey, mapping]),
    );
    for (const line of lines) {
      const learnedName = importMemoryKeys(line.name)
        .map((key) => learnedNames[key])
        .find((name) => name !== undefined);
      if (learnedName) learnedNameByKey[getImportedDescriptionKey(line.name)] = learnedName;
    }

    function suggestCategoryId(line: ReconciliationLine) {
      const lineType = lineTypeOf(line.signedCents);
      const learned = importMemoryKeys(line.name)
        .map((key) => learnedCategoryByKey.get(key))
        .find((mapping) => mapping !== undefined);
      if (learned) return learned.categoryType === lineType ? learned.categoryId : null;

      if (!line.categoryName) return null;
      const wanted = line.categoryName.trim().toLowerCase();
      return (
        categories.find(
          (category) =>
            category.type === lineType && category.name.trim().toLowerCase() === wanted,
        )?.id ?? null
      );
    }

    const context: MatchContext = {
      targetType: input.targetType,
      nameMappings: learnedNameByKey,
    };
    const { lines: classifications, appOnlyKeys } = matchReconciliationLines({
      lines,
      entries,
      context,
    });
    const buckets = assignReconciliationBuckets({
      lines,
      classification: classifications,
      entries,
      ignoredExternalIds,
      fileStartDate: fileRange?.start ?? null,
      targetType: input.targetType,
    });

    const entriesByKey = new Map(entries.map((entry) => [entry.entryKey, entry]));
    const scopedAppOnly = new Set(
      filterAppOnlyByScope(
        entries,
        isCard
          ? { targetType: "card", invoicePeriod: cardPeriod }
          : { targetType: "account", from, to },
      ).map((entry) => entry.entryKey),
    );
    const appOnlyScopedKeys = appOnlyKeys.filter((key) => scopedAppOnly.has(key));

    const previewLines = lines.map((line, position) => {
      const outcome = buckets[position];
      const classification = classifications[position];
      const matched = classification.status === "matched" ? classification : null;
      const entry = matched ? entriesByKey.get(matched.entryKey) : undefined;
      const alignment = entry
        ? resolveAmountAlignment({ line, entry, targetType: input.targetType })
        : { kind: "none" as const };

      return {
        index: line.index,
        purchaseDate: line.purchaseDate,
        postedDate: line.postedDate,
        amount: signedToDisplay(line.signedCents),
        type: lineTypeOf(line.signedCents),
        name: line.name,
        installment: line.installment,
        lineKind: line.lineKind,
        bucket: outcome.bucket,
        rule: matched?.rule ?? null,
        entryKey: matched?.entryKey ?? null,
        candidateKeys: classification.status === "ambiguous" ? classification.candidateKeys : [],
        divergence: matched?.divergence
          ? {
              appAmount: signedToDisplay(matched.divergence.appCents),
              fileAmount: signedToDisplay(matched.divergence.fileCents),
            }
          : null,
        alignment: {
          kind: alignment.kind,
          reason: alignment.kind === "kept" ? alignment.reason : null,
        },
        suspicions: outcome.suspicions.map(toSuspicionOutput),
        ignoredReason: outcome.ignoredReason,
        suggestedName: suggestLineName(line, learnedNameByKey),
        suggestedCategoryId: suggestCategoryId(line),
      };
    });

    const countOf = (bucket: (typeof buckets)[number]["bucket"]) =>
      buckets.filter((outcome) => outcome.bucket === bucket).length;

    return {
      fileRange,
      invoicePeriod: isCard ? cardPeriod : null,
      lines: previewLines,
      entries: entries.map((entry) => ({
        entryKey: entry.entryKey,
        name: entry.name,
        date: entry.date,
        period: entry.period,
        amount: signedToDisplay(entry.signedCents),
        type: lineTypeOf(entry.signedCents),
        categoryId: entry.categoryId,
      })),
      appOnlyKeys: appOnlyScopedKeys,
      counts: {
        needsDecision: countOf("needs-decision"),
        matched: countOf("matched"),
        bankOnly: countOf("bank-only"),
        ambiguous: countOf("ambiguous"),
        ignored: countOf("ignored"),
        informational: countOf("informational"),
        appOnly: appOnlyScopedKeys.length,
      },
      classificationDigest: createHash("sha256")
        .update(
          JSON.stringify(
            previewLines.map((line) => [
              line.index,
              line.bucket,
              line.rule,
              line.entryKey,
              line.candidateKeys,
            ]),
          ),
        )
        .digest("hex"),
    };
  }

  return { detectReconciliation, previewReconciliation };
}

export type ReconciliationsService = ReturnType<typeof createReconciliationsService>;
