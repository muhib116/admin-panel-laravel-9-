import type { ContentBlock, Message, StopReason, ToolSchema } from "../types.js";
import type { ChatRequest, ChatResponse, LLMProvider } from "./provider.js";
import { llmFetch, withCause } from "./http.js";
import { readLines } from "./stream.js";

export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";

// Ollama speaks the OpenAI-style chat format: tool calls live in a `tool_calls`
// array on the assistant message, and every tool result is its own `role: "tool"`
// message. Our format puts both inside content blocks, so we translate both ways.

export interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaChatResponse {
  message: OllamaMessage;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function toOllamaMessages(system: string | undefined, messages: Message[]): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  if (system) out.push({ role: "system", content: system });

  const toolNames = new Map<string, string>();

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");

    if (msg.role === "assistant") {
      const toolCalls: OllamaToolCall[] = [];
      for (const b of msg.content) {
        if (b.type !== "tool_use") continue;
        toolNames.set(b.id, b.name);
        toolCalls.push({ id: b.id, function: { name: b.name, arguments: b.input } });
      }
      out.push({ role: "assistant", content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    for (const b of msg.content) {
      if (b.type !== "tool_result") continue;
      out.push({
        role: "tool",
        content: b.is_error ? `ERROR: ${b.content}` : b.content,
        tool_name: toolNames.get(b.tool_use_id),
      });
    }
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

export function toOllamaTools(tools: ToolSchema[] | undefined) {
  return tools?.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

let callCounter = 0;

export function fromOllamaMessage(msg: OllamaMessage): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (msg.content) blocks.push({ type: "text", text: msg.content });
  for (const call of msg.tool_calls ?? []) {
    const args = call.function.arguments;
    let input: Record<string, unknown>;
    try {
      input = typeof args === "string" ? JSON.parse(args) : args ?? {};
    } catch {
      input = { _raw: args };
    }
    blocks.push({
      type: "tool_use",
      // Ollama does not always return ids, but our format needs one to pair results with calls.
      id: call.id ?? `ollama_call_${Date.now()}_${callCounter++}`,
      name: call.function.name,
      input,
    });
  }
  return blocks;
}

export function mapOllamaStopReason(blocks: ContentBlock[], doneReason?: string): StopReason {
  if (blocks.some((b) => b.type === "tool_use")) return "tool_use";
  if (doneReason === "length") return "max_tokens";
  return "end_turn";
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  constructor(
    readonly model: string = DEFAULT_OLLAMA_MODEL,
    protected host = "http://localhost:11434",
    /** Ollama silently drops the oldest tokens beyond num_ctx, so we always set it explicitly. */
    readonly contextWindow = 16_384,
  ) {}

  protected buildBody(req: ChatRequest, stream: boolean) {
    return {
      model: this.model,
      messages: toOllamaMessages(req.system, req.messages),
      tools: toOllamaTools(req.tools),
      stream,
      options: { num_predict: req.maxTokens ?? 4096, num_ctx: this.contextWindow },
    };
  }

  protected async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    const res = await llmFetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    return res;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      if (req.onText) {
        const res = await this.post(this.buildBody(req, true), req.signal);
        return await accumulateOllamaStream(readLines(res.body!), req.onText);
      }
      const res = await this.post(this.buildBody(req, false), req.signal);
      const json = (await res.json()) as OllamaChatResponse;
      return toChatResponse(fromOllamaMessage(json.message), json);
    } catch (err) {
      throw withCause(err);
    }
  }
}

function toChatResponse(content: ContentBlock[], final: OllamaChatResponse | undefined): ChatResponse {
  return {
    content,
    stopReason: mapOllamaStopReason(content, final?.done_reason),
    usage: { inputTokens: final?.prompt_eval_count ?? 0, outputTokens: final?.eval_count ?? 0 },
  };
}

/** Ollama streams newline-delimited JSON: one partial message per line, then a final `done: true` line. */
export async function accumulateOllamaStream(
  lines: AsyncIterable<string>,
  onText: (delta: string) => void = () => {},
): Promise<ChatResponse> {
  let text = "";
  const toolCalls: OllamaToolCall[] = [];
  let final: OllamaChatResponse | undefined;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const chunk = JSON.parse(line) as OllamaChatResponse & { done?: boolean; error?: string };
    if (chunk.error) throw new Error(`Ollama stream error: ${chunk.error}`);
    if (chunk.message?.content) {
      text += chunk.message.content;
      onText(chunk.message.content);
    }
    if (chunk.message?.tool_calls) toolCalls.push(...chunk.message.tool_calls);
    if (chunk.done) final = chunk;
  }

  return toChatResponse(fromOllamaMessage({ role: "assistant", content: text, tool_calls: toolCalls }), final);
}
