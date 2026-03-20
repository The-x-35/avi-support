export const dynamic = "force-dynamic";
import { Header } from "@/components/layout/header";
import { LiveFeed } from "@/components/conversations/live-feed";

export default function LivePage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Live Feed" subtitle="Active conversations in real time" />
      <LiveFeed />
    </div>
  );
}
