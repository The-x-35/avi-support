"use client";

import { useState } from "react";

const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8];

export function InactivitySettings({ initialEnabled, initialHours }: { initialEnabled: boolean; initialHours: number }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hours, setHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentInactivityEnabled: enabled, agentInactivityHours: hours }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <div className="flex items-center justify-between py-4 border-b border-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-900">Agent auto-offline</p>
          <p className="text-xs text-gray-400 mt-0.5">Set agents offline after inactivity</p>
        </div>
        <button
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enabled ? "bg-gray-900" : "bg-gray-200"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
        </button>
      </div>

      {enabled && (
        <div className="flex items-center justify-between py-4 border-b border-gray-50">
          <div>
            <p className="text-sm font-medium text-gray-900">Inactivity threshold</p>
            <p className="text-xs text-gray-400 mt-0.5">Time before auto-offline triggers</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {HOUR_OPTIONS.map((h) => (
                <button key={h} onClick={() => setHours(h)} className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${hours === h ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {h}h
                </button>
              ))}
            </div>
            <button onClick={handleSave} disabled={saving} className="text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors">
              {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
