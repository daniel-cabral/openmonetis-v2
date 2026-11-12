import { z } from "@hono/zod-openapi";

const periodSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);

export const SpendingOverviewQuerySchema = z
  .object({
    period: periodSchema,
  })
  .openapi("SpendingOverviewQuery");

const SpendingOverviewExpenseOutputSchema = z.object({
  key: z.string(),
  name: z.string(),
  purchaseDate: z.iso.date(),
  amount: z.number(),
  categoryIcon: z.string().nullable(),
});

const SpendingOverviewEstablishmentOutputSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  total: z.number(),
  categoryIcon: z.string().nullable(),
});

export const SpendingOverviewOutputSchema = z
  .object({
    period: periodSchema,
    topExpenses: z.array(SpendingOverviewExpenseOutputSchema),
    topEstablishments: z.array(SpendingOverviewEstablishmentOutputSchema),
  })
  .openapi("SpendingOverview");

export type SpendingOverviewQuery = z.infer<typeof SpendingOverviewQuerySchema>;
export type SpendingOverviewOutput = z.infer<typeof SpendingOverviewOutputSchema>;
