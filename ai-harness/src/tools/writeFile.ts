import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveInProject, type Tool } from "./types.js";

export const writeFileTool: Tool<{ path: string; content: string }> = {
  name: "write_file",
  kind: "write",
  description:
    "Create a new file or completely overwrite an existing one. Parent directories are created. " +
    "For changing part of an existing file prefer edit_file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to the project root." },
      content: { type: "string", description: "The full new content of the file." },
    },
    required: ["path", "content"],
  },
  async run({ path, content }, ctx) {
    const abs = resolveInProject(ctx.cwd, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return `Wrote ${content.split("\n").length} lines to ${path}`;
  },
};
