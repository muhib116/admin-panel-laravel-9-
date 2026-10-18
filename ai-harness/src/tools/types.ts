import { isAbsolute, relative, resolve } from "node:path";
import type { ToolSchema } from "../types.js";

/** read: no side effects. write: changes files. execute: runs arbitrary code. */
export type ToolKind = "read" | "write" | "execute";

export interface ToolContext {
  /** Project root. File tools resolve relative paths against it. */
  cwd: string;
  signal?: AbortSignal;
}

export interface Tool<I = Record<string, unknown>> {
  name: string;
  kind: ToolKind;
  /** Read by the model: this text is how it decides when and how to call the tool. */
  description: string;
  inputSchema: ToolSchema["input_schema"];
  run(input: I, ctx: ToolContext): Promise<string>;
}

/** Thrown by tools for expected failures; the message is shown to the model as-is. */
export class ToolError extends Error {}

/**
 * Resolve a model-supplied path and refuse anything outside the project root,
 * e.g. `../../etc/passwd` or `/home/me/.ssh/id_rsa`.
 */
export function resolveInProject(cwd: string, path: string): string {
  const root = resolve(cwd);
  const abs = resolve(root, path);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ToolError(`Access denied: ${path} is outside the project root (${root})`);
  }
  return abs;
}
