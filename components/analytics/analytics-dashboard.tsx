"use client";

import { useState, useEffect } from "react";
import { BarChart } from "./bar-chart";
import { PieChartComponent } from "./pie-chart";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart2, TrendingUp, Tag, AlertTriangle } from "lucide-react";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#10b981",
  neutral: "#6b7280",
  frustrated: "#f59e0b",
  angry: "#ef4444",
};

type Period = "7" | "14" | "30";

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("7");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    overview: Record<string, number>;
    topIssues: Array<{ label: string; value: string; count: number }>;
    sentiment: Array<{ type: string; value: string; label: string; count: number }>;
    volume: Array<{ date: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?type=overview`).then((r) => r.json()),
      fetch(`/api/analytics?type=top_issues&days=${period}`).then((r) => r.json()),
      fetch(`/api/analytics?type=tag_distribution&days=${period}`).then((r) => r.json()),
      fetch(`/api/analytics?type=volume&days=${period}`).then((r) => r.json()),
    ])
      .then(([overview, topIssues, dist, volume]) => {
        setData({
          overview,
          topIssues,
          sentiment: dist.filter((d: { type: string }) => d.type === "sentiment"),
          volume,
        });
      })
      .finally(() => setLoading(false));
  }, [period]);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl h-72" />
          <div className="bg-white border border-gray-100 rounded-xl h-72" />
        </div>
      </div>
    );
  }

  const sentimentData = data.sentiment.map((s) => ({
    name: s.label,
    value: s.count,
    color: SENTIMENT_COLORS[s.value] ?? "#9ca3af",
  }));

  const periodOptions: { value: Period; label: string }[] = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
  ];

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

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Issues</h3>
          <BarChart
            data={data.topIssues.map((i) => ({
              label: i.label ?? i.value,
              value: i.count,
            }))}
            color="#3b82f6"
          />
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Sentiment Breakdown</h3>
          <PieChartComponent data={sentimentData} />
        </div>
      </div>

      {/* Volume chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Daily Volume
        </h3>
        <BarChart
          data={data.volume.map((v) => ({
            label: v.date,
            value: v.count,
          }))}
          color="#8b5cf6"
        />
      </div>
    </div>
  );
}
