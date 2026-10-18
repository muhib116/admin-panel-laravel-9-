import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent/loop.js";
import { accumulateAnthropicStream } from "../src/llm/anthropic.js";
import { accumulateOllamaStream } from "../src/llm/ollama.js";
import { ScriptedProvider, text, toolUse } from "../src/llm/scripted.js";
import { parseSSE, readLines } from "../src/llm/stream.js";
import { createCoreRegistry } from "../src/tools/index.js";
import { createRenderer } from "../src/ui/render.js";

/** A fetch-like body that delivers the payload in awkward chunk sizes. */
function body(payload: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(payload);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const anthropicStream = [
  sse("message_start", { type: "message_start", message: { usage: { input_tokens: 42, output_tokens: 1 } } }),
  sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
  sse("ping", { type: "ping" }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me " } }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "look." } }),
  sse("content_block_stop", { type: "content_block_stop", index: 0 }),
  sse("content_block_start", {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "toolu_1", name: "read_file", input: {} },
  }),
  sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"pa' } }),
  sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'th":"a.ts"}' } }),
  sse("content_block_stop", { type: "content_block_stop", index: 1 }),
  sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 17 } }),
  sse("message_stop", { type: "message_stop" }),
].join("");

describe("stream parsing", () => {
  it("reassembles lines across chunk boundaries", async () => {
    const lines: string[] = [];
    for await (const l of readLines(body("a\r\nbb\n\nccc", 2))) lines.push(l);
    expect(lines).toEqual(["a", "bb", "", "ccc"]);
  });

  it("parses SSE events", async () => {
    const events = [];
    for await (const e of parseSSE(readLines(body(anthropicStream)))) events.push(e.event);
    expect(events[0]).toBe("message_start");
    expect(events.at(-1)).toBe("message_stop");
  });

  it("rebuilds an Anthropic response with text and a tool call from deltas", async () => {
    const deltas: string[] = [];
    const res = await accumulateAnthropicStream(parseSSE(readLines(body(anthropicStream))), (d) => deltas.push(d));
    expect(deltas).toEqual(["Let me ", "look."]);
    expect(res).toEqual({
      content: [
        { type: "text", text: "Let me look." },
        { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 42, outputTokens: 17 },
    });
  });

  it("surfaces stream errors", async () => {
    const payload = sse("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    await expect(accumulateAnthropicStream(parseSSE(readLines(body(payload))))).rejects.toThrow(/Overloaded/);
  });

  it("rebuilds an Ollama NDJSON stream", async () => {
    const ndjson = [
      { message: { role: "assistant", content: "Hel" }, done: false },
      { message: { role: "assistant", content: "lo" }, done: false },
      { message: { role: "assistant", content: "", tool_calls: [{ function: { name: "bash", arguments: { command: "ls" } } }] }, done: false },
      { message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 10, eval_count: 5 },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");
    const deltas: string[] = [];
    const res = await accumulateOllamaStream(readLines(body(ndjson, 5)), (d) => deltas.push(d));
    expect(deltas.join("")).toBe("Hello");
    expect(res.content[0]).toEqual({ type: "text", text: "Hello" });
    expect(res.content[1]).toMatchObject({ type: "tool_use", name: "bash", input: { command: "ls" } });
    expect(res.stopReason).toBe("tool_use");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe("Agent streaming and interrupts", () => {
  it("emits text deltas when streaming", async () => {
    const llm = new ScriptedProvider([[text("one two three")]]);
    const deltas: string[] = [];
    const agent = new Agent({
      provider: llm,
      tools: createCoreRegistry(),
      system: "",
      cwd: "/tmp",
      stream: true,
      onEvent: (e) => e.type === "text_delta" && deltas.push(e.text),
    });
    await agent.run("count");
    expect(deltas).toEqual(["one ", "two ", "three"]);
  });

  it("stops on abort during a tool and still answers every tool call", async () => {
    const controller = new AbortController();
    const llm = new ScriptedProvider([
      [toolUse("t1", "bash", { command: "sleep 10" }), toolUse("t2", "list_files", {})],
      [text("resumed")],
    ]);
    const agent = new Agent({ provider: llm, tools: createCoreRegistry(), system: "", cwd: "/tmp" });
    setTimeout(() => controller.abort(), 200);

    const started = Date.now();
    const res = await agent.run("slow", { signal: controller.signal });

    expect(res.stoppedBecause).toBe("interrupted");
    expect(Date.now() - started).toBeLessThan(5000);
    const results = agent.messages.at(-1)!.content as { tool_use_id: string; content: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
    expect(results[0].content).toMatch(/interrupted by user/);
    expect(results[1].content).toMatch(/Interrupted by user before/);

    // The conversation is still valid: the next request works and roles alternate.
    await agent.run("go on");
    expect(llm.requests[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("returns interrupted when aborted during the model call", async () => {
    const controller = new AbortController();
    const llm = new ScriptedProvider([
      async () => {
        controller.abort();
        return [text("never seen")];
      },
    ]);
    const agent = new Agent({ provider: llm, tools: createCoreRegistry(), system: "", cwd: "/tmp" });
    expect((await agent.run("hi", { signal: controller.signal })).stoppedBecause).toBe("interrupted");
    expect(agent.messages).toHaveLength(1);
  });
});

describe("renderer", () => {
  it("prints streamed text once and summarizes tool activity", () => {
    let output = "";
    const out = new Writable({ write: (c, _e, cb) => ((output += c), cb()) });
    const render = createRenderer({ tools: createCoreRegistry(), out, color: false });
    const call = toolUse("t", "read_file", { path: "a.ts" }) as never;

    render({ type: "text_delta", text: "Hi " });
    render({ type: "text_delta", text: "there" });
    render({ type: "assistant", content: [text("Hi there"), call] });
    render({ type: "tool_start", call });
    render({ type: "tool_end", call, result: { type: "tool_result", tool_use_id: "t", content: "1|a\n2|b" } });

    expect(output).toBe("\nHi there\n  > Reading a.ts\n    1|a (+1 lines)\n");
  });
});
