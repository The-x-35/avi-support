import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are helping a human support agent reply to a customer.
Analyze the conversation and suggest 3 short, natural reply options the agent could send next.

Rules:
- Each suggestion must be concise (1-3 sentences max)
- Match the tone of the conversation (empathetic if user is frustrated, efficient if straightforward)
- Suggestions should be meaningfully different from each other (different approaches or angles)
- Write as the agent speaking directly to the user (no "Agent:" prefix)
- Do NOT add placeholders like [name] or [X days]
- Return ONLY a JSON array of 3 strings, nothing else

Example: ["Got it, let me look into that for you right now.", "Could you share your transaction ID so I can pull up the details?", "I understand how frustrating that must be — I'll escalate this to our team immediately."]`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const convId = parseInt(id, 10);
  if (isNaN(convId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: { conversationId: convId, isPrivate: false },
    orderBy: { createdAt: "asc" },
    select: { senderType: true, content: true },
    take: 30,
  });

  if (messages.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const transcript = messages
    .map((m) => `${m.senderType === "USER" ? "User" : "Agent"}: ${m.content}`)
    .join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 300,
    });

    const raw = res.choices[0]?.message?.content ?? "[]";
    let parsed: string[];
    try {
      const obj = JSON.parse(raw);
      parsed = Array.isArray(obj) ? obj : (obj.suggestions ?? obj.replies ?? Object.values(obj));
    } catch {
      parsed = [];
    }

    return NextResponse.json({ suggestions: parsed.slice(0, 3).filter((s) => typeof s === "string") });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
