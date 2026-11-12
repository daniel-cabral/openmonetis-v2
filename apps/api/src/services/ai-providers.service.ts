import {
  type AiApiKeyProvider,
  type AiProvider,
  type AiProviderLoginMethod,
  type AiProviderLoginStatus,
  aiApiKeyRequired,
  aiProviderAcceptsCustomModel,
  aiProviderKindOf,
  aiProviders,
  isAiApiKeyProvider,
  isValidAiApiKeyModelId,
  normalizeAiApiKey,
} from "@openmonetis/domain/ai-providers";
import type {
  AiProviderLoginOutput,
  AiProviderModel,
  AiProviderOutput,
  AiProvidersOutput,
  SaveAiProviderKeyInput,
  StartAiProviderLoginInput,
  SubmitAiProviderLoginCodeInput,
  UpdateAiProviderInput,
} from "@openmonetis/validators/ai-providers";
import type { AiKeyCipher } from "../utils/ai-key-cipher";
import {
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  unprocessable,
} from "../utils/errors";

export type AiProviderLogin = {
  loginId: string;
  provider: AiProvider;
  method: AiProviderLoginMethod;
  status: AiProviderLoginStatus;
  verificationUrl: string | null;
  userCode: string | null;
  expiresAt: string;
};

/** A live subscription sign-in; `email` is `null` when the vendor CLI does not report it. */
export type AiProviderAccount = { email: string | null };

/** The API-side view of a key; the AI service receives it only in the body of a call. */
export type AiProviderCredential = { apiKey: string | null };

export type ApiKeyModelsResult =
  | { status: "ok"; models: AiProviderModel[] }
  | {
      status: "failed";
      code: "providerDisconnected" | "providerLimitReached" | "providerUnavailable";
    };

/** The internal AI service, which runs each vendor's own CLI sign-in in the user's home. */
export type AiProvidersGateway = {
  enabled: boolean;
  /** The signed-in account, or `null` when the provider is disconnected. */
  readAccount(userId: string, provider: AiProvider): Promise<AiProviderAccount | null>;
  listModels(userId: string, provider: AiProvider): Promise<AiProviderModel[]>;
  disconnect(userId: string, provider: AiProvider): Promise<void>;
  startLogin(userId: string, provider: AiProvider): Promise<AiProviderLogin>;
  getLogin(userId: string, provider: AiProvider, loginId: string): Promise<AiProviderLogin | null>;
  submitLoginCode(
    userId: string,
    provider: AiProvider,
    loginId: string,
    code: string,
  ): Promise<AiProviderLogin | null>;
  /** Lists the vendor's models with the key, which also validates it. */
  listApiKeyModels(
    provider: AiApiKeyProvider,
    credential: AiProviderCredential,
  ): Promise<ApiKeyModelsResult>;
  /** `false` when the administrator has not configured Ollama or it does not answer. */
  isOllamaAvailable(): Promise<boolean>;
};

export type AiProviderConnectionRecord = {
  provider: AiProvider;
  consentedAt: Date;
  preferredModel: string | null;
};

export type AiProvidersRepository = {
  listByUser(userId: string): Promise<AiProviderConnectionRecord[]>;
  saveConsent(userId: string, provider: AiProvider, consentedAt: Date): Promise<void>;
  savePreferredModel(
    userId: string,
    provider: AiProvider,
    preferredModel: string | null,
  ): Promise<boolean>;
  deleteForUser(userId: string, provider: AiProvider): Promise<void>;
};

export type AiProviderCredentialRecord = {
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
  AiProviderCredentialRecord,
  "provider" | "last4" | "secretFingerprint" | "refusedAt"
>;

export type AiProviderCredentialsRepository = {
  findForUser(userId: string, provider: AiProvider): Promise<AiProviderCredentialRecord | null>;
  listForUser(userId: string): Promise<AiProviderCredentialSummary[]>;
  upsert(
    userId: string,
    provider: AiProvider,
    sealed: Pick<
      AiProviderCredentialRecord,
      "ciphertext" | "nonce" | "authTag" | "last4" | "secretFingerprint" | "rotatedAt"
    >,
  ): Promise<void>;
  markRefused(userId: string, provider: AiProvider, refusedAt: Date): Promise<void>;
  deleteForUser(userId: string, provider: AiProvider): Promise<void>;
};

/** Unavailable unless both the cipher and the repository are wired (AI_KEYS_SECRET is set). */
export type AiProviderKeyOptions = {
  credentials?: AiProviderCredentialsRepository;
  cipher?: AiKeyCipher | null;
};

/** The output fields of a provider, before its live status is known. */
const subscriptionFields = {
  kind: "subscription",
  keyLast4: null,
  acceptsCustomModel: false,
  keyRequired: false,
} as const;

export function createAiProvidersService(
  repository: AiProvidersRepository,
  gateway: AiProvidersGateway,
  options: { now?: () => Date } & AiProviderKeyOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const credentials = options.credentials;
  const cipher = options.cipher ?? null;
  const keysAvailable = gateway.enabled && Boolean(credentials && cipher);

  function requireEnabled() {
    if (!gateway.enabled) {
      throw serviceUnavailable("AI features are not enabled", "ai_disabled");
    }
  }

  function requireKeys() {
    requireEnabled();
    if (!keysAvailable) {
      throw serviceUnavailable("API keys are not enabled", "ai_keys_unavailable");
    }
  }

  async function reach<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error("AI service request failed", error);
      throw serviceUnavailable("AI service unavailable", "ai_service_unavailable");
    }
  }

  function aadOf(userId: string, provider: AiProvider) {
    return `${userId}:${provider}`;
  }

  /** Decrypts a stored key; `null` when the secret rotated or the row was tampered with. */
  function openKey(userId: string, record: AiProviderCredentialRecord) {
    if (!cipher) return null;
    return cipher.decrypt(
      { ciphertext: record.ciphertext, nonce: record.nonce, authTag: record.authTag },
      aadOf(userId, record.provider),
    );
  }

  async function describe(
    userId: string,
    provider: AiProvider,
    connection: AiProviderConnectionRecord | undefined,
  ): Promise<AiProviderOutput> {
    const base = { provider, models: [], accountEmail: null, ...subscriptionFields };
    if (!connection) {
      return { ...base, status: "disconnected", consentedAt: null, preferredModel: null };
    }
    const known = {
      ...base,
      consentedAt: connection.consentedAt.toISOString(),
      preferredModel: connection.preferredModel,
    };
    try {
      const account = await gateway.readAccount(userId, provider);
      if (!account) return { ...known, status: "disconnected" };
      const models = await gateway.listModels(userId, provider).catch(() => []);
      return { ...known, status: "connected", models, accountEmail: account.email };
    } catch {
      return { ...known, status: "unavailable" };
    }
  }

  /** Models of an API-key provider with the stored key; empty when the key is missing or refused. */
  async function apiKeyCatalog(userId: string, provider: AiApiKeyProvider) {
    const record = credentials ? await credentials.findForUser(userId, provider) : null;
    const apiKey = record ? openKey(userId, record) : null;
    if (provider !== "ollama" && !apiKey) return [];
    const result = await reach(() => gateway.listApiKeyModels(provider, { apiKey }));
    return result.status === "ok" ? result.models : [];
  }

  async function describeApiKey(
    userId: string,
    provider: AiApiKeyProvider,
    connection: AiProviderConnectionRecord | undefined,
    summary: AiProviderCredentialSummary | undefined,
  ): Promise<AiProviderOutput> {
    const base = {
      provider,
      kind: aiProviderKindOf(provider),
      accountEmail: null,
      acceptsCustomModel: aiProviderAcceptsCustomModel(provider),
      keyRequired: aiApiKeyRequired(provider),
      consentedAt: connection?.consentedAt.toISOString() ?? null,
      preferredModel: connection?.preferredModel ?? null,
    };
    const unconnected = { ...base, keyLast4: null, models: [] };

    if (provider === "ollama" && !summary) {
      // Keyless Ollama needs only the administrator's address, not the key cipher.
      const available = gateway.enabled && (await gateway.isOllamaAvailable().catch(() => false));
      if (!connection || !available) return { ...unconnected, status: "disconnected" };
      return { ...unconnected, status: "connected", models: await apiKeyCatalog(userId, provider) };
    }
    if (!keysAvailable) return { ...unconnected, status: "unavailable" };
    if (!summary) return { ...unconnected, status: "disconnected" };

    const stale = summary.refusedAt !== null || summary.secretFingerprint !== cipher?.fingerprint;
    const attention = { ...base, keyLast4: summary.last4, models: [] };
    if (stale) return { ...attention, status: "needsAttention" };
    const record = await credentials?.findForUser(userId, provider);
    if (!record || openKey(userId, record) === null) {
      return { ...attention, status: "needsAttention" };
    }
    return {
      ...attention,
      status: "connected",
      models: await apiKeyCatalog(userId, provider),
    };
  }

  async function describeOne(userId: string, provider: AiProvider): Promise<AiProviderOutput> {
    const connection = await connectionOf(userId, provider);
    if (!isAiApiKeyProvider(provider)) return describe(userId, provider, connection);
    const summary =
      gateway.enabled && credentials
        ? (await credentials.listForUser(userId)).find((item) => item.provider === provider)
        : undefined;
    return describeApiKey(userId, provider, connection, summary);
  }

  async function connectionOf(userId: string, provider: AiProvider) {
    const connections = await repository.listByUser(userId);
    return connections.find((connection) => connection.provider === provider);
  }

  async function requireCatalogModel(userId: string, provider: AiProvider, model: string) {
    const models = await catalogOf(userId, provider);
    if (!models.some((item) => item.id === model)) {
      throw badRequest("Model not available for this account", "ai_model_unavailable");
    }
  }

  async function catalogOf(userId: string, provider: AiProvider) {
    if (isAiApiKeyProvider(provider)) return apiKeyCatalog(userId, provider);
    return reach(() => gateway.listModels(userId, provider));
  }

  /** Validates a custom or catalog model id for an API-key provider. */
  async function requireApiKeyModel(userId: string, provider: AiApiKeyProvider, model: string) {
    if (!isValidAiApiKeyModelId(provider, model)) {
      throw badRequest("Invalid model id", "ai_model_invalid");
    }
    if (aiProviderAcceptsCustomModel(provider)) return;
    await requireCatalogModel(userId, provider, model);
  }

  /** Maps a refused, rate-limited or unreachable key validation to the contract's errors. */
  function keyValidationError(
    code: "providerDisconnected" | "providerLimitReached" | "providerUnavailable",
  ) {
    if (code === "providerDisconnected") {
      return unprocessable("The provider refused the key", "ai_provider_key_refused");
    }
    if (code === "providerLimitReached") {
      return tooManyRequests("The provider limit was reached", "ai_provider_limit_reached");
    }
    return serviceUnavailable("Provider unavailable", "ai_provider_unavailable");
  }

  return {
    async list(userId: string): Promise<AiProvidersOutput> {
      const connections = gateway.enabled ? await repository.listByUser(userId) : [];
      const summaries = gateway.enabled && credentials ? await credentials.listForUser(userId) : [];
      const ollamaAvailable =
        gateway.enabled && (await gateway.isOllamaAvailable().catch(() => false));

      const described = await Promise.all(
        aiProviders.map((provider) => {
          const connection = connections.find((item) => item.provider === provider);
          if (!isAiApiKeyProvider(provider)) return describe(userId, provider, connection);
          const summary = summaries.find((item) => item.provider === provider);
          return describeApiKey(userId, provider, connection, summary);
        }),
      );
      // Ollama is listed only when the administrator configured it and it answers.
      const items = described.filter((item) => item.provider !== "ollama" || ollamaAvailable);
      return { enabled: gateway.enabled, items };
    },

    async update(
      userId: string,
      provider: AiProvider,
      input: UpdateAiProviderInput,
    ): Promise<AiProviderOutput> {
      requireEnabled();
      const connection = await connectionOf(userId, provider);
      if (!connection) throw conflict("Connect the AI provider first", "ai_provider_not_connected");
      if (input.preferredModel) {
        if (isAiApiKeyProvider(provider)) {
          await requireApiKeyModel(userId, provider, input.preferredModel);
        } else {
          await requireCatalogModel(userId, provider, input.preferredModel);
        }
      }
      await repository.savePreferredModel(userId, provider, input.preferredModel);
      return describeOne(userId, provider);
    },

    /** Validates a key with the vendor before storing it; a refused key keeps the previous one. */
    async saveKey(
      userId: string,
      provider: AiProvider,
      input: SaveAiProviderKeyInput,
    ): Promise<AiProviderOutput> {
      if (!isAiApiKeyProvider(provider)) {
        throw badRequest("Sign in with the provider CLI instead", "ai_provider_not_api_key");
      }
      requireEnabled();
      const apiKey = input.apiKey === undefined ? null : normalizeAiApiKey(input.apiKey);
      if (aiApiKeyRequired(provider) && !apiKey) {
        throw badRequest("Invalid API key", "ai_key_invalid");
      }

      if (provider === "ollama" && !apiKey) {
        // Keyless Ollama stores no secret: a previous key is removed and only consent is recorded.
        if (!(await reach(() => gateway.isOllamaAvailable()))) {
          throw serviceUnavailable("Provider unavailable", "ai_provider_unavailable");
        }
        await credentials?.deleteForUser(userId, provider);
        await repository.saveConsent(userId, provider, now());
        return describeOne(userId, provider);
      }

      requireKeys();
      if (!apiKey || !cipher || !credentials) {
        throw badRequest("Invalid API key", "ai_key_invalid");
      }
      const result = await reach(() => gateway.listApiKeyModels(provider, { apiKey }));
      if (result.status === "failed") throw keyValidationError(result.code);

      const sealed = cipher.encrypt(apiKey, aadOf(userId, provider));
      await credentials.upsert(userId, provider, {
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        authTag: sealed.authTag,
        last4: apiKey.slice(-4),
        secretFingerprint: cipher.fingerprint,
        rotatedAt: now(),
      });
      await repository.saveConsent(userId, provider, now());
      return describeOne(userId, provider);
    },

    /** Flags a stored key the vendor refused during a run, so the person replaces it. */
    async markKeyRefused(userId: string, provider: AiProvider): Promise<void> {
      if (!isAiApiKeyProvider(provider) || !credentials) return;
      await credentials.markRefused(userId, provider, now());
    },

    async disconnect(userId: string, provider: AiProvider): Promise<AiProviderOutput> {
      requireEnabled();
      if (isAiApiKeyProvider(provider)) {
        await credentials?.deleteForUser(userId, provider);
        await repository.deleteForUser(userId, provider);
        return describeOne(userId, provider);
      }
      await reach(() => gateway.disconnect(userId, provider));
      await repository.deleteForUser(userId, provider);
      return describe(userId, provider, undefined);
    },

    async startLogin(
      userId: string,
      provider: AiProvider,
      _input: StartAiProviderLoginInput,
    ): Promise<AiProviderLoginOutput> {
      requireEnabled();
      if (isAiApiKeyProvider(provider)) {
        throw badRequest(
          "Save an API key for this provider instead",
          "ai_provider_not_subscription",
        );
      }
      await repository.saveConsent(userId, provider, now());
      return reach(() => gateway.startLogin(userId, provider));
    },

    async getLogin(
      userId: string,
      provider: AiProvider,
      loginId: string,
    ): Promise<AiProviderLoginOutput> {
      requireEnabled();
      const login = await reach(() => gateway.getLogin(userId, provider, loginId));
      if (!login) throw notFound("Sign-in not found", "ai_login_not_found");
      return login;
    },

    async submitLoginCode(
      userId: string,
      provider: AiProvider,
      loginId: string,
      input: SubmitAiProviderLoginCodeInput,
    ): Promise<AiProviderLoginOutput> {
      requireEnabled();
      const login = await reach(() =>
        gateway.submitLoginCode(userId, provider, loginId, input.code),
      );
      if (!login) throw notFound("Sign-in not found", "ai_login_not_found");
      return login;
    },

    /**
     * Confirms a provider can run a diagnosis or chat and resolves the model: the one requested,
     * else the preferred one, else the first catalog item. API-key providers also return the key
     * for this single call; it is never stored by the caller.
     */
    async prepareRun(userId: string, provider: AiProvider, requestedModel?: string | null) {
      const connection = gateway.enabled ? await connectionOf(userId, provider) : undefined;
      if (isAiApiKeyProvider(provider)) {
        return prepareApiKeyRun(userId, provider, connection, requestedModel);
      }
      if (!connection || !(await reach(() => gateway.readAccount(userId, provider)))) {
        throw conflict(
          "Connect the AI provider before requesting a diagnosis",
          "ai_provider_not_connected",
        );
      }
      if (requestedModel) {
        await requireCatalogModel(userId, provider, requestedModel);
        return { model: requestedModel };
      }
      // A preferred model the account lost access to falls back to the plan default.
      const preferred = connection.preferredModel;
      const models = preferred ? await reach(() => gateway.listModels(userId, provider)) : [];
      return { model: models.some((item) => item.id === preferred) ? preferred : null };
    },
  };

  async function prepareApiKeyRun(
    userId: string,
    provider: AiApiKeyProvider,
    connection: AiProviderConnectionRecord | undefined,
    requestedModel: string | null | undefined,
  ): Promise<{ model: string | null; credential: AiProviderCredential }> {
    if (!connection) {
      throw conflict(
        "Connect the AI provider before requesting a diagnosis",
        "ai_provider_not_connected",
      );
    }
    const record =
      keysAvailable && credentials ? await credentials.findForUser(userId, provider) : null;
    let apiKey: string | null = null;
    if (record) {
      apiKey = record.refusedAt === null ? openKey(userId, record) : null;
      if (!apiKey) {
        throw conflict(
          "Replace the API key before requesting a diagnosis",
          "ai_provider_not_connected",
        );
      }
    } else if (provider !== "ollama" || !(await gateway.isOllamaAvailable().catch(() => false))) {
      throw conflict(
        "Connect the AI provider before requesting a diagnosis",
        "ai_provider_not_connected",
      );
    }

    if (requestedModel) {
      await requireApiKeyModel(userId, provider, requestedModel);
      return { model: requestedModel, credential: { apiKey } };
    }
    const preferred = connection.preferredModel;
    if (preferred && isValidAiApiKeyModelId(provider, preferred)) {
      const models = await apiKeyCatalog(userId, provider);
      if (aiProviderAcceptsCustomModel(provider) || models.some((item) => item.id === preferred)) {
        return { model: preferred, credential: { apiKey } };
      }
    }
    const models = await apiKeyCatalog(userId, provider);
    return { model: models[0]?.id ?? null, credential: { apiKey } };
  }
}

export type AiProvidersService = ReturnType<typeof createAiProvidersService>;
