import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/badge";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Mail, Phone, MessageSquare } from "lucide-react";

interface UserProfileProps {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    conversations: Array<{
      id: number;
      status: string;
      category: string;
      priority: string;
      isAiPaused: boolean;
      lastMessageAt: Date | null;
      createdAt: Date;
      tags: Array<{ definition: { name: string; color: string | null } }>;
      messages: Array<{ content: string; senderType: string }>;
      _count: { messages: number };
    }>;
  };
}
type UserConversation = UserProfileProps["user"]["conversations"][number];
type UserConversationTag = UserConversation["tags"][number];

export function UserProfile({ user }: UserProfileProps) {
  const totalChats = user.conversations.length;
  const resolved = user.conversations.filter(
    (c: UserConversation) => c.status === "RESOLVED"
  ).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={user.name ?? user.email ?? "User"}
        subtitle="User profile and conversation history"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-6">
          {/* User card */}
          <div className="bg-white border border-gray-100 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <Avatar name={user.name} src={user.avatarUrl} size="lg" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">
                  {user.name ?? "Unknown"}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2">
                  {user.email && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Mail className="w-3.5 h-3.5" />
                      {user.email}
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Phone className="w-3.5 h-3.5" />
                      {user.phone}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">{totalChats}</p>
                  <p className="text-xs text-gray-400">Total chats</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">{resolved}</p>
                  <p className="text-xs text-gray-400">Resolved</p>
                </div>
              </div>
            </div>
          </div>

          {/* Conversations */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                Conversation History ({totalChats})
              </h3>
            </div>

            {user.conversations.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No conversations
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {user.conversations.map((conv: UserConversation) => {
                  const lastMsg = conv.messages[0];
                  return (
                    <Link
                      key={conv.id}
                      href={`/conversations/${conv.id}`}
                      className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">#{conv.id}</span>
                          <Badge variant="muted" size="sm">
                            {categoryLabel(conv.category)}
                          </Badge>
                          <PriorityBadge priority={conv.priority} />
                          {conv.tags.slice(0, 2).map((t: UserConversationTag) => (
                            <Badge key={t.definition.name} variant="default" size="sm">
                              {t.definition.name}
                            </Badge>
                          ))}
                        </div>
                        {lastMsg && (
                          <p className="text-sm text-gray-600 truncate">
                            {lastMsg.content}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            {conv._count.messages} messages
                          </span>
                          {conv.lastMessageAt && (
                            <span className="text-xs text-gray-400">
                              · {formatRelativeTime(new Date(conv.lastMessageAt))}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={conv.status} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
