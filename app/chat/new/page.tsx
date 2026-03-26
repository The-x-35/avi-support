import { redirect } from "next/navigation";
import { NewChatCreator } from "./new-chat-creator";
import { getChatSession } from "@/lib/auth/chat-token";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; name?: string; initialMessage?: string }>;
}) {
  const [session, { category, name, initialMessage }] = await Promise.all([
    getChatSession(),
    searchParams,
  ]);

  if (!session) redirect("/chat/error");

  return (
    <NewChatCreator
      userId={session.userId}
      category={category ?? "GENERAL"}
      name={name}
      initialMessage={initialMessage}
    />
  );
}
