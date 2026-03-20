export const dynamic = "force-dynamic";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Header } from "@/components/layout/header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AdminPanel } from "./admin-panel";

export default async function SettingsPage() {
  const session = await getSession();
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, avatarUrl: true, role: true, createdAt: true },
  });

  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Settings" subtitle="Team and configuration" />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-6">
        {/* Team */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Team</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {agents.map((agent: (typeof agents)[number]) => (
              <div key={agent.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={agent.name} src={agent.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                  <p className="text-xs text-gray-400">{agent.email}</p>
                </div>
                <Badge variant={agent.role === "ADMIN" ? "info" : "default"}>
                  {agent.role}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && <AdminPanel agents={agents} currentAgentId={session?.agentId ?? ""} />}
      </div>
    </div>
  );
}
