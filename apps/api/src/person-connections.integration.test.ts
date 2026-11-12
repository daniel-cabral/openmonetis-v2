import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { personConnectionConfirmationMaximumAttempts } from "@openmonetis/domain/person-connections";
import type { ExternalExpensePageOutput } from "@openmonetis/validators/external-expenses";
import type {
  ClaimedPersonConnectionInvitationOutput,
  CreatedPersonConnectionInvitationOutput,
  PersonConnectionOutput,
} from "@openmonetis/validators/person-connections";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

test("connection persistence protects one-time credentials, expiration, attempts and bilateral revocation", {
  skip: process.env.CONNECTIONS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const { db, personConnectionInvitations, personConnections } = await import("@openmonetis/db");
    const { eq } = await import("drizzle-orm");
    const { personConnectionsRepository } = await import(
      "./repositories/person-connections.repository"
    );
    const { createPersonConnectionsService } = await import(
      "./services/person-connections.service"
    );
    let now = new Date();
    const service = createPersonConnectionsService(personConnectionsRepository, {
      secret: "test-connection-secret",
      now: () => now,
    });
    const owner = await api.register();
    const recipient = await api.register();
    const stranger = await api.register();
    async function invitation() {
      const person = await api.data<{ id: string }>(
        await api.request("/people", owner, "POST", { name: `Guest ${randomUUID()}` }),
        201,
      );
      return service.createInvitation(person.id, owner.id);
    }
    await t.test(
      "HTTP invitation creation stores a digest and never recovers the original token in listings",
      async () => {
        const person = await api.data<{ id: string }>(
          await api.request("/people", owner, "POST", { name: "HTTP guest" }),
          201,
        );
        const created = await api.data<CreatedPersonConnectionInvitationOutput>(
          await api.request("/person-connections/invitations", owner, "POST", {
            personId: person.id,
          }),
          201,
        );
        const [stored] = await db
          .select()
          .from(personConnectionInvitations)
          .where(eq(personConnectionInvitations.id, created.id));
        assert.equal(stored.tokenDigest, createHash("sha256").update(created.token).digest("hex"));
        assert.equal(JSON.stringify(stored).includes(created.token), false);
        const listed = await api.data<unknown[]>(
          await api.request("/person-connections/invitations", owner),
        );
        assert.equal(JSON.stringify(listed).includes(created.token), false);
        await api.error(
          await api.request("/person-connections/invitations", stranger, "POST", {
            personId: person.id,
          }),
          404,
          "person_not_found",
        );
      },
    );
    await t.test("tokens cannot be claimed twice or by the invitation owner", async () => {
      const item = await invitation();
      await assert.rejects(service.claimInvitation(item.token, owner.id));
      const claimed = await service.claimInvitation(item.token, recipient.id);
      assert.match(claimed.confirmationCode, /^\d{6}$/);
      await assert.rejects(service.claimInvitation(item.token, stranger.id), {
        code: "invitation_invalid",
      });
      const [stored] = await db
        .select()
        .from(personConnectionInvitations)
        .where(eq(personConnectionInvitations.id, item.id));
      assert.equal(
        stored.confirmationCodeDigest,
        createHmac("sha256", "test-connection-secret")
          .update(claimed.confirmationCode)
          .digest("hex"),
      );
      assert.equal(Object.values(stored).includes(claimed.confirmationCode), false);
    });
    await t.test("expired and cancelled invitations cannot be claimed", async () => {
      const expired = await invitation();
      const cancelled = await invitation();
      await service.cancelInvitation(cancelled.id, owner.id);
      await assert.rejects(service.claimInvitation(cancelled.token, recipient.id), {
        code: "invitation_invalid",
      });
      const original = now;
      now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await assert.rejects(service.claimInvitation(expired.token, recipient.id), {
        code: "invitation_invalid",
      });
      now = original;
    });
    await t.test(
      "confirmation is owner-scoped, expires at its deadline and locks after wrong attempts",
      async () => {
        const item = await invitation();
        const claimed = await service.claimInvitation(item.token, recipient.id);
        await assert.rejects(
          service.confirmInvitation(item.id, stranger.id, {
            confirmationCode: claimed.confirmationCode,
          }),
          { code: "invitation_not_found" },
        );
        const wrong = claimed.confirmationCode === "000000" ? "111111" : "000000";
        for (let attempt = 0; attempt < personConnectionConfirmationMaximumAttempts; attempt++)
          await assert.rejects(
            service.confirmInvitation(item.id, owner.id, { confirmationCode: wrong }),
            { code: "confirmation_code_invalid" },
          );
        await assert.rejects(
          service.confirmInvitation(item.id, owner.id, {
            confirmationCode: claimed.confirmationCode,
          }),
          { code: "confirmation_locked" },
        );
        const next = await invitation();
        const code = await service.claimInvitation(next.token, recipient.id);
        const original = now;
        now = new Date(code.confirmationExpiresAt);
        await assert.rejects(
          service.confirmInvitation(next.id, owner.id, { confirmationCode: code.confirmationCode }),
          { code: "confirmation_expired" },
        );
        now = original;
      },
    );
    await t.test(
      "confirmation races create one connection and revocation is restricted to the participants",
      async () => {
        const item = await invitation();
        const claimed = await service.claimInvitation(item.token, recipient.id);
        const attempts = await Promise.allSettled([
          service.confirmInvitation(item.id, owner.id, {
            confirmationCode: claimed.confirmationCode,
          }),
          service.confirmInvitation(item.id, owner.id, {
            confirmationCode: claimed.confirmationCode,
          }),
        ]);
        assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
        const [connection] = await db
          .select()
          .from(personConnections)
          .where(eq(personConnections.invitationId, item.id));
        assert.ok(connection);
        await assert.rejects(service.revokeConnection(connection.id, stranger.id), {
          code: "connection_not_found",
        });
        const recipientList = await service.listConnections(recipient.id);
        assert.equal(recipientList.find((row) => row.id === connection.id)?.personId, null);
        await service.revokeConnection(connection.id, recipient.id);
        assert.equal(
          (await service.listConnections(owner.id)).find((row) => row.id === connection.id)?.status,
          "revoked",
        );
      },
    );
    await t.test(
      "HTTP claim and owner confirmation activate a connection without exposing internal identifiers",
      async () => {
        const item = await invitation();
        const claimed = await api.data<ClaimedPersonConnectionInvitationOutput>(
          await api.request("/person-connections/invitations/claim", recipient, "POST", {
            token: item.token,
          }),
        );
        const connection = await api.data<PersonConnectionOutput>(
          await api.request(`/person-connections/invitations/${item.id}/confirm`, owner, "POST", {
            confirmationCode: claimed.confirmationCode,
          }),
        );
        assert.equal(connection.status, "active");
        await api.error(
          await api.request(`/person-connections/${connection.id}`, stranger, "DELETE"),
          404,
          "connection_not_found",
        );
        await api.data(
          await api.request(`/person-connections/${connection.id}`, recipient, "DELETE"),
        );
      },
    );
    await t.test(
      "an active connection gives the recipient read-only shared items and no write access to owner data",
      async () => {
        const connectionOwner = await api.register();
        const connectionRecipient = await api.register();
        const connectedPerson = await api.data<{ id: string }>(
          await api.request("/people", connectionOwner, "POST", { name: "Shared guest" }),
          201,
        );
        const item = await api.data<CreatedPersonConnectionInvitationOutput>(
          await api.request("/person-connections/invitations", connectionOwner, "POST", {
            personId: connectedPerson.id,
          }),
          201,
        );
        const claimed = await api.data<ClaimedPersonConnectionInvitationOutput>(
          await api.request("/person-connections/invitations/claim", connectionRecipient, "POST", {
            token: item.token,
          }),
        );
        const connection = await api.data<PersonConnectionOutput>(
          await api.request(
            `/person-connections/invitations/${item.id}/confirm`,
            connectionOwner,
            "POST",
            { confirmationCode: claimed.confirmationCode },
          ),
        );
        assert.equal(connection.status, "active");
        assert.equal("permission" in connection, false);
        const sharedExpense = await api.expense(connectionOwner, { personId: connectedPerson.id });
        await api.expense(connectionOwner, { personId: connectionOwner.personId });
        const shared = await api.data<ExternalExpensePageOutput>(
          await api.request("/external-expenses", connectionRecipient),
        );
        assert.deepEqual(
          shared.items.map((row) => row.sourceTransactionId),
          [sharedExpense.id],
        );
        const ownerAccount = await api.account(connectionOwner);
        const recipientAccount = await api.account(connectionRecipient);
        const card = await api.data<{ id: string }>(
          await api.request("/cards", connectionOwner, "POST", {
            accountId: ownerAccount.id,
            name: "Shared card",
            brand: "visa",
            closingDay: 20,
            dueDay: 25,
            limit: 1000,
          }),
          201,
        );
        const ownerResources = [
          { path: "/transactions", id: sharedExpense.id, patch: { name: "Stolen" } },
          { path: "/people", id: connectedPerson.id, patch: { name: "Stolen" } },
          { path: "/accounts", id: ownerAccount.id, patch: { name: "Stolen" } },
          { path: "/cards", id: card.id, patch: { name: "Stolen" } },
        ];
        const ownerBefore: unknown[] = [];
        for (const resource of ownerResources)
          ownerBefore.push(
            await api.data(await api.request(`${resource.path}/${resource.id}`, connectionOwner)),
          );
        for (const resource of ownerResources) {
          const path = `${resource.path}/${resource.id}`;
          await api.error(
            await api.request(path, connectionRecipient, "PATCH", resource.patch),
            404,
          );
          await api.error(await api.request(path, connectionRecipient, "DELETE", {}), 404);
        }
        for (const [index, resource] of ownerResources.entries())
          assert.deepEqual(
            await api.data(await api.request(`${resource.path}/${resource.id}`, connectionOwner)),
            ownerBefore[index],
          );
        for (const override of [
          { accountId: ownerAccount.id },
          { personId: connectionOwner.personId },
        ])
          await api.error(
            await api.request("/transactions", connectionRecipient, "POST", {
              type: "expense",
              paymentMethod: "pix",
              name: "Recipient purchase",
              amount: 10.01,
              purchaseDate: "2020-01-10",
              personId: connectionRecipient.personId,
              categoryId: connectionRecipient.expenseCategoryId,
              accountId: recipientAccount.id,
              ...override,
            }),
            404,
          );
        await api.data(
          await api.request(`/person-connections/${connection.id}`, connectionRecipient, "DELETE"),
        );
        const laterExpense = await api.expense(connectionOwner, { personId: connectedPerson.id });
        const afterRevoke = await api.data<ExternalExpensePageOutput>(
          await api.request("/external-expenses", connectionRecipient),
        );
        assert.equal(
          afterRevoke.items.some((row) => row.sourceTransactionId === laterExpense.id),
          false,
        );
      },
    );
  });
});
