import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ToolError, type Tool } from "./types.js";
import { globToRegExp, walkFiles } from "./walk.js";

const MAX_MATCHES = 100;
const MAX_FILE_BYTES = 1_000_000;

export const grepTool: Tool<{ pattern: string; path?: string; glob?: string; ignore_case?: boolean }> = {
  name: "grep",
  description:
    "Search file contents with a JavaScript regular expression. Returns `file:line: text` for each match. " +
    "Use it to find where something is defined or used before reading whole files.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression, e.g. `function\\s+login`." },
      path: { type: "string", description: "Directory to search, relative to the project root. Default: root." },
      glob: { type: "string", description: "Only search files matching this glob, e.g. `*.php`." },
      ignore_case: { type: "boolean", description: "Case-insensitive search." },
    },
    required: ["pattern"],
  },
  async run({ pattern, path = ".", glob, ignore_case }, ctx) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, ignore_case ? "i" : "");
    } catch (err) {
      throw new ToolError(`Invalid regex: ${(err as Error).message}`);
    }
    const root = resolve(ctx.cwd);
    const matcher = glob ? globToRegExp(glob) : null;
    const out: string[] = [];

    for await (const file of walkFiles(root, resolve(root, path))) {
      if (matcher && !matcher.test(file)) continue;
      const abs = join(root, file);
      if ((await stat(abs)).size > MAX_FILE_BYTES) continue;
      const text = await readFile(abs, "utf8");
      if (text.includes("\u0000")) continue;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i])) continue;
        out.push(`${file}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        if (out.length >= MAX_MATCHES) return out.join("\n") + `\n... stopped after ${MAX_MATCHES} matches`;
      }
    }
    return out.length ? out.join("\n") : "No matches.";
  },
};
