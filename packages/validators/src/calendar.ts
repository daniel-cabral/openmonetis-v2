import { z } from "@hono/zod-openapi";
import { cardBrands } from "@openmonetis/domain/cards";
import { paymentMethods } from "@openmonetis/domain/transactions";

const periodSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);

export const CalendarQuerySchema = z
  .object({
    period: periodSchema.optional().openapi({
      param: { name: "period", in: "query" },
      example: "2026-07",
    }),
  })
  .openapi("CalendarQuery");

const calendarEventBaseSchema = z.object({
  id: z.string(),
  date: z.iso.date(),
  transactionId: z.uuid().nullable(),
  name: z.string(),
  type: z.enum(["income", "expense"]),
  amount: z.number().nonnegative(),
  categoryName: z.string().nullable(),
  categoryIcon: z.string().nullable(),
  paymentMethod: z.enum(paymentMethods).nullable(),
  cardName: z.string().nullable(),
  isSettled: z.boolean(),
  dueDate: z.iso.date().nullable(),
});

const CalendarTransactionEventSchema = calendarEventBaseSchema
  .extend({ kind: z.literal("transaction") })
  .openapi("CalendarTransactionEvent");

const CalendarInstallmentEventSchema = calendarEventBaseSchema
  .extend({
    kind: z.literal("installment"),
    currentInstallment: z.number().int().positive(),
    installmentCount: z.number().int().positive(),
  })
  .openapi("CalendarInstallmentEvent");

const CalendarBoletoEventSchema = calendarEventBaseSchema
  .extend({
    kind: z.literal("boleto"),
    isOverdue: z.boolean(),
  })
  .openapi("CalendarBoletoEvent");

const CalendarInvoiceEventSchema = z
  .object({
    id: z.string(),
    kind: z.literal("invoice"),
    date: z.iso.date(),
    cardId: z.uuid(),
    cardName: z.string(),
    cardLogo: z.string().nullable(),
    cardBrand: z.enum(cardBrands),
    amount: z.number().nonnegative(),
    state: z.enum(["paid", "overdue", "pending"]),
    paidAt: z.iso.date().nullable(),
  })
  .openapi("CalendarInvoiceEvent");

export const CalendarEventSchema = z
  .discriminatedUnion("kind", [
    CalendarTransactionEventSchema,
    CalendarInstallmentEventSchema,
    CalendarBoletoEventSchema,
    CalendarInvoiceEventSchema,
  ])
  .openapi("CalendarEvent");

export const CalendarDaySchema = z
  .object({
    date: z.iso.date(),
    inMonth: z.boolean(),
    isToday: z.boolean(),
    totals: z.object({
      income: z.number().nonnegative(),
      expense: z.number().nonnegative(),
    }),
    events: z.array(CalendarEventSchema),
  })
  .openapi("CalendarDay");

export const CalendarOutputSchema = z
  .object({
    period: periodSchema,
    days: z.array(CalendarDaySchema).length(42),
  })
  .openapi("CalendarOutput");

export type CalendarOutput = z.infer<typeof CalendarOutputSchema>;
