import type { Message, ToolSchema } from "../types.js";

/**
 * Rough token estimate: about 4 characters per token for English and code.
 * Real tokenizers differ per model; for budgeting, a cheap estimate is enough.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessages(messages: Message[]): number {
  let total = 0;
  for (const m of messages) total += 4 + estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content));
  return total;
}

export function estimateRequest(system: string, messages: Message[], tools: ToolSchema[]): number {
  return estimateTokens(system) + estimateTokens(JSON.stringify(tools)) + estimateMessages(messages);
}

/** Keep the start and the end of a long text; the middle is usually the least useful part. */
export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.6);
  const tail = maxChars - head;
  const cut = text.length - head - tail;
  return `${text.slice(0, head)}\n\n... [${cut} characters truncated to save context; use offset/limit or a narrower search to see them] ...\n\n${text.slice(-tail)}`;
}
