import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";
import { MoneyValue } from "@/components/money-value";
import { Card } from "@/components/ui/card";
import { formatPurchaseCount } from "../establishments-report.presentation";

type Establishment = EstablishmentsReportOutput["establishments"][number];

type EstablishmentsHighlightsProps = {
  establishments: Establishment[];
  summary: EstablishmentsReportOutput["summary"];
};

export function EstablishmentsHighlights({
  establishments,
  summary,
}: EstablishmentsHighlightsProps) {
  return (
    <section aria-label="Destaques" className="grid gap-3 sm:grid-cols-2">
      <HighlightCard
        establishment={findEstablishment(establishments, summary.mostFrequent)}
        label="Mais Frequente"
        name={summary.mostFrequent}
      />
      <HighlightCard
        establishment={findEstablishment(establishments, summary.highestTotal)}
        label="Maior Gasto Total"
        name={summary.highestTotal}
      />
    </section>
  );
}

function findEstablishment(establishments: Establishment[], name: string | null) {
  return name ? establishments.find((establishment) => establishment.name === name) : undefined;
}

function HighlightCard({
  establishment,
  label,
  name,
}: {
  establishment: Establishment | undefined;
  label: string;
  name: string | null;
}) {
  return (
    <Card className="min-w-0 gap-1 px-5 py-4">
      <p className="flex items-center gap-2 font-heading font-medium text-base leading-normal">
        {label}
      </p>
      {name ? (
        <>
          <p className="min-w-0 truncate py-1 font-medium text-sm leading-snug">{name}</p>
          {establishment ? (
            <>
              <MoneyValue amount={establishment.totalAmount} className="font-semibold text-xl" />
              <span className="text-muted-foreground text-xs">
                {formatPurchaseCount(establishment.count)} · média{" "}
                <MoneyValue amount={establishment.averageAmount} className="text-xs" />
              </span>
            </>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Nenhum estabelecimento no período.</p>
      )}
    </Card>
  );
}
