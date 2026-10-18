import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const IGNORED_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", ".next", ".mini-claude"]);

/** Recursively yield file paths (relative to `root`, using forward slashes). */
export async function* walkFiles(root: string, start = root, maxDepth = 25): AsyncGenerator<string> {
  async function* walk(dir: string, depth: number): AsyncGenerator<string> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && depth < maxDepth) yield* walk(full, depth + 1);
      } else if (entry.isFile()) {
        yield relative(root, full).split(sep).join("/");
      }
    }
  }
  yield* walk(start, 0);
}

/** Convert a simple glob (`*`, `**`, `?`, `{a,b}`) to a RegExp matched against a relative path. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += glob[i + 2] === "/" ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") re += "[^/]";
    else if (c === "{") re += "(?:";
    else if (c === "}") re += ")";
    else if (c === ",") re += "|";
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  // A pattern without a slash matches the file name anywhere, like `*.php`.
  return glob.includes("/") ? new RegExp(`^${re}$`) : new RegExp(`(?:^|/)${re}$`);
}
