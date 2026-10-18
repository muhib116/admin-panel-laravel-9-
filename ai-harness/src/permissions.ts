import type { ToolKind } from "./tools/types.js";
import type { ToolUseBlock } from "./types.js";

/**
 * ask:       read tools run freely, write/execute tools need approval (default).
 * auto:      everything runs without asking, except dangerous commands.
 * read-only: write/execute tools are always denied.
 */
export type PermissionMode = "ask" | "auto" | "read-only";

export type Decision = { allowed: true } | { allowed: false; reason: string };

export type Answer = { choice: "yes" | "always" } | { choice: "no"; feedback?: string };

/** How the manager asks a human. The CLI implements it with stdin; tests fake it. */
export interface Prompter {
  ask(question: string): Promise<Answer>;
}

/** Patterns that are always confirmed, even in auto mode or with an "always" rule. */
const DANGEROUS: [RegExp, string][] = [
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, "recursive force delete"],
  [/\bsudo\b/, "runs as root"],
  [/\bgit\s+push\b.*(--force|-f\b)/, "force push"],
  [/\bgit\s+reset\s+--hard\b/, "discards local changes"],
  [/\b(curl|wget)\b.*\|\s*(ba|z)?sh\b/, "pipes a download into a shell"],
  [/\bmkfs\b|\bdd\s+if=/, "can wipe a disk"],
  [/:\(\)\s*\{.*\};\s*:/, "fork bomb"],
  [/\b(drop\s+database|migrate:fresh|db:wipe)\b/i, "destroys database data"],
];

export function dangerReason(command: string): string | null {
  for (const [re, why] of DANGEROUS) if (re.test(command)) return why;
  return null;
}

/** True if a command chains or redirects, so a prefix rule like "npm" cannot vouch for all of it. */
export function isCompound(command: string): boolean {
  return /[;&|`<>]|\$\(/.test(command);
}

export class PermissionManager {
  /** Session rules created by answering "always": `write_file`, `bash:npm`, ... */
  readonly rules = new Set<string>();

  constructor(
    public mode: PermissionMode,
    private prompter: Prompter | null,
    private kindOf: (toolName: string) => ToolKind | undefined,
  ) {}

  /** The rule an "always" answer creates for this call. */
  ruleFor(call: ToolUseBlock): string | null {
    if (call.name !== "bash") return call.name;
    const command = String(call.input.command ?? "").trim();
    if (isCompound(command)) return null;
    const program = command.split(/\s+/)[0];
    return program ? `bash:${program}` : null;
  }

  async check(call: ToolUseBlock): Promise<Decision> {
    const kind = this.kindOf(call.name) ?? "execute";
    if (kind === "read") return { allowed: true };

    if (this.mode === "read-only") {
      return { allowed: false, reason: `Permission mode is read-only; ${call.name} is not allowed.` };
    }

    const danger = call.name === "bash" ? dangerReason(String(call.input.command ?? "")) : null;
    const rule = this.ruleFor(call);

    if (!danger) {
      if (this.mode === "auto") return { allowed: true };
      if (rule && this.rules.has(rule)) return { allowed: true };
    }

    if (!this.prompter) {
      return { allowed: false, reason: `${call.name} needs approval but no one is available to approve it.` };
    }

    const warning = danger ? `  WARNING: ${danger}\n` : "";
    const always = rule && !danger ? `, a = always allow ${rule}` : "";
    const answer = await this.prompter.ask(
      `${warning}Allow ${describeCall(call)}?  [y = yes, n = no${always}, or n: <tell the agent what to do instead>] `,
    );

    if (answer.choice === "always" && rule && !danger) this.rules.add(rule);
    if (answer.choice === "no") {
      const feedback = answer.feedback ? ` The user said: "${answer.feedback}"` : "";
      return { allowed: false, reason: `The user denied permission for this ${call.name} call.${feedback}` };
    }
    return { allowed: true };
  }
}

export function describeCall(call: ToolUseBlock): string {
  const i = call.input;
  switch (call.name) {
    case "bash":
      return `bash: ${i.command}`;
    case "write_file":
      return `write_file ${i.path} (${String(i.content ?? "").split("\n").length} lines)`;
    case "edit_file":
      return `edit_file ${i.path}\n  - ${preview(i.old_string)}\n  + ${preview(i.new_string)}\n`;
    default:
      return `${call.name} ${JSON.stringify(i)}`;
  }
}

function preview(value: unknown): string {
  const s = String(value ?? "").replace(/\n/g, "\\n");
  return s.length > 120 ? s.slice(0, 117) + "..." : s;
}

export function parseAnswer(raw: string | null): Answer {
  const text = (raw ?? "").trim();
  if (/^(y|yes)$/i.test(text)) return { choice: "yes" };
  if (/^(a|always)$/i.test(text)) return { choice: "always" };
  const feedback = text.match(/^n(?:o)?\s*[:,-]\s*(.+)$/i)?.[1]?.trim();
  return { choice: "no", ...(feedback ? { feedback } : {}) };
}
