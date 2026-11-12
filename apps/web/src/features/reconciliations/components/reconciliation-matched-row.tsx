import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { useState } from "react";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/money-presentation";
import {
  formatKeptAmountReason,
  formatMatchRule,
  formatSuspicionReason,
  reconciliationAlignmentNote,
} from "../reconciliations.presentation";
import { linkOptions, type UiLineDecision } from "./reconciliation-review";
import {
  formatShortDate,
  formatSignedAmount,
  ReconciliationEntrySelect,
  type ReconciliationRowProps,
} from "./reconciliation-row-fields";

type UiAction = UiLineDecision["action"];
type PreviewLine = ReconciliationPreview["lines"][number];

const matchedActionOptions: { value: UiAction; label: string }[] = [
  { value: "keep", label: "Manter casamento" },
  { value: "create", label: "Criar lançamento novo" },
  { value: "link", label: "Vincular a outro lançamento" },
  { value: "skip", label: "Pular" },
];

function alignmentNoteOf(alignment: PreviewLine["alignment"]): string | null {
  if (alignment.kind === "align") return reconciliationAlignmentNote;
  if (alignment.kind === "kept" && alignment.reason) {
    return formatKeptAmountReason(alignment.reason);
  }
  return null;
}

export function ReconciliationMatchedRow({
  line,
  decision,
  preview,
  consumed,
  onChange,
}: ReconciliationRowProps) {
  const [revealed, setRevealed] = useState(false);
  const isSuspicious = line.bucket === "needs-decision";
  const entryName = preview.entries.find((entry) => entry.entryKey === line.entryKey)?.name;
  const alignmentNote = line.divergence ? alignmentNoteOf(line.alignment) : null;
  const showDecision = isSuspicious || revealed;

  return (
    <div className="grid gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-sm">{line.name}</p>
            {isSuspicious ? <Badge variant="destructive">Suspeito</Badge> : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {[
              formatShortDate(line.purchaseDate),
              formatSignedAmount(line.amount, line.type),
              line.rule ? `casada por ${formatMatchRule(line.rule)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {line.divergence ? (
            <p className="text-muted-foreground text-xs">
              app {formatCurrency(line.divergence.appAmount)} → arquivo{" "}
              {formatCurrency(line.divergence.fileAmount)}
            </p>
          ) : null}
          {alignmentNote ? <p className="text-muted-foreground text-xs">{alignmentNote}</p> : null}
          {isSuspicious
            ? line.suspicions.map((suspicion) => (
                <p className="text-destructive text-xs" key={suspicion.reason}>
                  {formatSuspicionReason(suspicion, entryName ?? line.name)}
                </p>
              ))
            : null}
        </div>
        {isSuspicious ? null : (
          <Button
            onClick={() => setRevealed((open) => !open)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Desfazer casamento
          </Button>
        )}
      </div>
      {showDecision ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            onValueChange={(next) => onChange({ action: next as UiAction })}
            value={decision.action}
          >
            <SelectTrigger aria-label={`Decisão para ${line.name}`} className="h-8 w-full sm:w-64">
              <SelectValue>
                {matchedActionOptions.find((option) => option.value === decision.action)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {matchedActionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {decision.action === "link" ? (
            <ReconciliationEntrySelect
              label={`Lançamento para ${line.name}`}
              onChange={(entryKey) => onChange({ entryKey })}
              options={linkOptions(line, preview, consumed)}
              value={decision.entryKey ?? ""}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
