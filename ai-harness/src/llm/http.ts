import { Agent } from "undici";

/**
 * Node's fetch aborts a response that is silent for 300 s ("terminated",
 * UND_ERR_BODY_TIMEOUT). A slow local model writing a long tool call streams
 * nothing until the call is complete, so LLM requests must not have idle
 * timeouts; the user cancels with Ctrl+C (AbortSignal) instead.
 */
const llmDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

export async function llmFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, dispatcher: llmDispatcher } as RequestInit);
  } catch (err) {
    throw withCause(err);
  }
}

/** "fetch failed" / "terminated" alone say nothing; append the underlying cause. */
export function withCause(err: unknown): unknown {
  if (!(err instanceof Error) || err.name === "AbortError") return err;
  const cause = err.cause as { code?: string; message?: string } | undefined;
  if (cause?.code || cause?.message) err.message = `${err.message} (${[cause.code, cause.message].filter(Boolean).join(": ")})`;
  return err;
}
