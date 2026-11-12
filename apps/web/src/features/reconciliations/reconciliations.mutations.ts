import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshFinancialQueries } from "@/lib/financial-query-invalidation";
import {
  applyReconciliation,
  detectReconciliation,
  previewReconciliation,
  type ReconciliationOrigin,
  type ReconciliationReview,
  undoReconciliation,
} from "./reconciliations.api";

export function useDetectReconciliationMutation() {
  return useMutation({ mutationFn: detectReconciliation });
}

export function usePreviewReconciliationMutation() {
  return useMutation({
    mutationFn: ({ file, origin }: { file: File; origin: ReconciliationOrigin }) =>
      previewReconciliation(file, origin),
  });
}

export function useApplyReconciliationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      origin,
      review,
    }: {
      file: File;
      origin: ReconciliationOrigin;
      review: ReconciliationReview;
    }) => applyReconciliation(file, origin, review),
    onSuccess: () => refreshFinancialQueries(queryClient),
  });
}

export function useUndoReconciliationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: undoReconciliation,
    onSuccess: () => refreshFinancialQueries(queryClient),
  });
}
