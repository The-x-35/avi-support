"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import DOMPurify from "dompurify";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMessageTime, formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Bot, User, ChevronLeft, Play, UserCheck, ArrowRight, Send, History, X, Plus, Check, ChevronDown, Tag as TagIcon, Sparkles, Lock, EyeOff, Paperclip, Bold, Italic, Underline, Bell, BellOff, GitMerge, RefreshCw, Pencil, Trash2, Calendar, AlertTriangle, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import imageCompression from "browser-image-compression";
import { uploadMedia } from "@/lib/utils/upload";
import { agentWsManager } from "@/lib/agent-ws";
import { useChatTabs } from "@/lib/contexts/chat-tabs-context";

// ─── Media upload ─────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg","image/png","image/gif","image/webp","image/heic","image/heif",
  "video/mp4","video/quicktime","video/webm","video/x-m4v",
]);
const ALLOWED_EXT = new Set(["jpg","jpeg","png","gif","webp","heic","heif","mp4","mov","webm","m4v"]);
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

interface PendingMedia {
  file: File;
  previewUrl: string;
  isVideo: boolean;
}

// Render message content — HTML (from formatted agent messages) or plain text
const PURIFY_CONFIG = { ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "br", "p", "span", "a"], ALLOWED_ATTR: ["href", "target", "rel", "class"] };

function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtml) {
    const clean = DOMPurify.sanitize(content, PURIFY_CONFIG) + (isStreaming ? "<span class='inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-middle'></span>" : "");
    return (
      <p
        className="text-sm leading-relaxed break-words [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {content}
      {isStreaming && <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />}
    </p>
  );
}
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
  isPrivate: boolean;
  createdAt: string;
  agent: { id: string; name: string; avatarUrl: string | null } | null;
  media?: MediaMeta | null;
}

interface TagDefinition {
  id: string;
  name: string;
  color: string | null;
  categories: string[];
}

interface Tag {
  id: string;
  definition: TagDefinition;
}

interface Conversation {
  id: number;
  status: string;
  categories: string[];
  priority: string;
  isAiPaused: boolean;
  assignedAgentId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  lastReadByUserAt: string | null;
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

interface ConvSummary {
  id: number;
  status: string;
  categories: string[];
  lastMessageAt: string | null;
  user: { id: string; name: string | null; email: string | null; avatarUrl: string | null; externalId: string };
  messages: Array<{ content: string; senderType: string }>;
}

interface UserHistoryItem {
  id: number;
  categories: string[];
  status: string;
  lastMessageAt: string | null;
  messages: Array<{ content: string; senderType: string }>;
}

interface HistoryDetail {
  id: number;
  categories: string[];
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
const ESC_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];
const ESC_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  RESOLVED: "bg-green-50 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};
const EMPTY_ESC_FORM = { title: "", teamId: "", assigneeId: "", categories: [] as string[], tagIds: [] as string[], notes: "", dueDate: "", status: "OPEN" };

interface ConversationViewProps {
  conversation: Conversation;
  currentAgentId: string;
}


export function ConversationView({ conversation: initial, currentAgentId }: ConversationViewProps) {
  const { openTab } = useChatTabs();
  const [conv, setConv] = useState(initial);
  const [messages, setMessages] = useState<Message[]>(
    initial.messages.map((m) => ({ ...m, isPrivate: (m as Message & { isPrivate?: boolean }).isPrivate ?? false }))
  );
  const [streamingMsg, setStreamingMsg] = useState<{ id: string; content: string } | null>(null);
  const [typingAgent, setTypingAgent] = useState(false);
  const [userTypingText, setUserTypingText] = useState<string>("");
  const [lastReadByUserAt, setLastReadByUserAt] = useState<string | null>(initial.lastReadByUserAt ?? null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [controlLoading, setControlLoading] = useState<string | null>(null);
  const [userHistory, setUserHistory] = useState<UserHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);

  // Merge conversations
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<number>>(new Set());
  const [merging, setMerging] = useState(false);

  // Editing state
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [allTagDefs, setAllTagDefs] = useState<TagDefinition[]>([]);
  const [newTagName, setNewTagName] = useState<string | null>(null);
  const [newTagCategories, setNewTagCategories] = useState<string[]>([]);

  // Right panel tabs
  const [rightTab, setRightTab] = useState<"general" | "escalations">("general");

  // Escalations
  type TeamMember = { agent: { id: string; name: string; email: string; avatarUrl: string | null } };
  type TeamWithMembers = { id: string; name: string; members: TeamMember[] };
  type EscalationItem = {
    id: string; title: string; teamId: string | null; assigneeId: string | null; categories: string[]; tagIds: string[];
    notes: string | null; dueDate: string | null; status: string;
    team: { id: string; name: string } | null;
    assignee: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  };
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  type EscForm = { title: string; teamId: string; assigneeId: string; categories: string[]; tagIds: string[]; notes: string; dueDate: string; status: string };
  const [escForm, setEscForm] = useState<EscForm>(EMPTY_ESC_FORM);
  const [escFormOpen, setEscFormOpen] = useState(false);
  const [escEditId, setEscEditId] = useState<string | null>(null);
  const [escSaving, setEscSaving] = useState(false);

  // Workspace setting
  const [aiEnabled, setAiEnabled] = useState(true);

  // Canned responses
  const [cannedResponses, setCannedResponses] = useState<{ id: string; title: string; content: string }[]>([]);
  // Quick reply panel — track which item was last clicked for "click again to send"
  const [lastClickedCanned, setLastClickedCanned] = useState<string | null>(null);

  // AI suggested replies
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // Slash command autocomplete
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = closed, "" = show all
  const [slashIndex, setSlashIndex] = useState(0);

  // Follow
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Private message toggle
  const [privateMode, setPrivateMode] = useState(false);

  // Sidebar conversations
  const [sidebarConvs, setSidebarConvs] = useState<ConvSummary[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [switchingConv, setSwitchingConv] = useState(false);

  // Notes
  const [notes, setNotes] = useState<{ id: string; content: string; createdAt: string; agent: { id: string; name: string; avatarUrl: string | null } }[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const [sendDropdownOpen, setSendDropdownOpen] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
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

  // Fetch follow status
  useEffect(() => {
    fetch(`/api/conversations/${conv.id}/followers`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: { agentId: string }[]) => {
        setFollowing(data.some((f) => f.agentId === currentAgentId));
      })
      .catch(() => {});
  }, [conv.id, currentAgentId]);

  // Fetch agents list for assignment dropdown
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Register this conversation as an open tab in the bottom nav
  useEffect(() => {
    const label = conv.user.email ?? conv.user.externalId ?? "User";
    openTab(String(conv.id), label, conv.id);
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch canned responses
  useEffect(() => {
    fetch("/api/canned-responses")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCannedResponses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch AI suggested replies
  const fetchSuggestions = useCallback(() => {
    setSuggestionsLoading(true);
    fetch(`/api/conversations/${conv.id}/suggestions`)
      .then((r) => r.ok ? r.json() : { suggestions: [] })
      .then((data) => setAiSuggestions(data.suggestions ?? []))
      .catch(() => setAiSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [conv.id]);

  useEffect(() => {
    fetchSuggestions();
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch escalations + teams when escalations tab is opened
  useEffect(() => {
    if (rightTab !== "escalations") return;
    setEscalationsLoading(true);
    Promise.all([
      fetch(`/api/conversations/${conv.id}/escalations`).then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
    ]).then(([escs, tms]) => {
      setEscalations(Array.isArray(escs) ? escs : []);
      setTeams(Array.isArray(tms) ? tms : []);
    }).catch(() => {}).finally(() => setEscalationsLoading(false));
    // Also ensure tag defs are loaded for escalation tag picker
    if (allTagDefs.length === 0) {
      fetch("/api/tags").then((r) => r.json()).then((d) => setAllTagDefs(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [rightTab, conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch sidebar conversations
  useEffect(() => {
    fetch("/api/conversations?limit=50&status=OPEN")
      .then((r) => r.json())
      .then((d) => setSidebarConvs(d.conversations ?? []))
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


  // WebSocket setup — uses a persistent singleton so switching conversations
  // never tears down the connection (no "Connecting…" flash)
  useEffect(() => {
    agentWsManager.init(getAccessToken);
    agentWsManager.joinRoom(String(conv.id));

    function onMessage(event: MessageEvent) {
      const evt = JSON.parse(event.data);

      switch (evt.type) {
        case "message": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
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
                isPrivate: p.isPrivate ?? false,
                createdAt: p.createdAt,
                agent: p.senderName ? { id: p.senderId ?? "", name: p.senderName, avatarUrl: null } : null,
                media: p.media ?? null,
              },
            ];
          });
          if (!p.isPrivate) {
            setSidebarConvs((prev) => {
              const next = prev.map((c) =>
                String(c.id) === p.conversationId
                  ? { ...c, messages: [{ content: p.content, senderType: p.senderType }], lastMessageAt: p.createdAt }
                  : c
              );
              const idx = next.findIndex((c) => String(c.id) === p.conversationId);
              if (idx > 0) { const [item] = next.splice(idx, 1); next.unshift(item); }
              return next;
            });
          }
          break;
        }
        case "ai_chunk": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          setStreamingMsg((prev) =>
            prev
              ? { ...prev, content: prev.content + p.chunk }
              : { id: p.messageId, content: p.chunk }
          );
          break;
        }
        case "ai_done": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          setStreamingMsg((sm) => {
            if (sm) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === sm.id)) return prev;
                return [
                  ...prev,
                  {
                    id: sm.id,
                    senderType: "AI" as const,
                    senderId: null,
                    content: sm.content,
                    isStreaming: false,
                    isPrivate: false,
                    createdAt: new Date().toISOString(),
                    agent: null,
                  },
                ];
              });
              setSidebarConvs((prev) => {
                const now = new Date().toISOString();
                const next = prev.map((c) =>
                  String(c.id) === p.conversationId
                    ? { ...c, messages: [{ content: sm.content, senderType: "AI" }], lastMessageAt: now }
                    : c
                );
                const idx = next.findIndex((c) => String(c.id) === p.conversationId);
                if (idx > 0) { const [item] = next.splice(idx, 1); next.unshift(item); }
                return next;
              });
            }
            return null;
          });
          break;
        }
        case "ai_correction": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === p.messageId ? { ...m, content: p.content } : m
            )
          );
          break;
        }
        case "typing": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          if (p.senderType === "agent") {
            setTypingAgent(p.isTyping);
          }
          break;
        }
        case "control": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
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
          if (p.action === "reopen") setConv((c) => ({ ...c, status: "OPEN" }));
          if (p.action === "escalate") setConv((c) => ({ ...c, status: "ESCALATED", isAiPaused: true }));
          setControlLoading(null);
          break;
        }
        case "tag_update": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          setConv((c) => ({ ...c, tags: p.tags }));
          break;
        }
        case "typing_preview": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          setUserTypingText(p.text ?? "");
          break;
        }
        case "read_receipt": {
          const p = evt.payload;
          if (p.conversationId !== String(conv.id)) return;
          setLastReadByUserAt(p.readAt);
          break;
        }
        case "notification": {
          const p = evt.payload;
          if (p.type === "NEW_MESSAGE" && p.conversationId && p.conversationId !== String(conv.id)) {
            playNotificationSound();
            setUnreadCounts((prev) => ({
              ...prev,
              [p.conversationId]: (prev[p.conversationId] ?? 0) + 1,
            }));
            if (p.body) {
              setSidebarConvs((prev) => {
                const now = new Date().toISOString();
                const next = prev.map((c) =>
                  String(c.id) === p.conversationId
                    ? { ...c, messages: [{ content: p.body, senderType: "USER" }], lastMessageAt: now }
                    : c
                );
                const idx = next.findIndex((c) => String(c.id) === p.conversationId);
                if (idx > 0) { const [item] = next.splice(idx, 1); next.unshift(item); }
                return next;
              });
            }
          }
          break;
        }
      }
    };

    agentWsManager.addListener(onMessage);

    return () => {
      agentWsManager.leaveRoom(String(conv.id));
      agentWsManager.removeListener(onMessage);
    };
  }, [conv.id]);

  async function getAccessToken(): Promise<string> {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    return data.token ?? "";
  }

  async function toggleFollow() {
    setFollowLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      await fetch(`/api/conversations/${conv.id}/follow`, { method });
      setFollowing((f) => !f);
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  }

  async function sendControl(action: string) {
    setControlLoading(action);
    if (agentWsManager.ready) {
      // WS path — loading clears when the control event bounces back
      agentWsManager.send({ type: "control", conversationId: String(conv.id), action });
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

  async function openHistoryDetail(id: number) {
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

  function toggleMergeSelection(id: number) {
    setMergeSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMerge() {
    if (mergeSelected.size === 0) return;
    const count = mergeSelected.size;
    const confirmed = window.confirm(
      `Merge ${count} conversation${count > 1 ? "s" : ""} into this one? Messages, notes, and tags will be combined.`
    );
    if (!confirmed) return;

    setMerging(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceConversationIds: [...mergeSelected] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Merge failed" }));
        alert(err.error ?? "Merge failed");
        return;
      }
      const merged = await res.json();
      setMessages(
        (merged.messages ?? []).map((m: Message & { isPrivate?: boolean }) => ({
          ...m,
          isPrivate: m.isPrivate ?? false,
        }))
      );
      setConv((c) => ({ ...c, tags: merged.tags ?? c.tags, lastMessageAt: merged.lastMessageAt ?? c.lastMessageAt }));
      setMergeMode(false);
      setMergeSelected(new Set());
      // Refresh user history
      fetch(`/api/conversations?userId=${conv.user.id}&limit=20`)
        .then((r) => r.json())
        .then((d) => setUserHistory(d.conversations ?? []))
        .catch(() => {});
    } finally {
      setMerging(false);
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
    setConv((c) => ({ ...c, tags: c.tags.filter((t) => t.id !== tagId) }));
    const res = await fetch(`/api/conversations/${conv.id}/tags?tagId=${tagId}`, { method: "DELETE" });
    if (!res.ok) {
      const r = await fetch(`/api/conversations/${conv.id}/tags`);
      if (r.ok) { const tags = await r.json(); setConv((c) => ({ ...c, tags })); }
    }
  }

  async function addTag(defId: string) {
    if (tagSaving || conv.tags.some((t) => t.definition.id === defId)) {
      setTagPickerOpen(false);
      setTagSearch("");
      return;
    }
    setTagSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definitionId: defId }),
      });
      if (res.ok) {
        const tag = await res.json();
        setConv((c) => ({ ...c, tags: [...c.tags.filter((t) => t.id !== tag.id), tag] }));
      }
    } finally {
      setTagSaving(false);
      setTagPickerOpen(false);
      setTagSearch("");
    }
  }

  async function saveEscalation() {
    if (escSaving || !escForm.title.trim()) return;
    setEscSaving(true);
    try {
      const payload = {
        title: escForm.title.trim(),
        teamId: escForm.teamId || null,
        assigneeId: escForm.assigneeId || null,
        categories: escForm.categories,
        tagIds: escForm.tagIds,
        notes: escForm.notes || null,
        dueDate: escForm.dueDate || null,
        status: escForm.status,
      };
      let updated: EscalationItem;
      if (escEditId) {
        const r = await fetch(`/api/conversations/${conv.id}/escalations/${escEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        updated = await r.json();
        setEscalations((prev) => prev.map((e) => e.id === escEditId ? updated : e));
      } else {
        const r = await fetch(`/api/conversations/${conv.id}/escalations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        updated = await r.json();
        setEscalations((prev) => [updated, ...prev]);
      }
      setEscFormOpen(false);
      setEscEditId(null);
      setEscForm(EMPTY_ESC_FORM);
    } finally {
      setEscSaving(false);
    }
  }

  async function deleteEscalation(id: string) {
    await fetch(`/api/conversations/${conv.id}/escalations/${id}`, { method: "DELETE" });
    setEscalations((prev) => prev.filter((e) => e.id !== id));
  }

  async function quickChangeEscStatus(escId: string, newStatus: string) {
    const res = await fetch(`/api/conversations/${conv.id}/escalations/${escId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEscalations((prev) => prev.map((e) => e.id === escId ? updated : e));
    }
  }

  function startCreateTag(name: string) {
    setNewTagName(name.trim());
    setNewTagCategories(conv.categories.length > 0 ? [...conv.categories] : []);
  }

  async function createAndAddTag(name: string, categories: string[]) {
    if (tagSaving || !name.trim()) return;
    setTagSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), categories }),
      });
      if (res.ok) {
        const tag = await res.json();
        setConv((c) => ({ ...c, tags: [...c.tags.filter((t) => t.id !== tag.id), tag] }));
        setAllTagDefs((prev) => {
          if (prev.some((d) => d.id === tag.definition.id)) return prev;
          return [...prev, tag.definition].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    } finally {
      setTagSaving(false);
      setTagPickerOpen(false);
      setTagSearch("");
      setNewTagName(null);
      setNewTagCategories([]);
    }
  }

  function openTagPicker() {
    setTagPickerOpen(true);
    setTagSearch("");
    if (allTagDefs.length === 0) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data) => setAllTagDefs(Array.isArray(data) ? data : []))
        .catch(() => {});
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

  async function switchConversation(id: number) {
    if (id === conv.id || switchingConv) return;
    setSwitchingConv(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      // Reset per-conversation state
      setConv(data);
      setMessages((data.messages ?? []).map((m: Message) => ({ ...m, isPrivate: m.isPrivate ?? false })));
      setStreamingMsg(null);
      setTypingAgent(false);
      setUserTypingText("");
      setLastReadByUserAt(data.lastReadByUserAt ?? null);
      clearInput();
      setPrivateMode(false);
      clearMedia();
      setHistoryDetail(null);
      setEditOpen(null);
      setUnreadCounts((p) => { const n = { ...p }; delete n[id]; return n; });
      // Update URL without full navigation
      window.history.pushState(null, "", `/conversations/${id}`);
    } finally {
      setSwitchingConv(false);
    }
  }

  function playNotificationSound() {
    try {
      const audio = new Audio("/notification.mp3");
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch { /* ignore */ }
  }

  async function handleFilePick(file: File) {
    setUploadError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.type)) {
      setUploadError("Only images (jpg, png, gif, webp) and videos (mp4, mov, webm) are allowed.");
      return;
    }
    const isVideo = file.type.startsWith("video/");
    if (file.size > (isVideo ? MAX_VIDEO : MAX_IMAGE)) {
      setUploadError(`${isVideo ? "Video" : "Image"} too large. Max ${isVideo ? 50 : 10}MB.`);
      return;
    }
    let finalFile = file;
    if (!isVideo) {
      try {
        const compressed = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true });
        finalFile = new File([compressed], file.name, { type: compressed.type || file.type });
      } catch { /* use original */ }
    }
    setPendingMedia({ file: finalFile, previewUrl: URL.createObjectURL(finalFile), isVideo });
  }

  function clearMedia() {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
    setUploadError(null);
  }

  function syncActiveFormats() {
    setActiveFormats(new Set(
      (["bold", "italic", "underline"] as const).filter((cmd) => document.queryCommandState(cmd))
    ));
  }

  function applyFormat(cmd: "bold" | "italic" | "underline") {
    inputRef.current?.focus();
    document.execCommand(cmd, false);
    syncActiveFormats();
  }

  function clearInput() {
    if (inputRef.current) inputRef.current.innerHTML = "";
    setIsEmpty(true);
  }

  function setInputText(text: string) {
    if (inputRef.current) inputRef.current.innerText = text;
    setIsEmpty(!text.trim());
  }

  async function sendReply() {
    const html = inputRef.current?.innerHTML ?? "";
    const plain = inputRef.current?.innerText?.trim() ?? "";
    if ((!plain && !pendingMedia) || sending || !agentWsManager.ready) return;
    setSending(true);
    setUploadError(null);

    let mediaId: string | undefined;
    if (pendingMedia) {
      try {
        const uploaded = await uploadMedia(pendingMedia.file, String(conv.id));
        mediaId = uploaded.mediaId;
        clearMedia();
      } catch {
        setUploadError("Upload failed. Please try again.");
        setSending(false);
        return;
      }
    }

    clearInput();

    agentWsManager.send({ type: "send_message", conversationId: String(conv.id), content: html, ...(mediaId ? { mediaId } : {}), ...(privateMode ? { isPrivate: true } : {}) });
    if (privateMode) setPrivateMode(false);
    setSending(false);

    inputRef.current?.focus();
  }

  async function sendWithStatus(status: string) {
    setSendDropdownOpen(false);
    await sendReply();
    await patchConv({ status });
    setConv((c) => ({ ...c, status }));
  }

  function handleTyping() {
    if (agentWsManager.ready) {
      agentWsManager.send({ type: "typing", conversationId: String(conv.id), isTyping: true });

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        agentWsManager.send({ type: "typing", conversationId: String(conv.id), isTyping: false });
      }, 2000);
    }
  }

  const slashMatches = slashQuery !== null
    ? cannedResponses.filter((cr) => cr.title.toLowerCase().includes(slashQuery.toLowerCase()))
    : [];

  function applySlashMatch(cr: { id: string; title: string; content: string }) {
    setInputText(cr.content);
    setSlashQuery(null);
    setSlashIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
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


  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — all conversations */}
      <div className="w-64 shrink-0 border-r border-gray-100 bg-white flex flex-col overflow-hidden">
        <div className="h-14 px-4 flex items-center border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversations</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {(() => {
            // Deduplicate: one row per user, their most recent conversation
            const seenUsers = new Set<string>();
            const deduped: ConvSummary[] = [];
            for (const c of sidebarConvs) {
              if (!seenUsers.has(c.user.id)) {
                seenUsers.add(c.user.id);
                deduped.push(c);
              }
            }
            return deduped;
          })().map((c) => {
            const isActive = c.id === conv.id;
            const unread = unreadCounts[c.id] ?? 0;
            const lastMsg = c.messages[0];
            return (
              <button
                key={c.id}
                onClick={() => switchConversation(c.id)}
                className={cn(
                  "w-full text-left block px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors",
                  isActive && "bg-blue-50"
                )}
              >
                <div className="flex items-start gap-2">
                  <Avatar name={c.user.name ?? c.user.externalId} src={c.user.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium text-gray-900 truncate">
                          {c.user.name ?? c.user.email ?? c.user.externalId}
                        </span>
                        <span className="text-[9px] font-medium text-gray-400 bg-gray-100 px-1 py-0.5 rounded shrink-0">#{c.id}</span>
                      </div>
                      {unread > 0 && (
                        <span className="shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    {lastMsg ? (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{lastMsg.content}</p>
                    ) : null}
                    {c.lastMessageAt && (
                      <p className="text-[10px] text-gray-300 mt-0.5">{formatRelativeTime(c.lastMessageAt)}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">#{conv.id}</span>
              {conv.categories.map((c) => (
                <Badge key={c} variant="muted" size="sm">{categoryLabel(c)}</Badge>
              ))}
              {conv.isAiPaused && aiEnabled && (
                <Badge variant="warning" size="sm">
                  AI paused
                </Badge>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Follow button */}
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              title={following ? "Unfollow — stop receiving notifications for this chat" : "Follow — get notified on new messages"}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
                following
                  ? "bg-violet-50 text-violet-600 hover:bg-violet-100"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              )}
            >
              {following ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              {following ? "Following" : "Follow"}
            </button>

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
                isPrivate: false,
                createdAt: new Date().toISOString(),
                agent: null,
              }}
            />
          )}

          {/* Read receipt — show under last non-user message the user has seen */}
          {lastReadByUserAt && (() => {
            const readAt = new Date(lastReadByUserAt);
            // Find the last agent/AI message sent before the read timestamp
            const lastReadMsg = [...messages].reverse().find(
              (m) => m.senderType !== "USER" && new Date(m.createdAt) <= readAt
            );
            return lastReadMsg ? (
              <div key="read-receipt" className="flex justify-end pr-1">
                <span className="text-[10px] text-gray-400 italic">Read</span>
              </div>
            ) : null;
          })()}

          {/* Live typing preview from user */}
          {userTypingText && (
            <div className="flex items-end gap-2 justify-start">
              <div className="max-w-[70%] bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5">
                <p className="text-sm text-gray-500 italic leading-relaxed break-words">
                  {userTypingText}
                  <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                </p>
              </div>
            </div>
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

            {/* Media preview */}
            {pendingMedia && (
              <div className="relative inline-block mb-1">
                {pendingMedia.isVideo ? (
                  <div className="w-20 h-20 rounded-xl bg-gray-900 flex items-center justify-center overflow-hidden relative">
                    <video src={pendingMedia.previewUrl} className="w-full h-full object-cover" muted playsInline />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </div>
                ) : (
                  <img src={pendingMedia.previewUrl} alt="attachment" className="w-20 h-20 rounded-xl object-cover" />
                )}
                <button
                  onClick={clearMedia}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            {uploadError && (
              <p className="text-xs text-red-500">{uploadError}</p>
            )}

            {/* Formatting toolbar */}
            <div className="flex items-center gap-0.5 mb-1">
              {([
                { icon: Bold, cmd: "bold", title: "Bold" },
                { icon: Italic, cmd: "italic", title: "Italic" },
                { icon: Underline, cmd: "underline", title: "Underline" },
              ] as { icon: React.ComponentType<{ className?: string }>; cmd: "bold" | "italic" | "underline"; title: string }[]).map(({ icon: Icon, cmd, title }) => (
                <button
                  key={cmd}
                  type="button"
                  title={title}
                  onMouseDown={(e) => { e.preventDefault(); applyFormat(cmd); }}
                  className={cn(
                    "w-6 h-6 rounded flex items-center justify-center transition-colors",
                    activeFormats.has(cmd)
                      ? "bg-gray-900 text-white"
                      : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); e.target.value = ""; }}
            />

            <div className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              privateMode
                ? "bg-orange-50 border-orange-200"
                : "bg-gray-50 border-gray-200"
            )}>
              {/* Attach button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Attach image or video"
                className="shrink-0 text-gray-300 hover:text-gray-500 disabled:opacity-40 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Private toggle */}
              <button
                type="button"
                onClick={() => setPrivateMode((v) => !v)}
                title={privateMode ? "Private message (only agents see this)" : "Send as private message"}
                className={cn(
                  "shrink-0 transition-colors",
                  privateMode ? "text-orange-500 hover:text-orange-700" : "text-gray-300 hover:text-gray-500"
                )}
              >
                <EyeOff className="w-4 h-4" />
              </button>

              <div className="relative flex-1 min-w-0">
                {isEmpty && (
                  <span className="absolute top-0 left-0 text-sm pointer-events-none select-none leading-relaxed"
                    style={{ color: privateMode ? "#fca572" : "#9ca3af" }}>
                    {privateMode ? "Private message (only agents see this)…" : "Reply to user… (/ for quick replies, Enter to send)"}
                  </span>
                )}
                <div
                  ref={inputRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    const plain = e.currentTarget.innerText;
                    setIsEmpty(!plain.trim());
                    handleTyping();
                    syncActiveFormats();
                    if (plain.startsWith("/") && !plain.includes(" ") && !plain.includes("\n")) {
                      setSlashQuery(plain.slice(1));
                      setSlashIndex(0);
                    } else {
                      setSlashQuery(null);
                    }
                  }}
                  onKeyUp={syncActiveFormats}
                  onMouseUp={syncActiveFormats}
                  onSelect={syncActiveFormats}
                  onKeyDown={handleKeyDown}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData("text/plain");
                    document.execCommand("insertText", false, text);
                  }}
                  className={cn(
                    "text-sm outline-none min-h-[1.5rem] max-h-32 overflow-y-auto leading-relaxed break-words",
                    privateMode ? "text-orange-900" : "text-gray-900"
                  )}
                />
              </div>

              {/* Split send button */}
              <div className="relative flex items-center shrink-0">
                <button
                  onClick={sendReply}
                  disabled={sending || (isEmpty && !pendingMedia)}
                  className={cn(
                    "h-8 px-3 flex items-center gap-1.5 rounded-l-lg text-white text-xs font-medium transition-colors disabled:opacity-40",
                    privateMode ? "bg-orange-500 hover:bg-orange-600" : "bg-gray-900 hover:bg-gray-700"
                  )}
                >
                  <Send className="w-3 h-3" />
                  Send
                </button>
                <button
                  onClick={() => setSendDropdownOpen((o) => !o)}
                  disabled={sending || (isEmpty && !pendingMedia)}
                  className={cn(
                    "h-8 w-6 flex items-center justify-center rounded-r-lg border-l text-white transition-colors disabled:opacity-40",
                    privateMode
                      ? "bg-orange-500 hover:bg-orange-600 border-orange-400"
                      : "bg-gray-900 hover:bg-gray-700 border-gray-700"
                  )}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>

                {sendDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSendDropdownOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-1.5 w-44 bg-white border border-gray-100 rounded-xl shadow-xl z-20 overflow-hidden">
                      {[
                        { label: "Send & Resolve", status: "RESOLVED" },
                        { label: "Send & Close",   status: "CLOSED" },
                        { label: "Send & Pending",  status: "PENDING" },
                        { label: "Send & Escalate", status: "ESCALATED" },
                      ].map(({ label, status }) => (
                        <button
                          key={status}
                          onClick={() => sendWithStatus(status)}
                          className="w-full text-left px-3.5 py-2.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — context */}
      <div
        className="w-72 shrink-0 flex flex-col relative"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderLeft: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        {/* Tab switcher */}
        <div className="flex shrink-0 border-b border-gray-100">
          {(["general", "escalations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                rightTab === tab
                  ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab === "general" ? "General" : "Escalations"}
              {tab === "escalations" && escalations.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[9px]">
                  {escalations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── General tab ── */}
        {rightTab === "general" && (
          <div className="flex-1 overflow-y-auto">
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

        {/* App Info — mock data */}
        <div className="p-5 border-b border-gray-100 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">App Info</h3>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">App version</span>
            <span className="text-[11px] font-medium text-gray-700">2.4.1</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">90-day volume</span>
            <span className="text-[11px] font-medium text-gray-700">24 conversations</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Login method</span>
            <span className="text-[11px] font-medium text-gray-700">Google OAuth</span>
          </div>
        </div>

        {/* AI Suggested Replies */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Suggestions</h3>
            </div>
            <button
              onClick={fetchSuggestions}
              disabled={suggestionsLoading}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3 h-3", suggestionsLoading && "animate-spin")} />
            </button>
          </div>
          {suggestionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : aiSuggestions.length === 0 ? (
            <p className="text-[11px] text-gray-400">No suggestions yet</p>
          ) : (
            <div className="space-y-1.5">
              {aiSuggestions.map((suggestion, i) => {
                const isSelected = lastClickedCanned === `ai-${i}`;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isSelected) {
                        if (inputRef.current) inputRef.current.innerText = suggestion;
                        sendReply();
                        setLastClickedCanned(null);
                      } else {
                        setInputText(suggestion);
                        setLastClickedCanned(`ai-${i}`);
                        inputRef.current?.focus();
                      }
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-xl transition-all",
                      isSelected ? "bg-violet-600 text-white" : "hover:bg-violet-50 border border-transparent hover:border-violet-100 text-gray-700"
                    )}
                  >
                    <p className={cn("text-[11px] leading-relaxed", isSelected ? "text-white" : "text-gray-700")}>
                      {isSelected ? <span className="font-medium">Click again to send · </span> : null}{suggestion}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
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

          {/* Category — multi-select */}
          <EditableField
            label="Category"
            open={editOpen === "category"}
            onToggle={() => setEditOpen(editOpen === "category" ? null : "category")}
            display={
              <div className="flex flex-wrap gap-1">
                {conv.categories.length > 0
                  ? conv.categories.map((c) => <Badge key={c} variant="muted">{categoryLabel(c)}</Badge>)
                  : <Badge variant="muted">None</Badge>}
              </div>
            }
          >
            {CATEGORY_OPTIONS.map((c) => {
              const selected = conv.categories.includes(c);
              return (
                <DropdownOption
                  key={c}
                  active={selected}
                  onClick={() => {
                    const next = selected
                      ? conv.categories.filter((x) => x !== c)
                      : [...conv.categories, c];
                    if (next.length === 0) return; // require at least one
                    patchConv({ categories: next });
                    setConv((prev) => ({ ...prev, categories: next }));
                  }}
                >
                  <span className="flex items-center gap-2 text-xs text-gray-700">
                    <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-gray-700 border-gray-700" : "border-gray-300"}`}>
                      {selected && <Check className="w-2 h-2 text-white" />}
                    </span>
                    {categoryLabel(c)}
                  </span>
                </DropdownOption>
              );
            })}
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

        {/* Tags */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <TagIcon className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</h3>
            </div>
            <button
              onClick={openTagPicker}
              className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
              title="Add tag"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Current tags */}
          <div className="flex flex-wrap gap-1.5">
            {conv.tags.map((tag) => (
              <span
                key={tag.id}
                className="group inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-150 transition-colors"
                style={tag.definition.color ? { backgroundColor: tag.definition.color + "22", color: tag.definition.color } : {}}
              >
                {tag.definition.name}
                <button
                  onClick={() => removeTag(tag.id)}
                  className="opacity-0 group-hover:opacity-100 -mr-0.5 rounded-full hover:bg-black/10 transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {conv.tags.length === 0 && (
              <p className="text-[11px] text-gray-300">No tags</p>
            )}
          </div>

          {/* Tag picker dropdown */}
          {tagPickerOpen && (
            <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {newTagName !== null ? (
                /* ── Create-tag step: pick categories ── */
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <button onClick={() => setNewTagName(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-medium text-gray-700 truncate">New tag: &ldquo;{newTagName}&rdquo;</span>
                  </div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Link to categories</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {CATEGORY_OPTIONS.map((c) => {
                      const on = newTagCategories.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => setNewTagCategories((prev) => on ? prev.filter((x) => x !== c) : [...prev, c])}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${on ? "bg-gray-800 border-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                        >
                          {on && <Check className="w-2.5 h-2.5" />}
                          {categoryLabel(c)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-2.5">Leave unselected to show for all categories.</p>
                  <button
                    onClick={() => createAndAddTag(newTagName, newTagCategories)}
                    disabled={tagSaving}
                    className="w-full py-1.5 rounded-lg bg-gray-800 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {tagSaving ? "Creating…" : "Create tag"}
                  </button>
                </div>
              ) : (
                /* ── Search / list step ── */
                <>
                  <div className="px-3 py-2 border-b border-gray-100">
                    <input
                      autoFocus
                      placeholder="Search or create tag…"
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setTagPickerOpen(false); setTagSearch(""); }
                        if (e.key === "Enter") {
                          const q = tagSearch.trim();
                          if (!q) return;
                          const exact = allTagDefs.find((d) => d.name.toLowerCase() === q.toLowerCase());
                          if (exact) addTag(exact.id);
                          else startCreateTag(q);
                        }
                      }}
                      className="w-full text-xs outline-none placeholder:text-gray-300 bg-transparent"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {(() => {
                      const q = tagSearch.toLowerCase();
                      const filtered = allTagDefs.filter((d) => !q || d.name.toLowerCase().includes(q));
                      const suggested = filtered.filter((d) => d.categories.length > 0 && d.categories.some((c) => conv.categories.includes(c)));
                      const other = filtered.filter((d) => !suggested.includes(d));
                      const renderTag = (def: TagDefinition) => {
                        const already = conv.tags.some((t) => t.definition.id === def.id);
                        return (
                          <button
                            key={def.id}
                            onClick={() => addTag(def.id)}
                            disabled={already}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: def.color ?? "#d1d5db" }} />
                            {def.name}
                            {already && <span className="ml-auto text-gray-300">added</span>}
                          </button>
                        );
                      };
                      return (
                        <>
                          {suggested.length > 0 && (
                            <>
                              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Suggested</p>
                              {suggested.map(renderTag)}
                              {other.length > 0 && <div className="mx-3 my-1 border-t border-gray-100" />}
                            </>
                          )}
                          {other.map(renderTag)}
                        </>
                      );
                    })()}
                    {tagSearch.trim() && !allTagDefs.some((d) => d.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                      <button
                        onClick={() => startCreateTag(tagSearch)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 text-gray-500 transition-colors"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        Create &ldquo;{tagSearch.trim()}&rdquo;
                      </button>
                    )}
                    {allTagDefs.length === 0 && !tagSearch && (
                      <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>
                    )}
                  </div>
                  <div className="px-3 py-1.5 border-t border-gray-100">
                    <button
                      onClick={() => { setTagPickerOpen(false); setTagSearch(""); setNewTagName(null); setNewTagCategories([]); }}
                      className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Private notes */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <Lock className="w-3 h-3 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</h3>
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <History className="w-3 h-3 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past conversations</h3>
            </div>
            {userHistory && userHistory.filter((c) => c.id !== conv.id && (c.status === "OPEN" || c.status === "PENDING")).length > 0 && (
              <button
                onClick={() => { setMergeMode((v) => !v); setMergeSelected(new Set()); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  mergeMode
                    ? "bg-gray-900 text-white"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
                title={mergeMode ? "Cancel merge" : "Merge conversations"}
              >
                <GitMerge className="w-3 h-3" />
                {mergeMode ? "Cancel" : "Merge"}
              </button>
            )}
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
                  const isMergeable = mergeMode && (c.status === "OPEN" || c.status === "PENDING");
                  const isSelected = mergeSelected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => isMergeable ? toggleMergeSelection(c.id) : openHistoryDetail(c.id)}
                      className={`w-full text-left rounded-xl transition-colors px-3 py-2.5 ${
                        isSelected
                          ? "bg-blue-50 ring-1 ring-blue-300"
                          : "bg-gray-50 hover:bg-gray-100"
                      } ${mergeMode && !isMergeable ? "opacity-40 cursor-not-allowed" : ""}`}
                      disabled={mergeMode && !isMergeable}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {mergeMode && isMergeable && (
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300"
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                            {c.categories.map((cat) => categoryLabel(cat)).join(", ")}
                          </span>
                          <span className="text-[9px] font-medium text-gray-400 bg-gray-100 px-1 py-0.5 rounded">#{c.id}</span>
                        </div>
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

              {mergeMode && mergeSelected.size > 0 && (
                <button
                  onClick={handleMerge}
                  disabled={merging}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  <GitMerge className="w-3 h-3" />
                  {merging ? "Merging…" : `Merge ${mergeSelected.size} into #${conv.id}`}
                </button>
              )}
            </div>
          )}
        </div>
          </div>
        )}

        {/* ── Escalations tab ── */}
        {rightTab === "escalations" && (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Escalations</h3>
              <button
                onClick={() => { setEscEditId(null); setEscForm(EMPTY_ESC_FORM); setEscFormOpen(true); }}
                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                title="Add escalation"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Inline create / edit form */}
            {escFormOpen && (
              <div className="p-5 border-b border-gray-100 bg-gray-50 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {escEditId ? "Edit escalation" : "New escalation"}
                </p>

                {/* Title */}
                <input
                  placeholder="Title *"
                  value={escForm.title}
                  onChange={(e) => setEscForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 placeholder:text-gray-300 text-gray-800"
                />

                {/* Team */}
                <select
                  value={escForm.teamId}
                  onChange={(e) => setEscForm((f) => ({ ...f, teamId: e.target.value, assigneeId: "" }))}
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 text-gray-700 appearance-none"
                >
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>

                {/* Assignee (team members) */}
                {escForm.teamId && (() => {
                  const selectedTeam = teams.find((t) => t.id === escForm.teamId);
                  const members = selectedTeam?.members ?? [];
                  return members.length > 0 ? (
                    <select
                      value={escForm.assigneeId}
                      onChange={(e) => setEscForm((f) => ({ ...f, assigneeId: e.target.value }))}
                      className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 text-gray-700 appearance-none"
                    >
                      <option value="">No assignee</option>
                      {members.map((m) => (
                        <option key={m.agent.id} value={m.agent.id}>
                          {m.agent.name || m.agent.email}
                        </option>
                      ))}
                    </select>
                  ) : null;
                })()}

                {/* Categories */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_OPTIONS.map((c) => {
                      const on = escForm.categories.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEscForm((f) => ({ ...f, categories: on ? f.categories.filter((x) => x !== c) : [...f.categories, c] }))}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${on ? "bg-gray-800 border-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                        >
                          {on && <Check className="w-2.5 h-2.5" />}
                          {categoryLabel(c)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tags */}
                {allTagDefs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allTagDefs.map((d) => {
                        const on = escForm.tagIds.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setEscForm((f) => ({ ...f, tagIds: on ? f.tagIds.filter((x) => x !== d.id) : [...f.tagIds, d.id] }))}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${on ? "text-white border-transparent" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                            style={on ? { backgroundColor: d.color ?? "#374151", borderColor: d.color ?? "#374151" } : {}}
                          >
                            {on && <Check className="w-2.5 h-2.5" />}
                            {d.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Status */}
                <select
                  value={escForm.status}
                  onChange={(e) => setEscForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 text-gray-700 appearance-none"
                >
                  {ESC_STATUS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>

                {/* Due date */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Due date</p>
                  <input
                    type="date"
                    value={escForm.dueDate}
                    onChange={(e) => setEscForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 text-gray-700"
                  />
                </div>

                {/* Notes */}
                <textarea
                  placeholder="Notes (optional)"
                  value={escForm.notes}
                  onChange={(e) => setEscForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-gray-400 placeholder:text-gray-300 resize-none text-gray-800"
                />

                <div className="flex gap-2">
                  <button
                    onClick={saveEscalation}
                    disabled={escSaving || !escForm.title.trim()}
                    className="flex-1 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    {escSaving ? "Saving…" : escEditId ? "Update" : "Create"}
                  </button>
                  <button
                    onClick={() => { setEscFormOpen(false); setEscEditId(null); setEscForm(EMPTY_ESC_FORM); }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Escalation list */}
            <div className="p-5 space-y-3">
              {escalationsLoading && (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-50 animate-pulse" />)}
                </div>
              )}

              {!escalationsLoading && escalations.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <AlertTriangle className="w-6 h-6 text-gray-200" />
                  <p className="text-xs text-gray-400">No escalations yet</p>
                  <button
                    onClick={() => { setEscEditId(null); setEscForm(EMPTY_ESC_FORM); setEscFormOpen(true); }}
                    className="text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
                  >
                    Create one
                  </button>
                </div>
              )}

              {escalations.map((esc) => {
                const statusOpt = ESC_STATUS_OPTIONS.find((o) => o.value === esc.status);
                return (
                  <div key={esc.id} className="bg-white border border-gray-100 rounded-xl p-3 space-y-1.5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-800 leading-snug flex-1">{esc.title}</p>
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESC_STATUS_COLORS[esc.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {statusOpt?.label ?? esc.status}
                      </span>
                    </div>

                    {(esc.team || esc.assignee || esc.dueDate) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {esc.team && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            {esc.team.name}
                          </span>
                        )}
                        {esc.assignee && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            &rarr; {esc.assignee.name || esc.assignee.email}
                          </span>
                        )}
                        {esc.dueDate && (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {new Date(esc.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    )}

                    {esc.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {esc.categories.map((c) => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{categoryLabel(c)}</span>
                        ))}
                      </div>
                    )}

                    {esc.tagIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {esc.tagIds.map((tid) => {
                          const def = allTagDefs.find((d) => d.id === tid);
                          return def ? (
                            <span
                              key={tid}
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={def.color ? { backgroundColor: def.color + "22", color: def.color } : { backgroundColor: "#f3f4f6", color: "#6b7280" }}
                            >
                              {def.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}

                    {esc.notes && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">{esc.notes}</p>
                    )}

                    <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                      {(esc.status === "OPEN" || esc.status === "IN_PROGRESS") && (
                        <button
                          onClick={() => quickChangeEscStatus(esc.id, "RESOLVED")}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-green-600 transition-colors"
                        >
                          <CheckCircle className="w-2.5 h-2.5" />
                          Resolve
                        </button>
                      )}
                      {(esc.status === "RESOLVED" || esc.status === "CLOSED") && (
                        <button
                          onClick={() => quickChangeEscStatus(esc.id, "OPEN")}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-amber-600 transition-colors"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reopen
                        </button>
                      )}
                      {esc.status !== "CLOSED" && (
                        <button
                          onClick={() => quickChangeEscStatus(esc.id, "CLOSED")}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <XCircle className="w-2.5 h-2.5" />
                          Close
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEscEditId(esc.id);
                          setEscForm({
                            title: esc.title,
                            teamId: esc.teamId ?? "",
                            assigneeId: esc.assigneeId ?? "",
                            categories: esc.categories,
                            tagIds: esc.tagIds,
                            notes: esc.notes ?? "",
                            dueDate: esc.dueDate ? esc.dueDate.slice(0, 10) : "",
                            status: esc.status,
                          });
                          setEscFormOpen(true);
                        }}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => deleteEscalation(esc.id)}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Past conversation overlay */}
        {(historyDetail || historyDetailLoading) && (
          <div className="absolute inset-0 bg-white flex flex-col z-20">
            {/* Overlay header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {historyDetail ? historyDetail.categories.map((c) => categoryLabel(c)).join(", ") : "Loading…"}
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
                      const isAgent = msg.senderType === "AGENT";
                      const isUser = msg.senderType === "USER";
                      return (
                        <div key={msg.id} className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed break-words",
                              isUser
                                ? "bg-gray-100 text-gray-900 rounded-bl-sm"
                                : isAgent
                                ? "bg-gray-900 text-white rounded-br-sm"
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
  const isPrivate = msg.isPrivate;

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isUser ? "justify-start" : "justify-end"
      )}
    >
      {/* Left avatar for user messages only */}
      {isUser && (
        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[70%] rounded-2xl overflow-hidden",
          msg.media && !msg.content ? "p-0" : "px-4 py-2.5",
          isUser
            ? "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"
            : isAI
            ? "bg-gray-100 text-gray-600 rounded-br-sm"
            : isPrivate
            ? "bg-orange-50 border border-orange-200 text-gray-900 rounded-br-sm"
            : "bg-gray-900 text-white rounded-br-sm"
        )}
      >
        {isAgent && (
          <div className="flex items-center gap-1 mb-1">
            {msg.agent && (
              <p className={cn("text-[10px] font-semibold", isPrivate ? "text-orange-600" : "text-gray-300")}>
                {msg.agent.name}
              </p>
            )}
            {isPrivate && (
              <span className="flex items-center gap-0.5 text-[10px] text-orange-500 font-medium">
                <EyeOff className="w-2.5 h-2.5" />
                Private
              </span>
            )}
          </div>
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
          <MessageContent content={msg.content} isStreaming={msg.isStreaming} />
        ) : !msg.media ? (
          <p className="text-sm italic opacity-50">📎 Attachment</p>
        ) : null}

        <p className={cn("text-[10px] mt-1", isAgent && !isPrivate ? "text-gray-400 opacity-50" : "text-gray-400")}>
          {formatMessageTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}
