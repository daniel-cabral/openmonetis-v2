import { expandCategoryIds } from "@openmonetis/domain/categories";
import {
  type CategoryTrendActualEntry,
  type CategoryTrendCategory,
  type CategoryTrendRecurringRule,
  calculateCategoryTrends,
} from "@openmonetis/domain/category-trends";
import { addMonthsToPeriod, getPeriodEndDate } from "@openmonetis/domain/transactions";
import { parseTripFilter, type TripFilter } from "@openmonetis/domain/trips";
import type {
  CategoryTrendsOutput,
  ListCategoryTrendsQuery,
} from "@openmonetis/validators/category-trends";

export type CategoryTrendsRepository = {
  listCategoriesForUser(userId: string): Promise<CategoryTrendCategory[]>;
  listActualEntriesForUser(
    userId: string,
    startPeriod: string,
    endPeriod: string,
    categoryIds: readonly string[],
    personScope?: string,
  ): Promise<CategoryTrendActualEntry[]>;
  listRecurringRulesForUser(
    userId: string,
    periodEnd: Date,
    categoryIds: readonly string[],
    personScope?: string,
  ): Promise<CategoryTrendRecurringRule[]>;
};

export type CategoryTrendsTripPort = {
  findTripForUser(userId: string, tripId: string): Promise<{ id: string } | null>;
};

export function createCategoryTrendsService(
  repository: CategoryTrendsRepository,
  trips?: CategoryTrendsTripPort,
) {
  return {
    async list(userId: string, query: ListCategoryTrendsQuery): Promise<CategoryTrendsOutput> {
      const lookbackPeriod = addMonthsToPeriod(query.startPeriod, -1);
      const periodEnd = getPeriodEndDate(query.endPeriod);
      const requestedFilter = parseTripFilter(query.trip);
      const trip =
        requestedFilter.mode === "trip" && trips
          ? await trips.findTripForUser(userId, requestedFilter.tripId)
          : null;
      const tripFilter: TripFilter =
        requestedFilter.mode === "trip" && trip === null ? { mode: "all" } : requestedFilter;
      const categories = await repository.listCategoriesForUser(userId);
      const categoryIds = expandCategoryIds(
        categories.map((category) => ({ id: category.categoryId, parentId: category.parentId })),
        query.categoryIds,
      );
      const [actualEntries, recurringRules] = await Promise.all([
        repository.listActualEntriesForUser(
          userId,
          lookbackPeriod,
          query.endPeriod,
          categoryIds,
          query.personScope ?? "admin",
        ),
        repository.listRecurringRulesForUser(
          userId,
          periodEnd,
          categoryIds,
          query.personScope ?? "admin",
        ),
      ]);

      return calculateCategoryTrends({
        startPeriod: query.startPeriod,
        endPeriod: query.endPeriod,
        categoryIds: query.categoryIds,
        categories,
        actualEntries,
        recurringRules,
        tripFilter,
      });
    },
  };
}

export type CategoryTrendsService = ReturnType<typeof createCategoryTrendsService>;
