export const aiSubscriptionProviders = ["claude", "codex", "antigravity"] as const;
export type AiSubscriptionProvider = (typeof aiSubscriptionProviders)[number];

export const aiApiKeyProviders = [
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
  "minimax",
  "ollama",
] as const;
export type AiApiKeyProvider = (typeof aiApiKeyProviders)[number];

export const aiProviders = [...aiSubscriptionProviders, ...aiApiKeyProviders] as const;
export type AiProvider = (typeof aiProviders)[number];

/** Subscription providers sign in through a vendor CLI; API-key providers take a pasted key. */
export const aiProviderKinds = ["subscription", "apiKey"] as const;
export type AiProviderKind = (typeof aiProviderKinds)[number];

const apiKeyProviderSet = new Set<AiProvider>(aiApiKeyProviders);

export function isAiApiKeyProvider(provider: AiProvider): provider is AiApiKeyProvider {
  return apiKeyProviderSet.has(provider);
}

export function aiProviderKindOf(provider: AiProvider): AiProviderKind {
  return isAiApiKeyProvider(provider) ? "apiKey" : "subscription";
}

/**
 * How each vendor CLI completes its own sign-in. Claude and Antigravity show a page that hands back
 * a code the person pastes; Codex shows a one-time code the person types on the vendor's page.
 */
export const aiProviderLoginMethods = ["authorizationCode", "deviceCode"] as const;
export type AiProviderLoginMethod = (typeof aiProviderLoginMethods)[number];

export const aiProviderLoginMethodByProvider = {
  claude: "authorizationCode",
  codex: "deviceCode",
  antigravity: "authorizationCode",
} as const satisfies Record<AiSubscriptionProvider, AiProviderLoginMethod>;

export const aiProviderLoginStatuses = ["pending", "connected", "failed", "expired"] as const;
export type AiProviderLoginStatus = (typeof aiProviderLoginStatuses)[number];

/**
 * `unavailable` means the AI service could not be reached, not that the account is signed out.
 * `needsAttention` means a stored API key was refused by its vendor or no longer decrypts.
 */
export const aiProviderStatuses = [
  "connected",
  "disconnected",
  "unavailable",
  "needsAttention",
] as const;
export type AiProviderStatus = (typeof aiProviderStatuses)[number];

export const aiProviderLoginCodeMaximumLength = 512;

/** Model ids travel to a CLI flag, so they never start with a dash and stay short. */
export const aiProviderModelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const aiProviderModelNameMaximumLength = 120;

/** API-key model ids may carry a slash (OpenRouter `vendor/model`, Ollama `hf.co/owner/model`). */
export const aiApiKeyModelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;

export const aiApiKeyMaximumLength = 512;

/** OpenRouter and Ollama serve catalogs the person may extend with ids not listed here. */
export function aiProviderAcceptsCustomModel(provider: AiApiKeyProvider) {
  return provider === "openrouter" || provider === "ollama";
}

/** Ollama runs on the administrator's machine and needs no key. */
export function aiApiKeyRequired(provider: AiApiKeyProvider) {
  return provider !== "ollama";
}

export function isValidAiApiKeyModelId(provider: AiApiKeyProvider, modelId: string) {
  if (!aiApiKeyModelIdPattern.test(modelId) || modelId.includes("..")) return false;
  if (provider === "openrouter") return modelId.split("/").length === 2;
  return true;
}

/** Trims the pasted key. Returns null when it is empty, has inner spaces or is too long. */
export function normalizeAiApiKey(value: string): string | null {
  const key = value.trim();
  if (!key || key.length > aiApiKeyMaximumLength || /\s/.test(key)) return null;
  return key;
}
