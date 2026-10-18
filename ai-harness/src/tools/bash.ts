import { spawn } from "node:child_process";
import type { Tool } from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_CHARS = 30_000;

export const bashTool: Tool<{ command: string; timeout_ms?: number }> = {
  name: "bash",
  kind: "execute",
  description:
    "Run a shell command in the project root with bash and return its exit code, stdout and stderr. " +
    "Use it for running tests, git, package managers and other CLI tools. Commands are non-interactive; " +
    "do not start servers or anything that waits for input. Prefer read_file/grep/list_files for reading code.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The command to run, e.g. `php artisan route:list`." },
      timeout_ms: { type: "number", description: `Timeout in ms (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).` },
    },
    required: ["command"],
  },
  activity: ({ command }) => `Running: ${command}`,
  run({ command, timeout_ms }, ctx) {
    const timeout = Math.min(timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], {
        cwd: ctx.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      let stdout = "";
      let stderr = "";
      let killedBy: string | null = null;
      const kill = (why: string) => {
        killedBy = why;
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {}
      };
      const timer = setTimeout(() => kill(`timed out after ${timeout}ms`), timeout);
      const onAbort = () => kill("interrupted by user");
      ctx.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (code) => {
        clearTimeout(timer);
        ctx.signal?.removeEventListener("abort", onAbort);
        const clip = (s: string) =>
          s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + `\n... [${s.length - MAX_OUTPUT_CHARS} chars cut]` : s;
        const parts = [killedBy ? `Command ${killedBy}` : `Exit code: ${code}`];
        if (stdout.trim()) parts.push(`stdout:\n${clip(stdout.trimEnd())}`);
        if (stderr.trim()) parts.push(`stderr:\n${clip(stderr.trimEnd())}`);
        resolve(parts.join("\n"));
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve(`Failed to start command: ${err.message}`);
      });
    });
  },
};
