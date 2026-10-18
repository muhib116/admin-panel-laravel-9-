# Lesson 5: The agent loop

## Concept

This is the single most important idea in the whole project. An "agent" is a
**loop** around the model:

```ts
// src/agent/loop.ts (simplified)
for (let turn = 1; turn <= maxTurns; turn++) {
  const res = await provider.chat({ system, messages, tools });
  messages.push({ role: "assistant", content: res.content });

  const calls = toolUsesOf(res.content);
  if (calls.length === 0) return textOf(res.content);   // model decided it is done

  const results = [];
  for (const call of calls) results.push(await tools.run(call, ctx));
  messages.push({ role: "user", content: results });     // show it what happened
}
```

The model decides **what** to do next. The harness decides **how** it happens, and
when to stop. This pattern is often called **ReAct** (Reason + Act): think, act,
observe the result, think again.

## A real run (qwen2.5:3b, running locally)

```
> math.js should print 5 but prints something else. Read it, fix the bug, run it.
  [tool] read_file {"path":"math.js"}
  [ok]      1|function add(a, b) {
I need to change `return a - b;` to `return a + b;`
  [tool] edit_file {"path":"math.js","old_string":"return a - b;","new_string":"return a + b;"}
  [ok] Edited math.js (1 replacement)
  [tool] bash {"command":"node math.js"}
  [ok] Exit code: 0
Running the function printed `5` as expected, which verifies the fix.
[turns=4 | total tokens in=4254 out=259]
```

Four model calls, three tools, zero human help. Compare with Lesson 4, where the
model wanted to keep going but our harness stopped after one round.

## Stop conditions

| Condition | Why |
|-----------|-----|
| No tool calls in the reply | Normal end: the model chose to answer. |
| `maxTurns` reached (default 25) | Safety valve. Models can get stuck in loops; you do not want an infinite bill. |
| `stop_reason: max_tokens` | The reply was cut off. We report it. |

## Details that matter

- **Parallel tool calls.** One reply can contain several `tool_use` blocks. All results
  must go back in **one** user message. We run them one by one, which is simpler and
  plays nicely with permission prompts (Lesson 7). Real harnesses run read-only tools
  in parallel for speed.
- **Errors are observations.** `tools.run()` never throws. The test
  `feeds tool errors back so the model can recover` shows a model mistyping a file
  name, seeing "File not found" and retrying correctly.
- **Role alternation.** If we stop at `maxTurns`, the history ends with a user message
  (the tool results). The next user input is *merged* into it by `pushUser()` so the
  API never sees two user messages in a row.
- **The loop never prints.** It emits events (`assistant`, `tool_start`, `tool_end`,
  `usage`) and `index.ts` decides how to show them. This separation is what lets us
  add streaming, a different UI, or sub-agents later without touching the loop.

## The tools

| Tool | Notes |
|------|-------|
| `read_file` | Line-numbered output, offset and limit. |
| `list_files` | Recursive, skips `node_modules`, `vendor`, `.git`; glob filter; max 200 results. |
| `grep` | Regex search, `file:line: text`, max 100 matches. |
| `write_file` | Create or overwrite, makes parent dirs. |
| `edit_file` | Exact string replace. Must be unique, which forces the model to be precise. |
| `bash` | `bash -c` in the project root, timeout, output capped, whole process group killed on timeout. |

Why `edit_file` instead of "rewrite the whole file"? Rewriting costs many output
tokens and models sometimes drop lines by accident. A unique string replacement is
cheap and safe; when the match is ambiguous, the error tells the model exactly what
to do.

## Run it

```bash
npm start -- --cwd /path/to/project "what does this project do?"
npm test        # tests/agent.test.ts drives the loop with a fake LLM
```

## Exercise

1. Run with `--max-turns 1` on a task that needs several steps. What happens?
2. In `loop.ts`, run the tool calls with `Promise.all` instead of a `for` loop. When is
   that safe and when is it dangerous (think about two `edit_file` calls on one file)?
3. Notice that `bash` can do anything, including `rm -rf ~`. Nothing stops it yet.
   That is the topic of Lesson 7.
