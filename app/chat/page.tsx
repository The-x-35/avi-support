import { redirect } from "next/navigation";
import { CategoryPicker } from "./category-picker";

export default async function ChatHomePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const { userId } = await searchParams;
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    redirect("/chat/error");
  }
  return <CategoryPicker userId={userId.trim()} />;
}
