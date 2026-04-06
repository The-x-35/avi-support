"use client";

import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Plus, X, Pencil, Check } from "lucide-react";

interface AgentBasic {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

interface TeamMember {
  id: string;
  agentId: string;
  agent: AgentBasic;
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
}

export function TeamsSettings({ agents }: { agents: AgentBasic[] }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  async function createTeam() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
      const team = await r.json();
      setTeams((prev) => [...prev, team]);
      setNewName("");
    } finally { setCreating(false); }
  }

  async function renameTeam(id: string) {
    if (!renameVal.trim() || renameSaving) return;
    setRenameSaving(true);
    try {
      const r = await fetch(`/api/teams/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameVal.trim() }) });
      const updated = await r.json();
      setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name: updated.name } : t)));
      setRenamingId(null);
    } finally { setRenameSaving(false); }
  }

  async function deleteTeam(id: string) {
    await fetch(`/api/teams/${id}`, { method: "DELETE" });
    setTeams((prev) => prev.filter((t) => t.id !== id));
  }

  async function addMember(teamId: string, agentId: string) {
    const r = await fetch(`/api/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId }) });
    const member = await r.json();
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, members: [...t.members, member] } : t)));
    setAddingMemberTo(null);
  }

  async function removeMember(teamId: string, agentId: string) {
    await fetch(`/api/teams/${teamId}/members?agentId=${agentId}`, { method: "DELETE" });
    setTeams((prev) => prev.map((t) => t.id === teamId ? { ...t, members: t.members.filter((m) => m.agentId !== agentId) } : t));
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Escalation Teams</p>
      </div>

      {/* Create team */}
      <div className="px-5 py-4 border-b border-gray-50 flex gap-2">
        <input
          placeholder="New team name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createTeam()}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
        />
        <button
          onClick={createTeam}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors shrink-0"
        >
          <Plus className="w-3 h-3" />
          {creating ? "Creating…" : "Create"}
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-4 space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />)}
        </div>
      ) : teams.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">No teams yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {teams.map((team) => {
            const memberIds = new Set(team.members.map((m) => m.agentId));
            const addableAgents = agents.filter((a) => !memberIds.has(a.id));
            return (
              <div key={team.id} className="px-5 py-4">
                {/* Team header */}
                <div className="flex items-center gap-2 mb-3">
                  {renamingId === team.id ? (
                    <>
                      <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renameTeam(team.id); if (e.key === "Escape") setRenamingId(null); }}
                        className="flex-1 text-sm font-semibold border border-gray-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-gray-500" />
                      <button onClick={() => renameTeam(team.id)} disabled={renameSaving} className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setRenamingId(null)} className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 text-sm font-semibold text-gray-800">{team.name}</p>
                      <button onClick={() => { setRenamingId(team.id); setRenameVal(team.name); }} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteTeam(team.id)} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>

                {/* Members */}
                <div className="space-y-2 pl-1">
                  {team.members.length === 0 && <p className="text-xs text-gray-300 italic">No members</p>}
                  {team.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 group">
                      <Avatar name={m.agent.name} src={m.agent.avatarUrl} size="xs" />
                      <span className="text-xs font-medium text-gray-700 flex-1">{m.agent.name}</span>
                      <span className="text-[11px] text-gray-400">{m.agent.email}</span>
                      <button onClick={() => removeMember(team.id, m.agentId)} className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 rounded transition-all">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add member */}
                  <div className="relative">
                    {addingMemberTo === team.id ? (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setAddingMemberTo(null)} />
                        <div className="relative z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-64">
                          <div className="max-h-40 overflow-y-auto py-1">
                            {addableAgents.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-gray-400">All agents already added</p>
                            ) : (
                              addableAgents.map((a) => (
                                <button key={a.id} onClick={() => addMember(team.id, a.id)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left">
                                  <Avatar name={a.name} src={a.avatarUrl} size="xs" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-gray-800">{a.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">{a.email}</p>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                          <div className="px-3 py-1.5 border-t border-gray-100">
                            <button onClick={() => setAddingMemberTo(null)} className="text-[11px] text-gray-400 hover:text-gray-600">Close</button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setAddingMemberTo(team.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
                        <Plus className="w-3 h-3" />
                        Add member
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
