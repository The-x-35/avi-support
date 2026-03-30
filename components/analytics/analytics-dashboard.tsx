"use client";

import { useState, useEffect } from "react";
import { BubbleChart, type BubbleItem } from "./bubble-chart";
import { PieChartComponent } from "./pie-chart";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "./bar-chart";
import { BarChart2, TrendingUp, Tag, AlertTriangle } from "lucide-react";

const SENTIMENT_NAMES = new Set(["positive", "neutral", "frustrated", "angry"]);

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#10b981",
  neutral: "#6b7280",
  frustrated: "#f59e0b",
  angry: "#ef4444",
};

type Period = "7" | "14" | "30";

interface TagItem {
  name?: string | null;
  color?: string | null;
  count: number;
}

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("7");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    overview: Record<string, number>;
    agentTags: TagItem[];
    aiTags: TagItem[];
    volume: Array<{ date: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?type=overview`).then((r) => r.json()),
      fetch(`/api/analytics?type=agent_tags&days=${period}`).then((r) => r.json()),
      fetch(`/api/analytics?type=ai_tags&days=${period}`).then((r) => r.json()),
      fetch(`/api/analytics?type=volume&days=${period}`).then((r) => r.json()),
    ])
      .then(([overview, agentTags, aiTags, volume]) => {
        setData({ overview, agentTags, aiTags, volume });
      })
      .finally(() => setLoading(false));
  }, [period]);

  const periodOptions: { value: Period; label: string }[] = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
  ];

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

  // Sentiment comes from agent-applied tags (ops team sentiment labels)
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
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {periodOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              period === opt.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
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
            <p className="text-xs text-gray-400 mt-0.5">Applied by ops team across conversations</p>
          </div>
          <BubbleChart data={opsTags} />
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
          <p className="text-xs text-gray-400 mt-0.5">Topics auto-tagged by AI from chat content</p>
        </div>
        <BubbleChart data={aiTags} />
      </div>

      {/* Daily volume */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Daily Volume</h3>
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
