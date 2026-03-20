"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge, PriorityBadge, SentimentBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMessageTime, formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Bot, User, ChevronLeft, Pause, Play, UserCheck, ArrowRight, Send } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Message {
  id: string;
  senderType: "USER" | "AI" | "AGENT";
  senderId: string | null;
  content: string;
  isStreaming: boolean;
  createdAt: string;
  agent: { id: string; name: string; avatarUrl: string | null } | null;
}

interface Tag {
  id: string;
  definition: { type: string; value: string; label: string; color: string | null };
  confidence: number | null;
  source: string;
}

interface Conversation {
  id: string;
  status: string;
  category: string;
  priority: string;
  isAiPaused: boolean;
  assignedAgentId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
  };
  assignedAgent: { id: string; name: string; avatarUrl: string | null; email: string } | null;
  messages: Message[];
  tags: Tag[];
}

interface ConversationViewProps {
  conversation: Conversation;
  currentAgentId: string;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

export function ConversationView({ conversation: initial, currentAgentId }: ConversationViewProps) {
  const [conv, setConv] = useState(initial);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [streamingMsg, setStreamingMsg] = useState<{ id: string; content: string } | null>(null);
  const [typingAgent, setTypingAgent] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [controlLoading, setControlLoading] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMsg]);

  // WebSocket setup
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = async () => {
      const token = await getAccessToken();
      ws.send(JSON.stringify({ type: "auth", token, role: "agent" }));
      ws.send(JSON.stringify({ type: "join", conversationId: conv.id }));
    };

    ws.onmessage = (event) => {
      const evt = JSON.parse(event.data);

      switch (evt.type) {
        case "message": {
          const p = evt.payload;
          if (p.conversationId !== conv.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === p.id)) return prev;
            return [
              ...prev,
              {
                id: p.id,
                senderType: p.senderType,
                senderId: p.senderId ?? null,
                content: p.content,
                isStreaming: false,
                createdAt: p.createdAt,
                agent: p.senderName ? { id: p.senderId ?? "", name: p.senderName, avatarUrl: null } : null,
              },
            ];
          });
          break;
        }
        case "ai_chunk": {
          const p = evt.payload;
          if (p.conversationId !== conv.id) return;
          setStreamingMsg((prev) =>
            prev
              ? { ...prev, content: prev.content + p.chunk }
              : { id: p.messageId, content: p.chunk }
          );
          break;
        }
        case "ai_done": {
          const p = evt.payload;
          if (p.conversationId !== conv.id) return;
          setStreamingMsg((sm) => {
            if (sm) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === sm.id)) return prev;
                return [
                  ...prev,
                  {
                    id: sm.id,
                    senderType: "AI",
                    senderId: null,
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
        case "typing": {
          const p = evt.payload;
          if (p.conversationId !== conv.id) return;
          if (p.senderType === "agent") {
            setTypingAgent(p.isTyping);
          }
          break;
        }
        case "control": {
          const p = evt.payload;
          if (p.conversationId !== conv.id) return;
          if (p.action === "pause_ai") setConv((c) => ({ ...c, isAiPaused: true }));
          if (p.action === "resume_ai") setConv((c) => ({ ...c, isAiPaused: false }));
          if (p.action === "takeover") setConv((c) => ({ ...c, isAiPaused: true, assignedAgentId: p.agentId ?? c.assignedAgentId }));
          if (p.action === "release") setConv((c) => ({ ...c, isAiPaused: false, assignedAgentId: null }));
          if (p.action === "resolve") setConv((c) => ({ ...c, status: "RESOLVED", isAiPaused: true }));
          if (p.action === "escalate") setConv((c) => ({ ...c, status: "ESCALATED", isAiPaused: true }));
          break;
        }
        case "tag_update": {
          const p = evt.payload;
          if (p.conversationId !== conv.id) return;
          setConv((c) => ({ ...c, tags: p.tags }));
          break;
        }
      }
    };

    ws.onclose = () => {};
    ws.onerror = () => {};

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", conversationId: conv.id }));
      }
      ws.close();
    };
  }, [conv.id]);

  async function getAccessToken(): Promise<string> {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    return data.token ?? "";
  }

  function sendControl(action: string) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    setControlLoading(action);
    wsRef.current.send(
      JSON.stringify({ type: "control", conversationId: conv.id, action })
    );
    setControlLoading(null);
  }

  function sendReply() {
    if (!replyText.trim() || sending || wsRef.current?.readyState !== WebSocket.OPEN) return;

    const content = replyText.trim();
    setReplyText("");

    wsRef.current.send(
      JSON.stringify({ type: "send_message", conversationId: conv.id, content })
    );

    inputRef.current?.focus();
  }

  function handleTyping() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "typing",
          conversationId: conv.id,
          isTyping: true,
        })
      );

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        wsRef.current?.send(
          JSON.stringify({
            type: "typing",
            conversationId: conv.id,
            isTyping: false,
          })
        );
      }, 2000);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  // Group tags by type
  const tagsByType = conv.tags.reduce<Record<string, Tag[]>>((acc, tag) => {
    const type = tag.definition.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(tag);
    return acc;
  }, {});

  const sentimentTag = tagsByType["sentiment"]?.[0];
  const issueTag = tagsByType["issue_type"]?.[0];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-gray-100">
        {/* Chat header */}
        <div className="h-14 flex items-center gap-3 px-5 border-b border-gray-100 bg-white shrink-0">
          <Link href="/live" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </Link>

          <Avatar
            name={conv.user.name}
            src={conv.user.avatarUrl}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {conv.user.name ?? conv.user.email ?? "User"}
              </span>
              <Badge variant="muted" size="sm">
                {categoryLabel(conv.category)}
              </Badge>
              {conv.isAiPaused && (
                <Badge variant="warning" size="sm">
                  AI paused
                </Badge>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {conv.isAiPaused ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => sendControl("resume_ai")}
                loading={controlLoading === "resume_ai"}
              >
                <Play className="w-3.5 h-3.5" />
                Resume AI
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => sendControl("pause_ai")}
                loading={controlLoading === "pause_ai"}
              >
                <Pause className="w-3.5 h-3.5" />
                Pause AI
              </Button>
            )}

            {conv.assignedAgentId !== currentAgentId && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => sendControl("takeover")}
                loading={controlLoading === "takeover"}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Take over
              </Button>
            )}

            {conv.status !== "RESOLVED" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sendControl("resolve")}
                loading={controlLoading === "resolve"}
              >
                Resolve
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {streamingMsg && (
            <MessageBubble
              key={`streaming-${streamingMsg.id}`}
              message={{
                id: streamingMsg.id,
                senderType: "AI",
                senderId: null,
                content: streamingMsg.content,
                isStreaming: true,
                createdAt: new Date().toISOString(),
                agent: null,
              }}
            />
          )}

          {typingAgent && (
            <div className="flex items-end gap-2 justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Reply input (only when agent has taken over) */}
        {(conv.isAiPaused || conv.assignedAgentId === currentAgentId) && (
          <div className="bg-white border-t border-gray-100 p-4 shrink-0">
            <div className="flex items-end gap-3 bg-gray-50 rounded-xl border border-gray-200 p-3">
              <textarea
                ref={inputRef}
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value);
                  handleTyping();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Reply to user… (Enter to send, Shift+Enter for newline)"
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none max-h-32 min-h-[1.5rem]"
                rows={1}
              />
              <Button
                variant="primary"
                size="icon"
                onClick={sendReply}
                loading={sending}
                disabled={!replyText.trim()}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — context */}
      <div className="w-72 shrink-0 flex flex-col overflow-y-auto bg-white">
        {/* User info */}
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">User</h3>
          <Link href={`/users/${conv.user.id}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Avatar name={conv.user.name} src={conv.user.avatarUrl} size="md" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {conv.user.name ?? "Unknown"}
              </p>
              {conv.user.email && (
                <p className="text-xs text-gray-400">{conv.user.email}</p>
              )}
              {conv.user.phone && (
                <p className="text-xs text-gray-400">{conv.user.phone}</p>
              )}
            </div>
          </Link>
        </div>

        {/* Conversation info */}
        <div className="p-5 border-b border-gray-100 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversation</h3>
          <Row label="Status" value={<StatusBadge status={conv.status} />} />
          <Row label="Priority" value={<PriorityBadge priority={conv.priority} />} />
          <Row label="Category" value={<Badge variant="muted">{categoryLabel(conv.category)}</Badge>} />
          {conv.assignedAgent && (
            <Row
              label="Assigned"
              value={
                <div className="flex items-center gap-1.5">
                  <Avatar name={conv.assignedAgent.name} size="xs" />
                  <span className="text-xs text-gray-700">{conv.assignedAgent.name}</span>
                </div>
              }
            />
          )}
        </div>

        {/* Tags */}
        {conv.tags.length > 0 && (
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              AI Tags
            </h3>
            <div className="space-y-2">
              {Object.entries(tagsByType).map(([type, tags]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 capitalize">
                    {type.replace(/_/g, " ")}
                  </span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {tags.map((tag) => {
                      if (tag.definition.type === "sentiment") {
                        return <SentimentBadge key={tag.id} sentiment={tag.definition.value} />;
                      }
                      return (
                        <Badge key={tag.id} variant="default" size="sm">
                          {tag.definition.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Actions
          </h3>
          {conv.status !== "ESCALATED" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => sendControl("escalate")}
              loading={controlLoading === "escalate"}
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Escalate
            </Button>
          )}
          {conv.status !== "RESOLVED" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => sendControl("resolve")}
              loading={controlLoading === "resolve"}
            >
              Resolve
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="text-xs">{value}</div>
    </div>
  );
}

function MessageBubble({ message: msg }: { message: Message }) {
  const isUser = msg.senderType === "USER";
  const isAI = msg.senderType === "AI";
  const isAgent = msg.senderType === "AGENT";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
            isAI ? "bg-gray-900" : "bg-blue-500"
          )}
        >
          {isAI ? (
            <Bot className="w-3.5 h-3.5 text-white" />
          ) : (
            <User className="w-3.5 h-3.5 text-white" />
          )}
        </div>
      )}

      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-gray-900 text-white rounded-br-sm"
            : isAI
            ? "bg-white border border-gray-100 text-gray-900 rounded-bl-sm"
            : "bg-blue-50 border border-blue-100 text-gray-900 rounded-bl-sm"
        )}
      >
        {isAgent && msg.agent && (
          <p className="text-[10px] font-semibold text-blue-600 mb-1">
            {msg.agent.name}
          </p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
          {msg.isStreaming && (
            <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />
          )}
        </p>
        <p
          className={cn(
            "text-[10px] mt-1",
            isUser ? "text-gray-400" : "text-gray-400"
          )}
        >
          {formatMessageTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}
