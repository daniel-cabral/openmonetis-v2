import { useQuery } from "@tanstack/react-query";
import { ChartLine, RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { MoneyValue } from "@/components/money-value";
import { usePrivacyMode } from "@/components/privacy-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryLabel } from "@/features/categories/categories.presentation";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import { DashboardWidgetEmptyState } from "@/features/dashboard/components/dashboard-widget-empty-state";
import { formatDashboardPeriod } from "@/features/dashboard/dashboard.presentation";
import { cn } from "@/lib/utils";
import {
  buildCategoryHistorySeries,
  categoryHistoryMaxSelection,
  categoryHistoryWindow,
} from "../category-trends.presentation";
import { categoryTrendsQueryOptions } from "../category-trends.queries";
import { useCategoryHistorySelection } from "../useCategoryHistorySelection";
import { CategoryHistoryPicker } from "./category-history-picker";

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function CategoryHistoryWidget({ period }: { period: string }) {
  const { selectedIds, add, remove, clear, prune } = useCategoryHistorySelection();
  const query = useQuery(
    categoryTrendsQueryOptions({
      ...categoryHistoryWindow(period),
      categoryIds: selectedIds,
      personScope: "admin",
    }),
  );
  const availableCategories = query.data?.availableCategories;

  // Drops selected ids whose category no longer exists, once the category list is known.
  useEffect(() => {
    if (availableCategories) {
      prune(availableCategories.map((category) => category.categoryId));
    }
  }, [availableCategories, prune]);

  const labelById = new Map(
    (availableCategories ?? []).map((category) => [
      category.categoryId,
      getCategoryLabel(category),
    ]),
  );
  const chartConfig = Object.fromEntries(
    selectedIds.map((categoryId, index) => [
      categoryId,
      { label: labelById.get(categoryId) ?? "Categoria", color: chartColors[index] },
    ]),
  ) satisfies ChartConfig;
  const isFull = selectedIds.length >= categoryHistoryMaxSelection;
  const isSeriesLoading = query.isLoading || query.isPlaceholderData;

  return (
    <DashboardWidget
      description="Comparação mês a mês de até 5 categorias"
      icon={<ChartLine aria-hidden="true" />}
      title="Histórico de categorias"
    >
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {selectedIds.map((categoryId, index) => (
          <Badge className="h-6 max-w-full gap-1.5 pr-0.5" key={categoryId} variant="outline">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: chartColors[index] }}
            />
            <span className="max-w-40 truncate">{labelById.get(categoryId) ?? "Categoria"}</span>
            <Button
              aria-label={`Remover ${labelById.get(categoryId) ?? "categoria"}`}
              className="size-5"
              onClick={() => remove(categoryId)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </Badge>
        ))}
        <CategoryHistoryPicker
          availableCategories={availableCategories ?? []}
          onSelect={add}
          selectedIds={selectedIds}
        />
        {selectedIds.length > 0 ? (
          <Button onClick={clear} size="sm" type="button" variant="ghost">
            Limpar
          </Button>
        ) : null}
        {isFull ? (
          <span className="text-muted-foreground text-xs">
            Remova uma categoria para adicionar outra.
          </span>
        ) : null}
      </div>

      {query.isError ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <p className="font-medium text-sm">Não foi possível carregar o histórico</p>
            <Button
              className="mt-3"
              onClick={() => void query.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" /> Tentar novamente
            </Button>
          </div>
        </div>
      ) : null}
      {!query.isError && selectedIds.length === 0 ? (
        <DashboardWidgetEmptyState
          description="Selecione até 5 categorias para comparar mês a mês."
          icon={<ChartLine aria-hidden="true" />}
          title="Escolha categorias para ver o histórico"
        />
      ) : null}
      {!query.isError && selectedIds.length > 0 && isSeriesLoading ? <HistoryLoading /> : null}
      {!query.isError && selectedIds.length > 0 && !isSeriesLoading && query.data ? (
        <CategoryHistoryChart
          chartConfig={chartConfig}
          data={buildCategoryHistorySeries(query.data, selectedIds)}
          selectedIds={selectedIds}
        />
      ) : null}
    </DashboardWidget>
  );
}

function CategoryHistoryChart({
  chartConfig,
  data,
  selectedIds,
}: {
  chartConfig: ChartConfig;
  data: Record<string, number | string>[];
  selectedIds: readonly string[];
}) {
  const { isPrivacyModeEnabled } = usePrivacyMode();

  return (
    <div className="flex flex-1 flex-col justify-center">
      <ChartContainer
        aria-label="Histórico mensal das categorias selecionadas"
        className={cn(
          "h-64 w-full transition-[filter]",
          isPrivacyModeEnabled && "pointer-events-none blur-sm select-none",
        )}
        config={chartConfig}
      >
        <LineChart accessibilityLayer data={data} margin={{ left: 2, right: 2, top: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="period"
            minTickGap={16}
            tickFormatter={(value) => formatDashboardPeriod(String(value), true)}
            tickLine={false}
            tickMargin={8}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatDashboardPeriod(String(value))}
                formatter={(value, name) => (
                  <div className="flex min-w-44 items-center justify-between gap-5">
                    <span className="truncate text-muted-foreground">
                      {chartConfig[String(name)]?.label}
                    </span>
                    <MoneyValue amount={Number(value)} className="font-medium" />
                  </div>
                )}
              />
            }
            cursor={false}
          />
          {selectedIds.map((categoryId) => (
            <Line
              activeDot={{ r: 4 }}
              dataKey={categoryId}
              dot={{ r: 2.5 }}
              key={categoryId}
              stroke={`var(--color-${categoryId})`}
              strokeWidth={2}
              type="linear"
            />
          ))}
        </LineChart>
      </ChartContainer>
      {isPrivacyModeEnabled ? (
        <span className="sr-only">Gráfico oculto pelo modo privacidade.</span>
      ) : null}
    </div>
  );
}

function HistoryLoading() {
  return (
    <div
      aria-label="Carregando histórico de categorias"
      className="grid flex-1 gap-4"
      role="status"
    >
      <Skeleton className="h-64 w-full" />
      <Skeleton className="mx-auto h-4 w-48" />
    </div>
  );
}
