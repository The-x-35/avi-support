"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface PieChartProps {
  data: Array<{ name: string; value: number; color: string }>;
}

export function PieChartComponent({ data }: PieChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry: PieChartProps["data"][number], i: number) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [String(value), "conversations"]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}
        />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 12, color: "#374151" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
