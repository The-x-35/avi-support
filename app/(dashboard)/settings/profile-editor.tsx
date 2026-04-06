"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Check, Pencil, X } from "lucide-react";

interface Props {
  agentId: string;
  initialName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

export function ProfileEditor({ initialName, email, avatarUrl, role }: Props) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) { setEditing(false); return; }
    setSaving(true);
    const res = await fetch("/api/agents/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2000); }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Profile</p>
      </div>
      <div className="px-5 py-4 flex items-center gap-4">
        <Avatar name={name} src={avatarUrl} size="md" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") { setName(initialName); setEditing(false); }
                }}
                className="text-sm font-medium border border-gray-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-gray-500 w-48"
              />
              <button onClick={handleSave} disabled={saving} className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setName(initialName); setEditing(false); }} className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-gray-900">{name}</p>
              {saved && <Check className="w-3.5 h-3.5 text-emerald-500" />}
              <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-gray-500 transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{email}</p>
        </div>
        <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full shrink-0">{role}</span>
      </div>
    </div>
  );
}
