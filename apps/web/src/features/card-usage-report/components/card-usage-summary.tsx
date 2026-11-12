import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { MoneyValue } from "@/components/money-value";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { cardUsageToneClassName } from "../card-usage-report.presentation";

type CardUsageSummaryProps = {
  summary: CardUsageReportOutput["summary"];
};

export function CardUsageSummary({ summary }: CardUsageSummaryProps) {
  const tone = cardUsageToneClassName[summary.tone];

  return (
    <Card className="min-w-0 gap-4 px-5 py-4">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryItem label="Limite total">
          <MoneyValue amount={summary.totalLimit} className="font-medium text-xl leading-tight" />
        </SummaryItem>
        <SummaryItem label="Usado">
          <MoneyValue amount={summary.totalUsed} className="font-medium text-xl leading-tight" />
        </SummaryItem>
        <SummaryItem label="Disponível">
          <MoneyValue
            amount={summary.totalAvailable}
            className="font-medium text-xl leading-tight"
          />
        </SummaryItem>
        <SummaryItem label="Utilização">
          <span className={cn("font-medium text-xl leading-tight tabular-nums", tone.text)}>
            {summary.usagePercentage.toLocaleString("pt-BR")}%
          </span>
        </SummaryItem>
      </dl>
      <Progress
        aria-label={`${summary.usagePercentage}% do limite total usado`}
        indicatorClassName={tone.bar}
        value={Math.min(100, summary.usagePercentage)}
      />
    </Card>
  );
}

function SummaryItem({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-muted-foreground text-xs">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}
