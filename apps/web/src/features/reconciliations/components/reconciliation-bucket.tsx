import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ReconciliationBucket({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 border py-0" size="sm">
      <CardHeader className="border-b py-4">
        <CardTitle>
          {title} ({count})
        </CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="divide-y px-4">
        {count === 0 ? <p className="py-4 text-muted-foreground text-sm">Nada aqui.</p> : children}
      </CardContent>
    </Card>
  );
}
