import { Badge } from "@/components/ui/badge";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/money-presentation";
import { cn } from "@/lib/utils";
import {
  transactionImportLineKindLabels,
  transactionImportNonImportableNote,
} from "../transactions.presentation";
import type { useTransactionImportReview } from "../useTransactionImportReview";
import { RowCategorySelect } from "./transaction-import-category-select";
import { RowSelect } from "./transaction-import-person-select";
import { updateRow } from "./transaction-import-review";
import type { Props, ReviewRow } from "./transaction-import-screen.types";
import { formatDate } from "./transaction-import-screen-options";
import { TransactionTypeBadge } from "./transaction-type-badge";

export function TransactionImportReviewRow({
  row,
  index,
  setRows,
  selectableCategories,
  people,
}: {
  row: ReviewRow;
  index: number;
  setRows: ReturnType<typeof useTransactionImportReview>["setRows"];
  selectableCategories: ReturnType<typeof useTransactionImportReview>["selectableCategories"];
  people: Props["people"];
}) {
  return (
    <TableRow className={cn(!row.selected && "opacity-55")} key={row.rowKey}>
      <TableCell>
        <Checkbox
          aria-label={`Selecionar ${row.name}`}
          checked={row.selected}
          disabled={row.isDuplicate || !row.importable}
          onCheckedChange={(checked) =>
            setRows((current) =>
              current.map((item, itemIndex) =>
                itemIndex === index ? { ...item, selected: checked } : item,
              ),
            )
          }
        />
      </TableCell>
      <TableCell className="text-muted-foreground">{formatDate(row.purchaseDate)}</TableCell>
      <TableCell>
        <Input
          aria-label={`Descrição do lançamento ${index + 1}`}
          className="h-8 min-w-48 border-transparent bg-transparent shadow-none focus-visible:border-input"
          disabled={!row.selected}
          onChange={(event) => updateRow(setRows, index, { name: event.target.value })}
          value={row.name}
        />
        {row.isDuplicate ? (
          <Badge className="mt-1" variant="outline">
            Já importado
          </Badge>
        ) : null}
        {row.lineKind === "credit" || row.lineKind === "invoice-payment" ? (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{transactionImportLineKindLabels[row.lineKind]}</Badge>
            <span className="text-muted-foreground text-xs">
              {transactionImportNonImportableNote}
            </span>
          </span>
        ) : null}
        {row.installment || row.fx ? (
          <p className="px-3 text-muted-foreground text-xs">
            {[
              row.installment ? `${row.installment.current}/${row.installment.total}` : null,
              row.fx
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(
                    row.fx.amount,
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <RowSelect
          disabled={!row.selected}
          onChange={(personId) => updateRow(setRows, index, { personId })}
          people={people}
          value={row.personId}
        />
      </TableCell>
      <TableCell>
        <RowCategorySelect
          categories={selectableCategories.filter((category) => category.type === row.type)}
          disabled={!row.selected}
          onChange={(categoryId) => updateRow(setRows, index, { categoryId })}
          value={row.categoryId}
        />
      </TableCell>
      <TableCell>
        <TransactionTypeBadge type={row.type} />
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-medium tabular-nums",
          row.type === "income" && "text-success",
        )}
      >
        {formatCurrency(row.type === "expense" ? -row.amount : row.amount)}
      </TableCell>
    </TableRow>
  );
}
