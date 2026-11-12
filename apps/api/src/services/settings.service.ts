import {
  type CategoryCreateDraft,
  createDefaultCategoryDrafts,
} from "@openmonetis/domain/categories";
import {
  type AdminPersonDraft,
  type AuthenticatedUser,
  createAdminPersonDraft,
} from "@openmonetis/domain/people";
import {
  assertSettingsConfirmation,
  isFreshSession,
  isSameAccountEmail,
} from "@openmonetis/domain/settings";
import type {
  ChangeAccountEmailInput,
  ChangeAccountEmailOutput,
  DeleteSettingsAccountInput,
  DeleteSettingsAccountOutput,
  ResetSettingsInput,
  ResetSettingsOutput,
  SettingsSecurityOutput,
} from "@openmonetis/validators/settings";
import { badRequest, forbidden, notFound, serviceUnavailable } from "../utils/errors";
import type { AttachmentStorage } from "../utils/storage";

export type SettingsResetDraft = {
  admin: AdminPersonDraft;
  categories: CategoryCreateDraft[];
};

export type AccountEmailState = { email: string; passwordHash: string | null };

export type AccountEmailActor = { userId: string; sessionId: string; sessionCreatedAt: Date };

export type SettingsEmailPorts = {
  verifyPassword(input: { hash: string; password: string }): Promise<boolean>;
  sendEmailVerification(email: string): Promise<boolean>;
};

// Without configured ports, password checks fail closed and no mail is sent.
const unconfiguredEmailPorts: SettingsEmailPorts = {
  verifyPassword: async () => false,
  sendEmailVerification: async () => false,
};

export type SettingsRepository = {
  findUserById(userId: string): Promise<AuthenticatedUser | null>;
  hasPasswordCredentialForUser(userId: string): Promise<boolean>;
  findAccountEmailStateForUser(userId: string): Promise<AccountEmailState | null>;
  isEmailUsedByAnotherUser(email: string, userId: string): Promise<boolean>;
  changeEmailForUser(userId: string, email: string, keepSessionId: string): Promise<boolean>;
  listAttachmentFileKeysByUser(userId: string): Promise<string[]>;
  resetForUser(userId: string, draft: SettingsResetDraft): Promise<boolean>;
  deleteForUser(userId: string): Promise<boolean>;
};

export function createSettingsService(
  repository: SettingsRepository,
  storage: Pick<AttachmentStorage, "enabled" | "remove">,
  emailPorts: SettingsEmailPorts = unconfiguredEmailPorts,
) {
  async function removeAttachmentObjects(userId: string) {
    const fileKeys = await repository.listAttachmentFileKeysByUser(userId);
    const storageKeys = [...new Set(fileKeys.flatMap(getAttachmentStorageKeys))];
    if (storageKeys.length > 0 && !storage.enabled) {
      throw serviceUnavailable(
        "Attachment storage is not configured",
        "attachment_storage_unavailable",
      );
    }

    for (const storageKey of storageKeys) {
      await storage.remove(storageKey);
    }
  }

  return {
    async getSecurity(userId: string): Promise<SettingsSecurityOutput> {
      return {
        passwordChangeAvailable: await repository.hasPasswordCredentialForUser(userId),
      };
    },

    async changeEmail(
      input: ChangeAccountEmailInput,
      actor: AccountEmailActor,
    ): Promise<ChangeAccountEmailOutput> {
      const state = await repository.findAccountEmailStateForUser(actor.userId);
      if (!state) throw notFound("User not found", "user_not_found");
      if (isSameAccountEmail(state.email, input.newEmail)) {
        throw badRequest("Email unchanged", "email_unchanged");
      }

      if (state.passwordHash) {
        const passwordMatches =
          input.currentPassword !== undefined &&
          (await emailPorts.verifyPassword({
            hash: state.passwordHash,
            password: input.currentPassword,
          }));
        if (!passwordMatches) throw badRequest("Email change rejected", "email_change_rejected");
      } else if (!isFreshSession(actor.sessionCreatedAt, new Date())) {
        throw forbidden("Fresh session required", "fresh_session_required");
      }

      if (await repository.isEmailUsedByAnotherUser(input.newEmail, actor.userId)) {
        throw badRequest("Email change rejected", "email_change_rejected");
      }
      const changed = await repository.changeEmailForUser(
        actor.userId,
        input.newEmail,
        actor.sessionId,
      );
      if (!changed) throw badRequest("Email change rejected", "email_change_rejected");

      let verificationEmailSent = false;
      try {
        verificationEmailSent = await emailPorts.sendEmailVerification(input.newEmail);
      } catch {
        console.error("[Settings] Failed to send email verification");
      }
      return { email: input.newEmail, verificationEmailSent };
    },

    async reset(input: ResetSettingsInput, userId: string): Promise<ResetSettingsOutput> {
      assertSettingsConfirmation("reset", input.confirmation);
      const user = await repository.findUserById(userId);
      if (!user) throw notFound("User not found", "user_not_found");

      await removeAttachmentObjects(userId);
      const reset = await repository.resetForUser(userId, {
        admin: createAdminPersonDraft(user),
        categories: createDefaultCategoryDrafts(userId),
      });
      if (!reset) throw notFound("User not found", "user_not_found");

      return { reset: true };
    },

    async deleteAccount(
      input: DeleteSettingsAccountInput,
      userId: string,
    ): Promise<DeleteSettingsAccountOutput> {
      assertSettingsConfirmation("delete", input.confirmation);
      const user = await repository.findUserById(userId);
      if (!user) throw notFound("User not found", "user_not_found");

      await removeAttachmentObjects(userId);
      const deleted = await repository.deleteForUser(userId);
      if (!deleted) throw notFound("User not found", "user_not_found");

      return { deleted: true };
    },
  };
}

function getAttachmentStorageKeys(fileKey: string) {
  const storageKey = fileKey.startsWith("deleting/") ? fileKey.slice("deleting/".length) : fileKey;
  if (!storageKey) return [];
  if (!storageKey.startsWith("pending/")) return [storageKey];

  const uploadId = storageKey.slice("pending/".length);
  return uploadId ? [storageKey, `attachments/${uploadId}`] : [storageKey];
}

export type SettingsService = ReturnType<typeof createSettingsService>;
