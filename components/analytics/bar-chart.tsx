"use client";

interface BarChartProps {
  data: Array<{ label: string; value: number }>;
  color?: string;
}

export function BarChart({ data, color = "#3b82f6" }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No data yet
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-28 truncate text-right shrink-0">
            {item.label}
          </span>
          <div className="flex-1 h-6 bg-gray-50 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{
                width: `${max > 0 ? (item.value / max) * 100 : 0}%`,
                backgroundColor: color,
                opacity: 0.85,
              }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8 shrink-0">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
