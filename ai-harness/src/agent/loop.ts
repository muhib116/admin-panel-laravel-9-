import { compactMessages } from "../context/compaction.js";
import { estimateMessages, estimateRequest, truncateMiddle } from "../context/tokens.js";
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
  | { type: "usage"; usage: Usage }
  | { type: "compacted"; beforeTokens: number; afterTokens: number; removedMessages: number }
  | { type: "warning"; message: string }
  /** The message history changed (used to persist sessions). */
  | { type: "history"; messages: Message[] };

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
  /** Compact when the context is this full (fraction of the window). Default 0.75. */
  compactAt?: number;
  /** Tool output beyond this many characters is truncated in the middle. */
  maxToolResultChars?: number;
  onEvent?: (event: AgentEvent) => void;
}

export class Agent {
  messages: Message[] = [];
  readonly totalUsage: Usage = { inputTokens: 0, outputTokens: 0 };
  /** Real input token count reported for the last call, and how many messages it covered. */
  private calibration: { tokens: number; messageCount: number } | null = null;

  constructor(readonly opts: AgentOptions) {}

  get contextWindow() {
    return this.opts.provider.contextWindow;
  }

  /** How full the context is: the last real count from the API plus an estimate for anything newer. */
  contextTokens(): number {
    const estimate = estimateRequest(this.system, this.messages, this.opts.tools.schemas());
    const cal = this.calibration;
    if (!cal || cal.messageCount > this.messages.length) return estimate;
    return Math.max(estimate, cal.tokens + estimateMessages(this.messages.slice(cal.messageCount)));
  }

  /** Replace older history with a model-written summary. Returns false if there was nothing to compact. */
  async compact(signal?: AbortSignal): Promise<boolean> {
    const before = this.contextTokens();
    const keepTokens = Math.floor(this.contextWindow * 0.3);
    const result = await compactMessages(this.opts.provider, this.messages, keepTokens, signal);
    if (!result) return false;
    this.messages = result.messages;
    this.calibration = null;
    this.historyChanged();
    this.emit({ type: "compacted", beforeTokens: before, afterTokens: this.contextTokens(), removedMessages: result.removed });
    return true;
  }

  private async maybeCompact(signal?: AbortSignal) {
    if (this.contextTokens() < this.contextWindow * (this.opts.compactAt ?? 0.75)) return;
    try {
      await this.compact(signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      this.emit({ type: "warning", message: `Compaction failed: ${(err as Error).message}` });
    }
  }

  private get maxToolResultChars() {
    // About 15% of the window per tool result, capped at 30k characters.
    return this.opts.maxToolResultChars ?? Math.min(30_000, Math.floor(this.contextWindow * 4 * 0.15));
  }

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
    this.historyChanged();
  }

  private historyChanged() {
    this.emit({ type: "history", messages: this.messages });
  }

  /** The agent loop: call the model, run requested tools, feed results back, repeat. */
  async run(userInput: string, { signal }: { signal?: AbortSignal } = {}): Promise<RunResult> {
    const maxTurns = this.opts.maxTurns ?? 25;
    this.pushUser([{ type: "text", text: userInput }]);

    for (let turn = 1; turn <= maxTurns; turn++) {
      let streamed = "";
      let res;
      try {
        await this.maybeCompact(signal);
        const messageCount = this.messages.length;
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
        if (res.usage.inputTokens > 0) this.calibration = { tokens: res.usage.inputTokens, messageCount };
      } catch (err) {
        if (!signal?.aborted) throw err;
        // Keep what the user already saw, so the model knows where it was cut off.
        if (streamed) {
          this.messages.push({ role: "assistant", content: [{ type: "text", text: `${streamed}\n[interrupted by user]` }] });
          this.historyChanged();
        }
        return { text: streamed, turns: turn, stoppedBecause: "interrupted" };
      }

      if (res.content.length === 0) {
        // APIs reject empty assistant messages, and the user would see nothing at all.
        this.emit({ type: "warning", message: `The model returned an empty response (${res.usage.outputTokens} output tokens, nothing usable).` });
        res.content = [{ type: "text", text: "(empty response)" }];
      }

      this.totalUsage.inputTokens += res.usage.inputTokens;
      this.totalUsage.outputTokens += res.usage.outputTokens;
      this.emit({ type: "usage", usage: res.usage });

      this.messages.push({ role: "assistant", content: res.content });
      this.historyChanged();
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
        result.content = truncateMiddle(result.content, this.maxToolResultChars);
        this.emit({ type: "tool_end", call, result });
        results.push(result);
      }
      this.pushUser(results);
      if (signal?.aborted) return { text: "", turns: turn, stoppedBecause: "interrupted" };
    }

    return { text: "", turns: maxTurns, stoppedBecause: "max_turns" };
  }
}
