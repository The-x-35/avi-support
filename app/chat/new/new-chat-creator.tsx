"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Send, Paperclip, Clock, ChevronUp, X,
  CreditCard, User, Receipt, ShieldCheck, HelpCircle, MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { userWsManager } from "@/lib/chat/user-ws";
import { UserChat } from "../[id]/user-chat";

const CATEGORIES = [
  { value: "CARDS",   label: "Cards",   description: "Activation, limits, declines", icon: CreditCard, color: "text-blue-500" },
  { value: "ACCOUNT", label: "Account", description: "Login, profile, access",       icon: User,        color: "text-violet-500" },
  { value: "SPENDS",  label: "Spends",  description: "Disputes, refunds, charges",   icon: Receipt,     color: "text-emerald-500" },
  { value: "KYC",     label: "KYC",     description: "Verification, documents",      icon: ShieldCheck, color: "text-amber-500" },
  { value: "GENERAL", label: "General", description: "Product questions, feedback",  icon: HelpCircle,  color: "text-gray-500" },
  { value: "OTHER",   label: "Other",   description: "Go straight to chat",          icon: MessageSquare, color: "text-rose-500" },
];

const CATEGORY_LABELS: Record<string, string> = {
  CARDS: "Cards", ACCOUNT: "Account", SPENDS: "Spends",
  KYC: "KYC", GENERAL: "General", OTHER: "Support",
};

interface HistoryConversation {
  id: number;
  category: string;
  status: string;
  lastMessageAt: string | null;
  messages: { content: string; senderType: string }[];
}

export function NewChatCreator({
  userId,
  wsToken,
  category,
  name,
  initialMessage,
}: {
  userId: string;
  wsToken: string;
  category: string;
  name?: string;
  initialMessage?: string;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pendingMessages, setPendingMessages] = useState<string[]>([]);
  const [convCategory, setConvCategory] = useState(category);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryConversation[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [readyToSwap, setReadyToSwap] = useState(false);
  const creating = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (creating.current) return;
    creating.current = true;

    userWsManager.init(userId, wsToken);

    fetch("/api/chat/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name }),
    })
      .then((r) => r.json())
      .then((data) => {
        const id = String(data.conversationId);
        setConversationId(id);
        const url = new URL(window.location.href);
        url.pathname = `/chat/${id}`;
        url.searchParams.delete("category");
        url.searchParams.delete("name");
        window.history.replaceState(null, "", url.toString());
      })
      .catch(() => {
        router.replace("/chat");
      });
  }, [userId, category, name, router]);

  // Swap to full chat when: ID ready AND (user sent a message OR there's an initial message)
  useEffect(() => {
    if (!conversationId) return;
    if (initialMessage || pendingMessages.length > 0) {
      setReadyToSwap(true);
    }
  }, [conversationId, initialMessage, pendingMessages.length]);

  // Shrink container for mobile keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${vv.height}px`;
        containerRef.current.style.transform = `translateY(${vv.offsetTop}px)`;
      }
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  function handleSend() {
    const msg = text.trim();
    if (!msg) return;
    setPendingMessages((prev) => [...prev, msg]);
    setText("");
    if (conversationId) setReadyToSwap(true);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    if (history !== null) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/chat/history");
      const data = await res.json();
      setHistory(data.conversations ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  if (readyToSwap && conversationId) {
    const allPending = [
      ...(initialMessage ? [initialMessage] : []),
      ...pendingMessages,
    ];
    const combined = allPending.join("\n") || undefined;

    return (
      <UserChat
        conversationId={conversationId}
        userId={userId}
        wsToken={wsToken}
        initialMessage={combined}
        initialCategory={convCategory}
        skipWelcomeAnimation
        draftText={text}
      />
    );
  }

  const categoryLabel = CATEGORY_LABELS[convCategory] ?? "Support";
  const activeCat = CATEGORIES.find((c) => c.value === convCategory);
  const ActiveIcon = activeCat?.icon ?? HelpCircle;

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-white w-full h-full"
      style={{ WebkitTapHighlightColor: "transparent", transformOrigin: "top left" }}
    >
      {/* Header */}
      <div
        className="shrink-0 border-b border-gray-100/80"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          backgroundColor: "rgba(255,255,255,0.92)",
          position: "sticky", top: 0, zIndex: 10,
        }}
      >
        <div className="flex items-center justify-end px-2 py-2">
          <button
            onClick={openHistory}
            className="flex items-center justify-center w-10 h-10 rounded-full text-gray-400 active:bg-gray-100 transition-colors"
            style={{ touchAction: "manipulation" }}
          >
            <Clock className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* History panel */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
            />
            <motion.div
              key="panel"
              className="fixed right-0 top-0 bottom-0 w-[88%] max-w-sm bg-white z-50 flex flex-col shadow-2xl"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 38, mass: 0.8 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <p className="text-[15px] font-semibold text-gray-900">Past conversations</p>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {historyLoading ? (
                  <div className="flex flex-col gap-3 p-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="rounded-2xl bg-gray-50 p-4 space-y-2 animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="h-3.5 w-16 bg-gray-200 rounded-full" />
                          <div className="h-3 w-10 bg-gray-100 rounded-full" />
                        </div>
                        <div className="h-3 w-3/4 bg-gray-100 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : !history || history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                    <Clock className="w-8 h-8 text-gray-200" />
                    <p className="text-sm text-gray-400">No past conversations</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 p-3">
                    {history.map((c) => {
                      const lastMsg = c.messages[0];
                      const cat = CATEGORY_LABELS[c.category] ?? c.category;
                      const ago = c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : "";
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setHistoryOpen(false);
                            router.push(`/chat/${c.id}`);
                          }}
                          className="w-full text-left rounded-2xl px-4 py-3.5 transition-colors active:scale-[0.98] bg-gray-50 active:bg-gray-100"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{cat}</span>
                            <span className="text-[11px] text-gray-300">{ago}</span>
                          </div>
                          <p className="text-[13px] leading-snug truncate text-gray-600">
                            {lastMsg ? lastMsg.content : "No messages yet"}
                          </p>
                          <span className={cn(
                            "inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full",
                            c.status === "OPEN" ? "bg-blue-50 text-blue-600"
                              : c.status === "PENDING" ? "bg-yellow-50 text-yellow-600"
                              : c.status === "RESOLVED" ? "bg-emerald-50 text-emerald-600"
                              : c.status === "ESCALATED" ? "bg-amber-50 text-amber-600"
                              : "bg-gray-100 text-gray-500"
                          )}>
                            {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {/* Welcome bubble */}
        <div className="flex justify-start mb-2">
          <div className="max-w-[82%]">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <p className="text-[15px] text-gray-800 leading-relaxed">
                Hi! I&apos;m Avi, your support assistant. How can I help you today?
              </p>
            </div>
          </div>
        </div>

        {/* User messages sent while waiting */}
        {pendingMessages.map((msg, i) => (
          <div key={i} className="flex justify-end mb-1.5">
            <div className="max-w-[82%]">
              <div className="bg-[#0f0f0f] text-white rounded-2xl rounded-br-sm px-4 py-[11px]">
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        className="shrink-0 bg-white/95 border-t border-gray-100"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="px-3 pt-2">
          {/* Category pill */}
          <div className="relative mb-2">
            <button
              onClick={() => setCategoryPickerOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-xs font-medium text-gray-600"
              style={{ touchAction: "manipulation" }}
            >
              <ActiveIcon className={cn("w-3 h-3 shrink-0", activeCat?.color ?? "text-gray-500")} />
              {categoryLabel}
              <ChevronUp className={cn("w-3 h-3 text-gray-400 transition-transform", !categoryPickerOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {categoryPickerOpen && (
                <>
                  <motion.div
                    className="fixed inset-0 z-30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setCategoryPickerOpen(false)}
                  />
                  <motion.div
                    className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-40"
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.6 }}
                  >
                    <div className="px-3 py-2 border-b border-gray-50">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Change topic</p>
                    </div>
                    {CATEGORIES.map(({ value, label, description, icon: Icon, color }) => {
                      const isActive = value === convCategory;
                      return (
                        <button
                          key={value}
                          onClick={() => { setConvCategory(value); setCategoryPickerOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                            isActive ? "bg-gray-50" : "hover:bg-gray-50"
                          )}
                        >
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-gray-100">
                            <Icon className={cn("w-3.5 h-3.5", color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-900">{label}</p>
                            <p className="text-[11px] text-gray-400 truncate">{description}</p>
                          </div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-gray-900 shrink-0" />}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Text input */}
          <div
            className="flex items-center gap-2 rounded-3xl border px-3 py-2.5 border-gray-200"
            style={{ backgroundColor: "#f2f2f7" }}
          >
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              style={{ touchAction: "manipulation" }}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Talk to Avi…"
              rows={1}
              className="flex-1 min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400 outline-none ring-0 resize-none leading-relaxed focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              style={{ minHeight: "1.5rem", maxHeight: "7rem", outline: "none", boxShadow: "none", fontSize: "16px" }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-150",
                text.trim()
                  ? "bg-[#0f0f0f] text-white shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              style={{ touchAction: "manipulation" }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-center text-gray-300 mt-2 mb-0.5 select-none">
            Secured by Avici · Your data is protected
          </p>
        </div>
      </div>
    </div>
  );
}
