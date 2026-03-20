"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { ChevronLeft, Download } from "lucide-react";

interface Segment {
  id: string;
  name: string;
  description: string | null;
}

interface Conversation {
  id: string;
  status: string;
  category: string;
  priority: string;
  lastMessageAt: string | null;
  user: { id: string; name: string | null; email: string | null; avatarUrl: string | null };
  tags: Array<{ definition: { type: string; value: string; label: string } }>;
  messages: Array<{ content: string }>;
}

interface SegmentResultsProps {
  segment: Segment;
  onBack: () => void;
}

export function SegmentResults({ segment, onBack }: SegmentResultsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/segments/${segment.id}/execute`)
      .then((r) => r.json())
      .then((data) => {
        setConversations(data.conversations);
        setTotal(data.total);
        setLoading(false);
      });
  }, [segment.id]);

  async function handleExport() {
    const res = await fetch(`/api/segments/${segment.id}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${segment.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{segment.name}</h2>
          {segment.description && (
            <p className="text-xs text-gray-400">{segment.description}</p>
          )}
        </div>
        <span className="text-xs text-gray-400">{total} conversations</span>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                  <div className="h-2.5 w-48 bg-gray-50 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            No conversations match this segment
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {conversations.map((conv) => {
              const lastMsg = conv.messages[0];
              const issueTag = conv.tags.find((t) => t.definition.type === "issue_type");

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <Avatar name={conv.user.name} src={conv.user.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900">
                        {conv.user.name ?? conv.user.email ?? "User"}
                      </span>
                      <Badge variant="muted" size="sm">
                        {categoryLabel(conv.category)}
                      </Badge>
                      {issueTag && (
                        <Badge variant="info" size="sm">
                          {issueTag.definition.label}
                        </Badge>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-gray-400 truncate">{lastMsg.content}</p>
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
    </div>
  );
}
