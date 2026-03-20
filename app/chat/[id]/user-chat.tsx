"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { formatMessageTime } from "@/lib/utils/format";
import { Send, ChevronLeft, Bot, User, Shield, CheckCircle, ArrowUpCircle } from "lucide-react";

interface Message {
  id: string;
  senderType: "USER" | "AI" | "AGENT";
  content: string;
  isStreaming: boolean;
  createdAt: string;
  agent: { name: string; avatarUrl: string | null } | null;
}

interface Conversation {
  id: string;
  category: string;
  status: string;
  isAiPaused: boolean;
  assignedAgentId: string | null;
  messages: Message[];
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

const CATEGORY_LABELS: Record<string, string> = {
  CARDS: "Cards",
  ACCOUNT: "Account",
  SPENDS: "Spends",
  KYC: "KYC",
  GENERAL: "General",
  OTHER: "Support",
};

function getUserId(): string {
  let id = localStorage.getItem("avi_user_id");
  if (!id) {
    id = `user_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem("avi_user_id", id);
  }
  return id;
}

export function UserChat({ conversation: initial }: { conversation: Conversation }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [streamingMsg, setStreamingMsg] = useState<{ id: string; content: string } | null>(null);
  const [convStatus, setConvStatus] = useState(initial.status);
  const [isAgentActive, setIsAgentActive] = useState(initial.isAiPaused && !!initial.assignedAgentId);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMsg, isAiTyping]);

  // Connect WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      const userId = getUserId();
      ws.send(JSON.stringify({ type: "auth", token: userId, role: "user" }));
      ws.send(JSON.stringify({ type: "join", conversationId: initial.id }));
      setWsReady(true);
      setWsError(false);
    };

    ws.onmessage = (event) => {
      const evt = JSON.parse(event.data);

      switch (evt.type) {
        case "message": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          // Don't add USER messages here — we optimistically add them on send
          if (p.senderType === "USER") return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === p.id)) return prev;
            return [
              ...prev,
              {
                id: p.id,
                senderType: p.senderType,
                content: p.content,
                isStreaming: false,
                createdAt: p.createdAt,
                agent: p.senderName ? { name: p.senderName, avatarUrl: null } : null,
              },
            ];
          });
          setIsAiTyping(false);
          break;
        }

        case "ai_chunk": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          setIsAiTyping(false);
          setStreamingMsg((prev) =>
            prev
              ? { ...prev, content: prev.content + p.chunk }
              : { id: p.messageId, content: p.chunk }
          );
          break;
        }

        case "ai_done": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          setStreamingMsg((sm) => {
            if (sm) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === sm.id)) return prev;
                return [
                  ...prev,
                  {
                    id: sm.id,
                    senderType: "AI",
                    content: sm.content,
                    isStreaming: false,
                    createdAt: new Date().toISOString(),
                    agent: null,
                  },
                ];
              });
            }
            return null;
          });
          break;
        }

        case "control": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          if (p.action === "takeover") setIsAgentActive(true);
          if (p.action === "resume_ai" || p.action === "release") setIsAgentActive(false);
          if (p.action === "resolve") setConvStatus("RESOLVED");
          if (p.action === "escalate") setConvStatus("ESCALATED");
          break;
        }
      }
    };

    ws.onclose = () => setWsReady(false);
    ws.onerror = () => { setWsReady(false); setWsError(true); };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", conversationId: initial.id }));
      }
      ws.close();
    };
  }, [initial.id]);

  const isClosed = convStatus === "RESOLVED" || convStatus === "ESCALATED";

  async function sendMessage() {
    if (!text.trim() || sending || !wsReady || isClosed) return;

    const content = text.trim();
    setText("");
    setSending(true);

    // Optimistic add
    setMessages((prev) => [
      ...prev,
      {
        id: `temp_${Date.now()}`,
        senderType: "USER",
        content,
        isStreaming: false,
        createdAt: new Date().toISOString(),
        agent: null,
      },
    ]);

    // Show AI typing indicator
    if (!isAgentActive) {
      setTimeout(() => setIsAiTyping(true), 300);
    }

    // Send via WebSocket
    wsRef.current!.send(
      JSON.stringify({ type: "send_message", conversationId: initial.id, content })
    );

    setSending(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const categoryLabel = CATEGORY_LABELS[initial.category] ?? "Support";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3 bg-white shrink-0">
        <button
          onClick={() => router.push("/chat")}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="w-9 h-9 rounded-xl bg-[#0f0f0f] flex items-center justify-center shrink-0">
          {isAgentActive ? (
            <User className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          ) : (
            <Bot className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {isAgentActive ? "Support Agent" : "Avi"}
          </p>
          <p className="text-xs text-gray-400">{categoryLabel} support</p>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-gray-400">Online</span>
        </div>
      </div>

      {/* Agent takeover banner */}
      {isAgentActive && convStatus === "OPEN" && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
          <Shield className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 font-medium">
            A support agent has joined and will assist you directly.
          </p>
        </div>
      )}

      {/* Resolved banner */}
      {convStatus === "RESOLVED" && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-xs text-emerald-700 font-medium">
            This conversation has been resolved. We hope we could help!
          </p>
        </div>
      )}

      {/* Escalated banner */}
      {convStatus === "ESCALATED" && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
          <ArrowUpCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">
            Your issue has been escalated to our team. Someone will follow up with you shortly.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Welcome message if no messages yet */}
        {messages.length === 0 && !streamingMsg && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2 max-w-[80%]">
              <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <p className="text-sm text-gray-800 leading-relaxed">
                  Hi! I'm Avi, your support assistant. How can I help you today?
                </p>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  {formatMessageTime(new Date().toISOString())}
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming AI response */}
        {streamingMsg && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2 max-w-[80%]">
              <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {streamingMsg.content}
                  <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI typing indicator */}
        {isAiTyping && !streamingMsg && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2">
              <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-5 pt-2 bg-white border-t border-gray-100 shrink-0">
        {/* Closed state */}
        {isClosed && (
          <div className="flex items-center justify-center gap-1.5 text-xs mb-2 py-1.5 rounded-lg bg-gray-50 text-gray-400">
            {convStatus === "RESOLVED" ? "Conversation resolved — no further replies needed" : "Escalated — our team will reach out to you"}
          </div>
        )}
        {/* Connection status */}
        {!wsReady && !isClosed && (
          <div className={cn(
            "flex items-center justify-center gap-1.5 text-xs mb-2 py-1.5 rounded-lg",
            wsError
              ? "bg-red-50 text-red-500"
              : "bg-gray-50 text-gray-400"
          )}>
            {wsError ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                Connection failed — make sure the chat server is running
              </>
            ) : (
              <>
                <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin shrink-0" />
                Connecting…
              </>
            )}
          </div>
        )}
        <div className={cn(
          "flex items-end gap-2 rounded-2xl border px-4 py-3 transition-colors",
          isClosed
            ? "bg-gray-50 border-gray-100 opacity-50"
            : wsReady ? "bg-gray-50 border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"
        )}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isClosed ? "This conversation is closed" : wsReady ? "Type a message…" : "Connecting…"}
            disabled={!wsReady || isClosed}
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none resize-none max-h-28 leading-relaxed disabled:cursor-not-allowed"
            style={{ minHeight: "1.5rem" }}
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending || !wsReady || isClosed}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all",
              text.trim() && wsReady && !sending && !isClosed
                ? "bg-[#0f0f0f] text-white hover:bg-[#262626] active:scale-95"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-center text-gray-300 mt-2">
          Secured by Avici · Your data is protected
        </p>
      </div>
    </div>
  );
}

function ChatBubble({ message: msg }: { message: Message }) {
  const isUser = msg.senderType === "USER";
  const isAgent = msg.senderType === "AGENT";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex items-end gap-2 max-w-[80%]", isUser && "flex-row-reverse")}>
        {/* Avatar */}
        {!isUser && (
          <div
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
              isAgent ? "bg-blue-500" : "bg-gray-900"
            )}
          >
            {isAgent ? (
              <User className="w-3.5 h-3.5 text-white" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-white" />
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "px-4 py-3 rounded-2xl",
            isUser
              ? "bg-[#0f0f0f] text-white rounded-br-sm"
              : isAgent
              ? "bg-blue-50 border border-blue-100 text-gray-900 rounded-bl-sm shadow-sm"
              : "bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm"
          )}
        >
          {isAgent && msg.agent?.name && (
            <p className="text-[10px] font-semibold text-blue-500 mb-1">
              {msg.agent.name}
            </p>
          )}
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </p>
          <p
            className={cn(
              "text-[10px] mt-1.5",
              isUser ? "text-gray-500" : "text-gray-400"
            )}
          >
            {formatMessageTime(msg.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
