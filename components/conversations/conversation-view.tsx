"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge, PriorityBadge, SentimentBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMessageTime, formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Bot, User, ChevronLeft, Play, UserCheck, ArrowRight, Send, History, X, Plus, Check, ChevronDown, Tag as TagIcon, Zap, Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface MediaMeta {
  id: string;
  url: string;
  mimeType: string;
  fileName: string;
}

interface Message {
  id: string;
  senderType: "USER" | "AI" | "AGENT";
  senderId: string | null;
  content: string;
  isStreaming: boolean;
  createdAt: string;
  agent: { id: string; name: string; avatarUrl: string | null } | null;
  media?: MediaMeta | null;
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
    externalId: string;
  };
  assignedAgent: { id: string; name: string; avatarUrl: string | null; email: string } | null;
  messages: Message[];
  tags: Tag[];
}

interface UserHistoryItem {
  id: string;
  category: string;
  status: string;
  lastMessageAt: string | null;
  messages: Array<{ content: string; senderType: string }>;
}

interface HistoryDetail {
  id: string;
  category: string;
  status: string;
  createdAt: string;
  messages: Array<{
    id: string;
    senderType: string;
    content: string;
    createdAt: string;
    media?: MediaMeta | null;
  }>;
}

interface Agent {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const STATUS_OPTIONS = ["OPEN", "PENDING", "ESCALATED", "RESOLVED", "CLOSED"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CATEGORY_OPTIONS = ["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"];

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
  const [userHistory, setUserHistory] = useState<UserHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);

  // Editing state
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [addTagForType, setAddTagForType] = useState<string | null>(null);
  const [addTagNewType, setAddTagNewType] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagLabel, setEditingTagLabel] = useState("");

  // Workspace setting
  const [aiEnabled, setAiEnabled] = useState(true);

  // Canned responses
  const [cannedResponses, setCannedResponses] = useState<{ id: string; title: string; content: string }[]>([]);
  const [cannedOpen, setCannedOpen] = useState(false);
  // Slash command autocomplete
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = closed, "" = show all
  const [slashIndex, setSlashIndex] = useState(0);

  // Notes
  const [notes, setNotes] = useState<{ id: string; content: string; createdAt: string; agent: { id: string; name: string; avatarUrl: string | null } }[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

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

  // Fetch user's conversation history
  useEffect(() => {
    setHistoryLoading(true);
    fetch(`/api/conversations?userId=${conv.user.id}&limit=20`)
      .then((r) => r.json())
      .then((d) => setUserHistory(d.conversations ?? []))
      .catch(() => setUserHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [conv.user.id]);

  // Fetch workspace setting
  useEffect(() => {
    fetch("/api/settings/workspace")
      .then((r) => r.ok ? r.json() : { aiEnabled: true })
      .then((d) => setAiEnabled(d.aiEnabled ?? true))
      .catch(() => {});
  }, []);

  // Fetch agents list for assignment dropdown
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch canned responses
  useEffect(() => {
    fetch("/api/canned-responses")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCannedResponses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch notes for this conversation
  useEffect(() => {
    setNotesLoading(true);
    fetch(`/api/conversations/${conv.id}/notes`)
      .then((r) => r.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [conv.id]);


  // WebSocket setup
  useEffect(() => {
    let cancelled = false;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = async () => {
      // Strict Mode mounts twice in dev — if cleanup already ran, close immediately
      if (cancelled) { ws.close(); return; }
      const token = await getAccessToken();
      if (cancelled) { ws.close(); return; }
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
                media: p.media ?? null,
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
          if (p.action === "takeover") {
            const takenById = p.agentId ?? null;
            const takenByAgent = agents.find((a) => a.id === takenById) ?? null;
            setConv((c) => ({
              ...c,
              isAiPaused: true,
              assignedAgentId: takenById ?? c.assignedAgentId,
              assignedAgent: takenByAgent
                ? { id: takenByAgent.id, name: takenByAgent.name, avatarUrl: takenByAgent.avatarUrl, email: "" }
                : c.assignedAgent,
            }));
          }
          if (p.action === "release") setConv((c) => ({ ...c, isAiPaused: false, assignedAgentId: null, assignedAgent: null }));
          if (p.action === "resolve") setConv((c) => ({ ...c, status: "RESOLVED", isAiPaused: true }));
          if (p.action === "escalate") setConv((c) => ({ ...c, status: "ESCALATED", isAiPaused: true }));
          setControlLoading(null);
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
      cancelled = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", conversationId: conv.id }));
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        // Close it as soon as it connects to avoid "closed before established" error
        ws.addEventListener("open", () => ws.close(), { once: true });
      }
    };
  }, [conv.id]);

  async function getAccessToken(): Promise<string> {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    return data.token ?? "";
  }

  async function sendControl(action: string) {
    setControlLoading(action);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // WS path — loading clears when the control event bounces back
      wsRef.current.send(JSON.stringify({ type: "control", conversationId: conv.id, action }));
    } else {
      // REST fallback when WS is not connected
      try {
        await fetch(`/api/conversations/${conv.id}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        // Apply state changes locally since there's no WS broadcast
        if (action === "pause_ai") setConv((c) => ({ ...c, isAiPaused: true }));
        if (action === "resume_ai") setConv((c) => ({ ...c, isAiPaused: false }));
        if (action === "takeover") {
          const me = agents.find((a) => a.id === currentAgentId) ?? null;
          setConv((c) => ({
            ...c,
            isAiPaused: true,
            assignedAgentId: currentAgentId,
            assignedAgent: me ? { id: me.id, name: me.name, avatarUrl: me.avatarUrl, email: "" } : c.assignedAgent,
          }));
        }
        if (action === "release") setConv((c) => ({ ...c, isAiPaused: false, assignedAgentId: null, assignedAgent: null }));
        if (action === "resolve") setConv((c) => ({ ...c, status: "RESOLVED", isAiPaused: true }));
        if (action === "escalate") setConv((c) => ({ ...c, status: "ESCALATED", isAiPaused: true }));
      } finally {
        setControlLoading(null);
      }
    }
  }

  async function openHistoryDetail(id: string) {
    setHistoryDetailLoading(true);
    setHistoryDetail(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      setHistoryDetail(data);
    } finally {
      setHistoryDetailLoading(false);
    }
  }

  async function patchConv(data: Record<string, unknown>) {
    // Optimistic update
    const prev = conv;
    setConv((c) => ({ ...c, ...data }));
    const res = await fetch(`/api/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) setConv(prev); // rollback on failure
  }

  async function removeTag(tagId: string) {
    // Optimistic update
    setConv((c) => ({ ...c, tags: c.tags.filter((t) => t.id !== tagId) }));
    const res = await fetch(`/api/conversations/${conv.id}/tags?tagId=${tagId}`, { method: "DELETE" });
    if (!res.ok) {
      // rollback — re-fetch tags
      const r = await fetch(`/api/conversations/${conv.id}/tags`);
      if (r.ok) { const tags = await r.json(); setConv((c) => ({ ...c, tags })); }
    }
  }

  async function saveTag(type: string) {
    const label = newTagLabel.trim();
    if (!type || !label) return;
    setTagSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value: label.toLowerCase().replace(/\s+/g, "_"), label }),
      });
      if (res.ok) {
        const tag = await res.json();
        setConv((c) => ({ ...c, tags: [...c.tags.filter((t) => t.id !== tag.id), tag] }));
        setNewTagLabel("");
        setAddTagForType(null);
        setAddTagNewType("");
        setEditingTagId(null);
      }
    } finally {
      setTagSaving(false);
    }
  }

  async function updateTag(tag: Tag) {
    const label = editingTagLabel.trim();
    if (!label || label === tag.definition.label) { setEditingTagId(null); return; }
    setTagSaving(true);
    try {
      // Remove old, add updated
      await fetch(`/api/conversations/${conv.id}/tags?tagId=${tag.id}`, { method: "DELETE" });
      const res = await fetch(`/api/conversations/${conv.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tag.definition.type, value: label.toLowerCase().replace(/\s+/g, "_"), label }),
      });
      if (res.ok) {
        const newTag = await res.json();
        setConv((c) => ({ ...c, tags: [...c.tags.filter((t) => t.id !== tag.id && t.id !== newTag.id), newTag] }));
      }
    } finally {
      setTagSaving(false);
      setEditingTagId(null);
    }
  }

  async function saveNote() {
    if (!noteText.trim() || noteSaving) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteText.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setNotes((n) => [...n, note]);
        setNoteText("");
      }
    } finally {
      setNoteSaving(false);
    }
  }

  async function deleteNote(noteId: string) {
    setNotes((n) => n.filter((note) => note.id !== noteId));
    await fetch(`/api/conversations/${conv.id}/notes?noteId=${noteId}`, { method: "DELETE" });
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

  const slashMatches = slashQuery !== null
    ? cannedResponses.filter((cr) => cr.title.toLowerCase().includes(slashQuery.toLowerCase()))
    : [];

  function applySlashMatch(cr: { id: string; title: string; content: string }) {
    setReplyText(cr.content);
    setSlashQuery(null);
    setSlashIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashQuery !== null && slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySlashMatch(slashMatches[slashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
    }
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
            name={conv.user.name ?? conv.user.externalId}
            src={conv.user.avatarUrl}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {conv.user.name ?? conv.user.email ?? conv.user.externalId}
              </span>
              <Badge variant="muted" size="sm">
                {categoryLabel(conv.category)}
              </Badge>
              {conv.isAiPaused && aiEnabled && (
                <Badge variant="warning" size="sm">
                  AI paused
                </Badge>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {conv.isAiPaused && aiEnabled && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => sendControl("resume_ai")}
                loading={controlLoading === "resume_ai"}
              >
                <Play className="w-3.5 h-3.5" />
                Resume AI
              </Button>
            )}
            {aiEnabled && (
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
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
          {messages.map((msg: Message) => (
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

        {/* Reply input: with AI off, agents can always reply; with AI on, takeover/pause rules apply */}
        {(!aiEnabled || conv.isAiPaused || conv.assignedAgentId === currentAgentId) && (
          <div className="bg-white border-t border-gray-100 p-4 shrink-0 space-y-2">
            {/* Canned responses */}
            {cannedResponses.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setCannedOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Quick replies
                  <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", cannedOpen && "rotate-180")} />
                </button>
                {cannedOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCannedOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-gray-100 rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto">
                      {cannedResponses.map((cr) => (
                        <button
                          key={cr.id}
                          onClick={() => { setReplyText(cr.content); setCannedOpen(false); inputRef.current?.focus(); }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <p className="text-xs font-medium text-gray-800">{cr.title}</p>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">{cr.content}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Slash command autocomplete */}
            {slashQuery !== null && slashMatches.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                {slashMatches.map((cr, i) => (
                  <button
                    key={cr.id}
                    onMouseDown={(e) => { e.preventDefault(); applySlashMatch(cr); }}
                    className={cn(
                      "w-full text-left px-3.5 py-2.5 transition-colors border-b border-gray-50 last:border-0",
                      i === slashIndex ? "bg-gray-50" : "hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-400">/{cr.title.toLowerCase().replace(/\s+/g, "-")}</span>
                      <span className="text-xs font-medium text-gray-800">{cr.title}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{cr.content}</p>
                  </button>
                ))}
              </div>
            )}
            {slashQuery !== null && cannedResponses.length > 0 && slashMatches.length === 0 && (
              <div className="bg-white border border-gray-100 rounded-xl px-3.5 py-2.5">
                <p className="text-xs text-gray-400">No matching quick replies</p>
              </div>
            )}

            <div className="flex items-center gap-3 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5">
              <textarea
                ref={inputRef}
                value={replyText}
                onChange={(e) => {
                  const val = e.target.value;
                  setReplyText(val);
                  handleTyping();
                  // Slash command: only trigger if the entire value starts with /
                  if (val.startsWith("/") && !val.includes(" ") && !val.includes("\n")) {
                    setSlashQuery(val.slice(1));
                    setSlashIndex(0);
                  } else {
                    setSlashQuery(null);
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Reply to user… (/ for quick replies, Enter to send)"
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none max-h-32"
                rows={1}
                style={{ lineHeight: "1.5", minHeight: "1.5rem" }}
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
      <div className="w-72 shrink-0 flex flex-col overflow-y-auto bg-white relative">
        {/* User info */}
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">User</h3>
          <Link href={`/users/${conv.user.id}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Avatar name={conv.user.name ?? conv.user.externalId} src={conv.user.avatarUrl} size="md" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {conv.user.name ?? conv.user.email ?? conv.user.externalId}
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

        {/* Conversation info — editable */}
        <div className="p-5 border-b border-gray-100 space-y-1">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversation</h3>

          {/* Status */}
          <EditableField
            label="Status"
            open={editOpen === "status"}
            onToggle={() => setEditOpen(editOpen === "status" ? null : "status")}
            display={<StatusBadge status={conv.status} />}
          >
            {STATUS_OPTIONS.map((s) => (
              <DropdownOption
                key={s}
                active={s === conv.status}
                onClick={() => { patchConv({ status: s }); setEditOpen(null); }}
              >
                <StatusBadge status={s} />
              </DropdownOption>
            ))}
          </EditableField>

          {/* Priority */}
          <EditableField
            label="Priority"
            open={editOpen === "priority"}
            onToggle={() => setEditOpen(editOpen === "priority" ? null : "priority")}
            display={<PriorityBadge priority={conv.priority} />}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <DropdownOption
                key={p}
                active={p === conv.priority}
                onClick={() => { patchConv({ priority: p }); setEditOpen(null); }}
              >
                <PriorityBadge priority={p} />
              </DropdownOption>
            ))}
          </EditableField>

          {/* Category */}
          <EditableField
            label="Category"
            open={editOpen === "category"}
            onToggle={() => setEditOpen(editOpen === "category" ? null : "category")}
            display={<Badge variant="muted">{categoryLabel(conv.category)}</Badge>}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <DropdownOption
                key={c}
                active={c === conv.category}
                onClick={() => { patchConv({ category: c }); setEditOpen(null); }}
              >
                <span className="text-xs text-gray-700">{categoryLabel(c)}</span>
              </DropdownOption>
            ))}
          </EditableField>

          {/* Assigned agent */}
          <EditableField
            label="Assigned"
            open={editOpen === "agent"}
            onToggle={() => setEditOpen(editOpen === "agent" ? null : "agent")}
            display={
              conv.assignedAgent ? (
                <div className="flex items-center gap-1.5">
                  <Avatar name={conv.assignedAgent.name} size="xs" />
                  <span className="text-xs text-gray-700">{conv.assignedAgent.name}</span>
                </div>
              ) : (
                <span className="text-xs text-gray-400 italic">Unassigned</span>
              )
            }
          >
            <DropdownOption
              active={!conv.assignedAgentId}
              onClick={() => {
                patchConv({ assignedAgentId: null });
                setConv((c) => ({ ...c, assignedAgent: null }));
                setEditOpen(null);
              }}
            >
              <span className="text-xs text-gray-400 italic">Unassigned</span>
            </DropdownOption>
            {agents.map((a) => (
              <DropdownOption
                key={a.id}
                active={a.id === conv.assignedAgentId}
                onClick={() => {
                  patchConv({ assignedAgentId: a.id });
                  setConv((c) => ({ ...c, assignedAgent: { id: a.id, name: a.name, avatarUrl: a.avatarUrl, email: "" } }));
                  setEditOpen(null);
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Avatar name={a.name} src={a.avatarUrl} size="xs" />
                  <span className="text-xs text-gray-700">{a.name}</span>
                </div>
              </DropdownOption>
            ))}
          </EditableField>
        </div>

        {/* Tags — editable */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <TagIcon className="w-3 h-3 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</h3>
          </div>

          <div className="space-y-3">
            {Object.entries(tagsByType).map(([type, tags]: [string, Tag[]]) => (
              <div key={type}>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                  {type.replace(/_/g, " ")}
                </p>
                <div className="flex gap-1 flex-wrap items-center">
                  {tags.map((tag: Tag) => (
                    <div key={tag.id} className="group relative">
                      {editingTagId === tag.id ? (
                        <input
                          autoFocus
                          value={editingTagLabel}
                          onChange={(e) => setEditingTagLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateTag(tag);
                            if (e.key === "Escape") setEditingTagId(null);
                          }}
                          onBlur={() => updateTag(tag)}
                          className="text-[11px] px-2 py-0.5 rounded-md border border-gray-300 outline-none bg-white w-24"
                        />
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => { setEditingTagId(tag.id); setEditingTagLabel(tag.definition.label); }}
                            className="hover:opacity-70 transition-opacity"
                            title="Click to edit"
                          >
                            {tag.definition.type === "sentiment" ? (
                              <SentimentBadge sentiment={tag.definition.value} />
                            ) : (
                              <Badge variant="default" size="sm">{tag.definition.label}</Badge>
                            )}
                          </button>
                          {tags.length > 1 && (
                            <button
                              onClick={() => removeTag(tag.id)}
                              className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 rounded-full bg-gray-200 hover:bg-red-100 flex items-center justify-center transition-all"
                            >
                              <X className="w-2 h-2 text-gray-500 hover:text-red-500" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Per-type + button */}
                  {addTagForType === type ? null : (
                    <button
                      onClick={() => { setAddTagForType(type); setNewTagLabel(""); }}
                      className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                      title={`Add ${type.replace(/_/g, " ")} tag`}
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                {/* Inline add form for this type */}
                {addTagForType === type && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      autoFocus
                      placeholder="Label…"
                      value={newTagLabel}
                      onChange={(e) => setNewTagLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTag(type);
                        if (e.key === "Escape") { setAddTagForType(null); setNewTagLabel(""); }
                      }}
                      className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder:text-gray-300"
                    />
                    <button
                      onClick={() => saveTag(type)}
                      disabled={tagSaving || !newTagLabel.trim()}
                      className="text-xs bg-gray-900 text-white rounded-lg px-2.5 py-1.5 font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors shrink-0"
                    >
                      {tagSaving ? "…" : "Add"}
                    </button>
                    <button
                      onClick={() => { setAddTagForType(null); setNewTagLabel(""); }}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Add a brand-new tag type */}
            {addTagForType === "__new__" ? (
              <div className="space-y-1.5 p-3 bg-gray-50 rounded-xl">
                <input
                  autoFocus
                  placeholder="Type (e.g. issue_type)"
                  value={addTagNewType}
                  onChange={(e) => setAddTagNewType(e.target.value)}
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder:text-gray-300"
                />
                <input
                  placeholder="Label (e.g. Payment Failed)"
                  value={newTagLabel}
                  onChange={(e) => setNewTagLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTag(addTagNewType);
                    if (e.key === "Escape") { setAddTagForType(null); setAddTagNewType(""); setNewTagLabel(""); }
                  }}
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder:text-gray-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveTag(addTagNewType)}
                    disabled={tagSaving || !addTagNewType.trim() || !newTagLabel.trim()}
                    className="flex-1 text-xs bg-gray-900 text-white rounded-lg py-1.5 font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
                  >
                    {tagSaving ? "Saving…" : "Add"}
                  </button>
                  <button
                    onClick={() => { setAddTagForType(null); setAddTagNewType(""); setNewTagLabel(""); }}
                    className="px-3 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddTagForType("__new__"); setNewTagLabel(""); setAddTagNewType(""); }}
                className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New tag type
              </button>
            )}
          </div>
        </div>

        {/* Private notes */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <Lock className="w-3 h-3 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Private Notes</h3>
          </div>

          {notesLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="rounded-xl bg-gray-50 p-3 animate-pulse space-y-1.5">
                  <div className="h-2.5 w-full bg-gray-100 rounded" />
                  <div className="h-2 w-2/3 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {notes.map((note) => (
                <div key={note.id} className="group bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-gray-800 leading-relaxed flex-1 whitespace-pre-wrap">{note.content}</p>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-400 transition-all shrink-0 mt-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Avatar name={note.agent.name} src={note.agent.avatarUrl} size="xs" />
                    <span className="text-[10px] text-gray-400">{note.agent.name} · {formatRelativeTime(note.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
              placeholder="Add a private note…"
              rows={2}
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 placeholder:text-gray-300 resize-none text-gray-800"
            />
            <button
              onClick={saveNote}
              disabled={noteSaving || !noteText.trim()}
              className="px-3 text-xs bg-gray-900 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors self-end py-2 shrink-0"
            >
              {noteSaving ? "…" : "Add"}
            </button>
          </div>
        </div>

        {/* User history */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <History className="w-3 h-3 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past conversations</h3>
          </div>
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl bg-gray-50 p-3 animate-pulse space-y-1.5">
                  <div className="h-2.5 w-20 bg-gray-200 rounded" />
                  <div className="h-2 w-32 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : !userHistory || userHistory.filter((c) => c.id !== conv.id).length === 0 ? (
            <p className="text-xs text-gray-300 italic">No other conversations</p>
          ) : (
            <div className="space-y-1.5">
              {userHistory
                .filter((c) => c.id !== conv.id)
                .map((c) => {
                  const lastMsg = c.messages[0];
                  return (
                    <button
                      key={c.id}
                      onClick={() => openHistoryDetail(c.id)}
                      className="w-full text-left rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          {categoryLabel(c.category)}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                      {lastMsg ? (
                        <p className="text-xs text-gray-500 truncate">{lastMsg.content}</p>
                      ) : (
                        <p className="text-xs text-gray-300 italic">No messages</p>
                      )}
                      {c.lastMessageAt && (
                        <p className="text-[10px] text-gray-300 mt-1">{formatRelativeTime(c.lastMessageAt)}</p>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>


        {/* Past conversation overlay */}
        {(historyDetail || historyDetailLoading) && (
          <div className="absolute inset-0 bg-white flex flex-col z-20">
            {/* Overlay header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {historyDetail ? categoryLabel(historyDetail.category) : "Loading…"}
              </span>
              <div className="flex items-center gap-1">
                {historyDetail && (
                  <Link
                    href={`/conversations/${historyDetail.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    title="Open in new tab"
                  >
                    <ArrowRight className="w-3.5 h-3.5 -rotate-45" />
                  </Link>
                )}
                <button
                  onClick={() => setHistoryDetail(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {historyDetailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : historyDetail ? (
              <>
                {/* Status row */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
                  <StatusBadge status={historyDetail.status} />
                  <span className="text-[11px] text-gray-400">
                    {formatRelativeTime(historyDetail.createdAt)}
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
                  {historyDetail.messages.length === 0 ? (
                    <p className="text-xs text-gray-300 italic text-center pt-8">No messages</p>
                  ) : (
                    historyDetail.messages.map((msg) => {
                      const isUser = msg.senderType === "USER";
                      return (
                        <div key={msg.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed break-words",
                              isUser
                                ? "bg-gray-900 text-white rounded-br-sm"
                                : msg.senderType === "AGENT"
                                ? "bg-blue-50 border border-blue-100 text-gray-900 rounded-bl-sm"
                                : "bg-white border border-gray-100 text-gray-900 rounded-bl-sm"
                            )}
                          >
                            {msg.media && (
                              msg.media.mimeType.startsWith("video/") ? (
                                <video
                                  src={msg.media.url}
                                  controls
                                  playsInline
                                  className="rounded-lg max-w-full max-h-[180px] object-cover block mb-1"
                                />
                              ) : (
                                <img
                                  src={msg.media.url}
                                  alt={msg.media.fileName}
                                  className="rounded-lg max-w-full max-h-[180px] object-cover block mb-1"
                                  loading="lazy"
                                />
                              )
                            )}
                            {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                            <p className="text-[10px] mt-1 opacity-50">{formatMessageTime(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
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

function EditableField({
  label,
  display,
  open,
  onToggle,
  children,
}: {
  label: string;
  display: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1.5 rounded-lg hover:bg-gray-50 px-1 -mx-1 transition-colors group"
      >
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-1">
          <div className="text-xs">{display}</div>
          <ChevronDown
            className={cn(
              "w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      {open && (
        <div className="mt-1 mb-1 bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-gray-100",
        active && "bg-white"
      )}
    >
      {children}
      {active && <Check className="w-3 h-3 text-gray-900 shrink-0 ml-2" />}
    </button>
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
          "max-w-[70%] rounded-2xl overflow-hidden",
          msg.media && !msg.content ? "p-0" : "px-4 py-2.5",
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

        {msg.media && (
          msg.media.mimeType.startsWith("video/") ? (
            <div className={cn(msg.content && "mb-2")}>
              <video
                src={msg.media.url}
                controls
                playsInline
                className="rounded-xl max-w-[260px] max-h-[300px] object-cover block"
              />
            </div>
          ) : (
            <div className={cn(msg.content && "mb-2")}>
              <img
                src={msg.media.url}
                alt={msg.media.fileName}
                className="rounded-xl max-w-[260px] max-h-[300px] object-cover block"
                loading="lazy"
              />
            </div>
          )
        )}

        {msg.content ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
            {msg.isStreaming && (
              <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />
            )}
          </p>
        ) : !msg.media ? (
          <p className="text-sm italic opacity-50">📎 Attachment</p>
        ) : null}

        <p className="text-[10px] mt-1 text-gray-400">
          {formatMessageTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}
