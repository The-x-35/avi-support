import { redirect } from "next/navigation";
import { NewChatCreator } from "./new-chat-creator";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; category?: string; name?: string; initialMessage?: string }>;
}) {
  const { userId, category, name, initialMessage } = await searchParams;

  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    redirect("/chat/error");
  }

  return (
    <NewChatCreator
      userId={userId.trim()}
      category={category ?? "GENERAL"}
      name={name}
      initialMessage={initialMessage}
    />
  );
}
