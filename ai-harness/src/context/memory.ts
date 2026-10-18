import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_MEMORY_CHARS = 20_000;

export interface MemoryFile {
  scope: "user" | "project" | "local";
  path: string;
  content: string;
}

export function memoryPaths(cwd: string, home = homedir()) {
  return [
    { scope: "user" as const, path: join(home, ".mini-claude", "AGENT.md") },
    { scope: "project" as const, path: join(cwd, "AGENT.md") },
    { scope: "local" as const, path: join(cwd, "AGENT.local.md") },
  ];
}

/**
 * Project memory = plain markdown files that are injected into the system prompt.
 * user:    ~/.mini-claude/AGENT.md   your personal preferences, every project
 * project: ./AGENT.md                team conventions, committed to git
 * local:   ./AGENT.local.md          your notes for this project, not committed
 */
export async function loadMemory(cwd: string, home = homedir()): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];
  for (const { scope, path } of memoryPaths(cwd, home)) {
    try {
      const content = (await readFile(path, "utf8")).trim();
      if (content) files.push({ scope, path, content });
    } catch {}
  }
  return files;
}

/** Later files win on conflicts, so they come last. */
export function formatMemory(files: MemoryFile[]): string {
  const text = files.map((f) => `## From ${f.scope} memory (${f.path})\n${f.content}`).join("\n\n");
  return text.length > MAX_MEMORY_CHARS ? text.slice(0, MAX_MEMORY_CHARS) + "\n... [memory truncated]" : text;
}

/** `# always run php artisan test after editing` in the REPL appends a line to ./AGENT.md. */
export async function rememberLine(cwd: string, line: string): Promise<string> {
  const path = join(cwd, "AGENT.md");
  let prefix = "";
  try {
    const existing = await readFile(path, "utf8");
    if (existing && !existing.endsWith("\n")) prefix = "\n";
  } catch {
    prefix = "# Project instructions for mini-claude\n\n";
  }
  await appendFile(path, `${prefix}- ${line.trim()}\n`, "utf8");
  return path;
}
