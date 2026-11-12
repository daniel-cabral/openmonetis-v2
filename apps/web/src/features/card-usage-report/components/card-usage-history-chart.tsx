import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis } from "recharts";
import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCardHistoryPeriod } from "@/features/cards/cards.presentation";

type CardUsageDetail = NonNullable<CardUsageReportOutput["detail"]>;
type HistoryItem = CardUsageDetail["history"][number];

const chartConfig = {
  usedAmount: { label: "Uso no mês", color: "var(--brand)" },
} satisfies ChartConfig;

type CardUsageHistoryChartProps = {
  cardId: string;
  cardName: string;
  history: HistoryItem[];
  limit: number;
  period: string;
};

export function CardUsageHistoryChart({
  cardId,
  cardName,
  history,
  limit,
  period,
}: CardUsageHistoryChartProps) {
  const firstPeriod = history[0]?.period;
  const lastPeriod = history.at(-1)?.period;

  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">{cardName}: últimos 12 meses</CardTitle>
          <CardDescription>
            Uso do limite de {firstPeriod ? formatCardHistoryPeriod(firstPeriod) : "–"} a{" "}
            {lastPeriod ? formatCardHistoryPeriod(lastPeriod) : "–"}
          </CardDescription>
        </div>
        <Link
          className="rounded-sm font-medium text-brand-strong text-sm hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          params={{ cardId }}
          search={{ period }}
          to="/cards/$cardId"
        >
          Ver cartão
        </Link>
      </CardHeader>
      <CardContent>
        <ChartContainer
          aria-label={`Uso mensal do limite do cartão ${cardName} nos últimos doze meses`}
          className="h-52 w-full sm:h-60"
          config={chartConfig}
        >
          <BarChart accessibilityLayer data={history} margin={{ left: 8, right: 8, top: 12 }}>
            <CartesianGrid vertical={false} />
            <ReferenceLine stroke="var(--destructive)" strokeDasharray="4 4" y={limit} />
            <XAxis
              axisLine={false}
              dataKey="period"
              height={40}
              interval={0}
              tickFormatter={(value: string) => value.slice(5)}
              tickLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, entry) => {
                    const item = (entry as { payload?: HistoryItem }).payload;
                    return (
                      <div className="flex min-w-44 items-center justify-between gap-5">
                        <span className="text-muted-foreground">
                          {item?.usagePercentage.toLocaleString("pt-BR")}% do limite
                        </span>
                        <MoneyValue amount={Number(value)} className="font-medium" />
                      </div>
                    );
                  }}
                  labelFormatter={(value) => formatCardHistoryPeriod(String(value))}
                />
              }
              cursor={{ fill: "var(--muted)", opacity: 0.35 }}
            />
            <Bar
              dataKey="usedAmount"
              fill="var(--color-usedAmount)"
              maxBarSize={38}
              minPointSize={2}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <p className="mt-3 text-muted-foreground text-xs">
          Linha tracejada: limite do cartão de <MoneyValue amount={limit} />.
        </p>
      </CardContent>
    </Card>
  );
}
