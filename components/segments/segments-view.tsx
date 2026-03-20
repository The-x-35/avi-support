"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/utils/format";
import { Plus, Filter, Download, Pin, Trash2 } from "lucide-react";
import { SegmentBuilder } from "./segment-builder";
import { SegmentResults } from "./segment-results";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: unknown;
  isPinned: boolean;
  createdAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
}

export function SegmentsView() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);

  const fetchSegments = async () => {
    const res = await fetch("/api/segments");
    const data = await res.json();
    setSegments(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSegments();
  }, []);

  async function handleExport(segment: Segment) {
    const res = await fetch(`/api/segments/${segment.id}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${segment.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    fetchSegments();
  }

  if (selectedSegment) {
    return (
      <SegmentResults
        segment={selectedSegment}
        onBack={() => setSelectedSegment(null)}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">{segments.length} segments</span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowBuilder(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          New Segment
        </Button>
      </div>

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse h-20" />
            ))}
          </div>
        ) : segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
            <Filter className="w-8 h-8 mb-2 text-gray-200" />
            <p>No segments yet</p>
            <p className="text-xs mt-1">Create a saved filter to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map((seg: Segment) => (
              <div
                key={seg.id}
                className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {seg.isPinned && (
                        <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />
                      )}
                      <h3 className="text-sm font-semibold text-gray-900">
                        {seg.name}
                      </h3>
                    </div>
                    {seg.description && (
                      <p className="text-xs text-gray-400 mb-2">{seg.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Avatar name={seg.createdBy.name} size="xs" />
                      <span>{seg.createdBy.name}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(seg.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExport(seg)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedSegment(seg)}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-500"
                      onClick={() => handleDelete(seg.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Segment builder modal */}
      {showBuilder && (
        <SegmentBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={() => {
            fetchSegments();
            setShowBuilder(false);
          }}
        />
      )}
    </div>
  );
}
