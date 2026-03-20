import { OpenAIProvider } from "./openai-provider";
import type { AIProvider } from "./types";

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!provider) {
    provider = new OpenAIProvider();
  }
  return provider;
}

export type { AIProvider, ConversationContext, TagResult } from "./types";
