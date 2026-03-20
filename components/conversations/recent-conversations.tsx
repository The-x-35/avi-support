import Link from "next/link";
import { getConversations } from "@/lib/services/conversations";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils/format";
import { Bot, User } from "lucide-react";

export async function RecentConversations() {
  const { conversations } = await getConversations({ limit: 10 });
  type RecentConversation = Awaited<
    ReturnType<typeof getConversations>
  >["conversations"][number];

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Recent Conversations</h3>
        <Link
          href="/live"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          View all
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No conversations yet
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {conversations.map((conv: RecentConversation) => {
            const lastMsg = conv.messages[0];
            const sentimentTag = conv.tags.find(
              (t: RecentConversation["tags"][number]) =>
                t.definition.type === "sentiment"
            );
            return (
              <Link
                key={conv.id}
                href={`/conversations/${conv.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <Avatar
                  name={conv.user.name}
                  src={conv.user.avatarUrl}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {conv.user.name ?? conv.user.email ?? "User"}
                    </span>
                    {conv.isAiPaused && (
                      <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">
                        Agent
                      </span>
                    )}
                  </div>
                  {lastMsg && (
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                      {lastMsg.senderType === "AI" ? (
                        <Bot className="w-2.5 h-2.5 shrink-0" />
                      ) : lastMsg.senderType === "AGENT" ? (
                        <User className="w-2.5 h-2.5 shrink-0" />
                      ) : null}
                      {lastMsg.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={conv.status} />
                  {conv.lastMessageAt && (
                    <span className="text-[11px] text-gray-400">
                      {formatRelativeTime(conv.lastMessageAt)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
