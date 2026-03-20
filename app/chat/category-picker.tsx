"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, User, Receipt, ShieldCheck, HelpCircle, MessageSquare } from "lucide-react";

const CATEGORIES = [
  {
    value: "CARDS",
    label: "Cards",
    description: "Activation, limits, declines, replacements",
    icon: CreditCard,
    color: "bg-blue-50 text-blue-600",
  },
  {
    value: "ACCOUNT",
    label: "Account",
    description: "Login issues, profile, access",
    icon: User,
    color: "bg-violet-50 text-violet-600",
  },
  {
    value: "SPENDS",
    label: "Spends",
    description: "Disputes, pending charges, refunds",
    icon: Receipt,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    value: "KYC",
    label: "KYC",
    description: "Verification status, document uploads",
    icon: ShieldCheck,
    color: "bg-amber-50 text-amber-600",
  },
  {
    value: "GENERAL",
    label: "General",
    description: "Product questions, feedback",
    icon: HelpCircle,
    color: "bg-gray-100 text-gray-600",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Skip categories, go straight to chat",
    icon: MessageSquare,
    color: "bg-rose-50 text-rose-600",
  },
];

function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("avi_user_id");
  if (!id) {
    id = `user_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem("avi_user_id", id);
  }
  return id;
}

export function CategoryPicker() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function startChat(category: string) {
    setLoading(category);
    const userId = getUserId();

    const res = await fetch("/api/chat/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, category }),
    });

    const data = await res.json();
    router.push(`/chat/${data.conversationId}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-8 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#0f0f0f] flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[15px] text-gray-900">Avi Support</span>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          What can we help you with today?
        </p>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {CATEGORIES.map(({ value, label, description, icon: Icon, color }) => (
          <button
            key={value}
            onClick={() => startChat(value)}
            disabled={loading !== null}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all text-left disabled:opacity-50 group"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              {loading === value ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      <div className="px-6 pb-5 pt-3 border-t border-gray-50">
        <p className="text-xs text-center text-gray-400">
          Typically replies in under 5 seconds
        </p>
      </div>
    </div>
  );
}
