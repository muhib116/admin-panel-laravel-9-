import { callClaude } from "./llm/anthropic.js";
import { LineReader } from "./ui/input.js";
import type { Message } from "./types.js";

try {
  process.loadEnvFile(".env");
} catch {}

const system = "You are mini-claude, a helpful assistant running in a terminal.";

// The whole "memory" of the chat. Every turn we append to it and resend ALL of it.
const messages: Message[] = [];

const reader = new LineReader();
console.log("mini-claude (type /exit to quit, /history to see what gets sent)\n");

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
    const reply = await callClaude({ system, messages });
    const text = reply.content.map((b) => b.text).join("");
    messages.push({ role: "assistant", content: reply.content });
    console.log(`\n${text}\n`);
    console.log(
      `[tokens in=${reply.usage.inputTokens} out=${reply.usage.outputTokens} | messages=${messages.length}]\n`,
    );
  } catch (err) {
    messages.pop();
    console.error(`Error: ${(err as Error).message}\n`);
  }
}

reader.close();
