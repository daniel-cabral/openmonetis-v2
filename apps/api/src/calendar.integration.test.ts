import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { CalendarOutput } from "@openmonetis/validators/calendar";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

type CalendarEventOutput = CalendarOutput["days"][number]["events"][number];

const eventName = (event: CalendarEventOutput) =>
  event.kind === "invoice" ? event.cardName : event.name;

test("calendar month places each owner's money events on their days and isolates users", {
  skip: process.env.CALENDAR_INTEGRATION_TEST !== "1",
}, async () => {
  await withIntegrationDatabase(
    async () => {
      const api = await createTestApiClient();
      const owner = await api.register();
      const stranger = await api.register();
      const account = await api.account(owner);
      const destination = await api.account(owner);
      const calendarPath = "/calendar?period=2026-10";
      await api.error(await api.request(calendarPath), 401);
      await api.error(await api.request("/calendar?period=2026-13", owner), 400);

      const invoiceCard = await api.data<{ id: string }>(
        await api.request("/cards", owner, "POST", {
          accountId: account.id,
          name: "Loja card",
          brand: "visa",
          closingDay: 20,
          dueDay: 27,
          limit: 1000,
        }),
        201,
      );
      const installmentCard = await api.data<{ id: string }>(
        await api.request("/cards", owner, "POST", {
          accountId: account.id,
          name: "Parcelado card",
          brand: "visa",
          closingDay: 20,
          dueDay: 25,
          limit: 1000,
        }),
        201,
      );

      await api.expense(owner, {
        name: "Mercado",
        amount: 42.5,
        purchaseDate: "2026-10-12",
        accountId: account.id,
      });
      await api.data(
        await api.request(`/accounts/${account.id}/balance-adjustments`, owner, "POST", {
          balance: 500,
          date: "2026-10-01",
        }),
      );
      await api.data(
        await api.request("/transactions", owner, "POST", {
          type: "transfer",
          paymentMethod: "bank_transfer",
          name: "Pix entre contas",
          amount: 30,
          purchaseDate: "2026-10-14",
          personId: owner.personId,
          sourceAccountId: account.id,
          destinationAccountId: destination.id,
          isSettled: true,
        }),
        201,
      );
      await api.expense(owner, {
        name: "Energia",
        paymentMethod: "boleto",
        amount: 120,
        purchaseDate: "2026-09-30",
        dueDate: "2026-10-20",
        accountId: account.id,
      });
      await api.expense(owner, {
        name: "Notebook",
        paymentMethod: "credit_card",
        condition: "installment",
        installmentCount: 3,
        amount: 90,
        purchaseDate: "2026-10-08",
        cardId: installmentCard.id,
        accountId: null,
      });
      await api.expense(owner, {
        name: "Loja",
        paymentMethod: "credit_card",
        amount: 30,
        purchaseDate: "2026-10-06",
        invoicePeriod: "2026-10",
        cardId: invoiceCard.id,
        accountId: null,
      });
      await api.expense(owner, {
        name: "Academia",
        condition: "recurring",
        recurrenceFrequency: "monthly",
        amount: 99.9,
        purchaseDate: "2026-04-05",
        accountId: account.id,
      });

      const calendar = await api.data<CalendarOutput>(await api.request(calendarPath, owner));
      assert.equal(calendar.period, "2026-10");
      assert.equal(calendar.days.length, 42);
      assert.equal(calendar.days[0]?.date, "2026-09-28");
      assert.equal(calendar.days[41]?.date, "2026-11-08");

      const eventsOn = (date: string) =>
        calendar.days.find((day) => day.date === date)?.events ?? [];
      assert.deepEqual(
        eventsOn("2026-10-12").map((event) => [event.kind, eventName(event), event.amount]),
        [["transaction", "Mercado", 42.5]],
      );
      assert.deepEqual(eventsOn("2026-10-14"), []);
      assert.deepEqual(
        eventsOn("2026-10-20").map((event) => [event.kind, eventName(event), event.amount]),
        [["boleto", "Energia", 120]],
      );
      assert.deepEqual(
        eventsOn("2026-10-08").map((event) => [event.kind, eventName(event), event.amount]),
        [["installment", "Notebook", 30]],
      );
      assert.deepEqual(
        eventsOn("2026-10-05")
          .filter((event) => eventName(event) === "Academia")
          .map((event) => [event.kind, event.amount]),
        [["transaction", 99.9]],
      );
      assert.deepEqual(
        eventsOn("2026-10-27")
          .filter((event) => "cardId" in event && event.cardId === invoiceCard.id)
          .map((event) => [event.kind, event.amount, event.date]),
        [["invoice", 30, "2026-10-27"]],
      );

      const strangerCalendar = await api.data<CalendarOutput>(
        await api.request(calendarPath, stranger),
      );
      await api.expense(stranger, {
        name: "Outro",
        amount: 15,
        purchaseDate: "2026-10-12",
      });
      const refreshedStranger = await api.data<CalendarOutput>(
        await api.request(calendarPath, stranger),
      );
      assert.equal(strangerCalendar.days.flatMap((day) => day.events).length, 0);
      assert.deepEqual(refreshedStranger.days.flatMap((day) => day.events).map(eventName), [
        "Outro",
      ]);
      const ownerNames = calendar.days.flatMap((day) => day.events).map(eventName);
      assert.equal(ownerNames.includes("Outro"), false);
    },
    { migrationsFolder },
  );
});
