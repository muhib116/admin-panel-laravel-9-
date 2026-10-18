import { createProvider } from "./llm/index.js";
import { readFileTool } from "./tools/readFile.js";
import { ToolRegistry } from "./tools/registry.js";
import { textOf, toolUsesOf, type Message } from "./types.js";
import { LineReader } from "./ui/input.js";

try {
  process.loadEnvFile(".env");
} catch {}

const cwd = process.cwd();
const system = `You are mini-claude, a helpful assistant running in a terminal. The project root is ${cwd}.`;
const provider = createProvider();
const tools = new ToolRegistry([readFileTool]);

// The whole "memory" of the chat. Every turn we append to it and resend ALL of it.
const messages: Message[] = [];

const reader = new LineReader();
console.log(`mini-claude using ${provider.name}:${provider.model} (/exit to quit, /history to inspect)\n`);

while (true) {
  const raw = await reader.read("> ");
  if (raw === null) break;
  const line = raw.trim();
  if (!line) continue;
  if (line === "/exit") break;
  if (line === "/history") {
    console.log(JSON.stringify(messages, null, 2));
    continue;
  }

  messages.push({ role: "user", content: line });

  const historyLength = messages.length - 1;
  try {
    let reply = await provider.chat({ system, messages, tools: tools.schemas() });
    messages.push({ role: "assistant", content: reply.content });

    // One round of tool use: the model asked, WE execute, then we send the result back.
    const calls = toolUsesOf(reply.content);
    if (calls.length) {
      const results = [];
      for (const call of calls) {
        console.log(`  [tool] ${call.name} ${JSON.stringify(call.input)}`);
        results.push(await tools.run(call, { cwd }));
      }
      messages.push({ role: "user", content: results });
      reply = await provider.chat({ system, messages, tools: tools.schemas() });
      messages.push({ role: "assistant", content: reply.content });
    }

    console.log(`\n${textOf(reply.content)}\n`);
    console.log(
      `[tokens in=${reply.usage.inputTokens} out=${reply.usage.outputTokens} | messages=${messages.length}]\n`,
    );
  } catch (err) {
    messages.length = historyLength;
    console.error(`Error: ${(err as Error).message}\n`);
  }
}

reader.close();
