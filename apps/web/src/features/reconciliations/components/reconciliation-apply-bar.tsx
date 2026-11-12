import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatPaidAfterEndItem,
  formatPaidAfterEndSummary,
  formatProjectionBadge,
  formatProjectionLine,
} from "../reconciliations.presentation";
import {
  applyBlockReason,
  hasApplicableDecision,
  type ProjectionView,
  type UiDecisions,
} from "./reconciliation-review";

type Preview = ReconciliationPreview;

function ProjectionLine({ projection }: { projection: ProjectionView }) {
  const badge = projection.comparison ? formatProjectionBadge(projection.comparison) : null;
  const paidAfterEnd = projection.kind === "account" ? projection.paidAfterEnd : [];
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {badge ? (
          <Badge
            className={badge.tone === "success" ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}
            variant="outline"
          >
            {badge.label}
          </Badge>
        ) : null}
        <span className="text-muted-foreground">{formatProjectionLine(projection)}</span>
      </div>
      {paidAfterEnd.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {formatPaidAfterEndSummary(paidAfterEnd.length)}
          </span>
          <Popover>
            <PopoverTrigger className="font-medium text-brand-strong underline underline-offset-2">
              ver
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              <ul className="grid gap-2">
                {paidAfterEnd.map((item) => {
                  const row = formatPaidAfterEndItem(item);
                  return (
                    <li className="flex justify-between gap-3 text-sm" key={item.entryKey}>
                      <span className="truncate">{row.label}</span>
                      <span className="tabular-nums">{row.amount}</span>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}

export function ReconciliationApplyBar({
  preview,
  decisions,
  isApplying,
  onApply,
  projection,
}: {
  preview: Preview;
  decisions: UiDecisions;
  isApplying: boolean;
  onApply: () => void;
  projection: ProjectionView | null;
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
        {projection ? <ProjectionLine projection={projection} /> : null}
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
