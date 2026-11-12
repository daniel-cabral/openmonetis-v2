import { z } from "@hono/zod-openapi";
import {
  DetectTransactionImportInputSchema,
  TransactionImportDetectionSchema,
} from "./transactions";

const dateSchema = z.iso.date();
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const amountSchema = z.number().nonnegative().max(999_999_999.99);
const countSchema = z.number().int().nonnegative();
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const reconciliationTargetTypeSchema = z.enum(["account", "card"]);
const transactionTypeSchema = z.enum(["income", "expense"]);
const lineKindSchema = z.enum(["purchase", "credit", "invoice-payment"]);
const matchRuleSchema = z.enum(["identity", "installment", "exact", "cents", "name-period"]);
const bucketSchema = z.enum([
  "needs-decision",
  "matched",
  "bank-only",
  "ambiguous",
  "ignored",
  "informational",
]);

const ReconciliationFileShape = {
  ...DetectTransactionImportInputSchema.shape,
  profileId: z.string().trim().min(1).max(64),
  targetType: reconciliationTargetTypeSchema,
  targetId: z.uuid(),
  invoicePeriod: periodSchema.optional(),
};

export const ReconciliationFileBaseSchema = z.object(ReconciliationFileShape);

function requireInvoicePeriodForCard(
  data: { targetType: "account" | "card"; invoicePeriod?: string | undefined },
  ctx: z.RefinementCtx,
) {
  if (data.targetType === "card" && !data.invoicePeriod) {
    ctx.addIssue({
      code: "custom",
      path: ["invoicePeriod"],
      message: "Cards require invoicePeriod",
    });
  }
}

export const DetectReconciliationInputSchema = z
  .object(DetectTransactionImportInputSchema.shape)
  .openapi("DetectReconciliationInput");

export const ReconciliationDetectionSchema = TransactionImportDetectionSchema.extend({
  suggestedAccountId: z.uuid().nullable(),
}).openapi("ReconciliationDetection");

export const ReconciliationFileInputSchema = ReconciliationFileBaseSchema.superRefine(
  requireInvoicePeriodForCard,
).openapi("ReconciliationFileInput");

const ReconciliationAlignmentSchema = z.object({
  kind: z.enum(["none", "align", "kept"]),
  reason: z.enum(["splits", "transfer", "generated", "paid-invoice", "card-recurring"]).nullable(),
});

const ReconciliationSuspicionSchema = z.object({
  reason: z.enum(["before-file-start", "amount-divergence"]),
  entryDate: dateSchema.optional(),
  fileStartDate: dateSchema.optional(),
  appAmount: amountSchema.optional(),
  fileAmount: amountSchema.optional(),
});

const ReconciliationPreviewLineSchema = z.object({
  index: countSchema,
  purchaseDate: dateSchema,
  postedDate: dateSchema.nullable(),
  amount: amountSchema,
  type: transactionTypeSchema,
  name: z.string(),
  installment: z
    .object({ current: z.number().int().positive(), total: z.number().int().positive() })
    .nullable(),
  lineKind: lineKindSchema.nullable(),
  bucket: bucketSchema,
  rule: matchRuleSchema.nullable(),
  entryKey: z.string().max(80).nullable(),
  candidateKeys: z.array(z.string().max(80)),
  divergence: z.object({ appAmount: amountSchema, fileAmount: amountSchema }).nullable(),
  alignment: ReconciliationAlignmentSchema,
  suspicions: z.array(ReconciliationSuspicionSchema),
  ignoredReason: z.string().nullable(),
  suggestedName: z.string(),
  suggestedCategoryId: z.uuid().nullable(),
});

const ReconciliationPreviewEntrySchema = z.object({
  entryKey: z.string().max(80),
  name: z.string(),
  date: dateSchema,
  period: periodSchema,
  amount: amountSchema,
  type: transactionTypeSchema,
  categoryId: z.uuid().nullable(),
});

export const ReconciliationPreviewSchema = z
  .object({
    fileRange: z.object({ start: dateSchema, end: dateSchema }).nullable(),
    invoicePeriod: periodSchema.nullable(),
    lines: z.array(ReconciliationPreviewLineSchema),
    entries: z.array(ReconciliationPreviewEntrySchema),
    appOnlyKeys: z.array(z.string().max(80)),
    counts: z.object({
      needsDecision: countSchema,
      matched: countSchema,
      bankOnly: countSchema,
      ambiguous: countSchema,
      ignored: countSchema,
      informational: countSchema,
      appOnly: countSchema,
    }),
    classificationDigest: sha256HexSchema,
  })
  .openapi("ReconciliationPreview");

export const ReconciliationLineDecisionSchema = z
  .object({
    lineIndex: countSchema,
    action: z.enum(["keep", "create", "link", "ignore", "skip"]),
    entryKey: z.string().max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    categoryId: z.uuid().nullable().optional(),
    personId: z.uuid().optional(),
    ignoreReason: z.string().trim().min(1).max(160).optional(),
  })
  .superRefine((decision, ctx) => {
    if (decision.action === "create" && !decision.name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Create requires name" });
    }
    if (decision.action === "create" && !decision.personId) {
      ctx.addIssue({ code: "custom", path: ["personId"], message: "Create requires personId" });
    }
    if (decision.action === "link" && !decision.entryKey) {
      ctx.addIssue({ code: "custom", path: ["entryKey"], message: "Link requires entryKey" });
    }
    if (decision.action === "ignore" && !decision.ignoreReason) {
      ctx.addIssue({
        code: "custom",
        path: ["ignoreReason"],
        message: "Ignore requires ignoreReason",
      });
    }
  });

export const ReconciliationLineDecisionsSchema = z
  .array(ReconciliationLineDecisionSchema)
  .superRefine((decisions, ctx) => {
    const seen = new Set<number>();
    for (const [position, decision] of decisions.entries()) {
      if (seen.has(decision.lineIndex)) {
        ctx.addIssue({
          code: "custom",
          path: [position, "lineIndex"],
          message: "Each lineIndex must appear once",
        });
      }
      seen.add(decision.lineIndex);
    }
  });

export const ApplyReconciliationInputSchema = ReconciliationFileBaseSchema.extend({
  classificationDigest: sha256HexSchema,
  decisions: ReconciliationLineDecisionsSchema,
})
  .superRefine(requireInvoicePeriodForCard)
  .openapi("ApplyReconciliationInput");

export const ReconciliationApplyResultSchema = z
  .object({
    batchId: z.uuid(),
    created: countSchema,
    reconciled: countSchema,
    ignored: countSchema,
    skipped: countSchema,
  })
  .openapi("ReconciliationApplyResult");

export const ReconciliationBatchParamsSchema = z.object({
  batchId: z.uuid().openapi({ param: { name: "batchId", in: "path" } }),
});

export type DetectReconciliationInput = z.infer<typeof DetectReconciliationInputSchema>;
export type ReconciliationDetection = z.infer<typeof ReconciliationDetectionSchema>;
export type ReconciliationFileInput = z.infer<typeof ReconciliationFileInputSchema>;
export type ReconciliationPreview = z.infer<typeof ReconciliationPreviewSchema>;
export type ReconciliationLineDecision = z.infer<typeof ReconciliationLineDecisionSchema>;
export type ApplyReconciliationInput = z.infer<typeof ApplyReconciliationInputSchema>;
export type ReconciliationApplyResult = z.infer<typeof ReconciliationApplyResultSchema>;
export type ReconciliationBatchParams = z.infer<typeof ReconciliationBatchParamsSchema>;
