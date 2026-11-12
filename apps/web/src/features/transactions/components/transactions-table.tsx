import {
  resolveTransactionColumnOrder,
  type TransactionColumnId,
} from "@openmonetis/domain/preferences";
import { CircleDollarSign } from "lucide-react";
import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { transactionColumnLabels } from "@/features/preferences/preferences.presentation";
import {
  formatTransactionGroupDate,
  groupTransactionRows,
  groupTransactionsByDate,
} from "../transactions.presentation";
import { useTransactionSelection } from "../useTransactionSelection";
import { TransactionBulkActionDock } from "./transaction-bulk-action-dock";
import { TransactionRow } from "./transaction-row";
import { TransactionsPagination } from "./transactions-pagination";
import type { TransactionsTableProps } from "./transactions-table.types";

const columnHeaderClassNames: Record<TransactionColumnId, string> = {
  name: "font-mono",
  amount: "font-mono text-right",
  condition: "font-mono pl-5",
  paymentMethod: "font-mono",
  note: "font-mono",
  account: "font-mono",
};

export function TransactionsTable({
  accountStatement = false,
  adminPersonId,
  listPreferences,
  selectionMode = false,
  transactions,
  pendingTransactionId,
  pendingSettlementKey,
  onEdit,
  onView,
  onDelete,
  onCopy,
  onAnticipate,
  onUndoAnticipation,
  onRefund,
  onSettle,
  onSettleRecurringOccurrence,
  onRecurringAction,
  currentPage,
  pageCount,
  pageSize,
  period,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: TransactionsTableProps) {
  const rows = groupTransactionRows(transactions);
  // Selection follows the rendered order so Shift+click ranges match what the user sees.
  const selection = useTransactionSelection(rows.map((row) => row.transaction));
  const columns = resolveTransactionColumnOrder(listPreferences.transactionsColumnOrder, {
    noteAsColumn: listPreferences.transactionNoteAsColumn,
  });
  const columnCount = columns.length + (selectionMode ? 2 : 1);
  const sections: Array<{ date: string | null; rows: typeof rows }> =
    listPreferences.groupTransactionsByDate
      ? groupTransactionsByDate(rows, (row) =>
          accountStatement
            ? (row.transaction.postingDate ?? row.transaction.purchaseDate)
            : row.transaction.purchaseDate,
        )
      : [{ date: null, rows }];

  return (
    <TooltipProvider>
      <div className="grid gap-3">
        <Card className="py-2">
          <CardContent className="px-2 sm:px-4">
            {transactions.length ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {selectionMode ? (
                          <TableHead className="font-mono w-10">
                            <Checkbox
                              aria-label="Selecionar lançamentos operacionais desta página"
                              checked={selection.allSelectableSelected}
                              disabled={!selection.selectableCount}
                              onCheckedChange={selection.setAllSelectableSelected}
                            />
                          </TableHead>
                        ) : null}
                        {columns.map((column) => (
                          <TableHead className={columnHeaderClassNames[column]} key={column}>
                            {transactionColumnLabels[column]}
                          </TableHead>
                        ))}
                        <TableHead className="font-mono w-24 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sections.map((section) => (
                        <Fragment key={section.date ?? "all"}>
                          {section.date ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell
                                className="eyebrow bg-muted/40 text-muted-foreground"
                                colSpan={columnCount}
                              >
                                {formatTransactionGroupDate(section.date)}
                              </TableCell>
                            </TableRow>
                          ) : null}
                          {section.rows.map(({ transaction, splitConnector }) => (
                            <TransactionRow
                              accountStatement={accountStatement}
                              adminPersonId={adminPersonId}
                              columns={columns}
                              key={transaction.id}
                              selectionMode={selectionMode}
                              selected={selection.isSelected(transaction.id)}
                              selectable={selection.isSelectable(transaction)}
                              splitConnector={splitConnector}
                              onEdit={onEdit}
                              onView={onView}
                              onDelete={onDelete}
                              onCopy={onCopy}
                              onAnticipate={onAnticipate}
                              onUndoAnticipation={onUndoAnticipation}
                              onRefund={onRefund}
                              onRecurringAction={onRecurringAction}
                              onSettle={onSettle}
                              onSettleRecurringOccurrence={onSettleRecurringOccurrence}
                              onSelectionChange={(selected, extendRange) =>
                                selection.setSelected(transaction.id, selected, extendRange)
                              }
                              pending={
                                pendingTransactionId !== null &&
                                pendingTransactionId === transaction.recordId
                              }
                              period={period}
                              settlementPending={
                                pendingSettlementKey ===
                                (transaction.recordId ??
                                  (transaction.recurringRuleId
                                    ? `${transaction.recurringRuleId}:${transaction.purchaseDate}`
                                    : null))
                              }
                              transaction={transaction}
                            />
                          ))}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TransactionsPagination
                  totalItems={totalItems}
                  currentPage={currentPage}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  onPageChange={onPageChange}
                  onPageSizeChange={onPageSizeChange}
                />
              </>
            ) : (
              <div className="grid place-items-center px-4 py-14 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-brand/10 text-brand-strong">
                  <CircleDollarSign className="size-6" />
                </span>
                <h2 className="mt-4 font-semibold">Nenhum lançamento encontrado</h2>
                <p className="mt-1 max-w-sm text-muted-foreground text-sm">
                  Ajuste os filtros ou cadastre um novo lançamento para visualizar aqui.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <TransactionBulkActionDock
          onClear={selection.clear}
          summary={selection.summary}
          transactions={selection.selectedTransactions}
        />
      </div>
    </TooltipProvider>
  );
}
