import { createAnthropicAdapter } from "./anthropic";
import type { ApiKeyAdapters, FetchLike } from "./api-key-provider";
import { createOpenAiCompatibleAdapter } from "./openai-compatible";

const unsupportedOpenAiModelPattern =
  /embedding|tts|whisper|dall-e|moderation|image|audio|realtime|transcribe/;

export type ApiKeyAdapterOptions = {
  fetch?: FetchLike;
  /** Read per call: Ollama is available only when the administrator configured its address. */
  ollamaBaseUrl?: () => string | null;
};

/** Ollama's OpenAI-compatible API lives under `/v1`; the variable may omit it. */
export function ollamaBaseUrlOf(configured: string | undefined): string | null {
  const value = configured?.trim().replace(/\/+$/, "");
  if (!value) return null;
  return value.endsWith("/v1") ? value : `${value}/v1`;
}

/** The six API-key vendors, each with its wire format, catalog fallback and key rules. */
export function createApiKeyAdapters(options: ApiKeyAdapterOptions = {}): ApiKeyAdapters {
  return {
    anthropic: createAnthropicAdapter({ fetch: options.fetch }),
    openai: createOpenAiCompatibleAdapter({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      fallbackModels: [
        { id: "gpt-5.5", name: "GPT-5.5", isDefault: true },
        { id: "gpt-5.4", name: "GPT-5.4", isDefault: false },
        { id: "gpt-5.4-mini", name: "GPT-5.4 mini", isDefault: false },
      ],
      jsonMode: true,
      validateWithChat: false,
      unsupportedModelPattern: unsupportedOpenAiModelPattern,
      fetch: options.fetch,
    }),
    gemini: createOpenAiCompatibleAdapter({
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      fallbackModels: [
        { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", isDefault: true },
        { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", isDefault: false },
      ],
      jsonMode: true,
      validateWithChat: false,
      fetch: options.fetch,
    }),
    openrouter: createOpenAiCompatibleAdapter({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      fallbackModels: [],
      jsonMode: true,
      validateWithChat: false,
      fetch: options.fetch,
    }),
    minimax: createOpenAiCompatibleAdapter({
      provider: "minimax",
      baseUrl: "https://api.minimax.io/v1",
      fallbackModels: [
        { id: "MiniMax-M2.7", name: "MiniMax M2.7", isDefault: true },
        { id: "MiniMax-M2.5", name: "MiniMax M2.5", isDefault: false },
      ],
      jsonMode: false,
      validateWithChat: true,
      fetch: options.fetch,
    }),
    ollama: createOpenAiCompatibleAdapter({
      provider: "ollama",
      baseUrl: options.ollamaBaseUrl ?? (() => ollamaBaseUrlOf(process.env.OLLAMA_BASE_URL)),
      fallbackModels: [],
      jsonMode: false,
      validateWithChat: false,
      fetch: options.fetch,
    }),
  };
}
