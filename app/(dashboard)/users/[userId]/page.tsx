import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { UserProfile } from "@/components/conversations/user-profile";

export default async function UserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const user = await prisma.endUser.findUnique({
    where: { id: userId },
    include: {
      conversations: {
        select: {
          id: true,
          status: true,
          categories: true,
          priority: true,
          isAiPaused: true,
          lastMessageAt: true,
          createdAt: true,
          tags: { include: { definition: { select: { name: true, color: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, content: true, senderType: true, createdAt: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  return <UserProfile user={user} />;
}
