"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  maxConcurrentChats: number;
}

export function AdminPanel({ agents, currentAgentId }: { agents: Agent[]; currentAgentId: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [chatLimits, setChatLimits] = useState<Record<string, number>>(
    Object.fromEntries(agents.map((a) => [a.id, a.maxConcurrentChats]))
  );

  async function toggleRole(agent: Agent) {
    setLoading(agent.id);
    await fetch("/api/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agent.id, role: agent.role === "ADMIN" ? "AGENT" : "ADMIN" }),
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

  const others = agents.filter((a) => a.id !== currentAgentId);
  if (others.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Agent Controls</p>
      </div>
      <div className="divide-y divide-gray-50">
        {others.map((agent) => (
          <div key={agent.id} className="flex items-center gap-3 px-5 py-3.5">
            <Avatar name={agent.name} src={agent.avatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{agent.name}</p>
              <p className="text-xs text-gray-400 truncate">{agent.email}</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1">
                <span className="text-[11px] text-gray-400">Max</span>
                <input
                  type="number" min={1} max={100} value={chatLimits[agent.id] ?? 5}
                  onChange={(e) => setChatLimits((prev) => ({ ...prev, [agent.id]: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) }))}
                  className="w-8 text-xs text-center focus:outline-none"
                />
                <button onClick={() => saveChatLimit(agent.id)} disabled={loading === agent.id} className="text-[11px] text-blue-600 font-medium disabled:opacity-40 flex items-center gap-1">
                  {loading === agent.id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  Save
                </button>
              </div>
              <Badge variant={agent.role === "ADMIN" ? "info" : "default"}>{agent.role}</Badge>
              <button onClick={() => toggleRole(agent)} disabled={loading === agent.id} className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 transition-colors flex items-center gap-1">
                {loading === agent.id && <Loader2 className="w-3 h-3 animate-spin" />}
                {agent.role === "ADMIN" ? "Demote" : "Make Admin"}
              </button>
              <button onClick={() => deactivate(agent)} disabled={loading === agent.id} className="text-xs font-medium text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors flex items-center gap-1">
                {loading === agent.id && <Loader2 className="w-3 h-3 animate-spin" />}
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
