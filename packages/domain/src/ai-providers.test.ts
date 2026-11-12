import assert from "node:assert/strict";
import test from "node:test";
import {
  aiApiKeyRequired,
  aiProviderAcceptsCustomModel,
  aiProviderKindOf,
  isAiApiKeyProvider,
  isValidAiApiKeyModelId,
  normalizeAiApiKey,
} from "./ai-providers";

const apiKeyProviders = ["anthropic", "openai", "gemini", "openrouter", "minimax", "ollama"] as const;
const subscriptionProviders = ["claude", "codex", "antigravity"] as const;

test("every provider has exactly one connection kind", () => {
  for (const provider of subscriptionProviders) {
    assert.equal(aiProviderKindOf(provider), "subscription");
    assert.equal(isAiApiKeyProvider(provider), false);
  }
  for (const provider of apiKeyProviders) {
    assert.equal(aiProviderKindOf(provider), "apiKey");
    assert.equal(isAiApiKeyProvider(provider), true);
  }
});

test("custom model ids and optional keys are allowed only where the provider takes them", () => {
  assert.equal(aiProviderAcceptsCustomModel("openrouter"), true);
  assert.equal(aiProviderAcceptsCustomModel("ollama"), true);
  assert.equal(aiProviderAcceptsCustomModel("openai"), false);
  assert.equal(aiApiKeyRequired("ollama"), false);
  assert.equal(aiApiKeyRequired("openai"), true);
});

test("model ids are checked against the pattern, the double-dot rule and the OpenRouter slash rule", () => {
  assert.equal(isValidAiApiKeyModelId("openai", "gpt-5.5"), true);
  assert.equal(isValidAiApiKeyModelId("openrouter", "anthropic/claude-sonnet-4.6"), true);
  assert.equal(isValidAiApiKeyModelId("ollama", "hf.co/x/y:q4"), true);

  assert.equal(isValidAiApiKeyModelId("openai", "-x"), false);
  assert.equal(isValidAiApiKeyModelId("openai", "a..b"), false);
  assert.equal(isValidAiApiKeyModelId("openai", "a b"), false);
  assert.equal(isValidAiApiKeyModelId("openrouter", "a/b/c"), false);
  assert.equal(isValidAiApiKeyModelId("openai", "a".repeat(81)), false);
});

test("API keys are trimmed and rejected when empty, containing spaces or oversized", () => {
  assert.equal(normalizeAiApiKey("  sk-abc\n"), "sk-abc");
  assert.equal(normalizeAiApiKey(""), null);
  assert.equal(normalizeAiApiKey("   "), null);
  assert.equal(normalizeAiApiKey("sk a"), null);
  assert.equal(normalizeAiApiKey("k".repeat(513)), null);
});
