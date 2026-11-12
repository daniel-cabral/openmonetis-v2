export const attachmentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const attachmentKinds = ["image", "pdf"] as const;

export type AttachmentKind = (typeof attachmentKinds)[number];

export const maximumAttachmentSize = 50 * 1024 * 1024;

export const attachmentSizeLimitOptionsMb = [5, 10, 25, 50] as const;

export type AttachmentSizeLimitMb = (typeof attachmentSizeLimitOptionsMb)[number];

export const defaultAttachmentSizeLimitMb: AttachmentSizeLimitMb = 50;

export function resolveAttachmentSizeLimit(mb: number) {
  return Math.min(mb * 1024 * 1024, maximumAttachmentSize);
}

export function isAllowedAttachment(mimeType: string, size: number, limit = maximumAttachmentSize) {
  return (
    attachmentMimeTypes.includes(mimeType as (typeof attachmentMimeTypes)[number]) &&
    Number.isInteger(size) &&
    size > 0 &&
    size <= Math.min(limit, maximumAttachmentSize)
  );
}

export function hasAllowedAttachmentSignature(mimeType: string, bytes: Uint8Array) {
  switch (mimeType) {
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && matchesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
      );
    default:
      return false;
  }
}

export function getAttachmentKind(mimeType: string): AttachmentKind | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}

export function normalizeAttachmentFileName(fileName: string) {
  const normalized = Array.from(fileName.normalize("NFC"), (character) =>
    isUnsafeFileNameCharacter(character) ? " " : character,
  )
    .join("")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const safeName =
    normalized && normalized !== "." && normalized !== ".." ? normalized : "attachment";

  return Array.from(safeName).slice(0, 255).join("");
}

export const attachmentRecentLimit = 5;

export type PeriodAttachmentLink = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  transactionName: string;
  purchaseDate: string;
};

export type PeriodAttachmentsSummary = {
  count: number;
  totalBytes: number;
  imageCount: number;
  pdfCount: number;
  recent: Omit<PeriodAttachmentLink, "createdAt">[];
};

export function summarizePeriodAttachments(
  links: PeriodAttachmentLink[],
): PeriodAttachmentsSummary {
  const latestByAttachment = new Map<string, PeriodAttachmentLink>();
  for (const link of links) {
    const current = latestByAttachment.get(link.id);
    if (!current || link.purchaseDate > current.purchaseDate) {
      latestByAttachment.set(link.id, link);
    }
  }
  const attachments = [...latestByAttachment.values()];
  const recent = [...attachments]
    .sort(compareLinksForRecent)
    .slice(0, attachmentRecentLimit)
    .map(({ id, fileName, mimeType, fileSize, transactionName, purchaseDate }) => ({
      id,
      fileName,
      mimeType,
      fileSize,
      transactionName,
      purchaseDate,
    }));

  return {
    count: attachments.length,
    totalBytes: attachments.reduce((total, link) => total + link.fileSize, 0),
    imageCount: attachments.filter((link) => getAttachmentKind(link.mimeType) === "image").length,
    pdfCount: attachments.filter((link) => getAttachmentKind(link.mimeType) === "pdf").length,
    recent,
  };
}

function compareLinksForRecent(left: PeriodAttachmentLink, right: PeriodAttachmentLink) {
  if (left.purchaseDate !== right.purchaseDate) {
    return left.purchaseDate > right.purchaseDate ? -1 : 1;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt > right.createdAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function isUnsafeFileNameCharacter(character: string) {
  const codePoint = character.codePointAt(0) as number;
  return (
    codePoint <= 0x1f ||
    codePoint === 0x7f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return matchesAt(bytes, 0, signature);
}

function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}
