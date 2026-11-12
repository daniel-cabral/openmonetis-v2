import type { EstablishmentsReportOutput } from "@openmonetis/validators/establishments-report";
import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/features/categories/category-icons";
import { formatPurchaseCount } from "../establishments-report.presentation";

type EstablishmentsTopCategoriesProps = {
  categories: EstablishmentsReportOutput["topCategories"];
};

export function EstablishmentsTopCategories({ categories }: EstablishmentsTopCategoriesProps) {
  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader>
        <CardTitle>Principais categorias</CardTitle>
        <CardDescription>Top 10 por valor gasto</CardDescription>
      </CardHeader>
      <CardContent>
        {categories.length ? (
          <ol className="divide-y">
            {categories.map((category, index) => (
              <li className="flex items-center gap-3 py-3" key={category.categoryId}>
                <span className="w-6 shrink-0 text-center text-muted-foreground text-xs tabular-nums">
                  #{index + 1}
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <CategoryIcon className="size-4" name={category.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{category.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatPurchaseCount(category.count)}
                  </p>
                </div>
                <MoneyValue amount={category.totalAmount} className="shrink-0 font-medium text-sm" />
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
