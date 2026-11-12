import {
  type CardUsageCard,
  type CardUsageEntry,
  type CardUsageRecurringRule,
  calculateCardUsageDetail,
  calculateCardUsageOverview,
  cardUsageHistoryMonths,
  resolveCardUsageInvoiceState,
} from "@openmonetis/domain/card-usage-report";
import type { CardInvoiceStatus } from "@openmonetis/domain/cards";
import { fromCents } from "@openmonetis/domain/money";
import { addMonthsToPeriod, getPeriodEndDate } from "@openmonetis/domain/transactions";
import { getCurrentDateInBrazil, getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import type {
  CardUsageReportOutput,
  ListCardUsageReportQuery,
} from "@openmonetis/validators/card-usage-report";

export type CardUsageReportRepository = {
  listActiveCardsForUser(userId: string): Promise<CardUsageCard[]>;
  listCardEntriesForUser(
    userId: string,
    startPeriod: string,
    endPeriod: string,
  ): Promise<CardUsageEntry[]>;
  listCardRecurringRulesForUser(userId: string, periodEnd: Date): Promise<CardUsageRecurringRule[]>;
};

export type CardUsageInvoicePort = {
  listInvoiceTimeline(
    id: string,
    userId: string,
    periods: string[],
  ): Promise<
    Array<{ period: string; status: CardInvoiceStatus; amount: number; hasRecord: boolean }>
  >;
};

export function createCardUsageReportService(
  repository: CardUsageReportRepository,
  invoices: CardUsageInvoicePort,
  getToday: () => string = getCurrentDateInBrazil,
) {
  return {
    async get(userId: string, query: ListCardUsageReportQuery): Promise<CardUsageReportOutput> {
      const period = query.period ?? getCurrentPeriodInBrazil();
      const startPeriod = addMonthsToPeriod(period, -(cardUsageHistoryMonths - 1));
      const [cards, entries, recurringRules] = await Promise.all([
        repository.listActiveCardsForUser(userId),
        repository.listCardEntriesForUser(userId, startPeriod, period),
        repository.listCardRecurringRulesForUser(userId, getPeriodEndDate(period)),
      ]);
      const overview = calculateCardUsageOverview({
        period,
        today: getToday(),
        cards,
        entries,
        recurringRules,
        requestedCardId: query.cardId,
      });
      const selectedCard = cards.find((card) => card.id === overview.selectedCardId);
      const detail = selectedCard
        ? calculateCardUsageDetail({
            period,
            card: selectedCard,
            countedRows: overview.countedRows,
          })
        : null;
      const invoiceTimeline = detail
        ? await invoices.listInvoiceTimeline(
            detail.cardId,
            userId,
            detail.history.map((item) => item.period),
          )
        : [];

      return {
        period,
        summary: {
          totalLimit: fromCents(overview.summary.totalLimitCents),
          totalUsed: fromCents(overview.summary.totalUsedCents),
          totalAvailable: fromCents(overview.summary.totalAvailableCents),
          usagePercentage: overview.summary.usagePercentage,
          tone: overview.summary.tone,
        },
        cards: overview.cards.map((card) => ({
          id: card.id,
          name: card.name,
          brand: card.brand,
          logo: card.logo,
          limit: fromCents(card.limitCents),
          usedAmount: fromCents(card.usedCents),
          availableAmount: fromCents(card.availableCents),
          usagePercentage: card.usagePercentage,
          tone: card.tone,
          previousAmount: fromCents(card.previousUsedCents),
          changePercentage: card.changePercentage,
          trend: card.trend,
        })),
        selectedCardId: overview.selectedCardId,
        detail: detail && {
          cardId: detail.cardId,
          history: detail.history.map((item) => ({
            period: item.period,
            usedAmount: fromCents(item.usedCents),
            usagePercentage: item.usagePercentage,
          })),
          invoices: invoiceTimeline.map((item) => ({
            period: item.period,
            state: resolveCardUsageInvoiceState(item),
            amount: item.amount,
          })),
          categories: detail.categories.map((category) => ({
            categoryId: category.categoryId,
            name: category.name,
            icon: category.icon,
            amount: fromCents(category.amountCents),
            percentage: category.percentage,
          })),
          topExpenses: detail.topExpenses.map((expense) => ({
            name: expense.name,
            purchaseDate: expense.purchaseDate,
            categoryName: expense.categoryName,
            amount: fromCents(expense.amountCents),
          })),
        },
      };
    },
  };
}

export type CardUsageReportService = ReturnType<typeof createCardUsageReportService>;
