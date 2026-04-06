import Link from "next/link";
import { getConversations } from "@/lib/services/conversations";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/badge";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Bot, User } from "lucide-react";

export async function RecentConversations() {
  // Fetch more than 10 so deduplication still gives us 10 unique users
  const { conversations } = await getConversations({ limit: 40 });

  // One row per user — keep their most recent conversation
  const seen = new Set<string>();
  const byUser: typeof conversations = [];
  for (const conv of conversations) {
    if (!seen.has(conv.user.id)) {
      seen.add(conv.user.id);
      byUser.push(conv);
      if (byUser.length === 10) break;
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Recent Conversations</h3>
        <Link href="/live" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          View all
        </Link>
      </div>

      {byUser.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No conversations yet
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {byUser.map((conv) => {
            const lastMsg = conv.messages[0];
            const displayName = conv.user.name ?? conv.user.email ?? conv.user.externalId;

            return (
              <Link
                key={conv.id}
                href={`/conversations/${conv.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <Avatar
                  name={conv.user.name ?? conv.user.externalId}
                  src={conv.user.avatarUrl}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {displayName}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">#{conv.id}</span>
                    {conv.isAiPaused && (
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
                        Agent
                      </span>
                    )}
                  </div>
                  {lastMsg && (
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                      {lastMsg.senderType === "AI" && <Bot className="w-2.5 h-2.5 shrink-0 text-gray-300" />}
                      {lastMsg.senderType === "AGENT" && <User className="w-2.5 h-2.5 shrink-0 text-gray-300" />}
                      {lastMsg.content}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {conv.categories.map((c) => <Badge key={c} variant="muted" size="sm">{categoryLabel(c)}</Badge>)}
                    <StatusBadge status={conv.status} />
                  </div>
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
