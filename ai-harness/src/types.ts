// The shapes the harness passes around. They mirror the Anthropic Messages API
// because it is the cleanest model of "a conversation made of content blocks".
// Other providers get translated to and from these shapes.

export type Role = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

/** The model asking the harness to run a tool. Only ever appears in assistant messages. */
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** The harness reporting a tool's output back. Only ever appears in user messages. */
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: string | ContentBlock[];
}

/** JSON Schema description of a tool, sent to the model so it knows what it can call. */
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "other";

export function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function toolUsesOf(content: Message["content"]): ToolUseBlock[] {
  if (typeof content === "string") return [];
  return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}
