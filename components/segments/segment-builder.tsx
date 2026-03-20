"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Trash2 } from "lucide-react";

interface FilterCondition {
  field: string;
  operator: string;
  value: string;
}

const FIELD_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "category", label: "Category" },
  { value: "priority", label: "Priority" },
  { value: "sentiment", label: "Sentiment" },
  { value: "issue_type", label: "Issue Type" },
  { value: "product_area", label: "Product Area" },
  { value: "resolution_status", label: "Resolution" },
  { value: "isAiPaused", label: "AI Paused" },
];

const VALUE_OPTIONS: Record<string, string[]> = {
  status: ["OPEN", "PENDING", "RESOLVED", "ESCALATED", "CLOSED"],
  category: ["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"],
  priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  sentiment: ["positive", "neutral", "frustrated", "angry"],
  issue_type: ["card_decline", "kyc_stuck", "transaction_dispute", "login_issue", "general_query"],
  product_area: ["cards", "account", "spends", "kyc", "borrow", "grow"],
  resolution_status: ["resolved_by_ai", "escalated", "pending", "unresolved"],
  isAiPaused: ["true", "false"],
};

interface SegmentBuilderProps {
  onClose: () => void;
  onCreated: () => void;
}

export function SegmentBuilder({ onClose, onCreated }: SegmentBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [operator, setOperator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<FilterCondition[]>([
    { field: "status", operator: "eq", value: "OPEN" },
  ]);
  const [saving, setSaving] = useState(false);

  function addCondition() {
    setConditions((prev) => [
      ...prev,
      { field: "status", operator: "eq", value: "OPEN" },
    ]);
  }

  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateCondition(i: number, key: keyof FilterCondition, val: string) {
    setConditions((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const updated = { ...c, [key]: val };
        if (key === "field") {
          updated.value = VALUE_OPTIONS[val]?.[0] ?? "";
        }
        return updated;
      })
    );
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    await fetch("/api/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        filters: { conditions, operator },
      }),
    });

    setSaving(false);
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">New Segment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Segment name
            </label>
            <Input
              placeholder="e.g. Frustrated KYC users"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Description (optional)
            </label>
            <Input
              placeholder="What is this segment for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Operator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Match</span>
            <div className="flex gap-1">
              {(["AND", "OR"] as const).map((op: "AND" | "OR") => (
                <button
                  key={op}
                  onClick={() => setOperator(op)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    operator === op
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">of the following conditions</span>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            {conditions.map((cond: FilterCondition, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={cond.field}
                  onChange={(e) => updateCondition(i, "field", e.target.value)}
                  className="h-8 px-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FIELD_OPTIONS.map((opt: { value: string; label: string }) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(i, "operator", e.target.value)}
                  className="h-8 px-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="eq">is</option>
                  <option value="neq">is not</option>
                  <option value="in">is any of</option>
                </select>

                <select
                  value={cond.value}
                  onChange={(e) => updateCondition(i, "value", e.target.value)}
                  className="flex-1 h-8 px-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(VALUE_OPTIONS[cond.field] ?? []).map((v: string) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => removeCondition(i)}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addCondition}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add condition
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-100">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!name.trim() || conditions.length === 0}
          >
            Create Segment
          </Button>
        </div>
      </div>
    </div>
  );
}
