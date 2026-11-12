import type {
  ReconciliationApplyResult,
  ReconciliationDetection,
  ReconciliationPreview,
} from "@openmonetis/validators/reconciliations";
import { useRef, useState } from "react";
import { acceptedExtensions } from "../transactions/components/transaction-import-screen-options";
import { useTransactionImportTemplateMutation } from "../transactions/transactions.mutations";
import { type UiDecisions, initialDecisions } from "./components/reconciliation-review";
import type { ReconciliationOrigin } from "./reconciliations.api";
import {
  useDetectReconciliationMutation,
  usePreviewReconciliationMutation,
} from "./reconciliations.mutations";
import { formatReconciliationError } from "./reconciliations.presentation";

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

export function useReconciliationReview({ adminPersonId }: { adminPersonId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<ReconciliationDetection | null>(null);
  const [origin, setOrigin] = useState<ReconciliationOrigin | null>(null);
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [decisions, setDecisions] = useState<UiDecisions>({});
  const [applyResult, setApplyResult] = useState<ReconciliationApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detectMutation = useDetectReconciliationMutation();
  const previewMutation = usePreviewReconciliationMutation();
  const templateMutation = useTransactionImportTemplateMutation();

  // Profile, target or period changed: the preview and its decisions no longer describe the form.
  function resetReview() {
    setOrigin(null);
    setPreview(null);
    setDecisions({});
    setApplyResult(null);
    setError(null);
  }

  function resetUpload() {
    setFile(null);
    setDetection(null);
    resetReview();
  }

  async function handleFile(selected: File) {
    setError(null);
    const extension = selected.name.split(".").at(-1)?.toLowerCase() ?? "";
    if (!acceptedExtensions.includes(extension)) {
      setError("Formato não suportado. Use OFX, QFX, CSV, XLSX ou XLS.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 5 MB.");
      return;
    }
    try {
      const result = await detectMutation.mutateAsync(selected);
      resetReview();
      setFile(selected);
      setDetection(result);
    } catch {
      setError("Não foi possível ler o arquivo. Verifique o formato e tente novamente.");
    }
  }

  async function readFile(nextOrigin: ReconciliationOrigin) {
    if (!file) return;
    setError(null);
    try {
      const result = await previewMutation.mutateAsync({ file, origin: nextOrigin });
      setOrigin(nextOrigin);
      setDecisions(initialDecisions(result, adminPersonId));
      setApplyResult(null);
      setPreview(result);
    } catch (readError) {
      setError(formatReconciliationError(errorCode(readError)));
    }
  }

  async function downloadTemplate() {
    setError(null);
    try {
      const template = await templateMutation.mutateAsync();
      const bytes = Uint8Array.from(atob(template.contentBase64), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = template.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Não foi possível baixar o modelo.");
    }
  }

  return {
    inputRef,
    dragging,
    setDragging,
    file,
    detection,
    origin,
    preview,
    decisions,
    setDecisions,
    applyResult,
    setApplyResult,
    error,
    isDetecting: detectMutation.isPending,
    isReading: previewMutation.isPending,
    isDownloadingTemplate: templateMutation.isPending,
    handleFile,
    readFile,
    downloadTemplate,
    resetReview,
    resetUpload,
  };
}
