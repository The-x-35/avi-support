"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import { Search, RefreshCw, Bot, User, Pause, ChevronDown } from "lucide-react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

interface ConversationItem {
  id: number;
  status: string;
  category: string;
  priority: string;
  isAiPaused: boolean;
  lastMessageAt: string | null;
  user: { id: string; name: string | null; email: string | null; avatarUrl: string | null; externalId: string };
  assignedAgent: { id: string; name: string } | null;
  tags: Array<{ definition: { name: string; color: string | null } }>;
  messages: Array<{ content: string; senderType: string; createdAt: string }>;
  _count: { messages: number };
}

type StatusFilter = "ALL" | "OPEN" | "PENDING" | "ESCALATED" | "RESOLVED" | "CLOSED";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL",       label: "All" },
  { value: "OPEN",      label: "Open" },
  { value: "PENDING",   label: "Pending" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED",  label: "Resolved" },
  { value: "CLOSED",    label: "Closed" },
];

const CATEGORIES = ["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function LiveFeed({ assignedAgentId }: { assignedAgentId?: string } = {}) {
  const [users, setUsers] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [tagDefs, setTagDefs] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const params = new URLSearchParams({ limit: "100" });
    if (status !== "ALL") params.set("status", status);
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (priority) params.set("priority", priority);
    if (aiPaused) params.set("isAiPaused", "true");
    if (tag) params.set("tagName", tag);
    if (assignedAgentId) params.set("assignedAgentId", assignedAgentId);
    else if (unassigned) params.set("assignedAgentId", "null");

    const res = await fetch(`/api/conversations?${params}`);
    const data = await res.json();

    // Deduplicate: one row per user (latest conversation)
    const seen = new Set<string>();
    const deduped: ConversationItem[] = [];
    for (const conv of data.conversations) {
      if (!seen.has(conv.user.id)) {
        seen.add(conv.user.id);
        deduped.push(conv);
      }
    }

    setUsers(deduped);
    setTotal(data.total);
    if (!silent) setLoading(false);
    else setRefreshing(false);
  }, [status, search, category, priority, aiPaused, tag, assignedAgentId, unassigned]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/settings/workspace")
      .then((r) => r.ok ? r.json() : { aiEnabled: true })
      .then((d) => setAiEnabled(d.aiEnabled ?? true))
      .catch(() => {});
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setTagDefs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // WS connection for real-time unread badges
  useEffect(() => {
    let cancelled = false;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = async () => {
      if (cancelled) { ws.close(); return; }
      const res = await fetch("/api/auth/token");
      const { token } = await res.json();
      if (cancelled) { ws.close(); return; }
      ws.send(JSON.stringify({ type: "auth", token, role: "agent" }));
    };

    ws.onmessage = (event) => {
      const evt = JSON.parse(event.data);
      if (evt.type === "notification" && evt.payload?.type === "NEW_MESSAGE" && evt.payload?.conversationId) {
        const convId = evt.payload.conversationId as string;
        setUnreadCounts((prev) => ({ ...prev, [convId]: (prev[convId] ?? 0) + 1 }));
      }
    };

    ws.onclose = () => {};
    ws.onerror = () => {};

    return () => {
      cancelled = true;
      if (ws.readyState === WebSocket.OPEN) ws.close();
      else ws.addEventListener("open", () => ws.close(), { once: true });
    };
  }, []);

  async function handleTakeover(convId: number) {
    setActionLoading(convId + "_takeover");
    await fetch(`/api/conversations/${convId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "takeover" }),
    });
    setActionLoading(null);
    fetchData(true);
  }

  async function handleResumeAI(convId: number) {
    setActionLoading(convId + "_resume");
    await fetch(`/api/conversations/${convId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume_ai" }),
    });
    setActionLoading(null);
    fetchData(true);
  }

  const activeFilterCount = [
    category, priority, tag,
    aiPaused ? "paused" : null,
    unassigned ? "unassigned" : null,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 space-y-2.5">
        {/* Row 1: search + refresh + count */}
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-sm">
            <Input
              icon={<Search className="w-3.5 h-3.5" />}
              placeholder="Search by user, keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category dropdown */}
          <Dropdown
            label="Category"
            value={category}
            options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
            onChange={setCategory}
          />

          {/* Priority dropdown */}
          <Dropdown
            label="Priority"
            value={priority}
            options={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))}
            onChange={setPriority}
          />

          {/* Tag dropdown */}
          <TagDropdown
            value={tag}
            tags={tagDefs}
            onChange={setTag}
          />

          {/* Quick toggles */}
          <button
            onClick={() => setAiPaused((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              aiPaused
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Pause className="w-3 h-3" />
            AI Paused
          </button>

          <button
            onClick={() => setUnassigned((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              unassigned
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            Unassigned
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={() => { setCategory(null); setPriority(null); setTag(null); setAiPaused(false); setUnassigned(false); }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Clear ({activeFilterCount})
            </button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchData(true)}
            loading={refreshing}
            className="ml-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-gray-400">{total} total</span>
        </div>

        {/* Row 2: status tabs */}
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-32 bg-gray-100 rounded" />
                  <div className="h-2.5 w-52 bg-gray-50 rounded" />
                </div>
                <div className="h-5 w-14 bg-gray-100 rounded-md" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
            <Search className="w-8 h-8 mb-2 text-gray-200" />
            Nothing here
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {users.map((conv) => {
              const lastMsg = conv.messages[0];
              const displayName = conv.user.name ?? conv.user.email ?? conv.user.externalId;

              const unread = unreadCounts[conv.id] ?? 0;
              return (
                <div key={conv.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                  {/* Avatar */}
                  <Link
                    href={`/conversations/${conv.id}`}
                    tabIndex={-1}
                    onClick={() => setUnreadCounts((p) => { const n = { ...p }; delete n[conv.id]; return n; })}
                    className="relative"
                  >
                    <Avatar name={conv.user.name ?? conv.user.externalId} src={conv.user.avatarUrl} size="md" />
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>

                  {/* Main content */}
                  <Link
                    href={`/conversations/${conv.id}`}
                    className="flex-1 min-w-0"
                    onClick={() => setUnreadCounts((p) => { const n = { ...p }; delete n[conv.id]; return n; })}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{displayName}</span>
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">#{conv.id}</span>
                      {conv.isAiPaused && aiEnabled && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                          <Pause className="w-2.5 h-2.5" />
                          AI paused
                        </span>
                      )}
                    </div>
                    {lastMsg ? (
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        {lastMsg.senderType === "AI"    && <Bot  className="w-2.5 h-2.5 shrink-0 text-gray-300" />}
                        {lastMsg.senderType === "AGENT" && <User className="w-2.5 h-2.5 shrink-0 text-gray-300" />}
                        <span className="truncate">{lastMsg.content}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-300 italic">No messages</p>
                    )}
                  </Link>

                  {/* Right: badges + time + actions */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="muted" size="sm">{categoryLabel(conv.category)}</Badge>
                      <PriorityBadge priority={conv.priority} />
                      <StatusBadge status={conv.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      {conv.lastMessageAt && (
                        <span className="text-[11px] text-gray-400">{formatRelativeTime(conv.lastMessageAt)}</span>
                      )}
                      {conv.isAiPaused && aiEnabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={actionLoading === conv.id + "_resume"}
                          onClick={(e) => { e.preventDefault(); handleResumeAI(conv.id); }}
                        >
                          Resume AI
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={actionLoading === conv.id + "_takeover"}
                          onClick={(e) => { e.preventDefault(); handleTakeover(conv.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Take over
                        </Button>
                      )}
                    </div>
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

function TagDropdown({
  value,
  tags,
  onChange,
}: {
  value: string | null;
  tags: { id: string; name: string; color: string | null }[];
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = tags.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );
  const active = value !== null;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          active
            ? "bg-gray-900 text-white border-gray-900"
            : "text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
        }`}
      >
        {active ? (
          <>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: tags.find((t) => t.name === value)?.color ?? "#d1d5db" }}
            />
            {value}
          </>
        ) : "Tag"}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""} ${active ? "text-white/70" : "text-gray-400"}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden w-48">
            <div className="px-3 py-2 border-b border-gray-100">
              <input
                autoFocus
                placeholder="Search tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs outline-none placeholder:text-gray-300"
              />
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${!active ? "font-medium text-gray-900" : "text-gray-500"}`}
              >
                All Tags
              </button>
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onChange(t.name); setOpen(false); }}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${value === t.name ? "font-medium text-gray-900 bg-gray-50" : "text-gray-600"}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color ?? "#d1d5db" }} />
                  {t.name}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No tags found</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          active
            ? "bg-gray-900 text-white border-gray-900"
            : "text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
        }`}
      >
        {active ? options.find((o) => o.value === value)?.label : label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""} ${active ? "text-white/70" : "text-gray-400"}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden min-w-[140px]">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${!active ? "font-medium text-gray-900" : "text-gray-500"}`}
            >
              All {label}s
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${value === opt.value ? "font-medium text-gray-900 bg-gray-50" : "text-gray-600"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
