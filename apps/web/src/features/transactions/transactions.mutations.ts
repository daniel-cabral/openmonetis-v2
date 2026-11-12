import type {
  CreateTransactionRefundInput,
  TransactionActionScope,
  UpdateTransactionInput,
} from "@openmonetis/validators/transactions";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { downloadBlob } from "@/lib/download-blob";
import { refreshFinancialQueries } from "@/lib/financial-query-invalidation";
import {
  applyRecurringRuleAction,
  categorizeTransactions,
  createTransaction,
  createTransactionsBulk,
  deleteTransaction,
  deleteTransactions,
  detectTransactionImport,
  exportTransactions,
  getTransactionExportItems,
  getTransactionImportTemplate,
  importTransactions,
  previewTransactionImport,
  refundTransaction,
  renameTransactions,
  setTransactionsTrip,
  settleRecurringOccurrence,
  settleTransactions,
  type TransactionImportPreviewOptions,
  type TransactionsApiSearch,
  tagTransactions,
  undoTransactionImport,
  updateRecurringRule,
  updateTransaction,
  updateTransactionsBulk,
} from "./transactions.api";
import {
  downloadTransactionExport,
  formatExportGeneratedAt,
  getTransactionsExportPeriodLabel,
  getTransactionsPdfFileName,
  labelTransactionExportFileName,
  type TransactionsExportFormat,
  toTransactionPdfRow,
} from "./transactions.presentation";

/** Index of the "Valor" column, the only cell that carries the expense or income tone. */
const PDF_AMOUNT_COLUMN_INDEX = 5;

function refreshTransactionQueries(queryClient: QueryClient) {
  return Promise.all([
    refreshFinancialQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: ["trips"] }),
  ]);
}

export function useExportTransactionsMutation() {
  return useMutation({
    mutationFn: async ({
      search,
      format,
      fileLabel,
    }: {
      search: TransactionsApiSearch;
      format: TransactionsExportFormat;
      fileLabel?: string;
    }) => {
      if (format === "pdf") {
        const [file, { buildBrandedPdf }, { resolveExportBranding }] = await Promise.all([
          getTransactionExportItems(search),
          import("@/lib/pdf-export"),
          import("@/lib/export-branding"),
        ]);
        const { blob } = await buildBrandedPdf({
          title: "Lançamentos",
          periodLabel: getTransactionsExportPeriodLabel(search),
          generatedAt: formatExportGeneratedAt(new Date()),
          branding: await resolveExportBranding(),
          columns: [
            { header: "Data" },
            { header: "Nome" },
            { header: "Tipo" },
            { header: "Condição" },
            { header: "Pagamento" },
            { header: "Valor", align: "right" },
            { header: "Categoria" },
            { header: "Conta/Cartão" },
            { header: "Pessoa" },
          ],
          rows: file.items.map((item) => {
            const { cells, tone } = toTransactionPdfRow(item);
            return {
              cells: cells.map((text, index) => ({
                text,
                tone: index === PDF_AMOUNT_COLUMN_INDEX ? tone : null,
              })),
            };
          }),
        });
        downloadBlob(
          blob,
          labelTransactionExportFileName(getTransactionsPdfFileName(search), fileLabel),
        );
        return { rowCount: file.rowCount };
      }

      const file = await exportTransactions(search, format);
      downloadTransactionExport({
        ...file,
        fileName: labelTransactionExportFileName(file.fileName, fileLabel),
      });
      return { rowCount: file.rowCount };
    },
  });
}

export function useCreateTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}

export function useRefundTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateTransactionRefundInput }) =>
      refundTransaction(id, data),
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}

export function useDetectTransactionImportMutation() {
  return useMutation({ mutationFn: detectTransactionImport });
}

export function usePreviewTransactionImportMutation() {
  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: TransactionImportPreviewOptions }) =>
      previewTransactionImport(file, options),
  });
}

export function useTransactionImportTemplateMutation() {
  return useMutation({ mutationFn: getTransactionImportTemplate });
}

export function useImportTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importTransactions,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}

export function useUndoTransactionImportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: undoTransactionImport,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useUpdateRecurringRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      scope,
      occurrenceDate,
    }: {
      id: string;
      data: import("@openmonetis/validators/transactions").TransactionInput;
      scope: TransactionActionScope;
      occurrenceDate: string;
    }) => updateRecurringRule(id, data, scope, occurrenceDate),
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}

export function useUpdateTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
      scope,
    }: {
      id: string;
      data: UpdateTransactionInput;
      scope?: TransactionActionScope;
    }) => updateTransaction(id, data, scope),
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}

export function useDeleteTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useSettleTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settleTransactions,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useCategorizeTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categorizeTransactions,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useRenameTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: renameTransactions,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useTagTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tagTransactions,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useSetTransactionsTripMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setTransactionsTrip,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useDeleteTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTransactions,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useCreateTransactionsBulkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTransactionsBulk,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useUpdateTransactionsBulkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateTransactionsBulk,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useSettleRecurringOccurrenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settleRecurringOccurrence,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
export function useRecurringRuleActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyRecurringRuleAction,
    onSuccess: () => refreshTransactionQueries(queryClient),
  });
}
