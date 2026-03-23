"use client";

import { useState } from "react";
import { Bot } from "lucide-react";

export function AIToggle({ initialEnabled }: { initialEnabled: boolean; isAdmin: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: next }),
      });
      if (!res.ok) setEnabled(!next);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
            <Bot className="w-4 h-4 text-gray-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">AI Responses</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {enabled
                ? "AI is handling new conversations automatically"
                : "AI is off — agents reply manually, users are informed"}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-gray-900" : "bg-gray-200"
          }`}
          aria-label={enabled ? "Disable AI" : "Enable AI"}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
