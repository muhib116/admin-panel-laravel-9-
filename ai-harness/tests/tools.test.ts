import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileTool } from "../src/tools/readFile.js";
import { ToolRegistry } from "../src/tools/registry.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "mini-claude-"));
  await writeFile(join(cwd, "a.txt"), "one\ntwo\nthree\nfour");
});

describe("ToolRegistry", () => {
  const registry = new ToolRegistry([readFileTool]);

  it("exposes JSON schemas for the model", () => {
    expect(registry.schemas()[0]).toMatchObject({ name: "read_file", input_schema: { required: ["path"] } });
  });

  it("runs a tool and pairs the result with the call id", async () => {
    const res = await registry.run({ type: "tool_use", id: "t1", name: "read_file", input: { path: "a.txt" } }, { cwd });
    expect(res).toEqual({ type: "tool_result", tool_use_id: "t1", content: "     1|one\n     2|two\n     3|three\n     4|four" });
  });

  it("turns unknown tools, missing params and failures into error results", async () => {
    const unknown = await registry.run({ type: "tool_use", id: "t", name: "fly", input: {} }, { cwd });
    expect(unknown).toMatchObject({ is_error: true, content: expect.stringContaining("Unknown tool") });

    const missing = await registry.run({ type: "tool_use", id: "t", name: "read_file", input: {} }, { cwd });
    expect(missing).toMatchObject({ is_error: true, content: expect.stringContaining("path") });

    const notFound = await registry.run({ type: "tool_use", id: "t", name: "read_file", input: { path: "nope" } }, { cwd });
    expect(notFound).toMatchObject({ is_error: true, content: expect.stringContaining("File not found") });
  });
});

describe("read_file", () => {
  it("supports offset and limit", async () => {
    expect(await readFileTool.run({ path: "a.txt", offset: 2, limit: 2 }, { cwd })).toBe("     2|two\n     3|three");
  });
});
