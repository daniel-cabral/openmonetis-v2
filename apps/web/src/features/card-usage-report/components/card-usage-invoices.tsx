import type { CardUsageInvoiceState } from "@openmonetis/domain/card-usage-report";
import type { CardUsageReportOutput } from "@openmonetis/validators/card-usage-report";
import { MoneyValue } from "@/components/money-value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCardHistoryPeriod } from "@/features/cards/cards.presentation";
import { cardUsageInvoiceStateLabel } from "../card-usage-report.presentation";

type CardUsageDetail = NonNullable<CardUsageReportOutput["detail"]>;

const invoiceBadgeClassName: Record<CardUsageInvoiceState, string> = {
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  overdue: "bg-destructive/10 text-destructive",
  none: "bg-muted text-muted-foreground",
};

export function CardUsageInvoices({ invoices }: { invoices: CardUsageDetail["invoices"] }) {
  return (
    <Card className="min-w-0 gap-4 py-6">
      <CardHeader>
        <CardTitle>Faturas</CardTitle>
        <CardDescription>Situação das faturas nos últimos 12 meses</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {invoices.map((invoice) => (
            <li className="flex items-center justify-between gap-3 py-2.5" key={invoice.period}>
              <span className="min-w-0 truncate text-sm capitalize">
                {formatCardHistoryPeriod(invoice.period)}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {invoice.state !== "none" ? (
                  <MoneyValue amount={invoice.amount} className="text-sm" />
                ) : null}
                <Badge className={invoiceBadgeClassName[invoice.state]} variant="secondary">
                  {cardUsageInvoiceStateLabel[invoice.state]}
                </Badge>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
