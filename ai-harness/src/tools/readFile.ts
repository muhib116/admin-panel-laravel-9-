import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ToolError, type Tool } from "./types.js";

export const readFileTool: Tool<{ path: string; offset?: number; limit?: number }> = {
  name: "read_file",
  description:
    "Read a text file from the project. Returns the content with line numbers (`  12|text`). " +
    "Use offset/limit to read part of a large file. Always read a file before editing it.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to the project root." },
      offset: { type: "number", description: "1-based line to start from (optional)." },
      limit: { type: "number", description: "Maximum number of lines to return (optional)." },
    },
    required: ["path"],
  },
  async run({ path, offset = 1, limit }, ctx) {
    const abs = resolve(ctx.cwd, path);
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new ToolError(`File not found: ${path}`);
      if (code === "EISDIR") throw new ToolError(`${path} is a directory; use list_files instead`);
      throw err;
    }
    if (text.includes("\u0000")) throw new ToolError(`${path} looks like a binary file`);

    const lines = text.split("\n");
    const start = Math.max(1, Math.floor(offset));
    const end = limit ? Math.min(lines.length, start + Math.floor(limit) - 1) : lines.length;
    const numbered = lines
      .slice(start - 1, end)
      .map((line, i) => `${String(start + i).padStart(6)}|${line}`)
      .join("\n");
    return numbered || "(empty file)";
  },
};
