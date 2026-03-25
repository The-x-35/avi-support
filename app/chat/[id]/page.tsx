import { redirect } from "next/navigation";
import { UserChat } from "./user-chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string; initialMessage?: string }>;
}) {
  const [{ id }, { userId, initialMessage }] = await Promise.all([
    params,
    searchParams,
  ]);

  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    redirect("/chat/error");
  }

  return (
    <UserChat
      conversationId={id}
      userId={userId.trim()}
      initialMessage={typeof initialMessage === "string" ? initialMessage : undefined}
    />
  );
}
