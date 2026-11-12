import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { Button } from "@/components/ui/button";
import { applyBlockReason, hasApplicableDecision, type UiDecisions } from "./reconciliation-review";

type Preview = ReconciliationPreview;

export function ReconciliationApplyBar({
  preview,
  decisions,
  isApplying,
  onApply,
}: {
  preview: Preview;
  decisions: UiDecisions;
  isApplying: boolean;
  onApply: () => void;
}) {
  const actions = Object.values(decisions).map((decision) => decision.action);
  const creates = actions.filter((action) => action === "create").length;
  const reconciled = actions.filter((action) => action === "keep" || action === "link").length;
  const ignored = actions.filter((action) => action === "ignore").length;
  const suspiciousKept = preview.lines.filter(
    (line) => line.bucket === "needs-decision" && decisions[line.index]?.action === "keep",
  ).length;
  const alignedKept = preview.lines.filter(
    (line) => decisions[line.index]?.action === "keep" && line.alignment.kind === "align",
  ).length;
  const blockReason = applyBlockReason(decisions);
  const canApply = !isApplying && blockReason === null && hasApplicableDecision(decisions, preview);

  return (
    <div className="sticky bottom-0 z-20 flex flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-1 text-sm">
        <p className="font-medium">
          {creates} criados · {reconciled} conciliados · {ignored} ignorados
        </p>
        <p className="text-muted-foreground text-xs">
          {suspiciousKept} casamento(s) suspeito(s) mantido(s) · {alignedKept} valor(es) alinhado(s)
        </p>
        {blockReason ? (
          <p className="text-destructive text-xs" role="status">
            {blockReason}
          </p>
        ) : null}
      </div>
      <Button disabled={!canApply} onClick={onApply} type="button">
        {isApplying ? "Aplicando…" : "Aplicar"}
      </Button>
    </div>
  );
}
