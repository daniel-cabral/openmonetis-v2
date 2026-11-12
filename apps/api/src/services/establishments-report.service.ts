import {
  calculateEstablishmentsReport,
  type EstablishmentPurchaseEntry,
  type EstablishmentRecurringRule,
  resolveEstablishmentsWindow,
} from "@openmonetis/domain/establishments-report";
import { fromCents } from "@openmonetis/domain/money";
import { getPeriodEndDate } from "@openmonetis/domain/transactions";
import { parseTripFilter, type TripFilter } from "@openmonetis/domain/trips";
import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import type {
  EstablishmentsReportOutput,
  ListEstablishmentsReportQuery,
} from "@openmonetis/validators/establishments-report";

export type EstablishmentsReportRepository = {
  listPurchaseEntriesForUser(
    userId: string,
    startPeriod: string,
    endPeriod: string,
  ): Promise<EstablishmentPurchaseEntry[]>;
  listRecurringRulesForUser(userId: string, periodEnd: Date): Promise<EstablishmentRecurringRule[]>;
};

export type EstablishmentsReportTripPort = {
  findTripForUser(userId: string, tripId: string): Promise<{ id: string; name: string } | null>;
  getTripPeriodRange(
    userId: string,
    tripId: string,
  ): Promise<{ startPeriod: string; endPeriod: string } | null>;
};

export function createEstablishmentsReportService(
  repository: EstablishmentsReportRepository,
  trips: EstablishmentsReportTripPort,
) {
  return {
    async list(
      userId: string,
      query: ListEstablishmentsReportQuery,
    ): Promise<EstablishmentsReportOutput> {
      const period = query.period ?? getCurrentPeriodInBrazil();
      const monthWindow = resolveEstablishmentsWindow(period, query.months);
      const requestedFilter = parseTripFilter(query.trip);
      const trip =
        requestedFilter.mode === "trip"
          ? await trips.findTripForUser(userId, requestedFilter.tripId)
          : null;
      const tripFilter: TripFilter =
        requestedFilter.mode === "trip" && trip === null ? { mode: "all" } : requestedFilter;
      const tripRange =
        tripFilter.mode === "trip"
          ? await trips.getTripPeriodRange(userId, tripFilter.tripId)
          : null;
      const window = tripRange ?? monthWindow;
      const [entries, recurringRules] = await Promise.all([
        repository.listPurchaseEntriesForUser(userId, window.startPeriod, window.endPeriod),
        repository.listRecurringRulesForUser(userId, getPeriodEndDate(window.endPeriod)),
      ]);
      const report = calculateEstablishmentsReport({
        window,
        tripFilter,
        entries,
        recurringRules,
      });

      return {
        window: report.window,
        months: query.months,
        tripFilter:
          tripFilter.mode === "trip" && trip
            ? { mode: "trip", tripId: trip.id, tripName: trip.name }
            : { mode: tripFilter.mode },
        summary: {
          establishmentCount: report.summary.establishmentCount,
          transactionCount: report.summary.transactionCount,
          totalAmount: fromCents(report.summary.totalCents),
          averageAmount: fromCents(report.summary.averageCents),
          mostFrequent: report.summary.mostFrequent,
          highestTotal: report.summary.highestTotal,
        },
        establishments: report.establishments.map((item) => ({
          name: item.name,
          count: item.count,
          totalAmount: fromCents(item.totalCents),
          averageAmount: fromCents(item.averageCents),
          categories: item.categories,
        })),
        topCategories: report.topCategories.map((category) => ({
          categoryId: category.categoryId,
          name: category.name,
          icon: category.icon,
          totalAmount: fromCents(category.totalCents),
          count: category.count,
        })),
      };
    },
  };
}

export type EstablishmentsReportService = ReturnType<typeof createEstablishmentsReportService>;
