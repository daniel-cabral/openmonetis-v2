import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";
import { MoneyValue } from "@/components/money-value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EstablishmentLogo } from "@/features/establishments/components/establishment-logo";
import { formatPurchaseCount } from "../establishments-report.presentation";

type EstablishmentsListProps = {
  establishments: EstablishmentsReportOutput["establishments"];
};

export function EstablishmentsList({ establishments }: EstablishmentsListProps) {
  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader>
        <CardTitle>Estabelecimentos</CardTitle>
        <CardDescription>Ordenados por frequência de compras</CardDescription>
      </CardHeader>
      <CardContent>
        {establishments.length ? (
          <ol className="divide-y">
            {establishments.map((establishment, index) => (
              <li className="flex items-center gap-3 py-3" key={establishment.name}>
                <span className="w-6 shrink-0 text-center text-muted-foreground text-xs tabular-nums">
                  #{index + 1}
                </span>
                <EstablishmentLogo
                  categoryIcon={establishment.categories[0]?.icon ?? null}
                  editable={false}
                  name={establishment.name}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{establishment.name}</p>
                  {establishment.categories.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {establishment.categories.map((category) => (
                        <Badge key={category.categoryId} variant="secondary">
                          {category.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <MoneyValue amount={establishment.totalAmount} className="font-medium text-sm" />
                  <p className="text-muted-foreground text-xs">
                    {formatPurchaseCount(establishment.count)} · média{" "}
                    <MoneyValue amount={establishment.averageAmount} className="text-xs" />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="grid place-items-center py-10 text-center">
            <p className="font-medium">Nenhum estabelecimento encontrado</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Quando houver compras registradas, elas aparecerão aqui.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
