import { useQuery } from "@tanstack/react-query";
import { MoneyValue } from "@/components/money-value";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryTrendsQueryOptions } from "@/features/category-trends/category-trends.queries";

const NO_SUBCATEGORY = "none";
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type SubcategoryBreakdownProps = {
  categoryId: string;
  period: string;
  personScope: string;
  activeSubcategory?: string;
  onSelect: (subcategory: string | undefined) => void;
};

export function SubcategoryBreakdown({
  categoryId,
  period,
  personScope,
  activeSubcategory,
  onSelect,
}: SubcategoryBreakdownProps) {
  const trendsQuery = useQuery({
    ...categoryTrendsQueryOptions({
      categoryIds: [categoryId],
      endPeriod: period,
      startPeriod: period,
      personScope,
    }),
    placeholderData: undefined,
  });
  const rows = trendsQuery.data?.categories.find(
    (item) => item.categoryId === categoryId,
  )?.subcategoryBreakdown;

  return (
    <section className="grid gap-3 p-5 sm:p-6">
      <h3 className="font-mono text-current/70 text-xs">Por subcategoria</h3>
      {trendsQuery.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full bg-current/20 before:via-current/20" />
          ))}
        </div>
      ) : trendsQuery.isError ? (
        <p className="text-sm">Indisponível</p>
      ) : !rows?.length ? (
        <p className="text-current/70 text-sm">Sem lançamentos no período.</p>
      ) : (
        <ul className="grid gap-1">
          {rows.map((row) => {
            const value = row.categoryId ?? NO_SUBCATEGORY;
            const isActive = activeSubcategory === value;

            return (
              <li key={value}>
                <button
                  aria-pressed={isActive}
                  className="grid w-full gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-current/30 aria-pressed:bg-current/15"
                  onClick={() => onSelect(isActive ? undefined : value)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{row.name ?? "Sem subcategoria"}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <MoneyValue amount={row.amount} />
                      <span className="w-14 text-right font-mono text-current/70 text-xs">
                        {percentFormatter.format(row.percentage)}%
                      </span>
                    </span>
                  </span>
                  <Progress aria-hidden="true" value={row.percentage} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
