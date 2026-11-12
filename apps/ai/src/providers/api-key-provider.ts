import type { AiApiKeyProvider } from "@openmonetis/domain/ai-providers";
import type {
  ChatEvent,
  ChatInput,
  ChatResult,
  ProviderModel,
  RunInput,
  RunResult,
} from "./provider";

/** The key the API decrypted for this call; `null` only for a keyless local provider (Ollama). */
export type ApiKeyCredential = { apiKey: string | null };

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ModelsFailureCode =
  | "providerDisconnected"
  | "providerLimitReached"
  | "providerUnavailable";

export type ModelsResult =
  | { status: "ok"; models: ProviderModel[] }
  | { status: "failed"; code: ModelsFailureCode };

/** Runs and chats never write to a home directory, so no work directory is passed. */
export type ApiKeyRunInput = Omit<RunInput, "workDirectory">;
export type ApiKeyChatInput = Omit<ChatInput, "workDirectory">;

/** One vendor reached over HTTP with the person's own key. */
export type ApiKeyProviderAdapter = {
  provider: AiApiKeyProvider;
  isAvailable(): boolean;
  listModels(credential: ApiKeyCredential, signal?: AbortSignal): Promise<ModelsResult>;
  run(credential: ApiKeyCredential, input: ApiKeyRunInput): Promise<RunResult>;
  chat(
    credential: ApiKeyCredential,
    input: ApiKeyChatInput,
    emit: (event: ChatEvent) => void,
  ): Promise<ChatResult>;
};

export type ApiKeyAdapters = Record<AiApiKeyProvider, ApiKeyProviderAdapter>;

/** Maps an HTTP status to the reason the API can show; the vendor body is never kept. */
export function classifyHttpFailure(status: number): ModelsFailureCode {
  if (status === 401 || status === 403) return "providerDisconnected";
  if (status === 402 || status === 429) return "providerLimitReached";
  return "providerUnavailable";
}

/** Extracts the JSON object a model wrote, tolerating markdown fences; null when none parses. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/`{3}(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(unfenced.slice(start, end + 1));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `data:` payloads from a server-sent events body until `onData` returns false. */
export async function readServerSentData(response: Response, onData: (payload: string) => boolean) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      if (!onData(line.slice(5).trim())) {
        await reader.cancel();
        return;
      }
    }
  }
}

/** A stop from the person is `canceled`; any other failed network call is `providerUnavailable`. */
export function isAbortError(error: unknown, signal?: AbortSignal) {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === "AbortError");
}

export function schemaInstruction(schema: Record<string, unknown>) {
  return `Respond only with a JSON object that follows this JSON schema:\n${JSON.stringify(schema)}`;
}
