export const dynamic = "force-dynamic";
import { Header } from "@/components/layout/header";
import { SegmentsView } from "@/components/segments/segments-view";

export default function SegmentsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Segments" subtitle="Saved filters and custom conversation groups" />
      <SegmentsView />
    </div>
  );
}
