// Lesson 1: a single, raw call to an LLM. Deliberately uses plain fetch and
// no harness code, so you can see exactly what goes over the wire.
// Run: npm run lesson:1 -- "What is an AI harness?"

try {
  process.loadEnvFile(".env");
} catch {}

type Message = { role: "user" | "assistant"; content: string };

async function callClaude(system: string | undefined, messages: Message[], maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (copy .env.example to .env)");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return (await res.json()) as {
    content: { type: "text"; text: string }[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };
}

const question = process.argv.slice(2).join(" ") || "In one sentence, what is an AI agent harness?";
const system = "You are a concise teacher. Answer in at most three sentences.";
const messages: Message[] = [{ role: "user", content: question }];

console.log("--- REQUEST (what the model receives) ---");
console.log(JSON.stringify({ system, messages }, null, 2));

const reply = await callClaude(system, messages, 300);
console.log("\n--- RESPONSE ---");
console.log(JSON.stringify(reply, null, 2));

// Prove statelessness: ask a follow-up WITHOUT sending the history.
const followUp = await callClaude(undefined, [{ role: "user", content: "What did I just ask you?" }], 100);
console.log("\n--- FOLLOW-UP WITHOUT HISTORY ---");
console.log(followUp.content.map((b) => b.text).join(""));
