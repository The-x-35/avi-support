"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Clock, Pause, AlertTriangle } from "lucide-react";

interface ConversationItem {
  id: string;
  status: string;
  categories: string[];
  priority: string;
  isAiPaused: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null; avatarUrl: string | null };
  assignedAgent: { id: string; name: string } | null;
  tags: Array<{ definition: { type: string; value: string; label: string } }>;
  messages: Array<{ content: string; senderType: string; createdAt: string }>;
}
type ConversationTag = ConversationItem["tags"][number];

export function Queue() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"paused" | "escalated" | "unassigned">("paused");

  const fetchQueue = async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: "100" };

    if (tab === "paused") params.isAiPaused = "true";
    else if (tab === "escalated") params.status = "ESCALATED";
    else if (tab === "unassigned") {
      params.status = "OPEN";
      params.assignedAgentId = "null";
    }

    const qs = new URLSearchParams(params);
    const res = await fetch(`/api/conversations?${qs}`);
    const data = await res.json();
    setConversations(data.conversations);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
  }, [tab]);

  async function handleTakeover(convId: string) {
    await fetch(`/api/conversations/${convId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "takeover" }),
    });
    fetchQueue();
  }

  async function handleResumeAI(convId: string) {
    await fetch(`/api/conversations/${convId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume_ai" }),
    });
    fetchQueue();
  }

  const tabs = [
    { value: "paused" as const, label: "AI Paused", icon: Pause },
    { value: "escalated" as const, label: "Escalated", icon: AlertTriangle },
    { value: "unassigned" as const, label: "Unassigned", icon: Clock },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-5 flex items-center gap-0">
        {tabs.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              tab === value
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 bg-gray-100 rounded" />
                  <div className="h-2.5 w-56 bg-gray-50 rounded" />
                </div>
                <div className="flex gap-2">
                  <div className="h-7 w-20 bg-gray-100 rounded-lg" />
                  <div className="h-7 w-24 bg-gray-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
            <Clock className="w-8 h-8 mb-2 text-gray-200" />
            Queue is clear
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {conversations.map((conv: ConversationItem) => {
              const lastMsg = conv.messages[0];
              const issueTag = conv.tags.find(
                (t: ConversationTag) => t.definition.type === "issue_type"
              );

              return (
                <div key={conv.id} className="flex items-start gap-3 px-5 py-4">
                  <Link href={`/conversations/${conv.id}`}>
                    <Avatar name={conv.user.name} src={conv.user.avatarUrl} size="md" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link
                        href={`/conversations/${conv.id}`}
                        className="text-sm font-medium text-gray-900 hover:underline"
                      >
                        {conv.user.name ?? conv.user.email ?? "User"}
                      </Link>
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">#{conv.id}</span>
                      {conv.categories.map((c) => (
                        <Badge key={c} variant="muted" size="sm">{categoryLabel(c)}</Badge>
                      ))}
                      <PriorityBadge priority={conv.priority} />
                      {issueTag && (
                        <Badge variant="info" size="sm">
                          {issueTag.definition.label}
                        </Badge>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-gray-400 truncate">{lastMsg.content}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {conv.lastMessageAt && (
                        <span className="text-[11px] text-gray-400">
                          {formatRelativeTime(conv.lastMessageAt)}
                        </span>
                      )}
                      {conv.assignedAgent && (
                        <span className="text-[11px] text-gray-400">
                          · Assigned to {conv.assignedAgent.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tab === "paused" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResumeAI(conv.id)}
                      >
                        Resume AI
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleTakeover(conv.id)}
                    >
                      Take over
                    </Button>
                    <Link href={`/conversations/${conv.id}`}>
                      <Button variant="outline" size="sm">
                        Open
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
