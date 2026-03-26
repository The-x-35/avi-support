import { redirect } from "next/navigation";
import { UserChat } from "./user-chat";
import { getChatSession } from "@/lib/auth/chat-token";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ initialMessage?: string }>;
}) {
  const [{ id }, { initialMessage }, session] = await Promise.all([
    params,
    searchParams,
    getChatSession(),
  ]);

  if (!session) redirect("/chat/error");

  return (
    <UserChat
      conversationId={id}
      userId={session.userId}
      initialMessage={typeof initialMessage === "string" ? initialMessage : undefined}
    />
  );
}
