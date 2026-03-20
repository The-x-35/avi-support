export const dynamic = "force-dynamic";
import { Header } from "@/components/layout/header";
import { Queue } from "@/components/conversations/queue";

export default function QueuePage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Queue" subtitle="Escalated and paused chats waiting for human review" />
      <Queue />
    </div>
  );
}
