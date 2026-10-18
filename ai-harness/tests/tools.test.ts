import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { bashTool } from "../src/tools/bash.js";
import { editFileTool } from "../src/tools/editFile.js";
import { grepTool } from "../src/tools/grep.js";
import { listFilesTool } from "../src/tools/listFiles.js";
import { readFileTool } from "../src/tools/readFile.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { globToRegExp } from "../src/tools/walk.js";
import { writeFileTool } from "../src/tools/writeFile.js";

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

describe("edit_file", () => {
  it("replaces a unique string", async () => {
    await editFileTool.run({ path: "a.txt", old_string: "two", new_string: "2" }, { cwd });
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("one\n2\nthree\nfour");
  });

  it("refuses ambiguous or missing matches unless replace_all", async () => {
    await writeFile(join(cwd, "b.txt"), "x x x");
    await expect(editFileTool.run({ path: "b.txt", old_string: "x", new_string: "y" }, { cwd })).rejects.toThrow(/3 times/);
    await expect(editFileTool.run({ path: "b.txt", old_string: "z", new_string: "y" }, { cwd })).rejects.toThrow(/not found/);
    expect(await editFileTool.run({ path: "b.txt", old_string: "x", new_string: "$&y", replace_all: true }, { cwd })).toMatch(
      /3 replacements/,
    );
    expect(await readFile(join(cwd, "b.txt"), "utf8")).toBe("$&y $&y $&y");
  });

  it("explains when old_string was copied with read_file line numbers", async () => {
    await expect(
      editFileTool.run({ path: "a.txt", old_string: "     2|two\n     3|three", new_string: "x" }, { cwd }),
    ).rejects.toThrow(/line-number prefixes \(like "     2\|"\)/);
  });
});

describe("write_file", () => {
  it("creates parent directories", async () => {
    await writeFileTool.run({ path: "deep/dir/c.txt", content: "hi" }, { cwd });
    expect(await readFile(join(cwd, "deep/dir/c.txt"), "utf8")).toBe("hi");
  });
});

describe("list_files and grep", () => {
  beforeEach(async () => {
    await mkdir(join(cwd, "src/sub"), { recursive: true });
    await mkdir(join(cwd, "node_modules/pkg"), { recursive: true });
    await writeFile(join(cwd, "src/main.ts"), "export function login() {}\n");
    await writeFile(join(cwd, "src/sub/util.ts"), "// LOGIN helper\n");
    await writeFile(join(cwd, "node_modules/pkg/index.js"), "login");
  });

  it("lists recursively, skipping ignored dirs, with glob filters", async () => {
    expect(await listFilesTool.run({}, { cwd })).toBe("a.txt\nsrc/main.ts\nsrc/sub/util.ts");
    expect(await listFilesTool.run({ pattern: "*.ts" }, { cwd })).toBe("src/main.ts\nsrc/sub/util.ts");
    expect(await listFilesTool.run({ pattern: "src/*.ts" }, { cwd })).toBe("src/main.ts");
    expect(await listFilesTool.run({ pattern: "src/**/*.ts" }, { cwd })).toBe("src/main.ts\nsrc/sub/util.ts");
  });

  it("greps with line numbers and case options", async () => {
    expect(await grepTool.run({ pattern: "login" }, { cwd })).toBe("src/main.ts:1: export function login() {}");
    expect(await grepTool.run({ pattern: "login", ignore_case: true, glob: "util.*" }, { cwd })).toBe(
      "src/sub/util.ts:1: // LOGIN helper",
    );
    await expect(grepTool.run({ pattern: "(" }, { cwd })).rejects.toThrow(/Invalid regex/);
  });

  it("globToRegExp handles braces", () => {
    expect(globToRegExp("*.{ts,js}").test("a/b.js")).toBe(true);
    expect(globToRegExp("*.{ts,js}").test("a/b.php")).toBe(false);
  });
});

describe("bash", () => {
  it("returns exit code, stdout and stderr", async () => {
    const out = await bashTool.run({ command: "echo hi; echo oops >&2; exit 3" }, { cwd });
    expect(out).toBe("Exit code: 3\nstdout:\nhi\nstderr:\noops");
  });

  it("kills commands that time out", async () => {
    expect(await bashTool.run({ command: "sleep 5", timeout_ms: 200 }, { cwd })).toMatch(/timed out/);
  });

  it("runs in the project directory", async () => {
    expect(await bashTool.run({ command: "cat a.txt | wc -l" }, { cwd })).toMatch(/3/);
  });
});
