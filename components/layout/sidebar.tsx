"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Radio,
  BarChart2,
  Filter,
  Settings,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/live", label: "Live Feed", icon: Radio },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/segments", label: "Segments", icon: Filter },
];

const secondary = [
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  agent?: { name: string; email: string; avatarUrl?: string | null; role: string };
}

export function Sidebar({ agent }: SidebarProps) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="w-[220px] shrink-0 h-screen flex flex-col border-r border-gray-100 bg-white">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-gray-100">
        <div className="w-7 h-7 rounded-lg bg-[#0f0f0f] flex items-center justify-center shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-[15px] text-gray-900 tracking-tight">
          Avi Support
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        <div className="space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
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
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Agent profile */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar
            name={agent?.name}
            src={agent?.avatarUrl}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {agent?.name ?? "Agent"}
            </p>
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
    </aside>
  );
}
