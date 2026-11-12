import assert from "node:assert/strict";
import test from "node:test";
import { addMonthsToPeriod } from "@openmonetis/domain/transactions";
import type { TransactionOutput } from "@openmonetis/validators/transactions";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

type TransactionsPage = { items: TransactionOutput[]; total: number };

const defaultPreferences = {
  transactionsColumnOrder: null,
  groupTransactionsByDate: true,
  hideAnticipatedInstallments: false,
  showTransactionSummary: true,
  transactionNoteAsColumn: false,
  attachmentMaxSizeMb: 50,
};

function assertPreferences(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, key);
}

test("account preferences persist per field and hide anticipated installments from the list only", {
  skip: process.env.ACCOUNT_PREFERENCES_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const readPreferences = async (identity: typeof owner) =>
      api.data<Record<string, unknown>>(await api.request("/preferences", identity));

    await t.test("first read returns the documented defaults", async () => {
      assertPreferences(await readPreferences(owner), defaultPreferences);
    });

    await t.test("each field is saved on its own and stays isolated per user", async () => {
      await api.data(
        await api.request("/preferences", owner, "PATCH", {
          transactionsColumnOrder: ["amount", "name"],
        }),
      );
      await api.data(
        await api.request("/preferences", owner, "PATCH", { transactionNoteAsColumn: true }),
      );
      assertPreferences(await readPreferences(owner), {
        ...defaultPreferences,
        transactionsColumnOrder: ["amount", "name"],
        transactionNoteAsColumn: true,
      });
      assertPreferences(await readPreferences(stranger), defaultPreferences);
    });

    await t.test("invalid values are rejected and saved preferences stay unchanged", async () => {
      for (const body of [
        { attachmentMaxSizeMb: 100 },
        { transactionsColumnOrder: ["amount", "amount"] },
        { transactionsColumnOrder: ["type"] },
      ]) {
        await api.error(await api.request("/preferences", owner, "PATCH", body), 400);
      }
      assertPreferences(await readPreferences(owner), {
        ...defaultPreferences,
        transactionsColumnOrder: ["amount", "name"],
        transactionNoteAsColumn: true,
      });
    });

    await t.test(
      "hiding anticipated installments shrinks the list and total but not the export",
      async () => {
        const account = await api.account(owner);
        const card = await api.data<{ id: string }>(
          await api.request("/cards", owner, "POST", {
            accountId: account.id,
            name: "Cartão parcelado",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 5000,
          }),
          201,
        );
        const first = await api.expense(owner, {
          name: "Notebook",
          paymentMethod: "credit_card",
          condition: "installment",
          installmentCount: 3,
          amount: 300,
          purchaseDate: "2026-03-10",
          cardId: card.id,
          accountId: null,
        });
        assert.ok(first.seriesId);
        const seriesId = first.seriesId;
        const target = first.period;
        const installmentRecordId = async (period: string) => {
          const page = await api.data<TransactionsPage>(
            await api.request(`/transactions?period=${period}`, owner),
          );
          const [item] = page.items.filter((row) => row.seriesId === seriesId);
          assert.ok(item?.recordId);
          return item.recordId;
        };
        const second = await installmentRecordId(addMonthsToPeriod(target, 1));
        const third = await installmentRecordId(addMonthsToPeriod(target, 2));
        await api.data(
          await api.request(`/reports/installments/${seriesId}/anticipations`, owner, "POST", {
            installmentIds: [second, third],
            targetPeriod: target,
            discount: 5,
          }),
          201,
        );

        const listTarget = async () =>
          api.data<TransactionsPage>(await api.request(`/transactions?period=${target}`, owner));
        const before = await listTarget();
        const adjustment = before.items.find((row) => row.origin === "invoiceAdjustment");
        assert.ok(adjustment?.recordId);
        assert.equal(before.items.filter((row) => row.seriesId === seriesId).length, 3);

        await api.data(
          await api.request("/preferences", owner, "PATCH", { hideAnticipatedInstallments: true }),
        );
        const after = await listTarget();
        assert.deepEqual(after.items.map((row) => row.recordId).sort(), [
          first.recordId,
          adjustment.recordId,
        ].sort());
        assert.equal(after.total, before.total - 2);

        const exported = await api.data<{ items: TransactionOutput[]; rowCount: number }>(
          await api.request(`/transactions/export/items?period=${target}`, owner),
        );
        assert.deepEqual(
          exported.items.map((row) => row.recordId).sort(),
          before.items.map((row) => row.recordId).sort(),
        );
      },
    );
  });
});
