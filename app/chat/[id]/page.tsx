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

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        where: { isStreaming: false },
        include: { agent: { select: { name: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) notFound();

  const serialized = JSON.parse(JSON.stringify(conversation));

  return <UserChat conversation={serialized} />;
}
