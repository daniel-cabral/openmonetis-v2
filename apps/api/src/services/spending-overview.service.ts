import { fromCents } from "@openmonetis/domain/money";
import { calculateSpendingOverview } from "@openmonetis/domain/spending-overview";
import { getPeriodEndDate } from "@openmonetis/domain/transactions";
import type {
  SpendingOverviewOutput,
  SpendingOverviewQuery,
} from "@openmonetis/validators/spending-overview";
import type { EstablishmentsReportRepository } from "./establishments-report.service";

export type SpendingOverviewRepository = Pick<
  EstablishmentsReportRepository,
  "listPurchaseEntriesForUser" | "listRecurringRulesForUser"
>;

export function createSpendingOverviewService(repository: SpendingOverviewRepository) {
  return {
    async getSpendingOverview(
      userId: string,
      query: SpendingOverviewQuery,
    ): Promise<SpendingOverviewOutput> {
      const { period } = query;
      const [entries, recurringRules] = await Promise.all([
        repository.listPurchaseEntriesForUser(userId, period, period),
        repository.listRecurringRulesForUser(userId, getPeriodEndDate(period)),
      ]);
      const overview = calculateSpendingOverview({ period, entries, recurringRules });

      return {
        period,
        topExpenses: overview.topExpenses.map((expense) => ({
          key: expense.key,
          name: expense.name,
          purchaseDate: expense.purchaseDate,
          amount: fromCents(expense.amountCents),
          categoryIcon: expense.categoryIcon,
        })),
        topEstablishments: overview.topEstablishments.map((establishment) => ({
          name: establishment.name,
          count: establishment.count,
          total: fromCents(establishment.totalCents),
          categoryIcon: establishment.categoryIcon,
        })),
      };
    },
  };
}

export type SpendingOverviewService = ReturnType<typeof createSpendingOverviewService>;
