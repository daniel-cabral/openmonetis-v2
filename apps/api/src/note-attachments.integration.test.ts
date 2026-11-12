import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AttachmentOutput } from "@openmonetis/validators/attachments";
import { createTestApiClient, type TestIdentity } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const pdfBytes = new TextEncoder().encode("%PDF-1.4\nreceipt");
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

test("note attachments are gated by kind, isolated by owner, excluded from transaction views and cleaned up with their parent", {
  skip: process.env.NOTE_ATTACHMENTS_INTEGRATION_TEST !== "1",
}, async (t) => {
  const endpoint = process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:19000";
  const bucket = `openmonetis-test-${randomUUID()}`;
  const credentials = { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" };
  const s3 = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  try {
    await withIntegrationDatabase(
      async () => {
        const api = await createTestApiClient();
        const owner = await api.register();
        const stranger = await api.register();
        const transaction = await api.expense(owner);
        const { db, attachments } = await import("@openmonetis/db");
        const { eq } = await import("drizzle-orm");

        async function createNote(identity: TestIdentity, body: Record<string, unknown>) {
          return api.data<{ id: string; version: number; attachmentCount: number }>(
            await api.request("/notes", identity, "POST", body),
            201,
          );
        }

        async function prepareNoteUpload(
          identity: TestIdentity,
          noteId: string,
          fileName: string,
          mimeType: "application/pdf" | "image/png",
          fileSize: number,
        ) {
          return api.data<{ uploadId: string; uploadUrl: string }>(
            await api.request("/attachments/note/prepare", identity, "POST", {
              noteId,
              fileName,
              fileSize,
              mimeType,
            }),
          );
        }

        async function uploadNoteFile(
          identity: TestIdentity,
          noteId: string,
          fileName: string,
          mimeType: "application/pdf" | "image/png",
          content: Uint8Array,
        ) {
          const prepared = await prepareNoteUpload(
            identity,
            noteId,
            fileName,
            mimeType,
            content.length,
          );
          const put = await fetch(prepared.uploadUrl, {
            method: "PUT",
            headers: { "content-type": mimeType },
            body: Buffer.from(content),
          });
          assert.ok(put.ok, await put.text());
          return prepared;
        }

        async function confirmNoteUpload(identity: TestIdentity, noteId: string, uploadId: string) {
          return api.data<AttachmentOutput>(
            await api.request("/attachments/note/confirm", identity, "POST", { noteId, uploadId }),
            201,
          );
        }

        async function listNoteAttachments(identity: TestIdentity, noteId: string) {
          return api.data<AttachmentOutput[]>(
            await api.request(`/attachments/note/${noteId}`, identity),
          );
        }

        async function objectsUnder(prefix: string) {
          const objects = await s3.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
          );
          return objects.KeyCount;
        }

        const note = await createNote(owner, { title: "Recibos", kind: "text", content: "Corpo" });
        const checklist = await createNote(owner, {
          title: "Lista",
          kind: "checklist",
          items: [{ text: "Item" }],
        });

        let pdfAttachment: AttachmentOutput | undefined;
        let pngAttachment: AttachmentOutput | undefined;
        let transactionAttachment: AttachmentOutput | undefined;
        let noteVersion = note.version;

        await t.test(
          "PDF and PNG uploads on a text note are listed with their metadata and counted on the note",
          async () => {
            const pdf = await uploadNoteFile(
              owner,
              note.id,
              "receipt.pdf",
              "application/pdf",
              pdfBytes,
            );
            pdfAttachment = await confirmNoteUpload(owner, note.id, pdf.uploadId);
            const png = await uploadNoteFile(owner, note.id, "photo.png", "image/png", pngBytes);
            pngAttachment = await confirmNoteUpload(owner, note.id, png.uploadId);

            const listed = await listNoteAttachments(owner, note.id);
            assert.deepEqual(
              listed
                .map(({ fileName, fileSize, mimeType }) => ({ fileName, fileSize, mimeType }))
                .sort((left, right) => left.fileName.localeCompare(right.fileName)),
              [
                { fileName: "photo.png", fileSize: pngBytes.length, mimeType: "image/png" },
                { fileName: "receipt.pdf", fileSize: pdfBytes.length, mimeType: "application/pdf" },
              ],
            );

            const notes = await api.data<{ items: Array<{ id: string; attachmentCount: number }> }>(
              await api.request("/notes", owner),
            );
            assert.equal(notes.items.find((item) => item.id === note.id)?.attachmentCount, 2);
          },
        );

        await t.test("each note attachment downloads the exact stored bytes", async () => {
          for (const [attachment, expected] of [
            [pdfAttachment, pdfBytes],
            [pngAttachment, pngBytes],
          ] as const) {
            assert.ok(attachment);
            const signed = await api.data<{ url: string }>(
              await api.request(`/attachments/${attachment.id}/download-url`, owner),
            );
            const downloaded = await fetch(signed.url);
            assert.ok(downloaded.ok);
            assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(expected));
          }
        });

        await t.test("checklist notes reject attachment preparation", async () => {
          await api.error(
            await api.request("/attachments/note/prepare", owner, "POST", {
              noteId: checklist.id,
              fileName: "receipt.pdf",
              fileSize: pdfBytes.length,
              mimeType: "application/pdf",
            }),
            400,
            "note_attachments_not_allowed",
          );
        });

        await t.test(
          "a PDF whose bytes are not a PDF is rejected at confirmation and never listed",
          async () => {
            const forged = await uploadNoteFile(
              owner,
              note.id,
              "forged.pdf",
              "application/pdf",
              new TextEncoder().encode("<script>bad</script>"),
            );
            await api.error(
              await api.request("/attachments/note/confirm", owner, "POST", {
                noteId: note.id,
                uploadId: forged.uploadId,
              }),
              400,
              "invalid_attachment_content",
            );
            assert.equal((await listNoteAttachments(owner, note.id)).length, 2);
          },
        );

        await t.test(
          "another user gets 404 for the note, its attachments and its uploads",
          async () => {
            const pending = await prepareNoteUpload(
              owner,
              note.id,
              "late.pdf",
              "application/pdf",
              8,
            );
            await api.error(
              await api.request(`/attachments/note/${note.id}`, stranger),
              404,
              "note_not_found",
            );
            await api.error(
              await api.request("/attachments/note/prepare", stranger, "POST", {
                noteId: note.id,
                fileName: "late.pdf",
                fileSize: 8,
                mimeType: "application/pdf",
              }),
              404,
              "note_not_found",
            );
            await api.error(
              await api.request("/attachments/note/confirm", stranger, "POST", {
                noteId: note.id,
                uploadId: pending.uploadId,
              }),
              404,
              "note_not_found",
            );
            await api.error(
              await api.request(
                `/attachments/note/${note.id}/${pdfAttachment?.id}`,
                stranger,
                "DELETE",
              ),
              404,
              "note_not_found",
            );
            await api.error(
              await api.request(`/attachments/${pdfAttachment?.id}/download-url`, stranger),
              404,
              "attachment_not_found",
            );
          },
        );

        await t.test(
          "a transaction attachment and a note attachment cannot cross parents",
          async () => {
            const transactionUpload = await api.data<{ uploadId: string; uploadUrl: string }>(
              await api.request("/attachments/prepare", owner, "POST", {
                transactionId: transaction.recordId,
                fileName: "invoice.pdf",
                fileSize: pdfBytes.length,
                mimeType: "application/pdf",
              }),
            );
            const put = await fetch(transactionUpload.uploadUrl, {
              method: "PUT",
              headers: { "content-type": "application/pdf" },
              body: Buffer.from(pdfBytes),
            });
            assert.ok(put.ok);
            transactionAttachment = await api.data<AttachmentOutput>(
              await api.request("/attachments/confirm", owner, "POST", {
                uploadId: transactionUpload.uploadId,
                transactionId: transaction.recordId,
              }),
              201,
            );

            await api.error(
              await api.request("/attachments/note/confirm", owner, "POST", {
                noteId: note.id,
                uploadId: transactionAttachment.id,
              }),
              404,
              "attachment_upload_not_found",
            );
            await api.error(
              await api.request("/attachments/confirm", owner, "POST", {
                uploadId: pdfAttachment?.id,
                transactionId: transaction.recordId,
              }),
              404,
              "attachment_upload_not_found",
            );
            assert.equal((await listNoteAttachments(owner, note.id)).length, 2);
            assert.equal(
              (
                await api.data<AttachmentOutput[]>(
                  await api.request(`/attachments/transaction/${transaction.recordId}`, owner),
                )
              ).length,
              1,
            );
          },
        );

        await t.test(
          "transaction library and summary expose only transaction attachments",
          async () => {
            const period = "2020-01";
            const library = await api.data<{
              total: number;
              items: Array<{ id: string }>;
            }>(await api.request(`/attachments?period=${period}`, owner));
            assert.deepEqual(
              library.items.map((item) => item.id),
              [transactionAttachment?.id],
            );
            assert.equal(library.total, 1);
            const summary = await api.data<{ count: number }>(
              await api.request(`/attachments/summary?period=${period}`, owner),
            );
            assert.equal(summary.count, 1);
          },
        );

        await t.test(
          "deleting the owner's transaction keeps note attachments listed and downloadable",
          async () => {
            await api.data(
              await api.request(`/transactions/${transaction.recordId}`, owner, "DELETE", {
                scope: "single",
              }),
            );
            assert.equal((await listNoteAttachments(owner, note.id)).length, 2);
            assert.ok(pdfAttachment);
            const signed = await api.data<{ url: string }>(
              await api.request(`/attachments/${pdfAttachment.id}/download-url`, owner),
            );
            assert.ok((await fetch(signed.url)).ok);
          },
        );

        await t.test("detaching one note attachment deletes it and its S3 object", async () => {
          assert.ok(pngAttachment);
          assert.deepEqual(
            await api.data(
              await api.request(
                `/attachments/note/${note.id}/${pngAttachment.id}`,
                owner,
                "DELETE",
              ),
            ),
            { id: pngAttachment.id, noteId: note.id, deleted: true },
          );
          assert.deepEqual(
            (await listNoteAttachments(owner, note.id)).map((item) => item.id),
            [pdfAttachment?.id],
          );
          await api.error(
            await api.request(`/attachments/${pngAttachment.id}/download-url`, owner),
            404,
            "attachment_not_found",
          );
          assert.equal(await objectsUnder(`attachments/${pngAttachment.id}`), 0);
        });

        await t.test(
          "archiving a note keeps its attachments and reports the count in the archive response",
          async () => {
            const archived = await api.data<{ attachmentCount: number; version: number }>(
              await api.request(`/notes/${note.id}/archive`, owner, "PATCH", { isArchived: true }),
            );
            assert.equal(archived.attachmentCount, 1);
            assert.equal((await listNoteAttachments(owner, note.id)).length, 1);
            noteVersion = archived.version;
          },
        );

        await t.test("deleting the note removes its remaining attachment and object", async () => {
          assert.ok(pdfAttachment);
          await api.data(
            await api.request(`/notes/${note.id}?expectedVersion=${noteVersion}`, owner, "DELETE"),
          );
          await api.error(
            await api.request(`/attachments/${pdfAttachment.id}/download-url`, owner),
            404,
            "attachment_not_found",
          );
          assert.equal(await objectsUnder(`attachments/${pdfAttachment.id}`), 0);
          assert.deepEqual(
            await db.select().from(attachments).where(eq(attachments.id, pdfAttachment.id)),
            [],
          );
        });
      },
      {
        environment: {
          S3_BUCKET: bucket,
          S3_ENDPOINT: endpoint,
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: credentials.accessKeyId,
          S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
        },
      },
    );
  } finally {
    try {
      const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
      if (objects.Contents?.length)
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects.Contents.map(({ Key }) => ({ Key })) },
          }),
        );
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    } finally {
      s3.destroy();
    }
  }
});
