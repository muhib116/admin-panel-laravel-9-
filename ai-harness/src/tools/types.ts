import type { ToolSchema } from "../types.js";

export interface ToolContext {
  /** Project root. File tools resolve relative paths against it. */
  cwd: string;
  signal?: AbortSignal;
}

export interface Tool<I = Record<string, unknown>> {
  name: string;
  /** Read by the model: this text is how it decides when and how to call the tool. */
  description: string;
  inputSchema: ToolSchema["input_schema"];
  run(input: I, ctx: ToolContext): Promise<string>;
}

/** Thrown by tools for expected failures; the message is shown to the model as-is. */
export class ToolError extends Error {}
