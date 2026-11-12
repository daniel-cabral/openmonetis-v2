import { aiProviderCredentials, db } from "@openmonetis/db";
import type { AiProvider } from "@openmonetis/domain/ai-providers";
import { and, eq } from "drizzle-orm";

export type AiProviderCredentialRow = {
  provider: AiProvider;
  ciphertext: string;
  nonce: string;
  authTag: string;
  last4: string;
  secretFingerprint: string;
  rotatedAt: Date;
  refusedAt: Date | null;
};

export type AiProviderCredentialSummary = Pick<
  AiProviderCredentialRow,
  "provider" | "last4" | "secretFingerprint" | "refusedAt"
>;

export type SealedAiProviderKey = Pick<
  AiProviderCredentialRow,
  "ciphertext" | "nonce" | "authTag" | "last4" | "secretFingerprint" | "rotatedAt"
>;

export const aiProviderCredentialsRepository = {
  async findForUser(userId: string, provider: AiProvider) {
    const [row] = await db
      .select({
        provider: aiProviderCredentials.provider,
        ciphertext: aiProviderCredentials.ciphertext,
        nonce: aiProviderCredentials.nonce,
        authTag: aiProviderCredentials.authTag,
        last4: aiProviderCredentials.last4,
        secretFingerprint: aiProviderCredentials.secretFingerprint,
        rotatedAt: aiProviderCredentials.rotatedAt,
        refusedAt: aiProviderCredentials.refusedAt,
      })
      .from(aiProviderCredentials)
      .where(
        and(eq(aiProviderCredentials.userId, userId), eq(aiProviderCredentials.provider, provider)),
      )
      .limit(1);
    return row ?? null;
  },

  /** Summaries only: the ciphertext never leaves the repository through a list. */
  async listForUser(userId: string) {
    return db
      .select({
        provider: aiProviderCredentials.provider,
        last4: aiProviderCredentials.last4,
        secretFingerprint: aiProviderCredentials.secretFingerprint,
        refusedAt: aiProviderCredentials.refusedAt,
      })
      .from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.userId, userId));
  },

  /** Replaces the stored key and clears any refusal recorded for the previous one. */
  async upsert(userId: string, provider: AiProvider, sealed: SealedAiProviderKey) {
    await db
      .insert(aiProviderCredentials)
      .values({ userId, provider, ...sealed, refusedAt: null })
      .onConflictDoUpdate({
        target: [aiProviderCredentials.userId, aiProviderCredentials.provider],
        set: { ...sealed, refusedAt: null, updatedAt: new Date() },
      });
  },

  async markRefused(userId: string, provider: AiProvider, refusedAt: Date) {
    await db
      .update(aiProviderCredentials)
      .set({ refusedAt })
      .where(
        and(eq(aiProviderCredentials.userId, userId), eq(aiProviderCredentials.provider, provider)),
      );
  },

  async deleteForUser(userId: string, provider: AiProvider) {
    await db
      .delete(aiProviderCredentials)
      .where(
        and(eq(aiProviderCredentials.userId, userId), eq(aiProviderCredentials.provider, provider)),
      );
  },
};
