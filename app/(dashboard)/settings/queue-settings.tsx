"use client";

import { useState } from "react";

interface QueueSettingsProps {
  initialQueueMessage: string;
  initialTicketMessage: string;
  initialTimeoutMinutes: number;
}

export function QueueSettings({ initialQueueMessage, initialTicketMessage, initialTimeoutMinutes }: QueueSettingsProps) {
  const [queueMessage, setQueueMessage] = useState(initialQueueMessage);
  const [ticketMessage, setTicketMessage] = useState(initialTicketMessage);
  const [timeoutMinutes, setTimeoutMinutes] = useState(initialTimeoutMinutes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueMessage, ticketMessage, queueTimeoutMinutes: timeoutMinutes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <div className="flex items-center justify-between py-4 border-b border-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-900">Queue timeout</p>
          <p className="text-xs text-gray-400 mt-0.5">Minutes before a ticket is auto-created</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number" min={1} max={60} value={timeoutMinutes}
            onChange={(e) => setTimeoutMinutes(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
            className="w-16 text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-400"
          />
          <span className="text-xs text-gray-400">min</span>
        </div>
      </div>

      <div className="py-4 border-b border-gray-50">
        <p className="text-sm font-medium text-gray-900 mb-0.5">Queue message</p>
        <p className="text-xs text-gray-400 mb-2">Shown when no agent has capacity</p>
        <textarea value={queueMessage} onChange={(e) => setQueueMessage(e.target.value)} rows={2}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-gray-400 text-gray-700" />
      </div>

      <div className="py-4 border-b border-gray-50">
        <p className="text-sm font-medium text-gray-900 mb-0.5">Ticket message</p>
        <p className="text-xs text-gray-400 mb-2">
          Shown after timeout. <code className="bg-gray-100 px-1 rounded text-[10px]">{"{ticketId}"}</code> inserts the reference.
        </p>
        <textarea value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} rows={2}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-gray-400 text-gray-700" />
      </div>

      <div className="flex justify-end py-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </>
  );
}
