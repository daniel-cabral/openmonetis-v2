import {
  type BulkCategoryCandidate,
  type BulkTransactionTarget,
  canApplyBulkTransactionAction,
  canAssignBulkCategory,
} from "@openmonetis/domain/transactions";
import type {
  BulkUpdateTransactionsInput,
  TransactionOutput,
} from "@openmonetis/validators/transactions";
import { useState } from "react";
import { toast } from "sonner";
import {
  useCategorizeTransactionsMutation,
  useDeleteTransactionsMutation,
  useRenameTransactionsMutation,
  useSetTransactionsTripMutation,
  useSettleTransactionsMutation,
  useTagTransactionsMutation,
  useUpdateTransactionsBulkMutation,
} from "./transactions.mutations";
import {
  type BulkTransactionActionKey,
  type BulkTransactionSelection,
  formatBulkTransactionResult,
  formatBulkUpdateSuccess,
  getBulkUpdateErrorMessage,
  getTransactionMutationErrorMessage,
  selectBulkTransactionIds,
} from "./transactions.presentation";

type BulkResult = Parameters<typeof formatBulkTransactionResult>[0];

const maxBulkEditRecords = 500;

export function useTransactionBulkActions(transactions: readonly TransactionOutput[]) {
  const categorizeMutation = useCategorizeTransactionsMutation();
  const renameMutation = useRenameTransactionsMutation();
  const tagMutation = useTagTransactionsMutation();
  const deleteMutation = useDeleteTransactionsMutation();
  const settleMutation = useSettleTransactionsMutation();
  const tripMutation = useSetTransactionsTripMutation();
  const updateMutation = useUpdateTransactionsBulkMutation();
  const [activeAction, setActiveAction] = useState<BulkTransactionActionKey | null>(null);
  const select = (accepts: (target: BulkTransactionTarget) => boolean) =>
    selectBulkTransactionIds(transactions, accepts);
  const settleSelection = select((target) => canApplyBulkTransactionAction(target, "settle"));
  const unsettleSelection = select((target) => canApplyBulkTransactionAction(target, "unsettle"));
  const renameSelection = select((target) => canApplyBulkTransactionAction(target, "rename"));
  const tagSelection = select((target) => canApplyBulkTransactionAction(target, "tag"));
  const tripSelection = select((target) => canApplyBulkTransactionAction(target, "trip"));
  const deleteSelection = select((target) => canApplyBulkTransactionAction(target, "delete"));
  const reach = (selection: BulkTransactionSelection) => ({
    count: selection.ids.length,
    total: selection.ids.length + selection.skippedCount,
  });

  async function run(
    action: BulkTransactionActionKey,
    result: BulkResult,
    selection: BulkTransactionSelection,
    operation: (ids: string[]) => Promise<unknown>,
  ) {
    if (!selection.ids.length) {
      toast.info("Nenhum lançamento selecionado aceita esta ação");
      return false;
    }
    setActiveAction(action);
    try {
      await operation(selection.ids);
      const message = formatBulkTransactionResult(result, selection);
      toast.success(message.title, { description: message.description });
      return true;
    } catch (error) {
      toast.error("Não foi possível concluir a ação em lote", {
        description: getTransactionMutationErrorMessage(error),
      });
      return false;
    } finally {
      setActiveAction(null);
    }
  }

  // Bulk edit reaches every selected record, so a recurring occurrence (no record) blocks it.
  async function update(input: Pick<BulkUpdateTransactionsInput, "scope" | "changes">) {
    const recordIds = new Set<string>();
    for (const transaction of transactions) {
      if (!transaction.recordId) {
        toast.info("Lançamentos recorrentes devem ser editados individualmente.");
        return false;
      }
      recordIds.add(transaction.recordId);
    }
    if (recordIds.size > maxBulkEditRecords) {
      toast.info("Selecione no máximo 500 lançamentos para editar em massa.");
      return false;
    }
    setActiveAction("update");
    try {
      const result = await updateMutation.mutateAsync({ ids: [...recordIds], ...input });
      toast.success(formatBulkUpdateSuccess(result.ids.length));
      return true;
    } catch (error) {
      toast.error(getBulkUpdateErrorMessage(error));
      return false;
    } finally {
      setActiveAction(null);
    }
  }

  return {
    activeAction,
    pending: activeAction !== null,
    availability: {
      settle: reach(settleSelection),
      unsettle: reach(unsettleSelection),
      // Category compatibility depends on the chosen category; editability bounds the reach.
      categorize: reach(renameSelection),
      tag: reach(tagSelection),
      trip: reach(tripSelection),
      rename: reach(renameSelection),
      delete: reach(deleteSelection),
      update: { count: transactions.length, total: transactions.length },
    } satisfies Record<BulkTransactionActionKey, { count: number; total: number }>,
    canCategorize: (category: BulkCategoryCandidate) =>
      select((target) => canAssignBulkCategory(target, category)).ids.length > 0,
    renameTargets: renameSelection.transactions,
    categorize: (category: BulkCategoryCandidate & { id: string }) =>
      run(
        "categorize",
        "categorized",
        select((target) => canAssignBulkCategory(target, category)),
        (ids) => categorizeMutation.mutateAsync({ ids, categoryId: category.id }),
      ),
    rename: (items: Array<{ id: string; name: string }>) =>
      run("rename", "renamed", renameSelection, () => renameMutation.mutateAsync({ items })),
    tag: (tagId: string, operation: "add" | "remove") =>
      run("tag", operation === "add" ? "tagged" : "untagged", tagSelection, (ids) =>
        tagMutation.mutateAsync({ ids, operation, tagIds: [tagId] }),
      ),
    setTrip: (tripId: string | null) =>
      run("trip", tripId ? "linked" : "unlinked", tripSelection, (ids) =>
        tripMutation.mutateAsync({ ids, tripId }),
      ),
    settle: (isSettled: boolean) =>
      run(
        isSettled ? "settle" : "unsettle",
        isSettled ? "settled" : "unsettled",
        isSettled ? settleSelection : unsettleSelection,
        (ids) => settleMutation.mutateAsync({ ids, isSettled }),
      ),
    remove: () =>
      run("delete", "deleted", deleteSelection, (ids) => deleteMutation.mutateAsync({ ids })),
    update,
  };
}
