// Evals: run real tasks against a real model several times and measure the pass rate.
// Usage: npm run eval -- --runs 3 [--task fix-add-bug]
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Agent } from "../src/agent/loop.js";
import { buildSystemPrompt, detectEnvironment } from "../src/context/systemPrompt.js";
import { createProvider } from "../src/llm/index.js";
import { PermissionManager } from "../src/permissions.js";
import { createCoreRegistry } from "../src/tools/index.js";
import { tasks } from "./tasks.js";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {}

const { values } = parseArgs({ options: { runs: { type: "string", default: "3" }, task: { type: "string" } } });
const runs = Number(values.runs);
const selected = tasks.filter((t) => !values.task || t.id === values.task);
const provider = createProvider();

console.log(`Evaluating ${provider.name}:${provider.model}, ${selected.length} task(s) x ${runs} run(s)\n`);

const results: { task: string; run: number; pass: boolean; reason: string | null; turns: number; tokens: number; seconds: number }[] = [];

for (const task of selected) {
  for (let run = 1; run <= runs; run++) {
    const cwd = await mkdtemp(join(tmpdir(), `mc-eval-${task.id}-`));
    for (const [path, content] of Object.entries(task.files)) {
      await mkdir(dirname(join(cwd, path)), { recursive: true });
      await writeFile(join(cwd, path), content);
    }
    const tools = createCoreRegistry();
    const agent = new Agent({
      provider,
      tools,
      cwd,
      maxTurns: 12,
      // Evals run unattended: auto mode, and nobody to approve dangerous commands.
      permissions: new PermissionManager("auto", null, (n) => tools.get(n)?.kind),
      system: () => buildSystemPrompt({ env: detectEnvironment(cwd), toolNames: tools.schemas().map((t) => t.name) }),
    });

    const started = Date.now();
    let answer = "";
    let reason: string | null;
    let turns = 0;
    try {
      const res = await agent.run(task.prompt);
      answer = res.text;
      turns = res.turns;
      reason = task.check(cwd, answer);
    } catch (err) {
      reason = `crashed: ${(err as Error).message}`;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    const tokens = agent.totalUsage.inputTokens + agent.totalUsage.outputTokens;
    results.push({ task: task.id, run, pass: reason === null, reason, turns, tokens, seconds });
    console.log(`${reason === null ? "PASS" : "FAIL"}  ${task.id} #${run}  (${turns} turns, ${tokens} tokens, ${seconds}s)${reason ? `  ${reason}` : ""}`);
  }
}

console.log("\nSummary");
for (const task of selected) {
  const mine = results.filter((r) => r.task === task.id);
  const passed = mine.filter((r) => r.pass).length;
  console.log(`  ${task.id.padEnd(18)} ${passed}/${mine.length} passed`);
}
const total = results.filter((r) => r.pass).length;
console.log(`  ${"overall".padEnd(18)} ${total}/${results.length} (${Math.round((total / results.length) * 100)}%)`);

const outDir = fileURLToPath(new URL("./results/", import.meta.url));
await mkdir(outDir, { recursive: true });
const file = join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${provider.model.replace(/[^\w.-]/g, "_")}.json`);
await writeFile(file, JSON.stringify({ provider: provider.name, model: provider.model, results }, null, 2));
console.log(`\nSaved ${file}`);
