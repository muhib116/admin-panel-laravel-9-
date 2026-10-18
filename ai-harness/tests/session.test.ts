import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent/loop.js";
import { ScriptedProvider, text, toolUse } from "../src/llm/scripted.js";
import { Session, sessionsDir } from "../src/session.js";
import { createCoreRegistry } from "../src/tools/index.js";
import type { Message } from "../src/types.js";

const info = { provider: "scripted", model: "scripted" };

describe("Session", () => {
  it("appends new messages and replays them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-sessions-"));
    const s = await Session.create("/proj", info, dir);
    const messages: Message[] = [{ role: "user", content: "hi" }];
    await s.sync(messages);
    messages.push({ role: "assistant", content: [text("hello")] });
    await s.sync(messages);

    const lines = (await readFile(s.path, "utf8")).trim().split("\n").map((l) => JSON.parse(l).type);
    expect(lines).toEqual(["meta", "message", "message"]);
    expect((await Session.open(s.path)).messages).toEqual(messages);
  });

  it("writes a replace record after compaction or an in-place merge", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-sessions-"));
    const s = await Session.create("/proj", info, dir);
    const messages: Message[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: [{ type: "text", text: "c" }] },
    ];
    await s.sync(messages);
    (messages[2].content as any[]).push({ type: "text", text: "merged" });
    await s.sync(messages);
    await s.sync([{ role: "user", content: "summary" }]);

    const types = (await readFile(s.path, "utf8")).trim().split("\n").map((l) => JSON.parse(l).type);
    expect(types).toEqual(["meta", "message", "message", "message", "replace", "replace"]);
    expect((await Session.open(s.path)).messages).toEqual([{ role: "user", content: "summary" }]);
  });

  it("survives a half-written last line and lists newest first", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-sessions-"));
    const a = await Session.create("/proj", info, dir);
    await a.sync([{ role: "user", content: "x" }]);
    await appendFile(a.path, '{"type":"message","mess');
    expect((await Session.open(a.path)).messages).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 10));
    const b = await Session.create("/proj", info, dir);
    expect((await Session.list("/proj", dir)).map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("stores sessions per project directory", () => {
    expect(sessionsDir("/home/me/my app", "/h")).toBe("/h/sessions/home-me-my-app");
  });

  it("resumes an agent conversation from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-sessions-"));
    const session = await Session.create("/tmp", info, dir);
    let saving = Promise.resolve();
    const llm1 = new ScriptedProvider([[toolUse("t1", "list_files", { path: "." })], [text("I listed files.")]]);
    const agent1 = new Agent({
      provider: llm1,
      tools: createCoreRegistry(),
      system: "",
      cwd: await mkdtemp(join(tmpdir(), "mc-cwd-")),
      onEvent: (e) => {
        if (e.type === "history") {
          const snap = structuredClone(e.messages);
          saving = saving.then(() => session.sync(snap));
        }
      },
    });
    await agent1.run("list files");
    await saving;

    const { messages } = await Session.open(session.path);
    expect(messages).toEqual(agent1.messages);

    const llm2 = new ScriptedProvider([[text("We listed files earlier.")]]);
    const agent2 = new Agent({ provider: llm2, tools: createCoreRegistry(), system: "", cwd: "/tmp" });
    agent2.messages = messages;
    await agent2.run("what did we do?");
    expect(llm2.requests[0].messages).toHaveLength(5);
  });
});
