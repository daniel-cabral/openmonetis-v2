import { MoneyValue } from "@/components/money-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type TripBreakdownItem = { label: string; amount: number };

export function TripBreakdownCard({
  title,
  items,
  showShare = false,
}: {
  title: string;
  items: readonly TripBreakdownItem[];
  showShare?: boolean;
}) {
  const total = items.reduce((sum, item) => sum + Math.max(item.amount, 0), 0);

  return (
    <Card className="gap-4 p-6">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length ? (
          <ul className="grid gap-3 text-sm">
            {items.map((item) => (
              <li className="grid gap-1.5" key={item.label}>
                <div className="flex justify-between gap-3">
                  <span className="truncate">{item.label}</span>
                  <MoneyValue amount={item.amount} className="shrink-0" />
                </div>
                {showShare ? <Progress value={total ? (item.amount / total) * 100 : 0} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nada por aqui ainda.</p>
        )}
      </CardContent>
    </Card>
  );
}
