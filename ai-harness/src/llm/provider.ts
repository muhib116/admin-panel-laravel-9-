import type { ContentBlock, Message, StopReason, ToolSchema, Usage } from "../types.js";

export interface ChatRequest {
  system?: string;
  messages: Message[];
  tools?: ToolSchema[];
  maxTokens?: number;
  signal?: AbortSignal;
  /** If set, the provider streams and calls this with each new piece of text. */
  onText?: (delta: string) => void;
}

export interface ChatResponse {
  content: ContentBlock[];
  stopReason: StopReason;
  usage: Usage;
}

/**
 * The single seam between the harness and any model. The agent loop only
 * talks to this interface, so swapping Claude for a local model is a config change.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
