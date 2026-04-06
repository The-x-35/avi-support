"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard, BarChart2, Filter, Settings, Bell,
  CircleUser, MessageSquare, X, MessageCircle, ChevronUp, AlertTriangle,
} from "lucide-react";
import { useNotifications } from "@/components/notifications/notification-context";
import { useChatTabs } from "@/lib/contexts/chat-tabs-context";
import { Avatar } from "@/components/ui/avatar";

const NAV_ITEMS = [
  { href: "/live",          label: "Chats",         icon: MessageSquare },
  { href: "/overview",      label: "Overview",       icon: LayoutDashboard },
  { href: "/my-issues",     label: "My Issues",      icon: CircleUser },
  { href: "/escalations",   label: "Escalations",    icon: AlertTriangle },
  { href: "/analytics",     label: "Analytics",      icon: BarChart2 },
  { href: "/segments",      label: "Segments",       icon: Filter },
  { href: "/notifications", label: "Notifications",  icon: Bell },
  { href: "/settings",      label: "Settings",       icon: Settings },
];

type AgentStatus = "ONLINE" | "AWAY" | "OFFLINE";

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string }> = {
  ONLINE:  { label: "Online",  color: "text-emerald-600", dot: "bg-emerald-500" },
  AWAY:    { label: "Away",    color: "text-amber-600",   dot: "bg-amber-400"   },
  OFFLINE: { label: "Offline", color: "text-gray-400",    dot: "bg-gray-400"    },
};

interface BottomNavProps {
  agent?: { id: string; name: string; email: string; avatarUrl?: string | null; role: string; status?: string };
}

function AgentStatusPicker({ agent }: { agent: NonNullable<BottomNavProps["agent"]> }) {
  const [status, setStatus] = useState<AgentStatus>((agent.status as AgentStatus) ?? "ONLINE");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function changeStatus(next: AgentStatus) {
    if (next === status || saving) return;
    setSaving(true);
    setStatus(next);
    setOpen(false);
    await fetch("/api/agents/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => {});
    setSaving(false);
  }

  const cfg = STATUS_CONFIG[status];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
        title="Set your status"
      >
        <div className="relative">
          <Avatar name={agent.name} src={agent.avatarUrl} size="xs" />
          <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white", cfg.dot)} />
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[11px] font-semibold text-gray-800 leading-none">{agent.name.split(" ")[0]}</span>
          <span className={cn("text-[10px] mt-0.5", cfg.color)}>{cfg.label}</span>
        </div>
        <ChevronUp className={cn("w-3 h-3 text-gray-400 transition-transform", open ? "" : "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden min-w-[140px] py-1">
          {(Object.entries(STATUS_CONFIG) as [AgentStatus, typeof STATUS_CONFIG[AgentStatus]][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => changeStatus(key)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-gray-50",
                status === key ? "font-semibold text-gray-900" : "text-gray-600"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", val.dot)} />
              {val.label}
              {status === key && <span className="ml-auto text-gray-300 text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BottomNav({ agent }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { tabs, closeTab } = useChatTabs();

  const activeConvId = pathname.startsWith("/conversations/")
    ? pathname.replace("/conversations/", "").split("/")[0]
    : null;

  return (
    <div className="shrink-0 flex items-center justify-center gap-3 px-6 py-3 bg-[#f5f5f7]">
      {/* Agent status pill */}
      {agent && (
        <div className="flex items-center bg-white rounded-2xl border border-gray-100 shadow-sm px-1 py-1.5">
          <AgentStatusPicker agent={agent} />
        </div>
      )}

      {/* Nav items card */}
      <div className="flex items-center bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-2 gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isBell = href === "/notifications";
          const showBadge = isBell && unreadCount > 0;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors",
                isActive ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <div className="relative">
                <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Chat tabs */}
      {tabs.length > 0 && (
        <div className="flex items-center bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2 gap-2">
          {tabs.map((tab) => {
            const isActive = activeConvId === tab.convId;
            return (
              <div
                key={tab.convId}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/conversations/${tab.convId}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/conversations/${tab.convId}`)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all cursor-pointer select-none",
                  isActive
                    ? "bg-[#0f0f0f] text-white"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <MessageCircle
                  className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-white/70" : "text-gray-400")}
                  strokeWidth={1.75}
                />
                <span className="text-xs font-medium max-w-[100px] truncate">{tab.label}</span>
                <span className={cn("text-[11px] shrink-0", isActive ? "text-white/50" : "text-gray-400")}>
                  #{tab.convNum}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.convId); }}
                  className={cn(
                    "w-4 h-4 flex items-center justify-center rounded-full ml-0.5 transition-colors",
                    isActive ? "hover:bg-white/20" : "hover:bg-gray-200"
                  )}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
