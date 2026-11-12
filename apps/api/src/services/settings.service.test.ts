import assert from "node:assert/strict";
import test from "node:test";
import { defaultAdminPersonAvatarUrl } from "@openmonetis/domain/people";
import {
  createSettingsService,
  type SettingsRepository,
  type SettingsResetDraft,
} from "./settings.service";

for (const action of ["reset", "delete"] as const) {
  function fixture() {
    const calls: string[] = [];
    const repository: SettingsRepository = {
      findUserById: async () => ({
        id: "owner",
        name: "Owner",
        email: "owner@example.test",
        image: null,
      }),
      hasPasswordCredentialForUser: async () => true,
      findAccountEmailStateForUser: async () => null,
      isEmailUsedByAnotherUser: async () => false,
      changeEmailForUser: async () => false,
      listAttachmentFileKeysByUser: async (id) => {
        assert.equal(id, "owner");
        return [
          "pending/one",
          "deleting/pending/one",
          "attachments/two",
          "deleting/attachments/two",
        ];
      },
      resetForUser: async () => {
        calls.push("database");
        return true;
      },
      deleteForUser: async () => {
        calls.push("database");
        return true;
      },
    };
    const storage = {
      enabled: true,
      remove: async (key: string) => {
        calls.push(key);
      },
    };
    const service = createSettingsService(repository, storage);
    const invoke = (confirmation = action === "reset" ? "ZERAR" : "EXCLUIR") =>
      action === "reset"
        ? service.reset({ confirmation } as Parameters<typeof service.reset>[0], "owner")
        : service.deleteAccount(
            { confirmation } as Parameters<typeof service.deleteAccount>[0],
            "owner",
          );
    return { calls, repository, storage, invoke };
  }
  test(`${action} removes distinct owned storage keys before changing database records`, async () => {
    const f = fixture();
    await f.invoke();
    assert.deepEqual(f.calls, ["pending/one", "attachments/one", "attachments/two", "database"]);
  });
  test(`${action} stops before database changes if storage is unavailable or deletion fails`, async () => {
    const f = fixture();
    f.storage.enabled = false;
    await assert.rejects(f.invoke(), { code: "attachment_storage_unavailable" });
    assert.deepEqual(f.calls, []);
    f.storage.enabled = true;
    f.storage.remove = async () => {
      throw new Error("storage offline");
    };
    await assert.rejects(f.invoke(), /storage offline/);
    assert.deepEqual(f.calls, []);
  });
  test(`${action} requires exact confirmation and an existing authenticated user`, async () => {
    const f = fixture();
    await assert.rejects(f.invoke("invalid"));
    assert.deepEqual(f.calls, []);
    f.repository.findUserById = async () => null;
    await assert.rejects(f.invoke(), { code: "user_not_found" });
    assert.deepEqual(f.calls, []);
  });
}

test("resets the admin person with the default avatar", async () => {
  const resetDrafts: SettingsResetDraft[] = [];
  const repository: SettingsRepository = {
    findUserById: async () => ({
      id: "user-1",
      name: "Admin",
      email: "admin@example.com",
      image: "/avatars/custom.png",
      providerAvatarUrl: "https://example.com/provider-avatar.png",
    }),
    hasPasswordCredentialForUser: async () => true,
    findAccountEmailStateForUser: async () => null,
    isEmailUsedByAnotherUser: async () => false,
    changeEmailForUser: async () => false,
    listAttachmentFileKeysByUser: async () => [],
    resetForUser: async (_userId, draft) => {
      resetDrafts.push(draft);
      return true;
    },
    deleteForUser: async () => true,
  };
  const service = createSettingsService(repository, {
    enabled: true,
    remove: async () => undefined,
  });

  await service.reset({ confirmation: "ZERAR" }, "user-1");

  const [resetDraft] = resetDrafts;
  assert.ok(resetDraft);
  assert.equal(resetDraft.admin.avatarUrl, defaultAdminPersonAvatarUrl);
  assert.equal(resetDraft.admin.status, "active");
});

test("reports whether password changes are available", async () => {
  const repository: SettingsRepository = {
    findUserById: async () => null,
    hasPasswordCredentialForUser: async (userId) => userId === "password-user",
    findAccountEmailStateForUser: async () => null,
    isEmailUsedByAnotherUser: async () => false,
    changeEmailForUser: async () => false,
    listAttachmentFileKeysByUser: async () => [],
    resetForUser: async () => false,
    deleteForUser: async () => false,
  };
  const service = createSettingsService(repository, {
    enabled: true,
    remove: async () => undefined,
  });

  assert.deepEqual(await service.getSecurity("password-user"), {
    passwordChangeAvailable: true,
  });
  assert.deepEqual(await service.getSecurity("google-user"), {
    passwordChangeAvailable: false,
  });
});
