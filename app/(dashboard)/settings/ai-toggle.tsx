"use client";

import { useState } from "react";

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
    <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">AI Responses</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {enabled ? "AI handles new conversations automatically" : "Agents reply manually"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {saving && <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />}
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-gray-900" : "bg-gray-200"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
        </button>
      </div>
    </div>
  );
}
