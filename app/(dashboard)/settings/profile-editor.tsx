"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Pencil } from "lucide-react";

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
    if (res.ok) {
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setName(initialName); setEditing(false); }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Profile</h3>
      </div>
      <div className="px-5 py-4 flex items-center gap-4">
        <Avatar name={name} src={avatarUrl} size="md" />
        <div className="flex-1 min-w-0 space-y-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 text-sm max-w-xs"
              />
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setName(initialName); setEditing(false); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">{name}</p>
              {saved && <Check className="w-3.5 h-3.5 text-emerald-500" />}
              <button
                onClick={() => setEditing(true)}
                className="text-gray-300 hover:text-gray-500 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400">{email}</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{role}</span>
      </div>
    </div>
  );
}
