import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.js";
import { DEFAULT_OLLAMA_MODEL, OllamaProvider } from "./ollama.js";
import type { LLMProvider } from "./provider.js";

export type { LLMProvider, ChatRequest, ChatResponse } from "./provider.js";

/** Pick a provider from environment variables (see .env.example). */
export function createProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const name = env.MINI_CLAUDE_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "ollama");

  switch (name) {
    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL);
    }
    case "ollama":
      return new OllamaProvider(
        env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
        env.OLLAMA_HOST ?? "http://localhost:11434",
        env.OLLAMA_NUM_CTX ? Number(env.OLLAMA_NUM_CTX) : undefined,
      );
    default:
      throw new Error(`Unknown MINI_CLAUDE_PROVIDER "${name}" (use anthropic or ollama)`);
  }
}
