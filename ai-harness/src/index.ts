import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Agent } from "./agent/loop.js";
import { createProvider } from "./llm/index.js";
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
  },
});

const cwd = resolve(args.cwd ?? process.cwd());
const provider = createProvider();

const agent = new Agent({
  provider,
  tools: createCoreRegistry(),
  cwd,
  maxTurns: args["max-turns"] ? Number(args["max-turns"]) : undefined,
  system: `You are mini-claude, a coding agent running in a terminal. The project root is ${cwd}. Use your tools to inspect and change the project, then answer briefly.`,
  onEvent(event) {
    if (event.type === "assistant") {
      const text = textOf(event.content).trim();
      if (text) console.log(`\n${text}`);
    } else if (event.type === "tool_start") {
      console.log(`  [tool] ${event.call.name} ${JSON.stringify(event.call.input)}`);
    } else if (event.type === "tool_end") {
      const firstLine = event.result.content.split("\n")[0].slice(0, 100);
      console.log(`  [${event.result.is_error ? "error" : "ok"}] ${firstLine}`);
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
  process.exit(0);
}

const reader = new LineReader();
console.log(`mini-claude using ${provider.name}:${provider.model} in ${cwd}`);
console.log("(/exit to quit, /history to inspect the conversation)\n");

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
  await handle(line);
}

reader.close();
