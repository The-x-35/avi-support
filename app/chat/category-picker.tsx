"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { userWsManager } from "@/lib/chat/user-ws";
import Link from "next/link";
import { CreditCard, User, Receipt, ShieldCheck, HelpCircle, MessageSquare, Send, ChevronRight, FileText } from "lucide-react";

const CATEGORIES = [
  { value: "CARDS", label: "Cards", icon: CreditCard, iconWrap: "bg-blue-50", iconColor: "text-blue-600" },
  { value: "ACCOUNT", label: "Account", icon: User, iconWrap: "bg-violet-50", iconColor: "text-violet-600" },
  { value: "SPENDS", label: "Spends", icon: Receipt, iconWrap: "bg-emerald-50", iconColor: "text-emerald-600" },
  { value: "KYC", label: "KYC", icon: ShieldCheck, iconWrap: "bg-amber-50", iconColor: "text-amber-600" },
  { value: "GENERAL", label: "General", icon: HelpCircle, iconWrap: "bg-gray-100", iconColor: "text-gray-700" },
  { value: "OTHER", label: "Other", icon: MessageSquare, iconWrap: "bg-rose-50", iconColor: "text-rose-600" },
];

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", PENDING: "Pending", ESCALATED: "Escalated",
  RESOLVED: "Resolved", CLOSED: "Closed",
};

interface PastConv {
  id: number;
  category: string;
  status: string;
  createdAt: string;
  lastMessageAt: string | null;
  messages: { content: string; senderType: string }[];
}

export function CategoryPicker({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [pastConvs, setPastConvs] = useState<PastConv[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Pre-warm the WS connection so it's ready before the user navigates to a chat
    userWsManager.init(userId);

    fetch(`/api/chat/history?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) =>
        setPastConvs(Array.isArray(d) ? d : Array.isArray(d?.conversations) ? d.conversations : [])
      )
      .catch(() => {});
  }, [userId]);

  function handleCategory(category: string) {
    setLoading(category);
    router.push(`/chat/new?userId=${encodeURIComponent(userId)}&category=${category}`);
  }

  function handleSendMessage() {
    const text = message.trim();
    if (!text) return;
    router.push(
      `/chat/new?userId=${encodeURIComponent(userId)}&category=GENERAL&initialMessage=${encodeURIComponent(text)}`
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function formatTime(iso: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  const CategoryIcon = ({ cat, className }: { cat: string; className?: string }) => {
    const found = CATEGORIES.find((c) => c.value === cat);
    const Icon = found?.icon ?? HelpCircle;
    return <Icon className={className ?? "w-5 h-5 text-gray-700"} />;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-10 pb-6">
        <h1 className="text-[26px] font-bold text-gray-900 leading-tight">How can we help?</h1>
        <p className="text-sm text-gray-400 mt-1.5">We're here to assist you with any questions or issues.</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">

        {/* Previous chats */}
        {pastConvs.length > 0 && (
          <div>
            <button
              onClick={() => setHistoryExpanded((v) => !v)}
              className="w-full flex items-center gap-3 rounded-3xl bg-[#f3f3f3] px-4 py-4 active:scale-[0.99] transition"
            >
              <div className="w-10 h-10 rounded-full bg-[#101010] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[15px] font-semibold text-gray-900">My requests</p>
                <p className="text-sm text-gray-500">Track your active tickets</p>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  historyExpanded ? "rotate-90" : ""
                }`}
              />
            </button>

            {historyExpanded && (
              <div className="space-y-2 mt-3">
                {pastConvs.map((conv: PastConv) => {
                  const isOpen = conv.status === "OPEN";
                  const isResolved = conv.status === "RESOLVED";
                  const isEscalated = conv.status === "ESCALATED";
                  const cat = CATEGORIES.find((c) => c.value === conv.category)?.label ?? conv.category;
                  const lastMsg = conv.messages[0];

                  return (
                    <Link
                      key={conv.id}
                      href={`/chat/${conv.id}?userId=${encodeURIComponent(userId)}`}
                      className="block rounded-2xl px-4 py-3.5 bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            {cat}
                          </span>
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">#{conv.id}</span>
                        </div>
                        <span className="text-[11px] text-gray-300">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      {lastMsg && (
                        <p className="text-[13px] leading-snug truncate text-gray-600">
                          {lastMsg.content}
                        </p>
                      )}
                      {!isOpen && (
                        <span
                          className={`inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            isResolved
                              ? "bg-emerald-50 text-emerald-600"
                              : isEscalated
                              ? "bg-amber-50 text-amber-600"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {STATUS_LABEL[conv.status] ?? conv.status}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Category grid */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Browse topics</p>
          <div className="grid grid-cols-2 gap-2.5">
            {CATEGORIES.map(({ value, label, icon: Icon, iconWrap, iconColor }) => (
              <button
                key={value}
                onClick={() => handleCategory(value)}
                disabled={loading !== null || false}
                className="flex flex-col items-start p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors text-left disabled:opacity-50"
              >
                <div className={`w-10 h-10 rounded-xl border border-gray-100 flex items-center justify-center mb-3 ${iconWrap}`}>
                  {loading === value ? (
                    <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon className={`w-5 h-5 ${iconColor}`} />
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-900">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message input */}
      <div className="px-5 pb-6 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message us directly…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            style={{ lineHeight: "1.5", minHeight: "1.5rem", maxHeight: "6rem" }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || false}
            className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity"
          >
            {false ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-center text-gray-300 mt-2.5">Typically replies in under 5 seconds</p>
      </div>
    </div>
  );
}
