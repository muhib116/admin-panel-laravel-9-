# Lesson 3: The provider abstraction

## Concept

Every model vendor has a slightly different API. If the agent loop talks to
Anthropic's JSON directly, switching to a local model means rewriting the loop.
So harnesses put **one interface** between "the brain" and everything else:

```ts
// src/llm/provider.ts
interface LLMProvider {
  chat(req: { system, messages, tools, maxTokens, signal }): Promise<{
    content: ContentBlock[];   // text and tool_use blocks
    stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
    usage: { inputTokens, outputTokens };
  }>;
}
```

Implementations:

| File | What it does |
|------|--------------|
| `src/llm/anthropic.ts` | Claude API. Our internal format is already Anthropic-shaped, so almost no translation. |
| `src/llm/ollama.ts`    | Local models through Ollama. Real translation work, see below. |
| `src/llm/scripted.ts`  | A **fake LLM** that replies from a script. Used in tests, free and deterministic. |
| `src/llm/index.ts`     | `createProvider()` picks one from `MINI_CLAUDE_PROVIDER`. |

## Same idea, two wire formats

How a tool call looks in each API:

```jsonc
// Anthropic: everything is a content block inside one message
{ "role": "assistant", "content": [
    { "type": "text", "text": "Let me look." },
    { "type": "tool_use", "id": "t1", "name": "read_file", "input": { "path": "a.txt" } } ] }
{ "role": "user", "content": [
    { "type": "tool_result", "tool_use_id": "t1", "content": "file contents..." } ] }

// Ollama / OpenAI style: calls are a side array, results are separate "tool" messages
{ "role": "assistant", "content": "Let me look.",
  "tool_calls": [{ "function": { "name": "read_file", "arguments": { "path": "a.txt" } } }] }
{ "role": "tool", "tool_name": "read_file", "content": "file contents..." }
```

`toOllamaMessages()` and `fromOllamaMessage()` convert between them. Read
`tests/providers.test.ts` to see the exact before/after.

Some gotchas the translation handles:

- Ollama does not always return a tool call id, so we generate one. Our format
  needs ids to pair each `tool_result` with its `tool_use`.
- Some models return `arguments` as a JSON *string*, others as an object.
- There is no `is_error` flag in the Ollama format, so we prefix `ERROR:`.

## Why the fake LLM matters

`ScriptedProvider` is the secret weapon for testing agents. Real models are slow,
cost money and give different answers every time. A scripted model lets us write
tests like "if the model asks to read a file, does the harness really read it and
send back the result?", which is exactly what we test in Lesson 10.

## Run it

```bash
npm test                                   # translation tests
MINI_CLAUDE_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:3b npm start
```

## Exercise

1. Add an `OpenAIProvider` (`https://api.openai.com/v1/chat/completions`). Its format
   is almost the same as Ollama's, so you can reuse most of `ollama.ts`.
2. Add a `/model` command to the REPL that prints `provider.name` and `provider.model`.
