import type { LLMProvider } from "../llm/provider.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";
import { Agent, type AgentEvent, type AgentOptions } from "./loop.js";

export const SUBAGENT_INSTRUCTIONS = `# You are a sub-agent
A parent agent delegated one focused task to you. You start with an empty conversation:
you only know what is in the task description. Work autonomously with your tools.
When finished, reply with a concise final report (key findings, file paths with line numbers,
and anything you changed). The parent sees ONLY that final report, not your tool calls.`;

export interface TaskToolOptions {
  provider: LLMProvider;
  /** Tools for the sub-agent. Must not include `task` itself, so sub-agents cannot recurse. */
  tools: ToolRegistry;
  system: () => string;
  permissions?: AgentOptions["permissions"];
  maxTurns?: number;
  /** Receives the sub-agent's events, e.g. to show its activity indented. */
  onEvent?: (event: AgentEvent) => void;
}

/**
 * A tool whose implementation is a whole new agent loop with a fresh context.
 * Big intermediate outputs (file contents, search results) stay in the sub-agent;
 * the parent's context only grows by the final report.
 */
export function createTaskTool(opts: TaskToolOptions): Tool<{ description: string; prompt: string }> {
  return {
    name: "task",
    // The sub-agent's own tool calls are permission-checked individually.
    kind: "read",
    description:
      "Delegate a self-contained task (research, exploring a large codebase, an isolated change) to a sub-agent " +
      "with a fresh context. It has the same tools as you except `task`. Give it a complete, specific prompt: it " +
      "cannot see this conversation. You get back only its final report, which keeps your own context small.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "3-6 word label, e.g. 'Find route definitions'." },
        prompt: { type: "string", description: "Full instructions for the sub-agent, including what to report back." },
      },
      required: ["description", "prompt"],
    },
    activity: ({ description }) => `Task: ${description}`,
    async run({ prompt }, ctx) {
      const sub = new Agent({
        provider: opts.provider,
        tools: opts.tools,
        cwd: ctx.cwd,
        system: () => `${opts.system()}\n\n${SUBAGENT_INSTRUCTIONS}`,
        permissions: opts.permissions,
        maxTurns: opts.maxTurns ?? 15,
        onEvent: opts.onEvent,
      });
      const result = await sub.run(prompt, { signal: ctx.signal });
      const { inputTokens, outputTokens } = sub.totalUsage;
      const footer = `\n\n[sub-agent: ${result.turns} turns, ${inputTokens + outputTokens} tokens, stopped: ${result.stoppedBecause}]`;
      return (result.text.trim() || "(the sub-agent returned no report)") + footer;
    },
  };
}
