import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConversationById } from "@/lib/services/conversations";
import { ConversationView } from "@/components/conversations/conversation-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [conversation, session] = await Promise.all([
    getConversationById(parseInt(id)),
    getSession(),
  ]);

  if (!conversation) notFound();

  // Serialize Dates to strings for client component
  const serialized = JSON.parse(JSON.stringify(conversation));

  return (
    <ConversationView
      conversation={serialized}
      currentAgentId={session?.agentId ?? ""}
    />
  );
}
