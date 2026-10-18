# Lesson 8: Streaming, activity display and interrupts

## Concept

A model can take 30 seconds to write a long answer. Without streaming you stare at
nothing, then get a wall of text. With streaming the API sends the reply **as it is
generated**, token by token, over one long HTTP response.

## How streaming works on the wire

Set `"stream": true` and the Anthropic API answers with **Server-Sent Events** (SSE):
plain text blocks separated by blank lines.

```
event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":42}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Let me "}}

event: content_block_start
data: {"index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}}

event: content_block_delta
data: {"index":1,"delta":{"type":"input_json_delta","partial_json":"{\"pa"}}

event: content_block_delta
data: {"index":1,"delta":{"type":"input_json_delta","partial_json":"th\":\"a.ts\"}"}}

event: content_block_stop
event: message_delta     (stop_reason, final output token count)
event: message_stop
```

Three layers in our code:

1. `readLines()` (`src/llm/stream.ts`): network chunks do **not** line up with
   lines. A chunk may end in the middle of a word or a JSON string. We buffer and
   only yield complete lines.
2. `parseSSE()`: groups `event:` / `data:` lines into events.
3. `accumulateAnthropicStream()`: rebuilds the same `ChatResponse` the non-streaming
   path returns. Text deltas are forwarded to `onText` immediately. Tool input arrives
   as **fragments of JSON** (`{"pa` + `th":"a.ts"}`) that can only be parsed when
   `content_block_stop` arrives.

Ollama streams **NDJSON** instead (one JSON object per line), handled by
`accumulateOllamaStream()`. Different format, same result. The agent loop does not
care: it gets `text_delta` events plus the final response.

`tests/streaming.test.ts` feeds recorded streams through the parser in 7-byte chunks
to prove the reassembly works.

## Activity display

Each tool now has `activity(input)`, for example `Reading routes/web.php` or
`Running: npm test`. The renderer (`src/ui/render.ts`) shows:

```
> List the files in this project.
  > Listing .
    math.js
The project contains the following files: ...
[turns=2 | total tokens in=2815 out=59]
```

The renderer is just a function from `AgentEvent` to terminal output. A web UI or an
IDE extension would be a different renderer over the same events.

## Interrupts (Ctrl+C)

An `AbortController` is created per request and its `signal` goes everywhere:
`fetch` (cancels the HTTP stream) and `bash` (kills the process group).

The hard part is **keeping the conversation valid** after an interrupt:

| Interrupted during | What we store |
|--------------------|---------------|
| Model streaming | The partial text plus `[interrupted by user]`, so the model knows what you saw. |
| A tool | That tool's result (`Command interrupted by user`), **and** an `Interrupted...` result for every remaining call. Every `tool_use` must have a `tool_result`, or the next API call fails. |

A real gotcha we hit: one Ctrl+C was delivered **twice**, once by the terminal to
the whole process group and once relayed by `tsx` to its child. The second signal
looked like "Ctrl+C while idle", so the CLI said "press again to exit". The fix
ignores a SIGINT that arrives within 500 ms of an abort.

## Exercise

1. Show a spinner (`|/-\`) while waiting for the first token. Stop it on the first
   `text_delta` or `tool_start`.
2. Print the tool input as it streams in (`input_json_delta`), the way some UIs show
   a file being written live.
3. Run with `--no-stream` and compare how the experience feels.
