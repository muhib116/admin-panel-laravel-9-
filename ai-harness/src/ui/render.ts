import type { AgentEvent } from "../agent/loop.js";
import type { ToolRegistry } from "../tools/registry.js";
import { textOf } from "../types.js";

const codes = { dim: 2, red: 31, green: 32, yellow: 33, cyan: 36 } as const;
export type Style = keyof typeof codes;

export function makeStyler(enabled: boolean) {
  return (style: Style, s: string) => (enabled ? `\x1b[${codes[style]}m${s}\x1b[0m` : s);
}

/**
 * Turns agent events into terminal output. Streaming text is written as it
 * arrives; tool calls are shown as one-line activity summaries.
 */
export function createRenderer(opts: {
  tools: ToolRegistry;
  out?: NodeJS.WritableStream;
  color?: boolean;
  /** Prefix for every line, used to nest sub-agent activity under its task. */
  indent?: string;
  /** Show only tool activity (sub-agents' text is not shown; only their final report reaches the parent). */
  toolsOnly?: boolean;
}) {
  const out = opts.out ?? process.stdout;
  const paint = makeStyler(opts.color ?? Boolean((out as NodeJS.WriteStream).isTTY));
  const indent = opts.indent ?? "";
  let midLine = false;
  let streamedThisTurn = false;

  const write = (s: string) => {
    out.write(s);
    if (s.length) midLine = !s.endsWith("\n");
  };
  const line = (s: string) => write(`${midLine ? "\n" : ""}${indent}${s}\n`);

  return function render(event: AgentEvent) {
    if (opts.toolsOnly && !["tool_start", "tool_end", "tool_denied", "warning"].includes(event.type)) return;
    switch (event.type) {
      case "text_delta":
        if (!streamedThisTurn) write(midLine ? "\n\n" : "\n");
        streamedThisTurn = true;
        write(event.text);
        break;
      case "assistant": {
        if (!streamedThisTurn) {
          const text = textOf(event.content).trim();
          if (text) line(`\n${text}`);
        } else if (midLine) {
          write("\n");
        }
        streamedThisTurn = false;
        break;
      }
      case "tool_start": {
        const tool = opts.tools.get(event.call.name);
        const label = tool?.activity?.(event.call.input as never) ?? `${event.call.name} ${JSON.stringify(event.call.input)}`;
        line(paint("cyan", `  > ${label}`));
        break;
      }
      case "tool_end": {
        const lines = event.result.content.split("\n");
        const first = lines[0].trim().slice(0, 100);
        const more = lines.length > 1 ? paint("dim", ` (+${lines.length - 1} lines)`) : "";
        line(event.result.is_error ? paint("red", `    error: ${first}`) : paint("dim", `    ${first}`) + more);
        break;
      }
      case "tool_denied":
        line(paint("yellow", `    denied: ${event.reason}`));
        break;
      case "compacted":
        line(
          paint(
            "dim",
            `  [context compacted: ~${event.beforeTokens} -> ~${event.afterTokens} tokens, ${event.removedMessages} messages summarized]`,
          ),
        );
        break;
      case "warning":
        line(paint("yellow", `  warning: ${event.message}`));
        break;
    }
  };
}
