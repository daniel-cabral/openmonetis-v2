import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import {
  type CategoryTrendsOutput,
  type ListCategoryTrendsQuery,
  ListCategoryTrendsQuerySchema,
} from "@openmonetis/validators/category-trends";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PeriodRangePicker } from "@/components/period-range-picker";
import { Button } from "@/components/ui/button";
import {
  getCategoryLabel,
  sortCategoryOptions,
} from "@/features/categories/categories.presentation";
import { MultiFilterSelect } from "@/features/transactions/components/transaction-multi-filter-select";
import { TripFilterSelect } from "@/features/trips/components/trip-filter-select";
import { tripPeriodRangeQueryOptions } from "@/features/trips/trips.queries";
import { getCategoryTrendsPeriodRange } from "../category-trends.presentation";

type CategoryTrendsFiltersProps = {
  categories: CategoryTrendsOutput["availableCategories"];
  filters: ListCategoryTrendsQuery;
  actions?: ReactNode;
  isFetching: boolean;
  onChange: (filters: ListCategoryTrendsQuery) => void;
};

export function CategoryTrendsFilters({
  actions,
  categories,
  filters,
  isFetching,
  onChange,
}: CategoryTrendsFiltersProps) {
  const queryClient = useQueryClient();
  const currentPeriod = getCurrentPeriodInBrazil();
  const defaultPeriodRange = getCategoryTrendsPeriodRange("end", currentPeriod);
  const hasCustomFilters =
    filters.startPeriod !== defaultPeriodRange.startPeriod ||
    filters.endPeriod !== defaultPeriodRange.endPeriod ||
    filters.categoryIds.length > 0 ||
    filters.trip !== undefined;

  // Picking a trip moves the range to the trip's own months, applied together with the trip.
  async function changeTrip(trip: string | undefined) {
    if (!trip || trip === "none") {
      onChange({ ...filters, trip });
      return;
    }
    const range = await queryClient.fetchQuery(tripPeriodRangeQueryOptions(trip));
    onChange({ ...filters, trip, ...(range ?? {}) });
  }

  // Selecionar uma categoria principal já inclui suas subcategorias: ao marcá-la,
  // as subcategorias redundantes saem da seleção.
  function changeCategories(categoryIds: string[]) {
    const added = categoryIds.filter((id) => !filters.categoryIds.includes(id));
    const parentIds = new Set(
      categories.filter((category) => added.includes(category.categoryId)).map((c) => c.categoryId),
    );
    const normalized = categoryIds.filter((id) => {
      const parentId = categories.find((category) => category.categoryId === id)?.parentId;
      return !(parentId && parentIds.has(parentId));
    });
    onChange({ ...filters, categoryIds: normalized });
  }

  function resetFilters() {
    onChange({ ...defaultPeriodRange, categoryIds: [], trip: undefined });
  }

  return (
    <section
      aria-label="Filtros do relatório"
      className="flex min-w-0 flex-wrap items-center gap-3"
    >
      <PeriodRangePicker
        value={filters}
        onChange={(range) => onChange({ ...filters, ...range })}
        schema={ListCategoryTrendsQuerySchema}
        maxMonths={24}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:ml-auto">
        <TripFilterSelect onChange={changeTrip} value={filters.trip} />
        <MultiFilterSelect
          className="w-full sm:w-64"
          hideLabel
          label="Categorias"
          placeholder="Todas as categorias"
          onChange={changeCategories}
          options={sortCategoryOptions(categories).map((category) => ({
            value: category.categoryId,
            label: getCategoryLabel(category),
            group: category.type === "income" ? "Receitas" : "Despesas",
            categoryIcon: category.icon,
          }))}
          selected={filters.categoryIds}
        />
        {hasCustomFilters ? (
          <Button disabled={isFetching} onClick={resetFilters} type="button" variant="ghost">
            Limpar filtros
          </Button>
        ) : null}
        {actions}
      </div>
    </section>
  );
}
