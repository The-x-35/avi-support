"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard, BarChart2, Filter, Settings, Bell,
  CircleUser, MessageSquare, Radio, X, MessageCircle,
} from "lucide-react";
import { useNotifications } from "@/components/notifications/notification-context";
import { useChatTabs } from "@/lib/contexts/chat-tabs-context";

const NAV_ITEMS = [
  { href: "/live",          label: "Chats",         icon: MessageSquare },
  { href: "/",              label: "Overview",       icon: LayoutDashboard },
  { href: "/my-issues",     label: "My Issues",      icon: CircleUser },
  { href: "/analytics",     label: "Analytics",      icon: BarChart2 },
  { href: "/segments",      label: "Segments",       icon: Filter },
  { href: "/notifications", label: "Notifications",  icon: Bell },
  { href: "/settings",      label: "Settings",       icon: Settings },
];

interface BottomNavProps {
  agent?: { id: string; name: string; email: string; avatarUrl?: string | null; role: string };
}

export function BottomNav({ agent: _agent }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { tabs, closeTab } = useChatTabs();

  const activeConvId = pathname.startsWith("/conversations/")
    ? pathname.replace("/conversations/", "").split("/")[0]
    : null;

  return (
    <div className="shrink-0 flex items-center justify-center gap-3 px-6 py-3 bg-[#f5f5f7]">
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
              <button
                key={tab.convId}
                onClick={() => router.push(`/conversations/${tab.convId}`)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all",
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
