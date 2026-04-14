"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BubbleChart, type BubbleItem } from "./bubble-chart";
import { PieChartComponent } from "./pie-chart";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "./bar-chart";
import { BarChart2, TrendingUp, Tag, AlertTriangle, Calendar } from "lucide-react";

const SENTIMENT_NAMES = new Set(["positive", "neutral", "frustrated", "angry"]);

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#10b981",
  neutral: "#6b7280",
  frustrated: "#f59e0b",
  angry: "#ef4444",
};

type Period = "1" | "7" | "14" | "30" | "custom";

interface TagItem {
  name?: string | null;
  color?: string | null;
  count: number;
}

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

export function AnalyticsDashboard() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("7");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date(Date.now() - 14 * 86400_000)));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    overview: Record<string, number>;
    agentTags: TagItem[];
    aiTags: TagItem[];
    volume: Array<{ date: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    const isCustom = period === "custom";
    if (isCustom && (!customFrom || !customTo)) return;

    const qs = isCustom
      ? `dateFrom=${customFrom}&dateTo=${customTo}`
      : `days=${period}`;

    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?type=overview`).then((r) => r.json()),
      fetch(`/api/analytics?type=agent_tags&${qs}`).then((r) => r.json()),
      fetch(`/api/analytics?type=ai_tags&${qs}`).then((r) => r.json()),
      fetch(`/api/analytics?type=volume&${qs}`).then((r) => r.json()),
    ])
      .then(([overview, agentTags, aiTags, volume]) => {
        setData({ overview, agentTags, aiTags, volume });
      })
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo]);

  const periodOptions: { value: Period; label: string }[] = [
    { value: "1",      label: "24h"    },
    { value: "7",      label: "7 days" },
    { value: "14",     label: "14 days"},
    { value: "30",     label: "30 days"},
    { value: "custom", label: "Custom" },
  ];

  function handleBubbleClick(tagName: string) {
    router.push(`/live?tag=${encodeURIComponent(tagName)}`);
  }

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl h-24" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-white border border-gray-100 rounded-xl h-72" />
          <div className="bg-white border border-gray-100 rounded-xl h-72" />
        </div>
        <div className="bg-white border border-gray-100 rounded-xl h-64" />
        <div className="bg-white border border-gray-100 rounded-xl h-48" />
      </div>
    );
  }

  const sentimentData = data.agentTags
    .filter((t) => SENTIMENT_NAMES.has(t.name?.toLowerCase() ?? ""))
    .map((t) => ({
      name: t.name ?? "Unknown",
      value: t.count,
      color: SENTIMENT_COLORS[t.name?.toLowerCase() ?? ""] ?? "#9ca3af",
    }));

  const opsTags: BubbleItem[] = data.agentTags.filter((t) => t.name);
  const aiTags: BubbleItem[] = data.aiTags.filter((t) => t.name);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.value === "custom" && <Calendar className="w-3 h-3" />}
              {opt.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={toDateInputValue(new Date())}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Chats Today"
          value={data.overview.totalToday ?? 0}
          icon={<BarChart2 className="w-4 h-4" />}
        />
        <StatCard
          label="Open"
          value={data.overview.openCount ?? 0}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <StatCard
          label="AI Resolution Rate"
          value={`${data.overview.aiResolutionRate ?? 0}%`}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Escalated"
          value={data.overview.escalatedCount ?? 0}
          icon={<Tag className="w-4 h-4" />}
        />
      </div>

      {/* Agent Tags bubble map + Sentiment pie */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-gray-100 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Agent Tags</h3>
            <p className="text-xs text-gray-400 mt-0.5">Click a bubble to view matching conversations</p>
          </div>
          <BubbleChart data={opsTags} onBubbleClick={handleBubbleClick} />
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Sentiment</h3>
            <p className="text-xs text-gray-400 mt-0.5">User mood breakdown</p>
          </div>
          <PieChartComponent data={sentimentData} />
        </div>
      </div>

      {/* AI Tags bubble map */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">AI-Detected Issues</h3>
          <p className="text-xs text-gray-400 mt-0.5">Click a bubble to view matching conversations</p>
        </div>
        <BubbleChart data={aiTags} onBubbleClick={handleBubbleClick} />
      </div>

      {/* Daily volume */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Daily Conversations</h3>
          <p className="text-xs text-gray-400 mt-0.5">Conversations started per day</p>
        </div>
        <BarChart
          data={data.volume.map((v) => ({ label: v.date, value: v.count }))}
          color="#8b5cf6"
        />
      </div>
    </div>
  );
}
