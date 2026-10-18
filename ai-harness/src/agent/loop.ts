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
  | { type: "assistant"; content: ContentBlock[] }
  | { type: "tool_start"; call: ToolUseBlock }
  | { type: "tool_end"; call: ToolUseBlock; result: ToolResultBlock }
  | { type: "usage"; usage: Usage };

export type StopCause = "done" | "max_turns" | "max_tokens";

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
  async run(userInput: string): Promise<RunResult> {
    const maxTurns = this.opts.maxTurns ?? 25;
    this.pushUser([{ type: "text", text: userInput }]);

    for (let turn = 1; turn <= maxTurns; turn++) {
      const res = await this.opts.provider.chat({
        system: this.system,
        messages: this.messages,
        tools: this.opts.tools.schemas(),
        maxTokens: this.opts.maxTokens,
      });

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
        this.emit({ type: "tool_start", call });
        const result = await this.opts.tools.run(call, { cwd: this.opts.cwd });
        this.emit({ type: "tool_end", call, result });
        results.push(result);
      }
      this.pushUser(results);
    }

    return { text: "", turns: maxTurns, stoppedBecause: "max_turns" };
  }
}
