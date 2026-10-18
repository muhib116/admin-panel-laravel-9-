// The shapes the harness passes around. They mirror the Anthropic Messages API
// because it is the cleanest model of "a conversation made of content blocks".
// Other providers get translated to and from these shapes.

export type Role = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

export type ContentBlock = TextBlock;

export interface Message {
  role: Role;
  content: string | ContentBlock[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}
