import { createProvider } from "./llm/index.js";
import { textOf, type Message } from "./types.js";
import { LineReader } from "./ui/input.js";

try {
  process.loadEnvFile(".env");
} catch {}

const system = "You are mini-claude, a helpful assistant running in a terminal.";
const provider = createProvider();

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

  try {
    const reply = await provider.chat({ system, messages });
    messages.push({ role: "assistant", content: reply.content });
    console.log(`\n${textOf(reply.content)}\n`);
    console.log(
      `[tokens in=${reply.usage.inputTokens} out=${reply.usage.outputTokens} | messages=${messages.length}]\n`,
    );
  } catch (err) {
    messages.pop();
    console.error(`Error: ${(err as Error).message}\n`);
  }
}

reader.close();
