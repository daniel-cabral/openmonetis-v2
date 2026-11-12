import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/features/transactions/transactions.presentation";
import { formatUncategorized } from "../card-usage-report.presentation";

type CardUsageDetail = NonNullable<CardUsageReportOutput["detail"]>;

export function CardUsageTopExpenses({ expenses }: { expenses: CardUsageDetail["topExpenses"] }) {
  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader>
        <CardTitle>Maiores gastos</CardTitle>
        <CardDescription>Top 10 do mês</CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length ? (
          <ol className="divide-y">
            {expenses.map((expense, index) => (
              <li
                className="flex items-center justify-between gap-3 py-3"
                // biome-ignore lint/suspicious/noArrayIndexKey: static list ordered by amount, rows may repeat
                key={`${expense.purchaseDate}-${expense.name}-${index}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{expense.name}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {formatDate(expense.purchaseDate)} · {formatUncategorized(expense.categoryName)}
                  </p>
                </div>
                <MoneyValue amount={expense.amount} className="shrink-0 font-medium text-sm" />
              </li>
            ))}
          </ol>
        ) : (
          <div className="grid place-items-center py-10 text-center">
            <p className="font-medium">Nenhum gasto encontrado</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Este cartão não tem gastos neste mês.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
