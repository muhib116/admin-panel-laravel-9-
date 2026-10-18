import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "./types.js";

/**
 * A session is a JSONL file, one JSON record per line:
 *   {"type":"meta", ...}               first line: who, where, when
 *   {"type":"message","message":{...}} one per new message (append-only, crash-safe)
 *   {"type":"replace","messages":[...]} after compaction or an in-place merge
 * Replaying the lines in order rebuilds the exact history.
 */
export type SessionRecord =
  | { type: "meta"; id: string; cwd: string; createdAt: string; provider: string; model: string }
  | { type: "message"; message: Message }
  | { type: "replace"; messages: Message[] };

export function sessionsDir(cwd: string, home = process.env.MINI_CLAUDE_HOME ?? join(homedir(), ".mini-claude")) {
  const slug = cwd.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root";
  return join(home, "sessions", slug);
}

export class Session {
  private persisted = 0;
  private lastJson = "";

  private constructor(
    readonly id: string,
    readonly path: string,
  ) {}

  static async create(cwd: string, info: { provider: string; model: string }, dir = sessionsDir(cwd)): Promise<Session> {
    await mkdir(dir, { recursive: true });
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
    const session = new Session(id, join(dir, `${id}.jsonl`));
    await session.write({ type: "meta", id, cwd, createdAt: new Date().toISOString(), ...info });
    return session;
  }

  /** Open an existing session file and return it together with its rebuilt history. */
  static async open(path: string): Promise<{ session: Session; messages: Message[]; meta: SessionRecord & { type: "meta" } }> {
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    let meta: (SessionRecord & { type: "meta" }) | null = null;
    let messages: Message[] = [];
    for (const line of lines) {
      let rec: SessionRecord;
      try {
        rec = JSON.parse(line);
      } catch {
        continue; // a half-written last line after a crash
      }
      if (rec.type === "meta") meta = rec;
      else if (rec.type === "message") messages.push(rec.message);
      else if (rec.type === "replace") messages = rec.messages;
    }
    if (!meta) throw new Error(`${path} is not a mini-claude session`);
    const session = new Session(meta.id, path);
    session.markPersisted(messages);
    return { session, messages, meta };
  }

  static async list(cwd: string, dir = sessionsDir(cwd)): Promise<{ id: string; path: string; modified: Date }[]> {
    let names: string[] = [];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith(".jsonl"));
    } catch {}
    const out = await Promise.all(
      names.map(async (n) => ({ id: n.replace(/\.jsonl$/, ""), path: join(dir, n), modified: (await stat(join(dir, n))).mtime })),
    );
    return out.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  private async write(rec: SessionRecord) {
    await appendFile(this.path, JSON.stringify(rec) + "\n", "utf8");
  }

  private markPersisted(messages: Message[]) {
    this.persisted = messages.length;
    this.lastJson = messages.length ? JSON.stringify(messages.at(-1)) : "";
  }

  /**
   * Persist whatever changed since the last sync. New messages are appended;
   * if history shrank (compaction) or the last saved message was mutated (merge), write a full replace.
   */
  async sync(messages: Message[]) {
    const rewritten =
      messages.length < this.persisted ||
      (this.persisted > 0 && JSON.stringify(messages[this.persisted - 1]) !== this.lastJson);
    if (rewritten) {
      await this.write({ type: "replace", messages });
    } else {
      for (const message of messages.slice(this.persisted)) await this.write({ type: "message", message });
    }
    this.markPersisted(messages);
  }
}
