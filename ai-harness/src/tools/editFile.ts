import { readFile, writeFile } from "node:fs/promises";
import { resolveInProject, ToolError, type Tool } from "./types.js";

export const editFileTool: Tool<{ path: string; old_string: string; new_string: string; replace_all?: boolean }> = {
  name: "edit_file",
  kind: "write",
  description:
    "Edit a file by replacing an exact string. `old_string` must match the file exactly (including indentation, " +
    "without the line-number prefix from read_file) and must be unique unless replace_all is true. " +
    "Include enough surrounding lines to make it unique.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to the project root." },
      old_string: { type: "string", description: "Exact text to replace." },
      new_string: { type: "string", description: "Replacement text." },
      replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring exactly one." },
    },
    required: ["path", "old_string", "new_string"],
  },
  activity: ({ path }) => `Editing ${path}`,
  async run({ path, old_string, new_string, replace_all }, ctx) {
    const abs = resolveInProject(ctx.cwd, path);
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      throw new ToolError(`File not found: ${path}. Use write_file to create it.`);
    }
    if (old_string === new_string) throw new ToolError("old_string and new_string are identical");

    const count = old_string ? text.split(old_string).length - 1 : 0;
    if (count === 0) {
      throw new ToolError(`old_string was not found in ${path}. Read the file again and copy the text exactly.`);
    }
    if (count > 1 && !replace_all) {
      throw new ToolError(
        `old_string appears ${count} times in ${path}. Add surrounding context to make it unique, or set replace_all.`,
      );
    }

    const updated = replace_all ? text.split(old_string).join(new_string) : text.replace(old_string, () => new_string);
    await writeFile(abs, updated, "utf8");
    const n = replace_all ? count : 1;
    return `Edited ${path} (${n} replacement${n > 1 ? "s" : ""})`;
  },
};
