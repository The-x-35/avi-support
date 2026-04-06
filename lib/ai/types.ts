export interface ConversationContext {
  conversationId: string;
  categories: string[];
  userProfile?: {
    name?: string;
    email?: string;
    metadata?: Record<string, unknown>;
  };
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  systemContext?: string;
}

export interface TagResult {
  type: string;
  value: string;
  confidence: number;
}

export interface AIProvider {
  generateResponse(
    context: ConversationContext
  ): AsyncIterable<string>;

  classifyConversation(
    context: ConversationContext
  ): Promise<TagResult[]>;
}
