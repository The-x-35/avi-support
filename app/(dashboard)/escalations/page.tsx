import { Header } from "@/components/layout/header";
import { EscalationsTable } from "./escalations-table";

export default function EscalationsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Escalations" subtitle="All escalations across conversations" />
      <EscalationsTable />
    </div>
  );
}
