import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Agent } from "./agent/loop.js";
import { buildSystemPrompt, detectEnvironment } from "./context/systemPrompt.js";
import { createProvider } from "./llm/index.js";
import { parseAnswer, PermissionManager, type PermissionMode, type Prompter } from "./permissions.js";
import { createCoreRegistry } from "./tools/index.js";
import { textOf } from "./types.js";
import { LineReader } from "./ui/input.js";

try {
  process.loadEnvFile(".env");
} catch {}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cwd: { type: "string" },
    "max-turns": { type: "string" },
    mode: { type: "string", default: "ask" },
    yes: { type: "boolean", short: "y" },
  },
});

const MODES: PermissionMode[] = ["ask", "auto", "read-only"];
const mode = (args.yes ? "auto" : args.mode) as PermissionMode;
if (!MODES.includes(mode)) {
  console.error(`--mode must be one of ${MODES.join(", ")}`);
  process.exit(1);
}

const cwd = resolve(args.cwd ?? process.cwd());
const provider = createProvider();
const tools = createCoreRegistry();
const toolNames = tools.schemas().map((t) => t.name);
const system = () => buildSystemPrompt({ env: detectEnvironment(cwd), toolNames });

const reader = new LineReader();
const prompter: Prompter = {
  async ask(question) {
    return parseAnswer(await reader.read(`\n${question}`));
  },
};
const permissions = new PermissionManager(mode, prompter, (name) => tools.get(name)?.kind);

const agent = new Agent({
  provider,
  tools,
  cwd,
  permissions,
  maxTurns: args["max-turns"] ? Number(args["max-turns"]) : undefined,
  system,
  onEvent(event) {
    if (event.type === "assistant") {
      const text = textOf(event.content).trim();
      if (text) console.log(`\n${text}`);
    } else if (event.type === "tool_start") {
      console.log(`  [tool] ${event.call.name} ${JSON.stringify(event.call.input)}`);
    } else if (event.type === "tool_end") {
      const firstLine = event.result.content.split("\n")[0].slice(0, 100);
      console.log(`  [${event.result.is_error ? "error" : "ok"}] ${firstLine}`);
    } else if (event.type === "tool_denied") {
      console.log(`  [denied] ${event.reason}`);
    }
  },
});

async function handle(input: string) {
  try {
    const result = await agent.run(input);
    const { inputTokens, outputTokens } = agent.totalUsage;
    const note = result.stoppedBecause === "done" ? "" : ` | stopped: ${result.stoppedBecause}`;
    console.log(`\n[turns=${result.turns} | total tokens in=${inputTokens} out=${outputTokens}${note}]\n`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}\n`);
  }
}

// One-shot mode: `mini-claude "fix the failing test"`
if (positionals.length) {
  await handle(positionals.join(" "));
  reader.close();
  process.exit(0);
}

console.log(`mini-claude using ${provider.name}:${provider.model} in ${cwd} (permission mode: ${mode})`);
console.log("(/exit, /history, /system, /mode <ask|auto|read-only>)\n");

while (true) {
  const raw = await reader.read("> ");
  if (raw === null) break;
  const line = raw.trim();
  if (!line) continue;
  if (line === "/exit") break;
  if (line === "/history") {
    console.log(JSON.stringify(agent.messages, null, 2));
    continue;
  }
  if (line === "/system") {
    console.log(system());
    continue;
  }
  if (line.startsWith("/mode")) {
    const next = line.split(/\s+/)[1] as PermissionMode;
    if (MODES.includes(next)) permissions.mode = next;
    console.log(`permission mode: ${permissions.mode}; always-rules: ${[...permissions.rules].join(", ") || "none"}\n`);
    continue;
  }
  await handle(line);
}

reader.close();
