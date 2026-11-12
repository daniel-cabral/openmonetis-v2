import { z } from "@hono/zod-openapi";
import { cardBrands } from "@openmonetis/domain/cards";
import {
  cardUsageInvoiceStates,
  cardUsageTones,
  cardUsageTrends,
} from "@openmonetis/domain/card-usage-report";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const usageToneSchema = z.enum(cardUsageTones);
const usageTrendSchema = z.enum(cardUsageTrends);

export const ListCardUsageReportQuerySchema = z
  .object({
    period: periodSchema
      .optional()
      .openapi({ param: { name: "period", in: "query" }, example: "2026-11" }),
    cardId: z.uuid().optional().openapi({ param: { name: "cardId", in: "query" } }),
  })
  .openapi("ListCardUsageReportQuery");

const CardUsageSummarySchema = z.object({
  totalLimit: z.number().nonnegative(),
  totalUsed: z.number().nonnegative(),
  totalAvailable: z.number().nonnegative(),
  usagePercentage: z.number().nonnegative(),
  tone: usageToneSchema,
});

const CardUsageCardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.enum(cardBrands),
  logo: z.string().nullable(),
  limit: z.number().nonnegative(),
  usedAmount: z.number().nonnegative(),
  availableAmount: z.number().nonnegative(),
  usagePercentage: z.number().nonnegative(),
  tone: usageToneSchema,
  previousAmount: z.number().nonnegative(),
  changePercentage: z.number(),
  trend: usageTrendSchema,
});

const CardUsageHistoryItemSchema = z.object({
  period: periodSchema,
  usedAmount: z.number().nonnegative(),
  usagePercentage: z.number().nonnegative(),
});

const CardUsageInvoiceItemSchema = z.object({
  period: periodSchema,
  state: z.enum(cardUsageInvoiceStates),
  amount: z.number().nonnegative(),
});

const CardUsageCategorySchema = z.object({
  categoryId: z.uuid().nullable(),
  name: z.string().nullable(),
  icon: z.string().nullable(),
  amount: z.number().nonnegative(),
  percentage: z.number().nonnegative(),
});

const CardUsageTopExpenseSchema = z.object({
  name: z.string(),
  purchaseDate: z.iso.date(),
  categoryName: z.string().nullable(),
  amount: z.number().nonnegative(),
});

const CardUsageDetailSchema = z.object({
  cardId: z.uuid(),
  history: z.array(CardUsageHistoryItemSchema),
  invoices: z.array(CardUsageInvoiceItemSchema),
  categories: z.array(CardUsageCategorySchema),
  topExpenses: z.array(CardUsageTopExpenseSchema),
});

export const CardUsageReportOutputSchema = z
  .object({
    period: periodSchema,
    summary: CardUsageSummarySchema,
    cards: z.array(CardUsageCardSchema),
    selectedCardId: z.uuid().nullable(),
    detail: CardUsageDetailSchema.nullable(),
  })
  .openapi("CardUsageReportOutput");

export type ListCardUsageReportQuery = z.infer<typeof ListCardUsageReportQuerySchema>;
export type CardUsageReportOutput = z.infer<typeof CardUsageReportOutputSchema>;
