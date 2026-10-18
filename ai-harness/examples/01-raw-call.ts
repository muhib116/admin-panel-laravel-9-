// Lesson 1: a single, raw call to an LLM.
// Run: npm run lesson:1 -- "What is an AI harness?"
import { callClaude } from "../src/llm/anthropic.js";
import type { Message } from "../src/types.js";

try {
  process.loadEnvFile(".env");
} catch {}

const question = process.argv.slice(2).join(" ") || "In one sentence, what is an AI agent harness?";

const messages: Message[] = [{ role: "user", content: question }];
const system = "You are a concise teacher. Answer in at most three sentences.";

console.log("--- REQUEST (what the model receives) ---");
console.log(JSON.stringify({ system, messages }, null, 2));

const reply = await callClaude({ system, messages, maxTokens: 300 });

console.log("\n--- RESPONSE ---");
console.log(JSON.stringify(reply, null, 2));

// Prove statelessness: ask a follow-up WITHOUT sending the history.
const followUp = await callClaude({
  messages: [{ role: "user", content: "What did I just ask you?" }],
  maxTokens: 100,
});
console.log("\n--- FOLLOW-UP WITHOUT HISTORY ---");
console.log(followUp.content.map((b) => b.text).join(""));
