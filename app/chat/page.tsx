import { redirect } from "next/navigation";
import { CategoryPicker } from "./category-picker";
import { getChatSession, getChatToken } from "@/lib/auth/chat-token";

export default async function ChatHomePage() {
  const [session, token] = await Promise.all([getChatSession(), getChatToken()]);
  if (!session || !token) redirect("/chat/error");
  return <CategoryPicker userId={session.userId} wsToken={token} />;
}
