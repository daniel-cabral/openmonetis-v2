import { z } from "@hono/zod-openapi";
import { transactionTypes } from "@openmonetis/domain/transactions";
import {
  parseTripLinkTarget,
  tripNameMaxLength,
  tripNoteMaxLength,
} from "@openmonetis/domain/trips";

const dateSchema = z.iso.date();
const tripIdSchema = z.uuid();
const tripNameSchema = z.string().trim().min(1).max(tripNameMaxLength);
const tripNoteSchema = z
  .string()
  .trim()
  .max(tripNoteMaxLength)
  .nullish()
  .transform((note) => note || null);

const TripFieldsSchema = z.object({
  name: tripNameSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  note: tripNoteSchema,
});

const endNotBeforeStart = (input: { startDate: string; endDate: string }, ctx: z.RefinementCtx) => {
  if (input.endDate < input.startDate) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "End date must not be before start date",
      input: input.endDate,
    });
  }
};

export const CreateTripInputSchema =
  TripFieldsSchema.superRefine(endNotBeforeStart).openapi("CreateTripInput");
export const UpdateTripInputSchema =
  TripFieldsSchema.superRefine(endNotBeforeStart).openapi("UpdateTripInput");
export const TripParamsSchema = z.object({
  id: tripIdSchema.openapi({ param: { name: "id", in: "path" } }),
});
export const TripLinkIdsInputSchema = z
  .object({
    ids: z
      .array(
        z.string().refine((id) => parseTripLinkTarget(id) !== null, "Invalid trip link target"),
      )
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate link targets are not allowed"),
  })
  .strict()
  .openapi("TripLinkIdsInput");
export const TripSuggestionOriginSchema = z.union([
  z.enum(["all", "cards", "accounts"]),
  z.string().regex(/^(card|account):[0-9a-f-]{36}$/i, "Invalid origin"),
]);
export const TripSuggestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  origin: TripSuggestionOriginSchema.default("all"),
});

const breakdownSchema = z.object({ label: z.string(), amount: z.number() });
const TripOutputFieldsSchema = z.object({
  id: tripIdSchema,
  name: z.string(),
  startDate: dateSchema,
  endDate: dateSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const TripOutputSchema = TripOutputFieldsSchema.openapi("TripOutput");
export const TripListItemOutputSchema = TripOutputFieldsSchema.extend({
  linkedCount: z.number().int().nonnegative(),
  netCost: z.number(),
}).openapi("TripListItemOutput");
export const TripSummaryOutputSchema = z
  .object({
    netCost: z.number(),
    expenses: z.number(),
    reimbursements: z.number(),
    byCategory: z.array(breakdownSchema),
    bySource: z.array(breakdownSchema),
    byPerson: z.array(breakdownSchema),
  })
  .openapi("TripSummaryOutput");
export const TripLinkedEntryOutputSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    purchaseDate: dateSchema,
    type: z.enum(transactionTypes),
    amount: z.number(),
    currentInstallment: z.number().int().nullable(),
    installmentCount: z.number().int().nullable(),
    isRecurring: z.boolean(),
    personNames: z.array(z.string()),
  })
  .openapi("TripLinkedEntryOutput");
export const TripDetailOutputSchema = z
  .object({
    trip: TripOutputSchema,
    summary: TripSummaryOutputSchema,
    linked: z.array(TripLinkedEntryOutputSchema),
  })
  .openapi("TripDetailOutput");
export const TripSuggestionOutputSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    purchaseDate: dateSchema,
    amount: z.number(),
    type: z.enum(transactionTypes),
    isRecurring: z.boolean(),
    cardId: z.string().nullable(),
    cardName: z.string().nullable(),
    accountId: z.string().nullable(),
    accountName: z.string().nullable(),
    categoryName: z.string().nullable(),
    currentInstallment: z.number().int().nullable(),
    installmentCount: z.number().int().nullable(),
  })
  .openapi("TripSuggestionOutput");
export const TripSuggestionsPageOutputSchema = z
  .object({
    items: z.array(TripSuggestionOutputSchema),
    page: z.number().int().positive(),
    pageCount: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    originOptions: z.array(z.object({ value: z.string(), label: z.string() })),
    filteredIds: z.array(z.string()),
  })
  .openapi("TripSuggestionsPageOutput");
export const TripLinkIdsOutputSchema = z
  .object({ ids: z.array(z.string()) })
  .openapi("TripLinkIdsOutput");
export const TripPeriodRangeOutputSchema = z
  .object({
    startPeriod: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/),
    endPeriod: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/),
  })
  .openapi("TripPeriodRange");

export type TripPeriodRangeOutput = z.infer<typeof TripPeriodRangeOutputSchema>;
export type CreateTripInput = z.infer<typeof CreateTripInputSchema>;
export type UpdateTripInput = z.infer<typeof UpdateTripInputSchema>;
export type TripLinkIdsInput = z.infer<typeof TripLinkIdsInputSchema>;
export type TripSuggestionsQuery = z.infer<typeof TripSuggestionsQuerySchema>;
export type TripOutput = z.infer<typeof TripOutputSchema>;
export type TripListItemOutput = z.infer<typeof TripListItemOutputSchema>;
export type TripDetailOutput = z.infer<typeof TripDetailOutputSchema>;
export type TripSuggestionsPageOutput = z.infer<typeof TripSuggestionsPageOutputSchema>;
