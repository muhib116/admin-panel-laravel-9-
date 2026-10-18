# Lesson 1: The raw LLM call

## Concept

An LLM API is just **one HTTP POST**. You send JSON and get JSON back. Everything a
"smart assistant" like Claude Code does is built on top of this single call.

The request (see `src/llm/anthropic.ts`):

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 300,
  "system": "You are a concise teacher...",
  "messages": [
    { "role": "user", "content": "What is an AI harness?" }
  ]
}
```

| Field        | Meaning |
|--------------|---------|
| `system`     | Instructions that frame the whole conversation (who the model is, rules). |
| `messages`   | The conversation so far. Roles alternate `user` and `assistant`. |
| `max_tokens` | Hard cap on the length of the *reply*. If hit, `stop_reason` is `max_tokens`. |

The response:

```json
{
  "content": [{ "type": "text", "text": "An AI harness is..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 31, "output_tokens": 42 }
}
```

Notice that `content` is an **array of blocks**, not a string. Today the only block is
`text`; in Lesson 4 a new block type, `tool_use`, appears. That is how the model
"asks" the harness to do something.

## The most important fact: the model is stateless

The server keeps **no memory** between calls. The example script asks a follow-up
question without resending the first one, and the model has no idea what you asked.
Every bit of "memory" an assistant has exists because the *harness* resends it.

## Tokens and cost

You pay for `input_tokens + output_tokens` on **every** call. Since the harness resends
the entire history each time, long conversations get more expensive with every turn.
Keep this in mind; Lesson 9 is about fighting it.

## Run it

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY
npm run lesson:1 -- "Explain recursion to a 10 year old"
```

## Exercise

1. Change `max_tokens` to `5`. What happens to `stop_reason`?
2. Change the `system` prompt to "You only answer in pirate speak." Same question,
   different personality: the system prompt is a powerful lever.
3. Put two `user` messages in a row in `messages`. Read the API error. Why do you
   think roles must alternate?
