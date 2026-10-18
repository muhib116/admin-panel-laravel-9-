import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Agent, type AgentEvent } from "../src/agent/loop.js";
import { createTaskTool } from "../src/agent/subagent.js";
import { ScriptedProvider, text, toolUse } from "../src/llm/scripted.js";
import { createCoreRegistry } from "../src/tools/index.js";
import type { ToolResultBlock } from "../src/types.js";

describe("task tool (sub-agents)", () => {
  it("runs a fresh agent and returns only its final report to the parent", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mc-sub-"));
    await writeFile(join(cwd, "routes.php"), "Route::get('/login', [LoginController::class, 'show']);\n" + "// filler\n".repeat(500));

    // One scripted model plays both roles, in call order.
    const llm = new ScriptedProvider([
      // 1. parent delegates
      [toolUse("p1", "task", { description: "Find login route", prompt: "Find where /login is defined. Report file:line." })],
      // 2. sub-agent starts with an empty conversation containing only the prompt
      (req) => {
        expect(req.messages).toHaveLength(1);
        expect(req.system).toContain("You are a sub-agent");
        expect(req.tools!.map((t) => t.name)).not.toContain("task");
        return [toolUse("s1", "read_file", { path: "routes.php" })];
      },
      // 3. sub-agent reports
      [text("/login is defined at routes.php:1 (LoginController@show).")],
      // 4. parent answers using the report
      (req) => {
        const result = (req.messages.at(-1)!.content as ToolResultBlock[])[0];
        expect(result.content).toContain("routes.php:1");
        expect(result.content).not.toContain("filler");
        return [text("The login route is in routes.php line 1.")];
      },
    ]);

    const subTools = createCoreRegistry();
    const subEvents: AgentEvent[] = [];
    const tools = createCoreRegistry();
    tools.register(createTaskTool({ provider: llm, tools: subTools, system: () => "base", onEvent: (e) => subEvents.push(e) }));
    const parent = new Agent({ provider: llm, tools, system: "base", cwd });

    const res = await parent.run("where is the login route?");

    expect(res.text).toBe("The login route is in routes.php line 1.");
    expect(subEvents.some((e) => e.type === "tool_start" && e.call.name === "read_file")).toBe(true);
    // The parent's history holds the short report, not the 500-line file the sub-agent read.
    expect(JSON.stringify(parent.messages)).not.toContain("filler");
    expect(JSON.stringify(parent.messages)).toContain("[sub-agent: 2 turns");
  });
});
