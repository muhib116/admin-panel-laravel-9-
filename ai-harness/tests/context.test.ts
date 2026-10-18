import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Agent, type AgentEvent } from "../src/agent/loop.js";
import { findCompactionSplit, renderTranscript, SUMMARY_PREFIX } from "../src/context/compaction.js";
import { formatMemory, loadMemory, rememberLine } from "../src/context/memory.js";
import { estimateTokens, truncateMiddle } from "../src/context/tokens.js";
import { ScriptedProvider, text, toolUse } from "../src/llm/scripted.js";
import { createCoreRegistry } from "../src/tools/index.js";
import type { Message } from "../src/types.js";

describe("tokens", () => {
  it("estimates about 4 chars per token", () => {
    expect(estimateTokens("abcd".repeat(10))).toBe(10);
  });

  it("truncates the middle and says so", () => {
    const out = truncateMiddle("A".repeat(600) + "B".repeat(400), 100);
    expect(out.startsWith("A".repeat(60))).toBe(true);
    expect(out.endsWith("B".repeat(40))).toBe(true);
    expect(out).toContain("900 characters truncated");
    expect(truncateMiddle("short", 100)).toBe("short");
  });
});

const big = (n: number) => "x".repeat(n);

function longHistory(): Message[] {
  return [
    { role: "user", content: "fix the login bug" },
    { role: "assistant", content: [toolUse("t1", "read_file", { path: "a" })] as never },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: big(4000) }] },
    { role: "assistant", content: [toolUse("t2", "read_file", { path: "b" })] as never },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: big(4000) }] },
    { role: "assistant", content: [text("found it")] },
    { role: "user", content: "now add a test" },
  ];
}

describe("compaction split", () => {
  it("cuts at an assistant message so tool pairs stay together", () => {
    const messages = longHistory();
    const i = findCompactionSplit(messages, 1200)!;
    expect(messages[i].role).toBe("assistant");
    expect(i).toBe(3);
  });

  it("falls back to the last assistant message, and refuses tiny histories", () => {
    expect(findCompactionSplit(longHistory(), 1)).toBe(5);
    expect(findCompactionSplit([{ role: "user", content: "hi" }], 10)).toBeNull();
  });

  it("renders a clipped transcript", () => {
    const t = renderTranscript(longHistory(), 10);
    expect(t).toContain("USER: fix the login bug");
    expect(t).toContain("TOOL CALL read_file");
    expect(t).toContain("[3990 more chars]");
  });
});

describe("Agent context management", () => {
  it("auto-compacts when the context fills up, then keeps working", async () => {
    const llm = new ScriptedProvider(
      [
        [toolUse("t1", "bash", { command: "head -c 6000 /dev/zero | tr '\\0' 'a'" })],
        [toolUse("t2", "bash", { command: "head -c 6000 /dev/zero | tr '\\0' 'b'" })],
        // The third call is the summarizer (it gets no tools).
        (req) => {
          expect(req.tools).toBeUndefined();
          expect(textOf(req.messages[0].content)).toContain("USER: make two big outputs");
          return [text("User wanted two big outputs; both were produced.")];
        },
        [text("All done.")],
      ],
      4000,
    );
    const events: AgentEvent[] = [];
    const agent = new Agent({
      provider: llm,
      tools: createCoreRegistry(),
      system: "sys",
      cwd: "/tmp",
      compactAt: 0.4,
      onEvent: (e) => events.push(e),
    });

    const res = await agent.run("make two big outputs");

    expect(res.text).toBe("All done.");
    const compacted = events.find((e) => e.type === "compacted");
    expect(compacted).toBeDefined();
    const final = llm.requests[3].messages;
    expect(textOf(final[0].content)).toContain(SUMMARY_PREFIX);
    expect(final[1].role).toBe("assistant");
    expect(final.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("truncates huge tool output before it enters the history", async () => {
    const llm = new ScriptedProvider([[toolUse("t1", "bash", { command: "head -c 50000 /dev/zero | tr '\\0' 'z'" })], [text("ok")]]);
    const agent = new Agent({ provider: llm, tools: createCoreRegistry(), system: "", cwd: "/tmp", maxToolResultChars: 1000 });
    await agent.run("big");
    const result = (agent.messages[2].content as { content: string }[])[0].content;
    expect(result.length).toBeLessThan(1300);
    expect(result).toContain("characters truncated");
  });
});

describe("memory", () => {
  it("loads user, project and local AGENT files in order, and appends with #", async () => {
    const home = await mkdtemp(join(tmpdir(), "mc-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "mc-proj-"));
    await mkdir(join(home, ".mini-claude"));
    await writeFile(join(home, ".mini-claude", "AGENT.md"), "Be brief.");
    await writeFile(join(cwd, "AGENT.local.md"), "My db is mysql.");

    await rememberLine(cwd, "Run php artisan test after edits");
    expect(await readFile(join(cwd, "AGENT.md"), "utf8")).toBe(
      "# Project instructions for mini-claude\n\n- Run php artisan test after edits\n",
    );

    const files = await loadMemory(cwd, home);
    expect(files.map((f) => f.scope)).toEqual(["user", "project", "local"]);
    const text = formatMemory(files);
    expect(text.indexOf("Be brief.")).toBeLessThan(text.indexOf("My db is mysql."));
  });
});

function textOf(content: Message["content"]): string {
  return typeof content === "string" ? content : content.map((b) => ("text" in b ? b.text : "")).join("");
}
