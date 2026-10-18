import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Agent, type AgentEvent } from "../src/agent/loop.js";
import { ScriptedProvider, text, toolUse } from "../src/llm/scripted.js";
import { createCoreRegistry } from "../src/tools/index.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "mini-claude-agent-"));
  await writeFile(join(cwd, "greet.js"), 'console.log("helo world");\n');
});

function makeAgent(llm: ScriptedProvider, extra: Partial<ConstructorParameters<typeof Agent>[0]> = {}) {
  const events: AgentEvent[] = [];
  const agent = new Agent({
    provider: llm,
    tools: createCoreRegistry(),
    system: "test",
    cwd,
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return { agent, events };
}

describe("Agent loop", () => {
  it("returns immediately when the model answers without tools", async () => {
    const llm = new ScriptedProvider([[text("Hello!")]]);
    const { agent } = makeAgent(llm);
    const res = await agent.run("hi");
    expect(res).toEqual({ text: "Hello!", turns: 1, stoppedBecause: "done" });
    expect(agent.messages).toHaveLength(2);
  });

  it("runs a multi-step task: read, edit, verify, answer", async () => {
    const llm = new ScriptedProvider([
      [text("Let me look."), toolUse("t1", "read_file", { path: "greet.js" })],
      [toolUse("t2", "edit_file", { path: "greet.js", old_string: "helo", new_string: "hello" })],
      [toolUse("t3", "bash", { command: "node greet.js" })],
      (req) => {
        const last = req.messages.at(-1)!.content as { content: string }[];
        return [text(`Fixed. Output: ${last[0].content.split("\n").at(-1)}`)];
      },
    ]);
    const { agent, events } = makeAgent(llm);

    const res = await agent.run("fix the typo in greet.js");

    expect(res.turns).toBe(4);
    expect(res.text).toBe("Fixed. Output: hello world");
    expect(await readFile(join(cwd, "greet.js"), "utf8")).toBe('console.log("hello world");\n');
    expect(events.filter((e) => e.type === "tool_start").map((e) => (e as any).call.name)).toEqual([
      "read_file",
      "edit_file",
      "bash",
    ]);
    // Second request must contain the tool result paired with the first call.
    expect(llm.requests[1].messages.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: expect.stringContaining("helo world") }],
    });
  });

  it("answers every parallel tool call in one user message", async () => {
    const llm = new ScriptedProvider([
      [toolUse("a", "list_files", {}), toolUse("b", "grep", { pattern: "helo" })],
      [text("done")],
    ]);
    const { agent } = makeAgent(llm);
    await agent.run("explore");
    const results = llm.requests[1].messages.at(-1)!.content as { tool_use_id: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["a", "b"]);
  });

  it("feeds tool errors back so the model can recover", async () => {
    const llm = new ScriptedProvider([
      [toolUse("t1", "read_file", { path: "gret.js" })],
      [toolUse("t2", "read_file", { path: "greet.js" })],
      [text("ok")],
    ]);
    const { agent } = makeAgent(llm);
    await agent.run("read greet");
    expect(llm.requests[1].messages.at(-1)!.content).toMatchObject([{ is_error: true }]);
    expect(llm.requests[2].messages.at(-1)!.content).toMatchObject([{ content: expect.stringContaining("helo") }]);
  });

  it("stops at maxTurns and keeps roles alternating for the next request", async () => {
    const loop = () => [toolUse(`t${Math.random()}`, "list_files", {})];
    const llm = new ScriptedProvider([loop, loop, [text("next answer")]]);
    const { agent } = makeAgent(llm, { maxTurns: 2 });

    expect((await agent.run("loop forever")).stoppedBecause).toBe("max_turns");
    await agent.run("continue");

    const roles = llm.requests[2].messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(llm.requests[2].messages.at(-1)!.content).toMatchObject([
      { type: "tool_result" },
      { type: "text", text: "continue" },
    ]);
  });
});
