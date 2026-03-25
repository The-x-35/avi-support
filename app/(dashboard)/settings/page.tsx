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
import { Tag, MessageSquareText, ChevronRight } from "lucide-react";

const DEFAULT_QUEUE_MESSAGE =
  "All our agents are currently busy. You have been added to the queue and someone will be with you as soon as possible.";

const DEFAULT_TICKET_MESSAGE =
  "We have created support ticket #{ticketId} for your request. Our team will follow up with you as soon as possible.";

export default async function SettingsPage() {
  const session = await getSession();
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, avatarUrl: true, role: true, createdAt: true, maxConcurrentChats: true },
  });

  const isAdmin = session?.role === "ADMIN";

  const workspaceSetting = await prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled: true },
    update: {},
  });

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
                <span className="text-xs text-gray-400">Max {agent.maxConcurrentChats} chats</span>
                <Badge variant={agent.role === "ADMIN" ? "info" : "default"}>
                  {agent.role}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        <Link
          href="/settings/tags"
          className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Tag className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Tags</p>
            <p className="text-xs text-gray-400 mt-0.5">Manage tags for categorizing conversations</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
        </Link>

        {/* Quick Replies */}
        <Link
          href="/settings/quick-replies"
          className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <MessageSquareText className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Quick Replies</p>
            <p className="text-xs text-gray-400 mt-0.5">Pre-written messages available in every conversation</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
        </Link>
        <AIToggle initialEnabled={workspaceSetting.aiEnabled} isAdmin={isAdmin} />
        {isAdmin && (
          <QueueSettings
            initialQueueMessage={workspaceSetting.queueMessage ?? DEFAULT_QUEUE_MESSAGE}
            initialTicketMessage={workspaceSetting.ticketMessage ?? DEFAULT_TICKET_MESSAGE}
            initialTimeoutMinutes={workspaceSetting.queueTimeoutMinutes}
          />
        )}
        {isAdmin && <AdminPanel agents={agents} currentAgentId={session?.agentId ?? ""} />}
      </div>
    </div>
  );
}
