import type {
  ApplyReconciliationInput,
  ReconciliationApplyResult,
  ReconciliationDetection,
  ReconciliationFileInput,
  ReconciliationPreview,
} from "@openmonetis/validators/reconciliations";
import { requestApi } from "@/lib/api-client";

export type ReconciliationOrigin = Omit<ReconciliationFileInput, "fileName" | "contentBase64">;

export type ReconciliationReview = Pick<
  ApplyReconciliationInput,
  "classificationDigest" | "decisions"
>;

async function readReconciliationFileBody(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error("IMPORT_FILE_TOO_LARGE");
  return { fileName: file.name, contentBase64: await readFileAsBase64(file) };
}

export async function detectReconciliation(file: File) {
  return requestApi<ReconciliationDetection>("/reconciliations/detect", {
    method: "POST",
    body: JSON.stringify(await readReconciliationFileBody(file)),
  });
}

export async function previewReconciliation(file: File, origin: ReconciliationOrigin) {
  return requestApi<ReconciliationPreview>("/reconciliations/preview", {
    method: "POST",
    body: JSON.stringify({ ...(await readReconciliationFileBody(file)), ...origin }),
  });
}

export async function applyReconciliation(
  file: File,
  origin: ReconciliationOrigin,
  review: ReconciliationReview,
) {
  return requestApi<ReconciliationApplyResult>("/reconciliations", {
    method: "POST",
    body: JSON.stringify({ ...(await readReconciliationFileBody(file)), ...origin, ...review }),
  });
}

export function undoReconciliation(batchId: string) {
  return requestApi<{ batchId: string; undone: true }>(`/reconciliations/${batchId}`, {
    method: "DELETE",
  });
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("IMPORT_FILE_INVALID"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const content = result.split(",", 2)[1];
      if (!content) reject(new Error("IMPORT_FILE_INVALID"));
      else resolve(content);
    };
    reader.readAsDataURL(file);
  });
}
