import { resolve } from "node:path";
import { resolveInProject, type Tool } from "./types.js";
import { globToRegExp, IGNORED_DIRS, walkFiles } from "./walk.js";

const MAX_RESULTS = 200;

export const listFilesTool: Tool<{ path?: string; pattern?: string }> = {
  name: "list_files",
  kind: "read",
  description:
    "List files in the project recursively (skips " +
    [...IGNORED_DIRS].join(", ") +
    "). Optionally filter with a glob such as `*.php` or `app/**/*.php`. Use this to explore an unfamiliar project.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory to list, relative to the project root. Default: root." },
      pattern: { type: "string", description: "Glob filter, e.g. `*.ts` or `src/**/*.test.ts`." },
    },
  },
  async run({ path = ".", pattern }, ctx) {
    const root = resolve(ctx.cwd);
    const matcher = pattern ? globToRegExp(pattern) : null;
    const files: string[] = [];
    let total = 0;
    for await (const file of walkFiles(root, resolveInProject(root, path))) {
      if (matcher && !matcher.test(file)) continue;
      total++;
      if (files.length < MAX_RESULTS) files.push(file);
    }
    if (total === 0) return "No files found.";
    const more = total > files.length ? `\n... and ${total - files.length} more (narrow with path or pattern)` : "";
    return files.join("\n") + more;
  },
};
