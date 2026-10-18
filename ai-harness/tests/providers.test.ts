import { describe, expect, it } from "vitest";
import { fromOllamaMessage, mapOllamaStopReason, toOllamaMessages, toOllamaTools } from "../src/llm/ollama.js";
import { createProvider } from "../src/llm/index.js";
import { ScriptedProvider, text, toolUse } from "../src/llm/scripted.js";
import type { Message } from "../src/types.js";

describe("Ollama translation", () => {
  it("splits tool_use and tool_result blocks into OpenAI-style messages", () => {
    const messages: Message[] = [
      { role: "user", content: "read a.txt" },
      {
        role: "assistant",
        content: [text("Sure."), toolUse("t1", "read_file", { path: "a.txt" })],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "hello" }] },
    ];

    expect(toOllamaMessages("sys", messages)).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "read a.txt" },
      {
        role: "assistant",
        content: "Sure.",
        tool_calls: [{ id: "t1", function: { name: "read_file", arguments: { path: "a.txt" } } }],
      },
      { role: "tool", content: "hello", tool_name: "read_file" },
    ]);
  });

  it("marks failed tool results so the model can see the error", () => {
    const out = toOllamaMessages(undefined, [
      { role: "assistant", content: [toolUse("t1", "bash", { command: "x" })] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true }] },
    ]);
    expect(out[1]).toEqual({ role: "tool", content: "ERROR: boom", tool_name: "bash" });
  });

  it("converts tool schemas to the function format", () => {
    const tools = toOllamaTools([
      { name: "read_file", description: "Read", input_schema: { type: "object", properties: {} } },
    ]);
    expect(tools).toEqual([
      { type: "function", function: { name: "read_file", description: "Read", parameters: { type: "object", properties: {} } } },
    ]);
  });

  it("parses tool calls, including string arguments, and assigns ids", () => {
    const blocks = fromOllamaMessage({
      role: "assistant",
      content: "",
      tool_calls: [
        { function: { name: "read_file", arguments: { path: "a" } } },
        { function: { name: "bash", arguments: '{"command":"ls"}' } },
      ],
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "tool_use", name: "read_file", input: { path: "a" } });
    expect(blocks[1]).toMatchObject({ type: "tool_use", name: "bash", input: { command: "ls" } });
    expect((blocks[0] as { id: string }).id).not.toEqual((blocks[1] as { id: string }).id);
    expect(mapOllamaStopReason(blocks)).toBe("tool_use");
    expect(mapOllamaStopReason([text("hi")], "length")).toBe("max_tokens");
  });
});

describe("createProvider", () => {
  it("chooses anthropic when a key is present and ollama otherwise", () => {
    expect(createProvider({ ANTHROPIC_API_KEY: "k" }).name).toBe("anthropic");
    expect(createProvider({}).name).toBe("ollama");
    expect(() => createProvider({ MINI_CLAUDE_PROVIDER: "nope" })).toThrow(/Unknown/);
  });
});

describe("ScriptedProvider", () => {
  it("replays scripted replies and records requests", async () => {
    const llm = new ScriptedProvider([[text("one")], () => [text("two")]]);
    const r1 = await llm.chat({ messages: [{ role: "user", content: "a" }] });
    const r2 = await llm.chat({ messages: [{ role: "user", content: "b" }] });
    expect(r1.content).toEqual([text("one")]);
    expect(r2.content).toEqual([text("two")]);
    expect(llm.requests).toHaveLength(2);
    await expect(llm.chat({ messages: [] })).rejects.toThrow(/ran out/);
  });
});
