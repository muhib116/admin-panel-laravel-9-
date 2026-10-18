import type { ContentBlock, Message, Usage } from "../types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export interface ClaudeReply {
  content: ContentBlock[];
  stopReason: string;
  usage: Usage;
}

/**
 * One plain HTTP request to the Messages API. This is the ONLY thing the
 * model ever sees: a system string plus the full list of messages. Nothing
 * else is remembered on the server between calls.
 */
export async function callClaude(opts: {
  messages: Message[];
  system?: string;
  model?: string;
  maxTokens?: number;
}): Promise<ClaudeReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const body = {
    model: opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages,
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    content: ContentBlock[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: json.content,
    stopReason: json.stop_reason,
    usage: { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens },
  };
}
