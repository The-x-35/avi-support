import { redirect } from "next/navigation";
import { UserChat } from "./user-chat";
import { getChatSession, getChatToken } from "@/lib/auth/chat-token";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ initialMessage?: string }>;
}) {
  const [{ id }, { initialMessage }, session, token] = await Promise.all([
    params,
    searchParams,
    getChatSession(),
    getChatToken(),
  ]);

  if (!session || !token) redirect("/chat/error");

  return (
    <UserChat
      conversationId={id}
      userId={session.userId}
      wsToken={token}
      initialMessage={typeof initialMessage === "string" ? initialMessage : undefined}
    />
  );
}
