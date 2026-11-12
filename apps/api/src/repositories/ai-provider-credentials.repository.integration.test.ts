import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withIntegrationDatabase } from "../test-support/integration-database";

const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url));
const plainKey = "sk-proj-integration-key-9876";

test("API keys stay isolated per user, are replaced on save and go with the user's data", {
  skip: process.env.AI_PROVIDER_CREDENTIALS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(
    async () => {
      const { db, user, aiProviderCredentials, aiProviderConnections } = await import(
        "@openmonetis/db"
      );
      const { eq, sql } = await import("drizzle-orm");
      const { createAiKeyCipher } = await import("../utils/ai-key-cipher");
      const { aiProviderCredentialsRepository } = await import(
        "./ai-provider-credentials.repository"
      );
      const { settingsRepository } = await import("./settings.repository");
      const { createAdminPersonDraft } = await import("@openmonetis/domain/people");
      const { createDefaultCategoryDrafts } = await import("@openmonetis/domain/categories");
      const cipher = createAiKeyCipher("integration-ai-keys-secret-with-32-chars");
      const [owner, other] = await db
        .insert(user)
        .values([
          { name: "Owner", email: "owner@example.test" },
          { name: "Other", email: "other@example.test" },
        ])
        .returning();
      const sealFor = (userId: string, value: string) => {
        const sealed = cipher.encrypt(value, `${userId}:openai`);
        return {
          ciphertext: sealed.ciphertext,
          nonce: sealed.nonce,
          authTag: sealed.authTag,
          last4: value.slice(-4),
          secretFingerprint: cipher.fingerprint,
          rotatedAt: new Date(),
        };
      };

      await t.test("a key saved for one user is invisible to another", async () => {
        await aiProviderCredentialsRepository.upsert(
          owner.id,
          "openai",
          sealFor(owner.id, plainKey),
        );

        assert.equal(await aiProviderCredentialsRepository.findForUser(other.id, "openai"), null);
        assert.deepEqual(await aiProviderCredentialsRepository.listForUser(other.id), []);
      });

      await t.test("a second save replaces the row and clears the refusal", async () => {
        await aiProviderCredentialsRepository.markRefused(owner.id, "openai", new Date());
        await aiProviderCredentialsRepository.upsert(
          owner.id,
          "openai",
          sealFor(owner.id, "sk-proj-replacement-5555"),
        );

        const rows = await aiProviderCredentialsRepository.listForUser(owner.id);
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.last4, "5555");
        assert.equal(rows[0]?.refusedAt, null);
      });

      await t.test("the stored row holds ciphertext, never the key", async () => {
        const rows = await db.select().from(aiProviderCredentials);
        assert.ok(rows.length > 0);
        assert.equal(JSON.stringify(rows).includes(plainKey), false);
        assert.equal(JSON.stringify(rows).includes("sk-proj-replacement-5555"), false);
      });

      await t.test("a settings reset removes the user's keys and connections only", async () => {
        await db.insert(aiProviderConnections).values([
          { userId: owner.id, provider: "openai", consentedAt: new Date() },
          { userId: other.id, provider: "openai", consentedAt: new Date() },
        ]);
        await aiProviderCredentialsRepository.upsert(
          other.id,
          "openai",
          sealFor(other.id, plainKey),
        );

        const reset = await settingsRepository.resetForUser(owner.id, {
          admin: createAdminPersonDraft(owner),
          categories: createDefaultCategoryDrafts(owner.id),
        });

        assert.equal(reset, true);
        assert.deepEqual(await aiProviderCredentialsRepository.listForUser(owner.id), []);
        assert.equal(
          (
            await db
              .select()
              .from(aiProviderConnections)
              .where(eq(aiProviderConnections.userId, owner.id))
          ).length,
          0,
        );
        assert.equal((await aiProviderCredentialsRepository.listForUser(other.id)).length, 1);
        assert.equal(
          (
            await db
              .select()
              .from(aiProviderConnections)
              .where(eq(aiProviderConnections.userId, other.id))
          ).length,
          1,
        );
      });

      await t.test("deleting the user cascades to the stored key", async () => {
        await db.delete(user).where(eq(user.id, other.id));

        const [remaining] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(aiProviderCredentials)
          .where(eq(aiProviderCredentials.userId, other.id));
        assert.equal(remaining?.count, 0);
      });
    },
    { migrationsFolder },
  );
});
