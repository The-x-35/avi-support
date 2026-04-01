"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { pack, hierarchy } from "d3-hierarchy";

const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#3b82f6",
  "#10b981", "#f59e0b", "#ef4444", "#14b8a6",
  "#84cc16", "#f97316", "#06b6d4", "#a855f7",
  "#e11d48", "#0ea5e9", "#d97706", "#16a34a",
];

export interface BubbleItem {
  name?: string | null;
  count: number;
  color?: string | null;
}

interface PackedNode {
  x: number;
  y: number;
  r: number;
  data: { name: string; count: number; color: string };
}

interface TooltipState {
  name: string;
  count: number;
  x: number;
  y: number;
}

function computePack(data: BubbleItem[], width: number, height: number): PackedNode[] {
  if (!data.length) return [];

  const root = hierarchy<{ name: string; count: number; color: string; children?: unknown[] }>({
    name: "root",
    count: 0,
    color: "",
    children: data.map((d, i) => ({
      name: d.name ?? "Unknown",
      count: d.count,
      color: d.color ?? PALETTE[i % PALETTE.length],
    })),
  }).sum((d) => d.count || 0);

  const layout = pack<{ name: string; count: number; color: string }>()
    .size([width, height])
    .padding(4);

  const packed = layout(root);

  return (packed.children ?? []).map((node) => ({
    x: node.x,
    y: node.y,
    r: node.r,
    data: node.data,
  }));
}

// Truncate text to fit inside a circle of radius r
function fitText(text: string, r: number): string {
  // Approx 6px per char at font-size 11px
  const maxChars = Math.floor((r * 1.6) / 6);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(maxChars - 1, 3)) + "…";
}

export function BubbleChart({ data, onBubbleClick }: { data: BubbleItem[]; onBubbleClick?: (name: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 380 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const measure = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.offsetWidth;
      // Height scales with data volume, min 280, max 480
      const h = Math.min(480, Math.max(280, Math.ceil(data.length * 14)));
      setDims({ width: w, height: h });
    }
  }, [data.length]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  if (!data.length) {
    return (
      <p className="text-xs text-gray-300 italic py-8 text-center">
        No data for this period
      </p>
    );
  }

  const nodes = computePack(data, dims.width, dims.height);

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={dims.width}
        height={dims.height}
        className="overflow-visible"
        style={{ display: "block" }}
      >
        {nodes.map((node) => {
          const { x, y, r, data: d } = node;
          const isHovered = hoveredName === d.name;
          const fontSize = r < 18 ? 7 : r < 28 ? 9 : r < 40 ? 10 : r < 55 ? 11 : 12;
          const showCount = r > 22;
          const showName = r > 14;

          return (
            <g
              key={d.name}
              transform={`translate(${x},${y})`}
              style={{
                cursor: onBubbleClick ? "pointer" : "default",
                transition: "transform 0.15s ease",
              }}
              onClick={() => onBubbleClick?.(d.name)}
              onMouseEnter={(e) => {
                setHoveredName(d.name);
                const svgRect = (e.currentTarget.closest("svg") as SVGSVGElement)
                  .getBoundingClientRect();
                setTooltip({
                  name: d.name,
                  count: d.count,
                  x: svgRect.left + x,
                  y: svgRect.top + y - r - 8,
                });
              }}
              onMouseLeave={() => {
                setHoveredName(null);
                setTooltip(null);
              }}
            >
              {/* Shadow / glow on hover */}
              {isHovered && (
                <circle
                  r={r + 4}
                  fill={d.color}
                  opacity={0.12}
                />
              )}

              {/* Main bubble */}
              <circle
                r={isHovered ? r * 1.06 : r}
                fill={d.color}
                fillOpacity={isHovered ? 0.25 : 0.15}
                stroke={d.color}
                strokeOpacity={isHovered ? 0.7 : 0.4}
                strokeWidth={1.5}
                style={{ transition: "r 0.15s ease, fill-opacity 0.15s ease" }}
              />

              {/* Label */}
              {showName && (
                <text
                  textAnchor="middle"
                  dominantBaseline={showCount ? "auto" : "middle"}
                  y={showCount ? -fontSize * 0.6 : 0}
                  fontSize={fontSize}
                  fontWeight="600"
                  fill={d.color}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {fitText(d.name, r)}
                </text>
              )}

              {/* Count */}
              {showCount && (
                <text
                  textAnchor="middle"
                  dominantBaseline="hanging"
                  y={fontSize * 0.3}
                  fontSize={fontSize}
                  fontWeight="700"
                  fill={d.color}
                  fillOpacity={0.7}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap">
            <span className="font-medium">{tooltip.name}</span>
            <span className="text-white/50 ml-1.5">{tooltip.count} conversations</span>
          </div>
        </div>
      )}
    </div>
  );
}
