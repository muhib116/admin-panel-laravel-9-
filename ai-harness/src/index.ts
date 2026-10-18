import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Agent } from "./agent/loop.js";
import { buildSystemPrompt, detectEnvironment } from "./context/systemPrompt.js";
import { createProvider } from "./llm/index.js";
import { parseAnswer, PermissionManager, type PermissionMode, type Prompter } from "./permissions.js";
import { createCoreRegistry } from "./tools/index.js";
import { LineReader } from "./ui/input.js";
import { createRenderer, makeStyler } from "./ui/render.js";

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
    stream: { type: "boolean", default: true },
    "no-stream": { type: "boolean" },
  },
});
if (args["no-stream"]) args.stream = false;

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

const paint = makeStyler(Boolean(process.stdout.isTTY));
const reader = new LineReader();
let running: AbortController | null = null;

const prompter: Prompter = {
  async ask(question) {
    return parseAnswer(await reader.read(`\n${paint("yellow", question)}`));
  },
};
const permissions = new PermissionManager(mode, prompter, (name) => tools.get(name)?.kind);

const agent = new Agent({
  provider,
  tools,
  cwd,
  permissions,
  stream: args.stream,
  maxTurns: args["max-turns"] ? Number(args["max-turns"]) : undefined,
  system,
  onEvent: createRenderer({ tools }),
});

// Ctrl+C while working interrupts the agent; Ctrl+C twice while idle exits.
let lastIdleSigint = 0;
let lastAbort = 0;
process.on("SIGINT", () => {
  if (running) {
    running.abort();
    reader.cancel();
    lastAbort = Date.now();
    return;
  }
  // One keypress can arrive twice: once from the terminal and once relayed by a wrapper like tsx.
  if (Date.now() - lastAbort < 500) return;
  if (Date.now() - lastIdleSigint < 2000) process.exit(130);
  lastIdleSigint = Date.now();
  process.stdout.write(paint("dim", "\n(press Ctrl+C again to exit)\n> "));
});

async function handle(input: string) {
  running = new AbortController();
  try {
    const result = await agent.run(input, { signal: running.signal });
    const { inputTokens, outputTokens } = agent.totalUsage;
    const note = result.stoppedBecause === "done" ? "" : ` | stopped: ${result.stoppedBecause}`;
    console.log(paint("dim", `\n[turns=${result.turns} | total tokens in=${inputTokens} out=${outputTokens}${note}]\n`));
  } catch (err) {
    console.error(paint("red", `Error: ${(err as Error).message}\n`));
  } finally {
    running = null;
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
