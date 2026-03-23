import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { UserChat } from "./user-chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Clean up any messages stuck in streaming state from a crashed WS server
  await prisma.message.updateMany({
    where: {
      conversationId: id,
      isStreaming: true,
      createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { isStreaming: false },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        include: {
          agent: { select: { name: true, avatarUrl: true } },
          media: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) notFound();

  const serialized = JSON.parse(JSON.stringify(conversation));

  return <UserChat conversation={serialized} />;
}
