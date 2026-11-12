import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { AttachmentsSummaryOutput } from "@openmonetis/validators/attachments";
import type { SpendingOverviewOutput } from "@openmonetis/validators/spending-overview";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

test("spending overview ranks the owner's June expenses by their own share and isolates users", {
  skip: process.env.SPENDING_OVERVIEW_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(
    async () => {
      const api = await createTestApiClient();
      const owner = await api.register();
      const stranger = await api.register();
      const account = await api.account(owner);
      const overviewPath = "/dashboard/spending-overview?period=2026-06";
      await api.error(await api.request(overviewPath), 401);

      const ana = await api.data<{ id: string }>(
        await api.request("/people", owner, "POST", { name: "Ana" }),
        201,
      );
      for (const [purchaseDate, amount] of [
        ["2026-06-03", 120],
        ["2026-06-10", 80],
        ["2026-06-20", 50],
      ] as const) {
        await api.expense(owner, {
          name: "Mercado A",
          amount,
          purchaseDate,
          accountId: account.id,
        });
      }
      const fatura = await api.expense(owner, {
        name: "Fatura de energia",
        amount: 412.8,
        purchaseDate: "2026-06-15",
        accountId: account.id,
      });
      await api.expense(owner, {
        name: "Loja",
        amount: 200,
        purchaseDate: "2026-06-05",
        accountId: account.id,
        splitShares: [
          { personId: owner.personId, amount: 60 },
          { personId: ana.id, amount: 140 },
        ],
      });
      await api.expense(owner, {
        name: "Assinatura streaming",
        condition: "recurring",
        recurrenceFrequency: "monthly",
        amount: 40,
        purchaseDate: "2026-04-05",
        accountId: account.id,
      });
      await api.expense(owner, {
        name: "Cinema julho",
        amount: 999,
        purchaseDate: "2026-07-10",
        accountId: account.id,
      });
      await api.expense(owner, {
        type: "income",
        name: "Salario",
        amount: 5000,
        purchaseDate: "2026-06-01",
        categoryId: owner.incomeCategoryId,
        accountId: account.id,
      });
      await api.expense(stranger, {
        name: "Padaria Vizinha",
        amount: 70,
        purchaseDate: "2026-06-12",
      });

      const overview = await api.data<SpendingOverviewOutput>(
        await api.request(overviewPath, owner),
      );
      assert.deepEqual(
        overview.topExpenses.map((expense) => [expense.name, expense.amount, expense.purchaseDate]),
        [
          ["Fatura de energia", 412.8, "2026-06-15"],
          ["Mercado A", 120, "2026-06-03"],
          ["Mercado A", 80, "2026-06-10"],
          ["Loja", 60, "2026-06-05"],
          ["Mercado A", 50, "2026-06-20"],
          ["Assinatura streaming", 40, "2026-06-05"],
        ],
      );
      assert.equal(overview.topExpenses[0]?.key, fatura.id);
      assert.equal(
        new Set(overview.topExpenses.map((expense) => expense.key)).size,
        overview.topExpenses.length,
      );
      assert.match(
        overview.topExpenses.find((expense) => expense.name === "Assinatura streaming")?.key ?? "",
        /:2026-06-05$/,
      );
      assert.deepEqual(
        overview.topEstablishments.map((item) => [item.name, item.count, item.total]),
        [
          ["Mercado A", 3, 250],
          ["Fatura de energia", 1, 412.8],
          ["Loja", 1, 60],
          ["Assinatura streaming", 1, 40],
        ],
      );

      const strangerOverview = await api.data<SpendingOverviewOutput>(
        await api.request(overviewPath, stranger),
      );
      assert.deepEqual(
        strangerOverview.topEstablishments.map((item) => [item.name, item.count, item.total]),
        [["Padaria Vizinha", 1, 70]],
      );
      assert.deepEqual(
        strangerOverview.topExpenses.map((expense) => expense.name),
        ["Padaria Vizinha"],
      );

      // Subtest shares this database run: withIntegrationDatabase cannot run twice per process.
      await t.test(
        "attachments summary counts the owner's period files once and isolates users",
        async () => {
          const summaryPath = "/attachments/summary?period=2026-06";
          await api.error(await api.request(summaryPath), 401);

          const { db, attachments, transactionAttachments } = await import("@openmonetis/db");
          const mercado = await api.expense(owner, {
            name: "Mercado B",
            amount: 120,
            purchaseDate: "2026-06-03",
          });
          const fatura = await api.expense(owner, {
            name: "Fatura de energia B",
            amount: 412.8,
            purchaseDate: "2026-06-20",
          });
          const cinema = await api.expense(owner, {
            name: "Cinema julho B",
            amount: 999,
            purchaseDate: "2026-07-10",
          });
          const padaria = await api.expense(stranger, {
            name: "Padaria Vizinha B",
            amount: 70,
            purchaseDate: "2026-06-12",
          });
          async function attach(
            userId: string,
            file: { fileName: string; mimeType: string; fileSize: number; createdAt: string },
            transactionIds: string[],
          ) {
            const [attachment] = await db
              .insert(attachments)
              .values({
                userId,
                fileKey: `attachments/${randomUUID()}`,
                fileName: file.fileName,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                createdAt: new Date(file.createdAt),
              })
              .returning({ id: attachments.id });
            await db.insert(transactionAttachments).values(
              transactionIds.map((transactionId) => ({
                userId,
                transactionId,
                attachmentId: attachment.id,
              })),
            );
          }
          await attach(
            owner.id,
            {
              fileName: "nota-mercado.jpg",
              mimeType: "image/jpeg",
              fileSize: 1000,
              createdAt: "2026-06-04T10:00:00Z",
            },
            [mercado.id, fatura.id],
          );
          await attach(
            owner.id,
            {
              fileName: "comprovante.pdf",
              mimeType: "application/pdf",
              fileSize: 2000,
              createdAt: "2026-06-05T10:00:00Z",
            },
            [fatura.id],
          );
          await attach(
            owner.id,
            {
              fileName: "cupom-mercado.png",
              mimeType: "image/png",
              fileSize: 300,
              createdAt: "2026-06-06T10:00:00Z",
            },
            [mercado.id],
          );
          await attach(
            owner.id,
            {
              fileName: "foto-cinema.png",
              mimeType: "image/png",
              fileSize: 500,
              createdAt: "2026-07-10T10:00:00Z",
            },
            [cinema.id],
          );
          await attach(
            stranger.id,
            {
              fileName: "nota-estranha.pdf",
              mimeType: "application/pdf",
              fileSize: 9999,
              createdAt: "2026-06-12T10:00:00Z",
            },
            [padaria.id],
          );

          const summary = await api.data<AttachmentsSummaryOutput>(
            await api.request(summaryPath, owner),
          );
          assert.deepEqual(
            {
              count: summary.count,
              totalBytes: summary.totalBytes,
              imageCount: summary.imageCount,
              pdfCount: summary.pdfCount,
            },
            { count: 3, totalBytes: 3300, imageCount: 2, pdfCount: 1 },
          );
          assert.deepEqual(
            summary.recent.map((file) => file.fileName),
            ["comprovante.pdf", "nota-mercado.jpg", "cupom-mercado.png"],
          );
        },
      );
    },
    { migrationsFolder },
  );
});
