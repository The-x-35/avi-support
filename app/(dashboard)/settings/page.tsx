export const dynamic = "force-dynamic";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AdminPanel } from "./admin-panel";
import { AIToggle } from "./ai-toggle";
import { QueueSettings } from "./queue-settings";
import { ProfileEditor } from "./profile-editor";
import { InactivitySettings } from "./inactivity-settings";
import { TeamsSettings } from "./teams-settings";
import { Tag, MessageSquareText, ChevronRight } from "lucide-react";

const DEFAULT_QUEUE_MESSAGE =
  "All our agents are currently busy. You have been added to the queue and someone will be with you as soon as possible.";

const DEFAULT_TICKET_MESSAGE =
  "Sorry, all our agents are busy at the moment. Your ticket has been created with the number #{ticketId}. We'll get back to you as soon as possible.";

export default async function SettingsPage() {
  const session = await getSession();
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, avatarUrl: true, role: true, createdAt: true, maxConcurrentChats: true },
  });

  const isAdmin = session?.role === "ADMIN";

  const currentAgent = session?.agentId
    ? await prisma.agent.findUnique({
        where: { id: session.agentId },
        select: { id: true, name: true, email: true, avatarUrl: true, role: true },
      })
    : null;

  const workspaceSetting = await prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled: true },
    update: {},
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Settings" subtitle="Workspace and account" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Profile */}
        {currentAgent && (
          <ProfileEditor
            agentId={currentAgent.id}
            initialName={currentAgent.name}
            email={currentAgent.email}
            avatarUrl={currentAgent.avatarUrl}
            role={currentAgent.role}
          />
        )}

        {/* Team */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team</p>
          </div>
          <div className="divide-y divide-gray-50">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={agent.name} src={agent.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                  <p className="text-xs text-gray-400 truncate">{agent.email}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">Max {agent.maxConcurrentChats}</span>
                <Badge variant={agent.role === "ADMIN" ? "info" : "default"}>{agent.role}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Workspace */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Workspace</p>
          </div>
          <div className="px-5">
            <AIToggle initialEnabled={workspaceSetting.aiEnabled} isAdmin={isAdmin} />
            {isAdmin && (
              <QueueSettings
                initialQueueMessage={workspaceSetting.queueMessage ?? DEFAULT_QUEUE_MESSAGE}
                initialTicketMessage={workspaceSetting.ticketMessage ?? DEFAULT_TICKET_MESSAGE}
                initialTimeoutMinutes={workspaceSetting.queueTimeoutMinutes}
              />
            )}
            {isAdmin && (
              <InactivitySettings
                initialEnabled={workspaceSetting.agentInactivityEnabled}
                initialHours={workspaceSetting.agentInactivityHours}
              />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Content</p>
          </div>
          <div className="divide-y divide-gray-50">
            <Link href="/settings/tags" className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Tag className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Tags</p>
                <p className="text-xs text-gray-400 mt-0.5">Manage conversation tags</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </Link>
            <Link href="/settings/quick-replies" className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <MessageSquareText className="w-3.5 h-3.5 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Quick Replies</p>
                <p className="text-xs text-gray-400 mt-0.5">Pre-written messages for agents</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </Link>
          </div>
        </div>

        {/* Escalation Teams (admin) */}
        {isAdmin && <TeamsSettings agents={agents} />}

        {/* Agent Controls (admin) */}
        {isAdmin && <AdminPanel agents={agents} currentAgentId={session?.agentId ?? ""} />}

      </div>
    </div>
  );
}
