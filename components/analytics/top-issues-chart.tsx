"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BubbleChart, type BubbleItem } from "./bubble-chart";
import { Calendar } from "lucide-react";

type Period = "1" | "7" | "14" | "30" | "custom";

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "1",      label: "24h"     },
  { value: "7",      label: "7 days"  },
  { value: "14",     label: "14 days" },
  { value: "30",     label: "30 days" },
  { value: "custom", label: "Custom"  },
];

export function TopIssuesChart() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("7");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date(Date.now() - 14 * 86400_000)));
  const [customTo, setCustomTo]     = useState(() => toDateInputValue(new Date()));
  const [issues, setIssues]         = useState<BubbleItem[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;
    const qs = period === "custom"
      ? `dateFrom=${customFrom}&dateTo=${customTo}`
      : `days=${period}`;
    setLoading(true);
    fetch(`/api/analytics?type=tag_distribution&${qs}`)
      .then((r) => r.json())
      .then((data: BubbleItem[]) => setIssues(data.filter((d) => d.name)))
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo]);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Issues</h3>
          <p className="text-xs text-gray-400 mt-0.5">All tags · click a bubble to filter conversations</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  period === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.value === "custom" && <Calendar className="w-2.5 h-2.5" />}
                {opt.label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <span className="text-[11px] text-gray-400">–</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={toDateInputValue(new Date())}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
      ) : (
        <BubbleChart
          data={issues}
          onBubbleClick={(name) => router.push(`/live?tag=${encodeURIComponent(name)}`)}
        />
      )}
    </div>
  );
}
