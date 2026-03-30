import { redirect } from "next/navigation";
import { NewChatCreator } from "./new-chat-creator";
import { getChatSession, getChatToken } from "@/lib/auth/chat-token";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; name?: string; initialMessage?: string }>;
}) {
  const [session, token, { category, name, initialMessage }] = await Promise.all([
    getChatSession(),
    getChatToken(),
    searchParams,
  ]);

  if (!session || !token) redirect("/chat/error");

  return (
    <NewChatCreator
      userId={session.userId}
      wsToken={token}
      category={category ?? "GENERAL"}
      name={name}
      initialMessage={initialMessage}
    />
  );
}
