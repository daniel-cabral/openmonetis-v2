import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { Card, CardContent } from "@/components/ui/card";
import { reconciliationSectionTitles } from "../reconciliations.presentation";

type Counts = ReconciliationPreview["counts"];

export function ReconciliationSummary({ counts }: { counts: Counts }) {
  const tiles = [
    { label: reconciliationSectionTitles["needs-decision"], value: counts.needsDecision },
    { label: reconciliationSectionTitles.matched, value: counts.matched },
    { label: reconciliationSectionTitles["bank-only"], value: counts.bankOnly },
    { label: reconciliationSectionTitles.ambiguous, value: counts.ambiguous },
    { label: reconciliationSectionTitles.ignored, value: counts.ignored },
    { label: reconciliationSectionTitles.informational, value: counts.informational },
  ];

  return (
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
  );
}
