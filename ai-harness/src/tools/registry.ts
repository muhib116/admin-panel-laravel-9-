import type { ToolResultBlock, ToolSchema, ToolUseBlock } from "../types.js";
import type { Tool, ToolContext } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool<any>>();

  constructor(tools: Tool<any>[] = []) {
    tools.forEach((t) => this.register(t));
  }

  register(tool: Tool<any>) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool<any> | undefined {
    return this.tools.get(name);
  }

  /** What we send to the model in the `tools` field of every request. */
  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  /**
   * Execute one tool call. Never throws: every failure becomes an `is_error`
   * result, because the model can usually fix its own mistake if it sees the error.
   */
  async run(call: ToolUseBlock, ctx: ToolContext): Promise<ToolResultBlock> {
    const result = (content: string, isError = false): ToolResultBlock => ({
      type: "tool_result",
      tool_use_id: call.id,
      content,
      ...(isError ? { is_error: true } : {}),
    });

    const tool = this.tools.get(call.name);
    if (!tool) {
      return result(`Unknown tool "${call.name}". Available tools: ${[...this.tools.keys()].join(", ")}`, true);
    }

    const missing = (tool.inputSchema.required ?? []).filter((k) => call.input?.[k] === undefined);
    if (missing.length) {
      return result(`Missing required parameter(s) for ${call.name}: ${missing.join(", ")}`, true);
    }

    try {
      return result(await tool.run(call.input, ctx));
    } catch (err) {
      return result(`${call.name} failed: ${(err as Error).message}`, true);
    }
  }
}
