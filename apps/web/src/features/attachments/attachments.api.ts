import type {
  AttachmentOutput,
  AttachmentsSummaryOutput,
  AttachmentUrlOutput,
  ListAttachmentsQuery,
  PaginatedAttachmentsOutput,
  PrepareAttachmentInput,
} from "@openmonetis/validators/attachments";
import { requestApiWithResponseMessage as request } from "@/lib/api-client";

export function fetchAttachmentsSummary(period: string) {
  const params = new URLSearchParams({ period });

  return request<AttachmentsSummaryOutput>(`/attachments/summary?${params.toString()}`);
}

export function getAttachments(query: ListAttachmentsQuery) {
  const params = new URLSearchParams({
    period: query.period,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.q) params.set("q", query.q);
  if (query.kind) params.set("kind", query.kind);
  if (query.personId) params.set("personId", query.personId);

  return request<PaginatedAttachmentsOutput>(`/attachments?${params.toString()}`);
}

export const getTransactionAttachments = (transactionId: string) =>
  request<AttachmentOutput[]>(`/attachments/transaction/${encodeURIComponent(transactionId)}`);

export const getAttachmentUrl = (id: string, disposition: "inline" | "attachment" = "inline") =>
  request<AttachmentUrlOutput>(
    `/attachments/${encodeURIComponent(id)}/download-url?disposition=${disposition}`,
  );

export const deleteAttachment = (id: string) =>
  request<{ id: string }>(`/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });

export const detachTransactionAttachment = (transactionId: string, attachmentId: string) =>
  request<{ id: string; transactionId: string; deleted: boolean }>(
    `/attachments/transaction/${encodeURIComponent(transactionId)}/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );

export const getNoteAttachments = (noteId: string) =>
  request<AttachmentOutput[]>(`/attachments/note/${encodeURIComponent(noteId)}`);

export const detachNoteAttachment = (noteId: string, attachmentId: string) =>
  request<{ id: string; noteId: string; deleted: boolean }>(
    `/attachments/note/${encodeURIComponent(noteId)}/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );

export function uploadAttachment(file: File, transactionId: string) {
  return uploadFile(
    file,
    { prepare: "/attachments/prepare", confirm: "/attachments/confirm" },
    { transactionId },
  );
}

export function uploadNoteAttachment(file: File, noteId: string) {
  return uploadFile(
    file,
    { prepare: "/attachments/note/prepare", confirm: "/attachments/note/confirm" },
    { noteId },
  );
}

type UploadParent = { transactionId: string } | { noteId: string };

async function uploadFile(
  file: File,
  paths: { prepare: string; confirm: string },
  parent: UploadParent,
) {
  const prepared = await request<{ uploadId: string; uploadUrl: string }>(paths.prepare, {
    method: "POST",
    body: JSON.stringify({
      ...parent,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type as PrepareAttachmentInput["mimeType"],
    }),
  });
  const response = await fetch(prepared.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!response.ok) throw new Error("Upload failed");

  return request<AttachmentOutput>(paths.confirm, {
    method: "POST",
    body: JSON.stringify({ uploadId: prepared.uploadId, ...parent }),
  });
}
