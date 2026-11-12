import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { PersonOutput } from "@openmonetis/validators/people";
import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { Button } from "@/components/ui/button";
import { transactionImportLineKindLabels } from "@/features/transactions/transactions.presentation";
import { reconciliationSectionTitles } from "../reconciliations.presentation";
import { ReconciliationAmbiguousRow } from "./reconciliation-ambiguous-row";
import { ReconciliationBankOnlyRow } from "./reconciliation-bank-only-row";
import { ReconciliationBucket } from "./reconciliation-bucket";
import { ReconciliationMatchedRow } from "./reconciliation-matched-row";
import { type UiDecisions, type UiLineDecision, consumedEntryKeys } from "./reconciliation-review";
import { formatLineMeta, formatShortDate, formatSignedAmount } from "./reconciliation-row-fields";

type Preview = ReconciliationPreview;
type PreviewLine = Preview["lines"][number];

function ReadonlyRow({ title, meta, note }: { title: string; meta: string; note?: string | null }) {
  return (
    <div className="py-3">
      <p className="truncate font-medium text-sm">{title}</p>
      <p className="text-muted-foreground text-xs">{meta}</p>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}

export function ReconciliationBuckets({
  preview,
  decisions,
  categories,
  people,
  onChange,
  onMarkAllBankOnlyAsCreate,
}: {
  preview: Preview;
  decisions: UiDecisions;
  categories: CategoryOutput[];
  people: PersonOutput[];
  onChange: (lineIndex: number, patch: Partial<UiLineDecision>) => void;
  onMarkAllBankOnlyAsCreate: () => void;
}) {
  const consumed = consumedEntryKeys(decisions, preview);
  const linesIn = (bucket: PreviewLine["bucket"]) =>
    preview.lines.filter((line) => line.bucket === bucket);
  const needsDecision = linesIn("needs-decision");
  const matched = linesIn("matched");
  const bankOnly = linesIn("bank-only");
  const ambiguous = linesIn("ambiguous");
  const ignored = linesIn("ignored");
  const informational = linesIn("informational");
  const appOnly = preview.entries.filter((entry) => preview.appOnlyKeys.includes(entry.entryKey));
  const canMarkAllBankOnly = bankOnly.some((line) => decisions[line.index]?.action === "skip");

  const rowProps = (line: PreviewLine) => ({
    line,
    decision: decisions[line.index],
    preview,
    consumed,
    categories,
    people,
    onChange: (patch: Partial<UiLineDecision>) => onChange(line.index, patch),
  });

  return (
    <div className="grid gap-6">
      {needsDecision.length > 0 ? (
        <ReconciliationBucket
          count={needsDecision.length}
          title={reconciliationSectionTitles["needs-decision"]}
        >
          {needsDecision.map((line) => (
            <ReconciliationMatchedRow key={line.index} {...rowProps(line)} />
          ))}
        </ReconciliationBucket>
      ) : null}

      <ReconciliationBucket count={matched.length} title={reconciliationSectionTitles.matched}>
        {matched.map((line) => (
          <ReconciliationMatchedRow key={line.index} {...rowProps(line)} />
        ))}
      </ReconciliationBucket>

      <ReconciliationBucket
        action={
          <Button
            disabled={!canMarkAllBankOnly}
            onClick={onMarkAllBankOnlyAsCreate}
            size="sm"
            type="button"
            variant="outline"
          >
            Marcar todas como Criar
          </Button>
        }
        count={bankOnly.length}
        title={reconciliationSectionTitles["bank-only"]}
      >
        {bankOnly.map((line) => (
          <ReconciliationBankOnlyRow key={line.index} {...rowProps(line)} />
        ))}
      </ReconciliationBucket>

      <ReconciliationBucket count={ambiguous.length} title={reconciliationSectionTitles.ambiguous}>
        {ambiguous.map((line) => (
          <ReconciliationAmbiguousRow key={line.index} {...rowProps(line)} />
        ))}
      </ReconciliationBucket>

      <ReconciliationBucket count={appOnly.length} title={reconciliationSectionTitles["app-only"]}>
        {appOnly.map((entry) => (
          <ReadonlyRow
            key={entry.entryKey}
            meta={`${formatShortDate(entry.date)} · ${formatSignedAmount(entry.amount, entry.type)}`}
            title={entry.name}
          />
        ))}
      </ReconciliationBucket>

      <ReconciliationBucket count={ignored.length} title={reconciliationSectionTitles.ignored}>
        {ignored.map((line) => (
          <ReadonlyRow
            key={line.index}
            meta={formatLineMeta(line)}
            note={line.ignoredReason}
            title={line.name}
          />
        ))}
      </ReconciliationBucket>

      <ReconciliationBucket
        count={informational.length}
        title={reconciliationSectionTitles.informational}
      >
        {informational.map((line) => (
          <ReadonlyRow
            key={line.index}
            meta={formatLineMeta(line)}
            note={
              line.lineKind && line.lineKind !== "purchase"
                ? transactionImportLineKindLabels[line.lineKind]
                : null
            }
            title={line.name}
          />
        ))}
      </ReconciliationBucket>
    </div>
  );
}
