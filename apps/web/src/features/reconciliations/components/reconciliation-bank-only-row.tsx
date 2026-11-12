import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { Input } from "@/components/ui/input";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowCategorySelect } from "@/features/transactions/components/transaction-import-category-select";
import { RowSelect as RowPersonSelect } from "@/features/transactions/components/transaction-import-person-select";
import { linkOptions, type UiLineDecision } from "./reconciliation-review";
import {
  ReconciliationEntrySelect,
  type ReconciliationRowProps,
  formatLineMeta,
} from "./reconciliation-row-fields";

type UiAction = UiLineDecision["action"];

const bankOnlyActionOptions: { value: UiAction; label: string }[] = [
  { value: "create", label: "Criar lançamento" },
  { value: "link", label: "Vincular a outro lançamento" },
  { value: "ignore", label: "Ignorar" },
  { value: "skip", label: "Pular" },
];

export function ReconciliationBankOnlyRow({
  line,
  decision,
  preview,
  consumed,
  categories,
  people,
  onChange,
}: ReconciliationRowProps) {
  return (
    <div className="grid gap-2 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{line.name}</p>
        <p className="text-muted-foreground text-xs">{formatLineMeta(line)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          onValueChange={(next) => onChange({ action: next as UiAction })}
          value={decision.action}
        >
          <SelectTrigger aria-label={`Decisão para ${line.name}`} className="h-8 w-full sm:w-64">
            <SelectValue>
              {bankOnlyActionOptions.find((option) => option.value === decision.action)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {bankOnlyActionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {decision.action === "create" ? (
          <>
            <Input
              aria-label={`Nome do lançamento de ${line.name}`}
              className="h-8 w-full sm:w-56"
              onChange={(event) => onChange({ name: event.target.value })}
              value={decision.name}
            />
            <RowCategorySelect
              categories={categories.filter((category) => category.type === line.type)}
              disabled={false}
              onChange={(categoryId) => onChange({ categoryId })}
              value={decision.categoryId ?? ""}
            />
            <RowPersonSelect
              disabled={false}
              onChange={(personId) => onChange({ personId })}
              people={people}
              value={decision.personId ?? ""}
            />
          </>
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
        {decision.action === "link" ? (
          <ReconciliationEntrySelect
            label={`Lançamento para ${line.name}`}
            onChange={(entryKey) => onChange({ entryKey })}
            options={linkOptions(line, preview, consumed)}
            value={decision.entryKey ?? ""}
          />
        ) : null}
      </div>
    </div>
  );
}
