import type { ContentBlock, StopReason } from "../types.js";
import type { ChatRequest, ChatResponse, LLMProvider } from "./provider.js";
import { parseSSE, readLines, type SSEEvent } from "./stream.js";

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
    if (req.onText) {
      const res = await this.post({ ...this.buildBody(req), stream: true }, req.signal);
      return accumulateAnthropicStream(parseSSE(readLines(res.body!)), req.onText);
    }
    const res = await this.post(this.buildBody(req), req.signal);
    const json = (await res.json()) as AnthropicResponse;
    return {
      content: json.content,
      stopReason: mapAnthropicStopReason(json.stop_reason),
      usage: { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens },
    };
  }
}

/**
 * Rebuild a full response from stream events:
 *   message_start -> (content_block_start -> content_block_delta* -> content_block_stop)* -> message_delta -> message_stop
 * Text arrives as `text_delta`; tool input arrives as fragments of JSON (`input_json_delta`)
 * that only parse once the block is complete.
 */
export async function accumulateAnthropicStream(
  events: AsyncIterable<SSEEvent>,
  onText: (delta: string) => void = () => {},
): Promise<ChatResponse> {
  const blocks: (ContentBlock & { _json?: string })[] = [];
  let stopReason: string | undefined;
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const { event, data } of events) {
    if (event === "ping") continue;
    const msg = JSON.parse(data);
    switch (msg.type) {
      case "message_start":
        usage.inputTokens = msg.message.usage?.input_tokens ?? 0;
        usage.outputTokens = msg.message.usage?.output_tokens ?? 0;
        break;
      case "content_block_start":
        blocks[msg.index] =
          msg.content_block.type === "tool_use" ? { ...msg.content_block, input: {}, _json: "" } : { ...msg.content_block };
        break;
      case "content_block_delta": {
        const block = blocks[msg.index];
        if (msg.delta.type === "text_delta" && block.type === "text") {
          block.text += msg.delta.text;
          onText(msg.delta.text);
        } else if (msg.delta.type === "input_json_delta") {
          block._json += msg.delta.partial_json;
        }
        break;
      }
      case "content_block_stop": {
        const block = blocks[msg.index];
        if (block.type === "tool_use") {
          block.input = block._json ? JSON.parse(block._json) : {};
          delete block._json;
        }
        break;
      }
      case "message_delta":
        stopReason = msg.delta.stop_reason ?? stopReason;
        if (msg.usage?.output_tokens) usage.outputTokens = msg.usage.output_tokens;
        break;
      case "error":
        throw new Error(`Anthropic stream error: ${msg.error?.message ?? data}`);
    }
  }

  return {
    content: blocks.filter((b) => b.type !== "text" || b.text.length > 0),
    stopReason: mapAnthropicStopReason(stopReason),
    usage,
  };
}
