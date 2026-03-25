export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Header } from "@/components/layout/header";
import { LiveFeed } from "@/components/conversations/live-feed";

export default async function MyIssuesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="My Issues" subtitle="Conversations assigned to you" />
      <LiveFeed assignedAgentId={session.agentId} />
    </div>
  );
}
