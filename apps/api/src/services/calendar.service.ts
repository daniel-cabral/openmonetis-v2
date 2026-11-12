import { buildCalendarMonth, type CalendarMonth } from "@openmonetis/domain/calendar";
import {
  getCurrentDateInBrazil,
  getCurrentPeriodInBrazil,
  getPeriodEndDateString,
} from "@openmonetis/shared/date-time";
import type { CardOutput } from "@openmonetis/validators/cards";
import {
  type ListTransactionsQuery,
  ListTransactionsQuerySchema,
  type TransactionOutput,
} from "@openmonetis/validators/transactions";

export type CalendarServiceDeps = {
  listTransactions(userId: string, query: ListTransactionsQuery): Promise<TransactionOutput[]>;
  listCards(userId: string, period: string): Promise<CardOutput[]>;
  findAdminPersonId(userId: string): Promise<string | null>;
};

export function createCalendarService(deps: CalendarServiceDeps) {
  return {
    async getMonth(userId: string, period = getCurrentPeriodInBrazil()): Promise<CalendarMonth> {
      const [purchaseItems, boletoItems, cards, adminPersonId] = await Promise.all([
        deps.listTransactions(
          userId,
          ListTransactionsQuerySchema.parse({
            dateStart: `${period}-01`,
            dateEnd: getPeriodEndDateString(period),
            pageSize: 100,
          }),
        ),
        deps.listTransactions(
          userId,
          ListTransactionsQuerySchema.parse({
            period,
            payables: "true",
            paymentMethod: "boleto",
            pageSize: 100,
          }),
        ),
        deps.listCards(userId, period),
        deps.findAdminPersonId(userId),
      ]);

      return buildCalendarMonth({
        period,
        today: getCurrentDateInBrazil(),
        adminPersonId,
        purchaseItems,
        boletoItems,
        cards,
      });
    },
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;
