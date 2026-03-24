import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { UserChat } from "./user-chat";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = [
  "CARDS",
  "ACCOUNT",
  "SPENDS",
  "KYC",
  "GENERAL",
  "OTHER",
] as const;
type ConversationCategory = (typeof VALID_CATEGORIES)[number];

const MESSAGE_INCLUDE = {
  where: { isPrivate: false },
  include: {
    agent: { select: { name: true, avatarUrl: true } },
    media: true,
  },
  orderBy: { createdAt: "asc" },
} as const;

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string; category?: string; new?: string; initialMessage?: string }>;
}) {
  const [{ id }, { userId, category, new: isNew, initialMessage }] = await Promise.all([
    params,
    searchParams,
  ]);

  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    redirect("/chat/error");
  }

  const uid = userId.trim();

  let conversation;

  if (isNew === "1") {
    // New conversation: create it now (idempotent — safe if called twice with same id)
    const safeCategory: ConversationCategory = VALID_CATEGORIES.includes(
      (category ?? "") as ConversationCategory
    )
      ? ((category ?? "GENERAL") as ConversationCategory)
      : "GENERAL";
    conversation = await prisma.conversation.upsert({
      where: { id },
      create: {
        id,
        category: safeCategory,
        status: "OPEN",
        user: {
          connectOrCreate: {
            where: { externalId: uid },
            create: { externalId: uid },
          },
        },
      },
      update: {},
      include: { messages: MESSAGE_INCLUDE },
    });
  } else {
    // Existing conversation: load it and clean up stuck streaming messages in parallel
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    [conversation] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id },
        include: { messages: MESSAGE_INCLUDE },
      }),
      prisma.message.updateMany({
        where: { conversationId: id, isStreaming: true, createdAt: { lt: cutoff } },
        data: { isStreaming: false },
      }),
    ]);
    if (!conversation) notFound();
  }

  return (
    <UserChat
      conversation={JSON.parse(JSON.stringify(conversation))}
      userId={uid}
      initialMessage={typeof initialMessage === "string" ? initialMessage : undefined}
    />
  );
}
