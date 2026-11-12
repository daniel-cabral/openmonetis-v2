import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { PersonOutput } from "@openmonetis/validators/people";
import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextOption } from "@/features/transactions/components/transaction-import-options";
import { formatCurrency } from "@/lib/money-presentation";
import { invoiceCreditLineLabel } from "../reconciliations.presentation";
import type { LinkOption, UiLineDecision } from "./reconciliation-review";

type Preview = ReconciliationPreview;
type PreviewLine = Preview["lines"][number];

export type ReconciliationRowProps = {
  line: PreviewLine;
  decision: UiLineDecision;
  preview: Preview;
  consumed: Map<string, number>;
  categories: CategoryOutput[];
  people: PersonOutput[];
  onChange: (patch: Partial<UiLineDecision>) => void;
};

export function formatShortDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), { day: "2-digit", month: "2-digit" });
}

// Outflows read negative, as in the import review table.
export function formatSignedAmount(amount: number, type: "income" | "expense") {
  return formatCurrency(type === "expense" ? -amount : amount);
}

export function formatLineMeta(line: PreviewLine) {
  const meta = `${formatShortDate(line.purchaseDate)} · ${formatSignedAmount(line.amount, line.type)}`;
  return line.lineKind === "credit" ? `${meta} · ${invoiceCreditLineLabel}` : meta;
}

export function ReconciliationEntryItem({ option, value }: { option: LinkOption; value: string }) {
  return (
    <SelectItem disabled={option.unavailable} value={value}>
      <TextOption
        description={[
          formatShortDate(option.date),
          formatCurrency(Number(option.amount)),
          option.unavailable ? "já usado" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        label={option.name}
      />
    </SelectItem>
  );
}

export function ReconciliationEntrySelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: LinkOption[];
  value: string;
  onChange: (entryKey: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-muted-foreground text-xs">Nenhum lançamento neste período.</p>;
  }
  const selected = options.find((option) => option.entryKey === value);
  return (
    <Select onValueChange={(next) => onChange(next as string)} value={value || null}>
      <SelectTrigger aria-label={label} className="h-8 w-full sm:w-72">
        <SelectValue>
          {selected ? (
            <TextOption label={selected.name} />
          ) : (
            <span>Vincular a outro lançamento</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <ReconciliationEntryItem key={option.entryKey} option={option} value={option.entryKey} />
        ))}
      </SelectContent>
    </Select>
  );
}
