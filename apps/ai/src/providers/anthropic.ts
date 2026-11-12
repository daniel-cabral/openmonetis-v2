import { isValidAiApiKeyModelId } from "@openmonetis/domain/ai-providers";
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
  type ModelsResult,
  readServerSentData,
  schemaInstruction,
} from "./api-key-provider";
import type { ChatEvent, ProviderModel } from "./provider";

export const anthropicBaseUrl = "https://api.anthropic.com/v1";
const anthropicVersion = "2023-06-01";
const maximumOutputTokens = 8192;

/** Served when the catalog cannot be listed; the first item is the default model. */
const fallbackModels: ProviderModel[] = [
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", isDefault: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", isDefault: false },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", isDefault: false },
];

export function createAnthropicAdapter(
  options: { fetch?: FetchLike; baseUrl?: string } = {},
): ApiKeyProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const base = options.baseUrl ?? anthropicBaseUrl;

  function headersFor(credential: ApiKeyCredential): Record<string, string> {
    return {
      "content-type": "application/json",
      "anthropic-version": anthropicVersion,
      "x-api-key": credential.apiKey ?? "",
    };
  }

  function modelFor(requested: string | null) {
    return requested ?? fallbackModels[0]?.id ?? null;
  }

  async function listModels(
    credential: ApiKeyCredential,
    signal?: AbortSignal,
  ): Promise<ModelsResult> {
    if (!credential.apiKey) return { status: "failed", code: "providerDisconnected" };
    let response: Response;
    try {
      response = await fetchImpl(`${base}/models`, { headers: headersFor(credential), signal });
    } catch {
      return { status: "failed", code: "providerUnavailable" };
    }
    if (response.status === 404) return { status: "ok", models: fallbackModels };
    if (!response.ok) return { status: "failed", code: classifyHttpFailure(response.status) };

    const body: unknown = await response.json().catch(() => null);
    const items = isPlainObject(body) && Array.isArray(body.data) ? body.data : [];
    const models = items
      .filter((item): item is Record<string, unknown> => isPlainObject(item))
      .filter((item) => typeof item.id === "string" && isValidAiApiKeyModelId("anthropic", item.id))
      .map((item, index) => ({
        id: item.id as string,
        name: typeof item.display_name === "string" ? item.display_name : (item.id as string),
        isDefault: index === 0,
      }));
    return { status: "ok", models: models.length ? models : fallbackModels };
  }

  function messagesBody(model: string, system: string, prompt: string, stream: boolean) {
    return {
      model,
      max_tokens: maximumOutputTokens,
      stream,
      system,
      messages: [{ role: "user", content: prompt }],
    };
  }

  return {
    provider: "anthropic",
    isAvailable: () => true,
    listModels,

    async run(credential, input: ApiKeyRunInput) {
      if (!credential.apiKey) return { status: "failed", code: "providerDisconnected" };
      const model = modelFor(input.model);
      if (!model) return { status: "failed", code: "runFailed" };
      const system = `${input.instructions}\n\n${schemaInstruction(input.schema)}`;

      let response: Response;
      try {
        response = await fetchImpl(`${base}/messages`, {
          method: "POST",
          headers: headersFor(credential),
          body: JSON.stringify(messagesBody(model, system, input.prompt, false)),
          signal: input.signal,
        });
      } catch (error) {
        return {
          status: "failed",
          code: isAbortError(error, input.signal) ? "canceled" : "providerUnavailable",
        };
      }
      if (!response.ok) return { status: "failed", code: classifyHttpFailure(response.status) };

      const json: unknown = await response.json().catch(() => null);
      const output = extractJsonObject(textBlocksOf(json));
      if (!output) return { status: "failed", code: "invalidOutput" };
      return { status: "completed", output, model: { id: model, name: model } };
    },

    async chat(credential, input: ApiKeyChatInput, emit: (event: ChatEvent) => void) {
      if (!credential.apiKey) return { status: "failed", code: "providerDisconnected" };
      const model = modelFor(input.model);
      if (!model) return { status: "failed", code: "runFailed" };

      let text = "";
      try {
        const response = await fetchImpl(`${base}/messages`, {
          method: "POST",
          headers: headersFor(credential),
          body: JSON.stringify(messagesBody(model, input.instructions, input.prompt, true)),
          signal: input.signal,
        });
        if (!response.ok) return { status: "failed", code: classifyHttpFailure(response.status) };
        await readServerSentData(response, (payload) => {
          const event = parseEvent(payload);
          if (event?.type === "error") throw new Error("stream error");
          if (event?.type === "message_stop") return false;
          if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
            text += event.delta.text;
            emit({ type: "delta", text: event.delta.text });
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

type StreamEvent = {
  type?: string;
  delta?: { type?: string; text: string };
};

function parseEvent(payload: string): StreamEvent | null {
  try {
    const value: unknown = JSON.parse(payload);
    return isPlainObject(value) ? (value as StreamEvent) : null;
  } catch {
    return null;
  }
}

/** Joins the text blocks of a Messages API response; empty when the shape differs. */
function textBlocksOf(json: unknown): string {
  if (!isPlainObject(json) || !Array.isArray(json.content)) return "";
  return json.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        isPlainObject(block) && block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("");
}
