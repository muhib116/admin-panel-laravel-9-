/** Yield decoded text lines from a fetch Response body as they arrive. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      yield buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) yield buffer;
}

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Server-Sent Events: blocks of `event: x` / `data: {...}` lines separated by a
 * blank line. This is how the Anthropic API streams a reply piece by piece.
 */
export async function* parseSSE(lines: AsyncIterable<string>): AsyncGenerator<SSEEvent> {
  let event = "message";
  let data: string[] = [];
  for await (const line of lines) {
    if (line === "") {
      if (data.length) yield { event, data: data.join("\n") };
      event = "message";
      data = [];
    } else if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (data.length) yield { event, data: data.join("\n") };
}
