import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryIcon } from "@/features/categories/category-icons";
import { formatUncategorized } from "../card-usage-report.presentation";

type CardUsageDetail = NonNullable<CardUsageReportOutput["detail"]>;

export function CardUsageCategories({ categories }: { categories: CardUsageDetail["categories"] }) {
  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader>
        <CardTitle>Categorias</CardTitle>
        <CardDescription>Top 10 do mês</CardDescription>
      </CardHeader>
      <CardContent>
        {categories.length ? (
          <ol className="grid gap-4">
            {categories.map((category) => (
              <li className="grid gap-2" key={category.categoryId ?? "uncategorized"}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <CategoryIcon className="size-4" name={category.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {formatUncategorized(category.name)}
                  </span>
                  <span className="shrink-0 text-right">
                    <MoneyValue amount={category.amount} className="block font-medium text-sm" />
                    <span className="block text-muted-foreground text-xs tabular-nums">
                      {category.percentage.toLocaleString("pt-BR")}%
                    </span>
                  </span>
                </div>
                <Progress
                  aria-label={`${category.percentage}% do uso do mês`}
                  className="h-1.5"
                  indicatorClassName="bg-brand"
                  value={Math.min(100, category.percentage)}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="grid place-items-center py-10 text-center">
            <p className="font-medium">Nenhuma categoria encontrada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
