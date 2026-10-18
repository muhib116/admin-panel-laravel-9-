import type { ContentBlock } from "../types.js";
import type { ChatRequest, ChatResponse, LLMProvider } from "./provider.js";

export type ScriptStep = ContentBlock[] | ((req: ChatRequest) => ContentBlock[]);

/**
 * A fake LLM that replies from a script. It lets us test the harness
 * deterministically and for free: the harness cannot tell it apart from a real model.
 */
export class ScriptedProvider implements LLMProvider {
  readonly name = "scripted";
  readonly model = "scripted";
  readonly requests: ChatRequest[] = [];
  private step = 0;

  constructor(private script: ScriptStep[]) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.requests.push(structuredClone({ ...req, signal: undefined }));
    const next = this.script[this.step++];
    if (!next) throw new Error(`ScriptedProvider ran out of steps (call #${this.step})`);
    const content = typeof next === "function" ? next(req) : next;
    return {
      content,
      stopReason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      usage: { inputTokens: JSON.stringify(req.messages).length / 4, outputTokens: JSON.stringify(content).length / 4 },
    };
  }
}

export const text = (t: string): ContentBlock => ({ type: "text", text: t });
export const toolUse = (id: string, name: string, input: Record<string, unknown>): ContentBlock => ({
  type: "tool_use",
  id,
  name,
  input,
});
