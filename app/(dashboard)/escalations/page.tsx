import { Header } from "@/components/layout/header";
import { EscalationsTable } from "./escalations-table";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function EscalationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Escalations" subtitle="All escalations across conversations" />
      <EscalationsTable currentAgentId={session.agentId} />
    </div>
  );
}
