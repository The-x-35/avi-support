"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface QueueSettingsProps {
  initialQueueMessage: string;
  initialTicketMessage: string;
  initialTimeoutMinutes: number;
}

export function QueueSettings({
  initialQueueMessage,
  initialTicketMessage,
  initialTimeoutMinutes,
}: QueueSettingsProps) {
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
      body: JSON.stringify({
        queueMessage,
        ticketMessage,
        queueTimeoutMinutes: timeoutMinutes,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Queue Settings</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Messages shown to users when all agents are at capacity.
        </p>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Queue message
          </label>
          <p className="text-[11px] text-gray-400 mb-1.5">
            Shown immediately when no agent has capacity.
          </p>
          <textarea
            value={queueMessage}
            onChange={(e) => setQueueMessage(e.target.value)}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Ticket message
          </label>
          <p className="text-[11px] text-gray-400 mb-1.5">
            Shown after queue timeout. Use <code className="bg-gray-100 px-1 rounded text-[10px]">{"{ticketId}"}</code> to insert the ticket reference.
          </p>
          <textarea
            value={ticketMessage}
            onChange={(e) => setTicketMessage(e.target.value)}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Queue timeout (minutes)
          </label>
          <p className="text-[11px] text-gray-400 mb-1.5">
            How long a user waits in queue before a ticket is auto-created.
          </p>
          <input
            type="number"
            min={1}
            max={60}
            value={timeoutMinutes}
            onChange={(e) => setTimeoutMinutes(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
            className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving} size="sm">
            {saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
