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
        include: {
          tags: { include: { definition: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  return <UserProfile user={user} />;
}
