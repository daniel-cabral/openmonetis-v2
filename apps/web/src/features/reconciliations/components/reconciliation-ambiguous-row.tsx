import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { Input } from "@/components/ui/input";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowCategorySelect } from "@/features/transactions/components/transaction-import-category-select";
import { TextOption } from "@/features/transactions/components/transaction-import-options";
import { candidateOptions, type UiLineDecision } from "./reconciliation-review";
import {
  formatLineMeta,
  ReconciliationEntryItem,
  type ReconciliationRowProps,
} from "./reconciliation-row-fields";

type UiAction = UiLineDecision["action"];

const entryValuePrefix = "entry:";

const ambiguousActionOptions: { value: UiAction; label: string }[] = [
  { value: "create", label: "Criar lançamento" },
  { value: "ignore", label: "Ignorar" },
  { value: "skip", label: "Pular" },
];

const candidatePlaceholder = "Escolher candidato…";

// A skipped ambiguous line is still undecided, so it shows the placeholder rather than "Pular".
function selectValueOf(decision: UiLineDecision) {
  if (decision.action === "skip") return "";
  if (decision.action === "keep" && decision.entryKey) {
    return `${entryValuePrefix}${decision.entryKey}`;
  }
  return decision.action;
}

export function ReconciliationAmbiguousRow({
  line,
  decision,
  preview,
  consumed,
  categories,
  onChange,
}: ReconciliationRowProps) {
  const candidates = candidateOptions(line, preview, consumed);
  const chosen =
    decision.action === "keep"
      ? candidates.find((option) => option.entryKey === decision.entryKey)
      : undefined;
  const actionLabel =
    decision.action === "skip"
      ? undefined
      : ambiguousActionOptions.find((option) => option.value === decision.action)?.label;
  const triggerLabel = chosen ? (
    <TextOption label={chosen.name} />
  ) : (
    <span>{actionLabel ?? candidatePlaceholder}</span>
  );

  return (
    <div className="grid gap-2 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{line.name}</p>
        <p className="text-muted-foreground text-xs">{formatLineMeta(line)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          onValueChange={(next) => {
            const value = next as string;
            if (value.startsWith(entryValuePrefix)) {
              onChange({ action: "keep", entryKey: value.slice(entryValuePrefix.length) });
              return;
            }
            onChange({ action: value as UiAction });
          }}
          value={selectValueOf(decision)}
        >
          <SelectTrigger aria-label={`Decisão para ${line.name}`} className="h-8 w-full sm:w-64">
            <SelectValue>{triggerLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {candidates.map((option) => (
              <ReconciliationEntryItem
                key={option.entryKey}
                option={option}
                value={`${entryValuePrefix}${option.entryKey}`}
              />
            ))}
            {ambiguousActionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {decision.action === "create" ? (
          <RowCategorySelect
            categories={categories.filter((category) => category.type === line.type)}
            disabled={false}
            onChange={(categoryId) => onChange({ categoryId })}
            value={decision.categoryId ?? ""}
          />
        ) : null}
        {decision.action === "ignore" ? (
          <Input
            aria-label={`Motivo para ignorar ${line.name}`}
            className="h-8 w-full sm:w-64"
            onChange={(event) => onChange({ ignoreReason: event.target.value })}
            placeholder="Motivo…"
            value={decision.ignoreReason}
          />
        ) : null}
      </div>
    </div>
  );
}
