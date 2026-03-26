"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, MessageSquare, UserPlus, AlertTriangle, ArrowUpRight } from "lucide-react";
import { useNotifications } from "@/components/notifications/notification-context";
import type { NotificationItem } from "@/components/notifications/notification-context";

const TYPE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  NEW_MESSAGE:      { icon: MessageSquare, color: "text-blue-600",    bg: "bg-blue-50" },
  NEW_CONVERSATION: { icon: UserPlus,      color: "text-emerald-600", bg: "bg-emerald-50" },
  ASSIGNED:         { icon: UserPlus,      color: "text-violet-600",  bg: "bg-violet-50" },
  ESCALATED:        { icon: AlertTriangle, color: "text-rose-600",    bg: "bg-rose-50" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Group NEW_MESSAGE notifications by conversation; keep everything else standalone
interface MsgGroup {
  kind: "group";
  conversationId: string;
  ids: string[];
  count: number;
  from: string;
  lastBody: string;
  lastTime: string;
  hasUnread: boolean;
}
interface Standalone {
  kind: "standalone";
  n: NotificationItem;
}
type DisplayItem = MsgGroup | Standalone;

function buildDisplayItems(notifications: NotificationItem[]): DisplayItem[] {
  // Process in chronological order so groups capture all msgs; display in reverse
  const grouped = new Map<string, MsgGroup>();
  const items: DisplayItem[] = [];

  // Iterate newest-first (already sorted that way)
  for (const n of notifications) {
    const convId = n.conversationId != null ? String(n.conversationId) : null;
    if (n.type === "NEW_MESSAGE" && convId) {
      if (grouped.has(convId)) {
        const g = grouped.get(convId)!;
        g.ids.push(n.id);
        g.count += 1;
        if (!n.isRead) g.hasUnread = true;
        // lastTime / lastBody already set to the newest (first seen) entry
      } else {
        const from = n.title.replace(/^New message from /i, "").trim() || "User";
        const g: MsgGroup = {
          kind: "group",
          conversationId: convId,
          ids: [n.id],
          count: 1,
          from,
          lastBody: n.body,
          lastTime: n.createdAt,
          hasUnread: !n.isRead,
        };
        grouped.set(convId, g);
        items.push(g);
      }
    } else {
      items.push({ kind: "standalone", n });
    }
  }

  return items;
}

export function NotificationsClient({ initialNotifications }: { initialNotifications: NotificationItem[] }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const { markOneRead, markAllRead } = useNotifications();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const handler = (e: Event) => {
      const n = (e as CustomEvent<NotificationItem>).detail;
      setNotifications((prev) => [n, ...prev]);
    };
    window.addEventListener("ws:notification", handler);
    return () => window.removeEventListener("ws:notification", handler);
  }, []);

  function markGroupRead(ids: string[]) {
    setNotifications((prev) =>
      prev.map((n) => ids.includes(n.id) ? { ...n, isRead: true } : n)
    );
    // Mark each one via the context (which calls the API)
    ids.forEach((id) => markOneRead(id));
  }

  function handleClickStandalone(n: NotificationItem) {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x));
      markOneRead(n.id);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllRead();
  }

  const items = buildDisplayItems(notifications);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-gray-100 bg-white shrink-0">
        <h1 className="text-[15px] font-semibold text-gray-900">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Bell className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">No notifications yet</p>
            <p className="text-xs text-gray-400 mt-1">New messages and conversations will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 bg-white">
            {items.map((item) => {
              if (item.kind === "group") {
                const meta = TYPE_META.NEW_MESSAGE;
                const Icon = meta.icon;
                return (
                  <Link
                    key={`group-${item.conversationId}`}
                    href={`/conversations/${item.conversationId}`}
                    onClick={() => item.hasUnread && markGroupRead(item.ids)}
                    className={`flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors ${item.hasUnread ? "bg-blue-50/40" : ""}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">
                          {item.count === 1 ? `New message from ${item.from}` : `${item.count} new messages from ${item.from}`}
                        </p>
                        <span className="text-[11px] text-gray-400 shrink-0">{formatTime(item.lastTime)}</span>
                      </div>
                      <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{item.lastBody}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      {item.hasUnread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                      <ArrowUpRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </Link>
                );
              }

              // Standalone
              const { n } = item;
              const meta = TYPE_META[n.type] ?? TYPE_META.NEW_MESSAGE;
              const Icon = meta.icon;
              const inner = (
                <div className={`flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors ${!n.isRead ? "bg-blue-50/40" : ""}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{n.title}</p>
                      <span className="text-[11px] text-gray-400 shrink-0">{formatTime(n.createdAt)}</span>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    {n.conversationId && <ArrowUpRight className="w-4 h-4 text-gray-300" />}
                  </div>
                </div>
              );

              if (n.conversationId) {
                return (
                  <Link key={n.id} href={`/conversations/${String(n.conversationId)}`} onClick={() => handleClickStandalone(n)}>
                    {inner}
                  </Link>
                );
              }
              return (
                <button key={n.id} className="w-full text-left" onClick={() => handleClickStandalone(n)}>
                  {inner}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
