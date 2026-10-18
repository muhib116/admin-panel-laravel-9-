import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Agent } from "./agent/loop.js";
import { createTaskTool } from "./agent/subagent.js";
import { formatMemory, loadMemory, rememberLine } from "./context/memory.js";
import { buildSystemPrompt, detectEnvironment } from "./context/systemPrompt.js";
import { createProvider } from "./llm/index.js";
import { parseAnswer, PermissionManager, type PermissionMode, type Prompter } from "./permissions.js";
import { Session } from "./session.js";
import { createCoreRegistry } from "./tools/index.js";
import { ToolRegistry } from "./tools/registry.js";
import type { Message } from "./types.js";
import { LineReader } from "./ui/input.js";
import { createRenderer, makeStyler } from "./ui/render.js";

// Load the harness's own .env, not the one of the project being worked on.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
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
    resume: { type: "boolean", short: "r" },
    session: { type: "string" },
    "no-subagents": { type: "boolean" },
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
let memoryFiles = await loadMemory(cwd);
const system = () =>
  buildSystemPrompt({
    env: detectEnvironment(cwd),
    toolNames: tools.schemas().map((t) => t.name),
    memory: formatMemory(memoryFiles),
  });

const paint = makeStyler(Boolean(process.stdout.isTTY));
const reader = new LineReader();
let running: AbortController | null = null;

const prompter: Prompter = {
  async ask(question) {
    return parseAnswer(await reader.read(`\n${paint("yellow", question)}`));
  },
};
const permissions = new PermissionManager(mode, prompter, (name) => tools.get(name)?.kind);

if (!args["no-subagents"]) {
  // Built from the core tools before `task` is registered, so sub-agents cannot spawn sub-agents.
  const subTools = new ToolRegistry(createCoreRegistry().schemas().map((s) => tools.get(s.name)!));
  tools.register(
    createTaskTool({
      provider,
      tools: subTools,
      system,
      permissions,
      onEvent: createRenderer({ tools: subTools, indent: "    | ", toolsOnly: true }),
    }),
  );
}

let session: Session;
let restored: Message[] = [];
if (args.resume || args.session) {
  const all = await Session.list(cwd);
  const found = args.session ? all.find((s) => s.id === args.session || s.path === args.session) : all[0];
  if (!found) {
    console.error(args.session ? `No session ${args.session} for ${cwd}` : `No previous session for ${cwd}`);
    process.exit(1);
  }
  ({ session, messages: restored } = await Session.open(found.path));
} else {
  session = await Session.create(cwd, { provider: provider.name, model: provider.model });
}

// Writes happen in order, one at a time, even though events fire synchronously.
let saving = Promise.resolve();
const render = createRenderer({ tools });
const agent = new Agent({
  provider,
  tools,
  cwd,
  permissions,
  stream: args.stream,
  maxTurns: args["max-turns"] ? Number(args["max-turns"]) : undefined,
  system,
  onEvent(event) {
    if (event.type === "history") {
      const snapshot = structuredClone(event.messages);
      saving = saving.then(() => session.sync(snapshot)).catch((err) => console.error(`session save failed: ${err.message}`));
      return;
    }
    render(event);
  },
});
agent.messages = restored;

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
  await saving;
  process.exit(0);
}

const HELP = `Commands:
  /help                  show this help
  /history               print the raw conversation sent to the model
  /system                print the current system prompt
  /context               show how full the context window is
  /compact               summarize older messages now
  /memory                show loaded AGENT.md files
  /sessions              list saved sessions for this project
  /mode <ask|auto|read-only>   change the permission mode
  # <text>               remember <text> in ./AGENT.md
  /exit                  quit`;

/** Returns false when the REPL should exit. */
async function command(line: string): Promise<boolean> {
  const [name, ...rest] = line.split(/\s+/);
  switch (name) {
    case "/exit":
      return false;
    case "/help":
      console.log(HELP + "\n");
      break;
    case "/history":
      console.log(JSON.stringify(agent.messages, null, 2));
      break;
    case "/system":
      console.log(system());
      break;
    case "/context": {
      const used = agent.contextTokens();
      const pct = ((used / agent.contextWindow) * 100).toFixed(1);
      console.log(`context: ~${used} / ${agent.contextWindow} tokens (${pct}%), ${agent.messages.length} messages\n`);
      break;
    }
    case "/compact": {
      running = new AbortController();
      try {
        if (!(await agent.compact(running.signal))) console.log("Nothing to compact yet.\n");
      } catch (err) {
        console.error(paint("red", `Error: ${(err as Error).message}\n`));
      } finally {
        running = null;
      }
      break;
    }
    case "/memory":
      memoryFiles = await loadMemory(cwd);
      console.log(memoryFiles.length ? memoryFiles.map((f) => `${f.scope}: ${f.path}`).join("\n") + "\n" : "No AGENT.md files found.\n");
      break;
    case "/mode": {
      const next = rest[0] as PermissionMode;
      if (MODES.includes(next)) permissions.mode = next;
      console.log(`permission mode: ${permissions.mode}; always-rules: ${[...permissions.rules].join(", ") || "none"}\n`);
      break;
    }
    case "/sessions": {
      const all = await Session.list(cwd);
      console.log(
        all
          .slice(0, 10)
          .map((s) => `${s.id === session.id ? "*" : " "} ${s.id}  (${s.modified.toLocaleString()})`)
          .join("\n") + "\n  resume with: --resume (latest) or --session <id>\n",
      );
      break;
    }
    default:
      console.log(`Unknown command ${name}. Type /help.\n`);
  }
  return true;
}

console.log(`mini-claude using ${provider.name}:${provider.model} in ${cwd} (permission mode: ${mode})`);
console.log(paint("dim", `session ${session.id}${restored.length ? ` (resumed, ${restored.length} messages)` : ""}`));
if (memoryFiles.length) console.log(paint("dim", `loaded memory: ${memoryFiles.map((f) => f.path).join(", ")}`));
console.log(paint("dim", "Type /help for commands.\n"));

while (true) {
  const raw = await reader.read("> ");
  if (raw === null) break;
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith("/")) {
    if (!(await command(line))) break;
    continue;
  }
  if (line.startsWith("#")) {
    const path = await rememberLine(cwd, line.replace(/^#+\s*/, ""));
    memoryFiles = await loadMemory(cwd);
    console.log(paint("dim", `Saved to ${path}\n`));
    continue;
  }
  await handle(line);
}

reader.close();
await saving;
process.exit(0);
