import { describe, expect, it } from "vitest";
import { buildSystemPrompt, detectEnvironment } from "../src/context/systemPrompt.js";

const env = { cwd: "/proj", platform: "linux 6", shell: "/bin/bash", date: "2026-10-18", gitBranch: "main" };

describe("buildSystemPrompt", () => {
  it("includes environment facts and tool names", () => {
    const prompt = buildSystemPrompt({ env, toolNames: ["read_file", "bash"] });
    expect(prompt).toContain("Project root: /proj");
    expect(prompt).toContain("Git branch: main");
    expect(prompt).toContain("Today's date: 2026-10-18");
    expect(prompt).toContain("Available tools: read_file, bash.");
    expect(prompt).not.toContain("AGENT.md)");
  });

  it("appends project memory last so it can override defaults", () => {
    const prompt = buildSystemPrompt({ env, toolNames: [], memory: "Always use tabs." });
    expect(prompt.trimEnd().endsWith("Always use tabs.")).toBe(true);
  });

  it("detects a missing git repo", () => {
    expect(detectEnvironment("/", new Date("2026-01-02T00:00:00Z"))).toMatchObject({ gitBranch: null, date: "2026-01-02" });
  });
});
