"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Radio,
  Filter,
  Settings,
  LogOut,
  MessageSquare,
  Bell,
  ChevronDown,
  CircleUser,
  AlertTriangle,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useNotifications } from "@/components/notifications/notification-context";
import { useState, useEffect, useRef } from "react";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/live", label: "Live Feed", icon: Radio },
  { href: "/my-issues", label: "My Issues", icon: CircleUser },
  { href: "/escalations", label: "Escalations", icon: AlertTriangle },
  { href: "/segments", label: "Segments", icon: Filter },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const secondary = [
  { href: "/settings", label: "Settings", icon: Settings },
];

type AgentStatus = "ONLINE" | "AWAY" | "OFFLINE";

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string }> = {
  ONLINE:  { label: "Online",  color: "bg-green-500" },
  AWAY:    { label: "Away",    color: "bg-yellow-400" },
  OFFLINE: { label: "Offline", color: "bg-gray-400" },
};

interface AgentSummary {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
  status: AgentStatus;
}

interface SidebarProps {
  agent?: { id: string; name: string; email: string; avatarUrl?: string | null; role: string };
}

function StatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <span className={cn("inline-block rounded-full shrink-0", STATUS_CONFIG[status].color, className)} />
  );
}

export function Sidebar({ agent }: SidebarProps) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const [hovered, setHovered] = useState(false);
  const [myStatus, setMyStatus] = useState<AgentStatus>("ONLINE");
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const isConversationPage = pathname.startsWith("/conversations");
  const collapsed = isConversationPage && !hovered;
  const isAdmin = agent?.role === "ADMIN";

  // Load agents list + current agent status
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: AgentSummary[]) => {
        setAgents(data);
        const me = data.find((a) => a.id === agent?.id);
        if (me) setMyStatus(me.status);
      })
      .catch(() => {});
  }, [agent?.id]);

  // Close status dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function updateMyStatus(status: AgentStatus) {
    setMyStatus(status);
    setStatusOpen(false);
    setAgents((prev) => prev.map((a) => a.id === agent?.id ? { ...a, status } : a));
    await fetch("/api/agents/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function updateAgentStatus(agentId: string, status: AgentStatus) {
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status } : a));
    await fetch("/api/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agentId, status }),
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside
      onMouseEnter={() => isConversationPage && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setStatusOpen(false); }}
      className={cn(
        "shrink-0 h-screen flex flex-col border-r border-gray-100 bg-white transition-all duration-200 z-20",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center border-b border-gray-100 px-3 gap-2 shrink-0 overflow-hidden">
        <div className="w-7 h-7 rounded-lg bg-[#0f0f0f] flex items-center justify-center shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-[15px] text-gray-900 tracking-tight truncate">
            Avi Support
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            const showBadge = href === "/notifications" && unreadCount > 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative group",
                  collapsed && "justify-center px-2",
                  isActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
              >
                <div className="relative shrink-0">
                  <Icon className="w-4 h-4" />
                  {showBadge && collapsed && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
                  )}
                </div>
                {!collapsed && (
                  <>
                    <span className="flex-1">{label}</span>
                    {showBadge && (
                      <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center px-1">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </>
                )}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    {label}{showBadge && ` (${unreadCount})`}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 pt-3 border-t border-gray-100 space-y-0.5">
          {secondary.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative group",
                collapsed && "justify-center px-2",
                pathname.startsWith(href) ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  {label}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Agents list */}
        {!collapsed && agents.length > 0 && (
          <div className="mt-6 pt-3 border-t border-gray-100">
            <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Team
            </p>
            <div className="space-y-0.5">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 group"
                >
                  <div className="relative shrink-0">
                    <Avatar name={a.name} src={a.avatarUrl} size="xs" />
                    <StatusDot
                      status={a.status}
                      className="w-2 h-2 absolute -bottom-0.5 -right-0.5 ring-1 ring-white"
                    />
                  </div>
                  <span className="flex-1 text-xs text-gray-700 truncate">{a.name}</span>
                  {/* Admin can change anyone's status */}
                  {isAdmin && a.id !== agent?.id && (
                    <select
                      value={a.status}
                      onChange={(e) => updateAgentStatus(a.id, e.target.value as AgentStatus)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 bg-transparent border border-gray-200 rounded px-1 py-0.5 transition-opacity cursor-pointer"
                    >
                      {(Object.keys(STATUS_CONFIG) as AgentStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Agent profile + status picker */}
      <div className="p-3 border-t border-gray-100">
        {collapsed ? (
          <div className="flex justify-center relative group">
            <div className="relative">
              <Avatar name={agent?.name} src={agent?.avatarUrl} size="sm" />
              <StatusDot status={myStatus} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 ring-1 ring-white" />
            </div>
            <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
              {agent?.name} · {STATUS_CONFIG[myStatus].label}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Status picker */}
            <div ref={statusRef} className="relative">
              <button
                onClick={() => setStatusOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <StatusDot status={myStatus} className="w-2 h-2" />
                <span className="flex-1 text-xs text-gray-600">{STATUS_CONFIG[myStatus].label}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              {statusOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-full bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden z-50">
                  {(Object.keys(STATUS_CONFIG) as AgentStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateMyStatus(s)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 transition-colors",
                        myStatus === s ? "text-gray-900 font-medium" : "text-gray-600"
                      )}
                    >
                      <StatusDot status={s} className="w-2 h-2" />
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Agent info + logout */}
            <div className="flex items-center gap-2.5 px-2 py-1">
              <div className="relative shrink-0">
                <Avatar name={agent?.name} src={agent?.avatarUrl} size="sm" />
                <StatusDot status={myStatus} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 ring-1 ring-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{agent?.name ?? "Agent"}</p>
                <p className="text-xs text-gray-400 truncate">{agent?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
