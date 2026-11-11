import type { TripDetailOutput } from "@openmonetis/validators/trips";
import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TripLinkedEntry = TripDetailOutput["linked"][number];

function formatPurchaseDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function TripLinkedList({ entries }: { entries: readonly TripLinkedEntry[] }) {
  return (
    <Card className="gap-4 p-4 sm:p-6">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">Lançamentos da viagem</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length ? (
          <ul className="divide-y text-sm">
            {entries.map((entry) => (
              <li className="flex items-center justify-between gap-3 py-2" key={entry.id}>
                <div className="min-w-0">
                  <p className="truncate">
                    {entry.name}
                    {entry.currentInstallment !== null && entry.installmentCount !== null
                      ? ` (${entry.currentInstallment}/${entry.installmentCount})`
                      : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatPurchaseDate(entry.purchaseDate)} · {entry.personNames.join(", ")}
                  </p>
                </div>
                <MoneyValue amount={entry.amount} className="shrink-0" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nenhum lançamento vinculado. Use as sugestões ou o campo Viagem no lançamento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
