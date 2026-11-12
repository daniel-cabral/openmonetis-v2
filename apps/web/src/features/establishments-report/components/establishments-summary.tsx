import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";
import { MoneyValue } from "@/components/money-value";
import { Card } from "@/components/ui/card";

type EstablishmentsSummaryProps = {
  summary: EstablishmentsReportOutput["summary"];
};

export function EstablishmentsSummary({ summary }: EstablishmentsSummaryProps) {
  return (
    <section aria-label="Resumo do período" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Locais diferentes">
        <span className="font-medium text-xl leading-tight tabular-nums">
          {summary.establishmentCount.toLocaleString("pt-BR")}
        </span>
      </SummaryCard>
      <SummaryCard label="Compras no período">
        <span className="font-medium text-xl leading-tight tabular-nums">
          {summary.transactionCount.toLocaleString("pt-BR")}
        </span>
      </SummaryCard>
      <SummaryCard label="Soma de todas as compras">
        <MoneyValue amount={summary.totalAmount} className="font-medium text-xl leading-tight" />
      </SummaryCard>
      <SummaryCard label="Média por transação">
        <MoneyValue amount={summary.averageAmount} className="font-medium text-xl leading-tight" />
      </SummaryCard>
    </section>
  );
}

function SummaryCard({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Card className="min-w-0 gap-1 px-5 py-4">
      <p className="font-mono text-muted-foreground text-xs">{label}</p>
      {children}
    </Card>
  );
}
