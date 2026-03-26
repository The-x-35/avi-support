import { redirect } from "next/navigation";
import { CategoryPicker } from "./category-picker";
import { getChatSession } from "@/lib/auth/chat-token";

export default async function ChatHomePage() {
  const session = await getChatSession();
  if (!session) redirect("/chat/error");
  return <CategoryPicker userId={session.userId} />;
}
