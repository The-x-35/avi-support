"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Search, RefreshCw, Bot, User, Pause } from "lucide-react";

interface ConversationItem {
  id: string;
  status: string;
  category: string;
  priority: string;
  isAiPaused: boolean;
  lastMessageAt: string | null;
  user: { id: string; name: string | null; email: string | null; avatarUrl: string | null };
  assignedAgent: { id: string; name: string } | null;
  tags: Array<{ definition: { type: string; value: string; label: string } }>;
  messages: Array<{ content: string; senderType: string; createdAt: string }>;
  _count: { messages: number };
}
type ConversationTag = ConversationItem["tags"][number];

type StatusFilter = "ALL" | "OPEN" | "PENDING" | "ESCALATED" | "RESOLVED";

export function LiveFeed() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const params = new URLSearchParams({ limit: "100" });
    if (status !== "ALL") params.set("status", status);
    if (search) params.set("search", search);

    const res = await fetch(`/api/conversations?${params}`);
    const data = await res.json();
    setConversations(data.conversations);
    setTotal(data.total);

    if (!silent) setLoading(false);
    else setRefreshing(false);
  }, [status, search]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => fetchConversations(true), 10_000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const statusTabs: { value: StatusFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "OPEN", label: "Open" },
    { value: "PENDING", label: "Pending" },
    { value: "ESCALATED", label: "Escalated" },
    { value: "RESOLVED", label: "Resolved" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3">
        <div className="flex-1 max-w-sm">
          <Input
            icon={<Search className="w-3.5 h-3.5" />}
            placeholder="Search by user, keyword…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                status === tab.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchConversations(true)}
          loading={refreshing}
          className="ml-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs text-gray-400">{total} total</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 bg-gray-100 rounded" />
                  <div className="h-2.5 w-56 bg-gray-50 rounded" />
                </div>
                <div className="h-5 w-14 bg-gray-100 rounded-md" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
            <Search className="w-8 h-8 mb-2 text-gray-200" />
            No conversations found
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {conversations.map((conv: ConversationItem) => {
              const lastMsg = conv.messages[0];
              const sentimentTag = conv.tags.find(
                (t: ConversationTag) => t.definition.type === "sentiment"
              );
              const issueTag = conv.tags.find(
                (t: ConversationTag) => t.definition.type === "issue_type"
              );

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors group"
                >
                  <Avatar
                    name={conv.user.name}
                    src={conv.user.avatarUrl}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900">
                        {conv.user.name ?? conv.user.email ?? "User"}
                      </span>
                      <Badge variant="muted" size="sm">
                        {categoryLabel(conv.category)}
                      </Badge>
                      {conv.isAiPaused && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          <Pause className="w-2.5 h-2.5" />
                          AI paused
                        </span>
                      )}
                      {issueTag && (
                        <Badge variant="info" size="sm">
                          {issueTag.definition.label}
                        </Badge>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        {lastMsg.senderType === "AI" && (
                          <Bot className="w-2.5 h-2.5 shrink-0" />
                        )}
                        {lastMsg.senderType === "AGENT" && (
                          <User className="w-2.5 h-2.5 shrink-0" />
                        )}
                        {lastMsg.content}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {conv.assignedAgent && (
                        <span className="text-[11px] text-gray-400">
                          → {conv.assignedAgent.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={conv.status} />
                    {conv.lastMessageAt && (
                      <span className="text-[11px] text-gray-400">
                        {formatRelativeTime(conv.lastMessageAt)}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-300">
                      {conv._count.messages} msgs
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
