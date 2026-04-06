import OpenAI from "openai";
import type { AIProvider, ConversationContext, TagResult } from "./types";

const SYSTEM_PROMPT = `You are Avi, an AI support agent for Avici — a fintech platform offering cards, accounts, spending, KYC, borrowing, and savings products.

Your goal: resolve user issues quickly, accurately, and empathetically.

Guidelines:
- Be concise and friendly, not robotic
- For financial queries (transactions, card issues), ask for specifics before answering
- If you cannot resolve an issue with confidence, say so clearly
- Use markdown for structured responses (bullet points, bold key info)
- Never hallucinate policy details — if unsure, say the team will follow up
- Keep responses under 200 words unless the issue requires detail`;

const CLASSIFICATION_PROMPT = `Analyze this support conversation and return a JSON object with these classifications:

{
  "issue_type": one of [card_decline, kyc_stuck, transaction_dispute, login_issue, card_lost, limit_change, refund_request, general_query, account_locked, payment_failed],
  "sentiment": one of [positive, neutral, frustrated, angry],
  "resolution_status": one of [resolved_by_ai, escalated, pending, unresolved],
  "priority": one of [low, medium, high, critical],
  "product_area": one of [cards, account, spends, kyc, borrow, grow, privacy_send, general],
  "confidence": {
    "issue_type": 0-1,
    "sentiment": 0-1,
    "resolution_status": 0-1,
    "priority": 0-1,
    "product_area": 0-1
  }
}

Respond ONLY with the JSON object. No explanation.`;

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  async *generateResponse(
    context: ConversationContext
  ): AsyncIterable<string> {
    const systemMessage = [
      SYSTEM_PROMPT,
      context.categories.length > 0 && !(context.categories.length === 1 && context.categories[0] === "GENERAL")
        ? `\nThis conversation is categorised as: ${context.categories.join(", ")}.`
        : "",
      context.userProfile?.name
        ? `\nUser: ${context.userProfile.name}`
        : "",
      context.systemContext ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    let attempt = 0;
    while (attempt < 3) {
      try {
        const stream = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: systemMessage },
            ...context.messages,
          ],
          stream: true,
          max_tokens: 500,
          temperature: 0.7,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) yield delta;
        }
        return;
      } catch (err) {
        attempt++;
        if (attempt >= 3) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  async classifyConversation(
    context: ConversationContext
  ): Promise<TagResult[]> {
    const transcript = context.messages
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");

    let attempt = 0;
    while (attempt < 3) {
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: CLASSIFICATION_PROMPT },
            {
              role: "user",
              content: `Categories: ${context.categories.join(", ")}\n\nTranscript:\n${transcript}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        });

        const raw = JSON.parse(res.choices[0]?.message?.content ?? "{}");
        const confidence = raw.confidence ?? {};

        const tags: TagResult[] = [
          { type: "issue_type", value: raw.issue_type, confidence: confidence.issue_type ?? 0.8 },
          { type: "sentiment", value: raw.sentiment, confidence: confidence.sentiment ?? 0.8 },
          { type: "resolution_status", value: raw.resolution_status, confidence: confidence.resolution_status ?? 0.7 },
          { type: "priority", value: raw.priority, confidence: confidence.priority ?? 0.75 },
          { type: "product_area", value: raw.product_area, confidence: confidence.product_area ?? 0.85 },
        ].filter((t) => t.value);

        return tags;
      } catch (err) {
        attempt++;
        if (attempt >= 3) return [];
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return [];
  }
}
