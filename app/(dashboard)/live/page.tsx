export const dynamic = "force-dynamic";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Header } from "@/components/layout/header";
import { LiveFeed } from "@/components/conversations/live-feed";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [followed, params] = await Promise.all([
    prisma.conversationFollower.findMany({
      where: { agentId: session.agentId },
      select: { conversationId: true },
    }),
    searchParams,
  ]);

  const initialFollowedIds = followed.map((f) => f.conversationId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Live Feed" subtitle="Active conversations in real time" />
      <LiveFeed
        currentAgentId={session.agentId}
        initialFollowedIds={initialFollowedIds}
        initialTag={params.tag ?? null}
      />
    </div>
  );
}
