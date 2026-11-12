import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatInvoiceClosureSummary,
  formatStatementClosureSummary,
  reconciliationSectionTitles,
} from "../reconciliations.presentation";
import type { ClosureView } from "./reconciliation-review";

type Counts = ReconciliationPreview["counts"];

function ClosurePanel({ closure }: { closure: ClosureView }) {
  if (closure.kind === "invoice") {
    const summary = formatInvoiceClosureSummary(closure.closure);
    return (
      <ClosureText badge={summary.badge} text={summary.text} tone={summary.tone} />
    );
  }
  const summary = formatStatementClosureSummary(closure);
  return (
    <div className="grid gap-2">
      <ClosureText badge={summary.badge} text={summary.text} tone={summary.tone} />
      {summary.divergences.map((divergence) => (
        <p className="text-destructive text-xs" key={divergence}>
          {divergence}
        </p>
      ))}
      {summary.unverified ? (
        <p className="text-muted-foreground text-xs">{summary.unverified}</p>
      ) : null}
    </div>
  );
}

function ClosureText({
  badge,
  text,
  tone,
}: {
  badge: string;
  text: string;
  tone: "success" | "destructive";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge
        className={tone === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}
        variant="outline"
      >
        {badge}
      </Badge>
      <p>{text}</p>
    </div>
  );
}

export function ReconciliationSummary({
  counts,
  closure,
}: {
  counts: Counts;
  closure: ClosureView | null;
}) {
  const tiles = [
    { label: reconciliationSectionTitles["needs-decision"], value: counts.needsDecision },
    { label: reconciliationSectionTitles.matched, value: counts.matched },
    { label: reconciliationSectionTitles["bank-only"], value: counts.bankOnly },
    { label: reconciliationSectionTitles.ambiguous, value: counts.ambiguous },
    { label: reconciliationSectionTitles.ignored, value: counts.ignored },
    { label: reconciliationSectionTitles.informational, value: counts.informational },
  ];

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <Card className="border" key={tile.label} size="sm">
            <CardContent>
              <p className="text-muted-foreground text-xs">{tile.label}</p>
              <p className="font-semibold text-2xl tabular-nums">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {closure ? <div className="border-t pt-3"><ClosurePanel closure={closure} /></div> : null}
    </div>
  );
}
