import {
  type AiApiKeyProvider,
  aiApiKeyRequired,
  isValidAiApiKeyModelId,
} from "@openmonetis/domain/ai-providers";
import type { ChatEvent, ProviderModel, RunFailureCode } from "./provider";

type ProviderFailure = Exclude<RunFailureCode, "invalidOutput">;

import {
  type ApiKeyChatInput,
  type ApiKeyCredential,
  type ApiKeyProviderAdapter,
  type ApiKeyRunInput,
  classifyHttpFailure,
  extractJsonObject,
  type FetchLike,
  isAbortError,
  isPlainObject,
  type ModelsFailureCode,
  type ModelsResult,
  readServerSentData,
  schemaInstruction,
} from "./api-key-provider";

export type OpenAiCompatibleProvider = Exclude<AiApiKeyProvider, "anthropic">;

export type OpenAiCompatibleOptions = {
  provider: OpenAiCompatibleProvider;
  /** A constant, or a read per call for Ollama, whose address the administrator sets. */
  baseUrl: string | (() => string | null);
  /** Served when the vendor has no usable catalog; the first item is the default model. */
  fallbackModels: ProviderModel[];
  /** Asks for JSON through `response_format`; providers without it get the instruction alone. */
  jsonMode: boolean;
  /** MiniMax has no reliable catalog, so a one-token chat call validates the key instead. */
  validateWithChat: boolean;
  /** Catalog ids that cannot hold a chat (embeddings, speech, images). */
  unsupportedModelPattern?: RegExp;
  fetch?: FetchLike;
};

type CompletionResult =
  | { ok: true; json: unknown }
  | { ok: false; code: ModelsFailureCode | "canceled" };

/** Adapter for vendors that speak the OpenAI chat-completions shape. */
export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleOptions,
): ApiKeyProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const resolveBase =
    typeof options.baseUrl === "function" ? options.baseUrl : () => options.baseUrl as string;
  const keyRequired = aiApiKeyRequired(options.provider);
  const defaultModelId = () => options.fallbackModels[0]?.id ?? null;

  function headersFor(credential: ApiKeyCredential): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (credential.apiKey) headers.authorization = `Bearer ${credential.apiKey}`;
    return headers;
  }

  async function complete(
    base: string,
    credential: ApiKeyCredential,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: headersFor(credential),
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      return { ok: false, code: isAbortError(error, signal) ? "canceled" : "providerUnavailable" };
    }
    if (!response.ok) return { ok: false, code: classifyHttpFailure(response.status) };
    return { ok: true, json: await response.json().catch(() => null) };
  }

  function listable(id: string) {
    if (options.fallbackModels.some((model) => model.id === id)) return true;
    if (options.unsupportedModelPattern?.test(id)) return false;
    return isValidAiApiKeyModelId(options.provider, id);
  }

  async function listModels(
    credential: ApiKeyCredential,
    signal?: AbortSignal,
  ): Promise<ModelsResult> {
    const base = resolveBase();
    if (!base) return { status: "failed", code: "providerUnavailable" };
    if (keyRequired && !credential.apiKey)
      return { status: "failed", code: "providerDisconnected" };
    const catalog = { status: "ok" as const, models: options.fallbackModels };

    if (options.validateWithChat) {
      const check = await complete(
        base,
        credential,
        { model: defaultModelId(), max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
        signal,
      );
      if (!check.ok) {
        return {
          status: "failed",
          code: check.code === "canceled" ? "providerUnavailable" : check.code,
        };
      }
      return catalog;
    }

    let response: Response;
    try {
      response = await fetchImpl(`${base}/models`, { headers: headersFor(credential), signal });
    } catch {
      return { status: "failed", code: "providerUnavailable" };
    }
    if (response.status === 404) return catalog;
    if (!response.ok) return { status: "failed", code: classifyHttpFailure(response.status) };

    const body: unknown = await response.json().catch(() => null);
    const ids = isPlainObject(body) && Array.isArray(body.data) ? body.data : [];
    const models = ids
      .map((item) => (isPlainObject(item) && typeof item.id === "string" ? item.id : null))
      .filter((id): id is string => id !== null && listable(id))
      .map((id, index) => ({ id, name: id, isDefault: index === 0 }));
    return { status: "ok", models: models.length ? models : options.fallbackModels };
  }

  /** Resolves the call's base and key rules; returns the failure code when the call cannot start. */
  function preflight(credential: ApiKeyCredential): { base: string } | ProviderFailure {
    const base = resolveBase();
    if (!base) return "providerUnavailable";
    if (keyRequired && !credential.apiKey) return "providerDisconnected";
    return { base };
  }

  return {
    provider: options.provider,
    isAvailable: () => resolveBase() !== null,
    listModels,

    async run(credential, input: ApiKeyRunInput) {
      const ready = preflight(credential);
      if (typeof ready === "string") return { status: "failed", code: ready };
      const model = input.model ?? defaultModelId();
      if (!model) return { status: "failed", code: "runFailed" };

      const body: Record<string, unknown> = {
        model,
        messages: [
          {
            role: "system",
            content: `${input.instructions}\n\n${schemaInstruction(input.schema)}`,
          },
          { role: "user", content: input.prompt },
        ],
      };
      if (options.jsonMode) body.response_format = { type: "json_object" };

      const result = await complete(ready.base, credential, body, input.signal);
      if (!result.ok) return { status: "failed", code: result.code };
      const output = extractJsonObject(completionText(result.json));
      if (!output) return { status: "failed", code: "invalidOutput" };
      return { status: "completed", output, model: { id: model, name: model } };
    },

    async chat(credential, input: ApiKeyChatInput, emit: (event: ChatEvent) => void) {
      const ready = preflight(credential);
      if (typeof ready === "string") return { status: "failed", code: ready };
      const model = input.model ?? defaultModelId();
      if (!model) return { status: "failed", code: "runFailed" };

      let text = "";
      try {
        const response = await fetchImpl(`${ready.base}/chat/completions`, {
          method: "POST",
          headers: headersFor(credential),
          body: JSON.stringify({
            model,
            stream: true,
            messages: [
              { role: "system", content: input.instructions },
              { role: "user", content: input.prompt },
            ],
          }),
          signal: input.signal,
        });
        if (!response.ok) return { status: "failed", code: classifyHttpFailure(response.status) };
        await readServerSentData(response, (payload) => {
          if (payload === "[DONE]") return false;
          const delta = streamedText(payload);
          if (delta) {
            text += delta;
            emit({ type: "delta", text: delta });
          }
          return true;
        });
      } catch (error) {
        return {
          status: "failed",
          code: isAbortError(error, input.signal) ? "canceled" : "providerUnavailable",
        };
      }
      if (input.signal?.aborted) return { status: "failed", code: "canceled" };
      return { status: "completed", text, model: { id: model, name: model } };
    },
  };
}

function completionText(json: unknown): string {
  return choiceField(json, "message");
}

function streamedText(payload: string): string {
  try {
    return choiceField(JSON.parse(payload), "delta");
  } catch {
    return "";
  }
}

/** The `content` of the first choice, under `message` or `delta`; empty when the shape differs. */
function choiceField(json: unknown, field: "message" | "delta"): string {
  if (!isPlainObject(json) || !Array.isArray(json.choices)) return "";
  const choice: unknown = json.choices[0];
  if (!isPlainObject(choice) || !isPlainObject(choice[field])) return "";
  const content = (choice[field] as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}
