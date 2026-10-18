import type { LLMProvider } from "../llm/provider.js";
import { textOf, type Message } from "../types.js";
import { estimateMessages } from "./tokens.js";

export const SUMMARY_PREFIX = "[Summary of the earlier conversation, written by you before older messages were removed]";

/**
 * Choose where to cut. Everything before `index` gets summarized.
 * The kept part must start with an assistant message: then the new history is
 * [user: summary, assistant, user, ...], which alternates correctly and never
 * separates a tool_use from its tool_result.
 */
export function findCompactionSplit(messages: Message[], keepTokens: number): number | null {
  const assistantIdx = messages.flatMap((m, i) => (m.role === "assistant" && i >= 2 ? [i] : []));
  if (assistantIdx.length === 0) return null;
  for (const i of assistantIdx) {
    if (estimateMessages(messages.slice(i)) <= keepTokens) return i;
  }
  return assistantIdx.at(-1)!;
}

/** Flatten messages into a readable transcript for the summarizer. Tool data is clipped. */
export function renderTranscript(messages: Message[], clip = 600): string {
  const cut = (s: string) => (s.length > clip ? `${s.slice(0, clip)}... [${s.length - clip} more chars]` : s);
  const lines: string[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      lines.push(`${m.role.toUpperCase()}: ${m.content}`);
      continue;
    }
    for (const b of m.content) {
      if (b.type === "text") lines.push(`${m.role.toUpperCase()}: ${b.text}`);
      else if (b.type === "tool_use") lines.push(`TOOL CALL ${b.name}: ${cut(JSON.stringify(b.input))}`);
      else lines.push(`TOOL RESULT${b.is_error ? " (error)" : ""}: ${cut(b.content)}`);
    }
  }
  return lines.join("\n");
}

const SUMMARIZER_SYSTEM = `You compress a coding agent's conversation so it can continue working with less context.
Write a dense summary with these sections:
1. User's goal and explicit requests (quote important wording).
2. Key facts discovered (files, functions, commands, errors).
3. Changes made so far (file paths and what changed).
4. Current state and what remains to do.
Do not invent anything. Keep it under 400 words.`;

export interface CompactionResult {
  messages: Message[];
  summary: string;
  removed: number;
}

export async function compactMessages(
  provider: LLMProvider,
  messages: Message[],
  keepTokens: number,
  signal?: AbortSignal,
): Promise<CompactionResult | null> {
  const split = findCompactionSplit(messages, keepTokens);
  if (split === null) return null;

  const old = messages.slice(0, split);
  const res = await provider.chat({
    system: SUMMARIZER_SYSTEM,
    messages: [{ role: "user", content: `Summarize this conversation:\n\n${renderTranscript(old)}` }],
    maxTokens: 1500,
    signal,
  });
  const summary = textOf(res.content).trim();

  return {
    messages: [{ role: "user", content: `${SUMMARY_PREFIX}\n\n${summary}` }, ...messages.slice(split)],
    summary,
    removed: old.length,
  };
}
