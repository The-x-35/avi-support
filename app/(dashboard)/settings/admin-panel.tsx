"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface Agent {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  maxConcurrentChats: number;
}

export function AdminPanel({
  agents,
  currentAgentId,
}: {
  agents: Agent[];
  currentAgentId: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [chatLimits, setChatLimits] = useState<Record<string, number>>(
    Object.fromEntries(agents.map((a) => [a.id, a.maxConcurrentChats]))
  );

  async function toggleRole(agent: Agent) {
    setLoading(agent.id);
    await fetch("/api/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: agent.id,
        role: agent.role === "ADMIN" ? "AGENT" : "ADMIN",
      }),
    });
    setLoading(null);
    window.location.reload();
  }

  async function deactivate(agent: Agent) {
    if (!confirm(`Deactivate ${agent.name}?`)) return;
    setLoading(agent.id);
    await fetch("/api/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agent.id, isActive: false }),
    });
    setLoading(null);
    window.location.reload();
  }

  async function saveChatLimit(agentId: string) {
    setLoading(agentId);
    await fetch("/api/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agentId, maxConcurrentChats: chatLimits[agentId] }),
    });
    setLoading(null);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Admin Controls</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {agents
          .filter((a: Agent) => a.id !== currentAgentId)
          .map((agent: Agent) => (
            <div key={agent.id} className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={agent.name} src={agent.avatarUrl} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                <p className="text-xs text-gray-400">{agent.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1.5">
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">Max chats</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={chatLimits[agent.id] ?? 5}
                    onChange={(e) =>
                      setChatLimits((prev) => ({
                        ...prev,
                        [agent.id]: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)),
                      }))
                    }
                    className="w-10 text-xs text-center focus:outline-none"
                  />
                  <button
                    onClick={() => saveChatLimit(agent.id)}
                    disabled={loading === agent.id}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleRole(agent)}
                  loading={loading === agent.id}
                >
                  {agent.role === "ADMIN" ? "Demote" : "Promote to Admin"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => deactivate(agent)}
                  loading={loading === agent.id}
                >
                  Deactivate
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
