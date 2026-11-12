import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentMimeTypes,
  hasAllowedAttachmentSignature,
  isAllowedAttachment,
  maximumAttachmentSize,
  normalizeAttachmentFileName,
  resolveAttachmentSizeLimit,
  summarizePeriodAttachments,
} from "./attachments";

test("attachment whitelist accepts exact size boundaries and rejects unsupported or fractional sizes", () => {
  for (const mime of attachmentMimeTypes) {
    assert.equal(isAllowedAttachment(mime, 1), true);
    assert.equal(isAllowedAttachment(mime, maximumAttachmentSize), true);
    for (const size of [0, -1, 0.5, maximumAttachmentSize + 1, NaN, Infinity])
      assert.equal(isAllowedAttachment(mime, size), false);
  }
  for (const mime of [
    "text/html",
    "image/svg+xml",
    "application/octet-stream",
    "image/png; charset=utf-8",
  ])
    assert.equal(isAllowedAttachment(mime, 10), false);
  const fiveMbLimit = resolveAttachmentSizeLimit(5);
  assert.equal(isAllowedAttachment("application/pdf", 5 * 1024 * 1024, fiveMbLimit), true);
  assert.equal(isAllowedAttachment("application/pdf", 5 * 1024 * 1024 + 1, fiveMbLimit), false);
  assert.equal(resolveAttachmentSizeLimit(100), 52428800);
});

test("all supported file signatures reject truncated, forged and mismatched content", () => {
  const samples = [
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d]],
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ] as const;
  for (const [mime, content] of samples) {
    assert.equal(hasAllowedAttachmentSignature(mime, Uint8Array.from(content)), true);
    assert.equal(hasAllowedAttachmentSignature(mime, Uint8Array.from(content.slice(0, -1))), false);
    assert.equal(
      hasAllowedAttachmentSignature(mime, new TextEncoder().encode("<script>alert(1)</script>")),
      false,
    );
    for (const other of attachmentMimeTypes.filter((value) => value !== mime))
      assert.equal(hasAllowedAttachmentSignature(other, Uint8Array.from(content)), false);
  }
});

test("attachment names remove path separators, controls and directional overrides", () => {
  assert.equal(
    normalizeAttachmentFileName("../receipt\\invoice\u0000\u202e.pdf"),
    ".._receipt_invoice .pdf",
  );
  for (const name of ["", " ", ".", "..", "\u0000"])
    assert.equal(normalizeAttachmentFileName(name), "attachment");
  assert.equal(Array.from(normalizeAttachmentFileName("😀".repeat(300))).length, 255);
});

test("period summary counts distinct attachments, keeps the latest link and orders recent ones", () => {
  assert.deepEqual(summarizePeriodAttachments([]), {
    count: 0,
    totalBytes: 0,
    imageCount: 0,
    pdfCount: 0,
    recent: [],
  });

  const summary = summarizePeriodAttachments([
    {
      id: "img-dup",
      fileName: "nota.png",
      mimeType: "image/png",
      fileSize: 2000,
      createdAt: "2026-11-02T10:00:00.000Z",
      transactionName: "Padaria",
      purchaseDate: "2026-11-03",
    },
    {
      id: "img-dup",
      fileName: "nota.png",
      mimeType: "image/png",
      fileSize: 2000,
      createdAt: "2026-11-02T10:00:00.000Z",
      transactionName: "Farmácia",
      purchaseDate: "2026-11-09",
    },
    {
      id: "img-2",
      fileName: "foto-2.webp",
      mimeType: "image/webp",
      fileSize: 3000,
      createdAt: "2026-11-03T10:00:00.000Z",
      transactionName: "Posto",
      purchaseDate: "2026-11-07",
    },
    {
      id: "img-3",
      fileName: "foto-3.jpg",
      mimeType: "image/jpeg",
      fileSize: 4000,
      createdAt: "2026-11-04T10:00:00.000Z",
      transactionName: "Restaurante",
      purchaseDate: "2026-11-07",
    },
    {
      id: "img-4",
      fileName: "foto-4.png",
      mimeType: "image/png",
      fileSize: 5000,
      createdAt: "2026-11-05T10:00:00.000Z",
      transactionName: "Loja",
      purchaseDate: "2026-11-01",
    },
    {
      id: "pdf-1",
      fileName: "recibo.pdf",
      mimeType: "application/pdf",
      fileSize: 10000,
      createdAt: "2026-11-06T10:00:00.000Z",
      transactionName: "Mercado",
      purchaseDate: "2026-11-08",
    },
    {
      id: "pdf-2",
      fileName: "fatura.pdf",
      mimeType: "application/pdf",
      fileSize: 20000,
      createdAt: "2026-11-01T10:00:00.000Z",
      transactionName: "Cartão",
      purchaseDate: "2026-11-04",
    },
  ]);

  assert.equal(summary.count, 6);
  assert.equal(summary.totalBytes, 44000);
  assert.equal(summary.imageCount, 4);
  assert.equal(summary.pdfCount, 2);
  assert.deepEqual(
    summary.recent.map((link) => link.id),
    ["img-dup", "pdf-1", "img-3", "img-2", "pdf-2"],
  );
  assert.deepEqual(summary.recent[0], {
    id: "img-dup",
    fileName: "nota.png",
    mimeType: "image/png",
    fileSize: 2000,
    transactionName: "Farmácia",
    purchaseDate: "2026-11-09",
  });
});
