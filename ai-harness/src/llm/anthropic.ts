import type { ContentBlock, StopReason } from "../types.js";
import type { ChatRequest, ChatResponse, LLMProvider } from "./provider.js";

const API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export function mapAnthropicStopReason(reason: string | null | undefined): StopReason {
  if (reason === "end_turn" || reason === "tool_use" || reason === "max_tokens") return reason;
  return "other";
}

/**
 * Our internal format IS the Anthropic format, so this provider barely
 * translates anything. Compare with ollama.ts to see what a real translation looks like.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  constructor(
    private apiKey: string,
    readonly model: string = DEFAULT_ANTHROPIC_MODEL,
  ) {}

  protected buildBody(req: ChatRequest) {
    return {
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: req.messages,
      tools: req.tools?.length ? req.tools : undefined,
    };
  }

  protected async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    return res;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.post(this.buildBody(req), req.signal);
    const json = (await res.json()) as AnthropicResponse;
    return {
      content: json.content,
      stopReason: mapAnthropicStopReason(json.stop_reason),
      usage: { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens },
    };
  }
}
