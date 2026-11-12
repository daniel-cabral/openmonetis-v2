import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { Image } from "@unpic/react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getCardBrandAsset } from "@/features/cards/card-brand-assets";
import { cn } from "@/lib/utils";
import {
  cardUsageToneClassName,
  formatCardUsageTrend,
} from "../card-usage-report.presentation";

type CardUsageListProps = {
  cards: CardUsageReportOutput["cards"];
  onSelect: (cardId: string) => void;
  selectedCardId: string | null;
};

const trendIcon = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
} as const;

export function CardUsageList({ cards, onSelect, selectedCardId }: CardUsageListProps) {
  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader>
        <CardTitle>Cartões</CardTitle>
        <CardDescription>Ordenados pelo uso no mês</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {cards.map((card) => {
            const tone = cardUsageToneClassName[card.tone];
            const trend = formatCardUsageTrend(card.trend, card.changePercentage);
            const TrendIcon = trendIcon[card.trend];
            const brandSrc = card.logo ?? getCardBrandAsset(card.brand);

            return (
              <li key={card.id}>
                <button
                  aria-pressed={card.id === selectedCardId}
                  className="grid w-full min-w-0 gap-3 rounded-lg border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-muted"
                  onClick={() => onSelect(card.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {brandSrc ? (
                      <Image
                        alt={`Bandeira ${card.brand}`}
                        className="h-5 w-8 shrink-0 rounded-sm object-contain"
                        height={20}
                        layout="fixed"
                        src={brandSrc}
                        width={32}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">{card.name}</span>
                      <span className="block text-muted-foreground text-xs">
                        <MoneyValue amount={card.usedAmount} /> de{" "}
                        <MoneyValue amount={card.limit} />
                      </span>
                    </span>
                    <span
                      className={cn("shrink-0 font-medium text-sm tabular-nums", tone.text)}
                    >
                      {card.usagePercentage.toLocaleString("pt-BR")}%
                    </span>
                  </span>
                  <Progress
                    aria-label={`${card.usagePercentage}% do limite usado`}
                    indicatorClassName={tone.bar}
                    value={Math.min(100, card.usagePercentage)}
                  />
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <TrendIcon
                      aria-label={`${trend.label} de ${trend.value} em relação ao mês anterior`}
                      className="size-3.5"
                      role="img"
                    />
                    {trend.value}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
