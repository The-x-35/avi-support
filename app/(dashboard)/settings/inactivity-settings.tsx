"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8];

interface InactivitySettingsProps {
  initialEnabled: boolean;
  initialHours: number;
}

export function InactivitySettings({ initialEnabled, initialHours }: InactivitySettingsProps) {
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
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Agent Inactivity</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Automatically set agents to offline after a period of no activity.
        </p>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Auto-offline</p>
            <p className="text-xs text-gray-400 mt-0.5">Set agents offline if inactive</p>
          </div>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? "bg-gray-900" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Inactivity threshold
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    hours === h
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving} size="sm">
            {saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
