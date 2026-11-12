import { z } from "@hono/zod-openapi";

const periodSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const establishmentsReportMonthsSchema = z.union([z.literal(3), z.literal(6), z.literal(12)]);
const tripFilterParamSchema = z.union([z.literal("none"), z.uuid()]);

export const ListEstablishmentsReportQuerySchema = z
  .object({
    period: periodSchema.optional(),
    months: z.coerce.number().pipe(establishmentsReportMonthsSchema).default(6),
    trip: tripFilterParamSchema.optional(),
  })
  .openapi("ListEstablishmentsReportQuery");

const EstablishmentsReportWindowSchema = z.object({
  startPeriod: periodSchema,
  endPeriod: periodSchema,
});

const EstablishmentsReportTripFilterSchema = z.object({
  mode: z.enum(["all", "none", "trip"]),
  tripId: z.uuid().optional(),
  tripName: z.string().optional(),
});

const EstablishmentsReportSummarySchema = z.object({
  establishmentCount: z.number().int().nonnegative(),
  transactionCount: z.number().int().nonnegative(),
  totalAmount: z.number(),
  averageAmount: z.number(),
  mostFrequent: z.string().nullable(),
  highestTotal: z.string().nullable(),
});

const EstablishmentCategoryOutputSchema = z.object({
  categoryId: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  count: z.number().int().nonnegative(),
});

const EstablishmentOutputSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  totalAmount: z.number(),
  averageAmount: z.number(),
  categories: z.array(EstablishmentCategoryOutputSchema),
});

const EstablishmentTopCategoryOutputSchema = z.object({
  categoryId: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  totalAmount: z.number(),
  count: z.number().int().nonnegative(),
});

export const EstablishmentsReportOutputSchema = z
  .object({
    window: EstablishmentsReportWindowSchema,
    months: establishmentsReportMonthsSchema,
    tripFilter: EstablishmentsReportTripFilterSchema,
    summary: EstablishmentsReportSummarySchema,
    establishments: z.array(EstablishmentOutputSchema),
    topCategories: z.array(EstablishmentTopCategoryOutputSchema),
  })
  .openapi("EstablishmentsReportOutput");

export type ListEstablishmentsReportQuery = z.infer<typeof ListEstablishmentsReportQuerySchema>;
export type EstablishmentsReportOutput = z.infer<typeof EstablishmentsReportOutputSchema>;
