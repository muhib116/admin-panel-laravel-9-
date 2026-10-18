import type { LLMProvider } from "../llm/provider.js";
import type { ToolRegistry } from "../tools/registry.js";
import {
  textOf,
  toolUsesOf,
  type ContentBlock,
  type Message,
  type ToolResultBlock,
  type ToolUseBlock,
  type Usage,
} from "../types.js";

/** Everything the UI might want to show. The loop itself never prints. */
export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "assistant"; content: ContentBlock[] }
  | { type: "tool_start"; call: ToolUseBlock }
  | { type: "tool_end"; call: ToolUseBlock; result: ToolResultBlock }
  | { type: "tool_denied"; call: ToolUseBlock; reason: string }
  | { type: "usage"; usage: Usage };

export type StopCause = "done" | "max_turns" | "max_tokens" | "interrupted";

export interface RunResult {
  text: string;
  turns: number;
  stoppedBecause: StopCause;
}

export interface AgentOptions {
  provider: LLMProvider;
  tools: ToolRegistry;
  system: string | (() => string);
  cwd: string;
  /** Safety valve: maximum model calls per user request. */
  maxTurns?: number;
  maxTokens?: number;
  /** Stream text as it is generated (emits text_delta events). */
  stream?: boolean;
  /** Gatekeeper consulted before every tool call. Omit to allow everything. */
  permissions?: { check(call: ToolUseBlock): Promise<{ allowed: true } | { allowed: false; reason: string }> };
  onEvent?: (event: AgentEvent) => void;
}

export class Agent {
  messages: Message[] = [];
  readonly totalUsage: Usage = { inputTokens: 0, outputTokens: 0 };

  constructor(readonly opts: AgentOptions) {}

  private emit(event: AgentEvent) {
    this.opts.onEvent?.(event);
  }

  private get system() {
    return typeof this.opts.system === "function" ? this.opts.system() : this.opts.system;
  }

  /**
   * Add a user message. If the history already ends with a user message (for
   * example after max_turns), merge into it so roles keep alternating.
   */
  private pushUser(blocks: ContentBlock[]) {
    const last = this.messages.at(-1);
    if (last?.role === "user") {
      const existing = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
      last.content = [...existing, ...blocks];
    } else {
      this.messages.push({ role: "user", content: blocks });
    }
  }

  /** The agent loop: call the model, run requested tools, feed results back, repeat. */
  async run(userInput: string, { signal }: { signal?: AbortSignal } = {}): Promise<RunResult> {
    const maxTurns = this.opts.maxTurns ?? 25;
    this.pushUser([{ type: "text", text: userInput }]);

    for (let turn = 1; turn <= maxTurns; turn++) {
      let streamed = "";
      let res;
      try {
        res = await this.opts.provider.chat({
          system: this.system,
          messages: this.messages,
          tools: this.opts.tools.schemas(),
          maxTokens: this.opts.maxTokens,
          signal,
          onText: this.opts.stream
            ? (delta) => {
                streamed += delta;
                this.emit({ type: "text_delta", text: delta });
              }
            : undefined,
        });
      } catch (err) {
        if (!signal?.aborted) throw err;
        // Keep what the user already saw, so the model knows where it was cut off.
        if (streamed) {
          this.messages.push({ role: "assistant", content: [{ type: "text", text: `${streamed}\n[interrupted by user]` }] });
        }
        return { text: streamed, turns: turn, stoppedBecause: "interrupted" };
      }

      this.totalUsage.inputTokens += res.usage.inputTokens;
      this.totalUsage.outputTokens += res.usage.outputTokens;
      this.emit({ type: "usage", usage: res.usage });

      this.messages.push({ role: "assistant", content: res.content });
      this.emit({ type: "assistant", content: res.content });

      const calls = toolUsesOf(res.content);
      if (calls.length === 0) {
        return {
          text: textOf(res.content),
          turns: turn,
          stoppedBecause: res.stopReason === "max_tokens" ? "max_tokens" : "done",
        };
      }

      // A reply may contain several tool calls. Every one of them needs a
      // matching tool_result in the SAME next user message.
      const results: ToolResultBlock[] = [];
      for (const call of calls) {
        if (signal?.aborted) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: "Interrupted by user before this tool ran.", is_error: true });
          continue;
        }
        const decision = (await this.opts.permissions?.check(call)) ?? { allowed: true };
        if (!decision.allowed) {
          const denied: ToolResultBlock = { type: "tool_result", tool_use_id: call.id, content: decision.reason, is_error: true };
          this.emit({ type: "tool_denied", call, reason: decision.reason });
          results.push(denied);
          continue;
        }
        this.emit({ type: "tool_start", call });
        const result = await this.opts.tools.run(call, { cwd: this.opts.cwd, signal });
        this.emit({ type: "tool_end", call, result });
        results.push(result);
      }
      this.pushUser(results);
      if (signal?.aborted) return { text: "", turns: turn, stoppedBecause: "interrupted" };
    }

    return { text: "", turns: maxTurns, stoppedBecause: "max_turns" };
  }
}
