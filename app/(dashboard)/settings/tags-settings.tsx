"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";

interface TagDef {
  id: string;
  name: string;
  color: string | null;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6",
  "#ec4899", "#6b7280",
];

export function TagsSettings() {
  const [tags, setTags] = useState<TagDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveEdit(id: string) {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTags((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(id: string) {
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (res.ok) setTags((prev) => prev.filter((t) => t.id !== id));
  }

  async function addTag() {
    if (!newName.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (res.ok) {
        const tag = await res.json();
        setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
        setNewName("");
        setNewColor(null);
        setAddOpen(false);
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Tags</h3>
          <p className="text-xs text-gray-400 mt-0.5">Available tags for categorizing conversations</p>
        </div>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New tag
        </button>
      </div>

      {/* Add new tag form */}
      {addOpen && (
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
          <div className="flex gap-1.5 shrink-0">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c === newColor ? null : c)}
                className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c, outline: newColor === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
              />
            ))}
          </div>
          <input
            autoFocus
            placeholder="Tag name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTag(); if (e.key === "Escape") setAddOpen(false); }}
            className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 placeholder:text-gray-300"
          />
          <button
            onClick={addTag}
            disabled={!newName.trim() || adding}
            className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors shrink-0"
          >
            {adding ? "Adding…" : "Add"}
          </button>
          <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="divide-y divide-gray-50">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
              <div className="w-4 h-4 rounded-full bg-gray-100" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : tags.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">No tags yet. Add one above.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-3 px-5 py-3 group">
              {editingId === tag.id ? (
                <>
                  <div className="flex gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c === editColor ? null : c)}
                        className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-110"
                        style={{ backgroundColor: c, outline: editColor === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
                      />
                    ))}
                  </div>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(tag.id); if (e.key === "Escape") setEditingId(null); }}
                    className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-2.5 py-1 outline-none focus:border-gray-400"
                  />
                  <button
                    onClick={() => saveEdit(tag.id)}
                    disabled={saving || !editName.trim()}
                    className="text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color ?? "#d1d5db" }}
                  />
                  <button
                    onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); }}
                    className="flex-1 text-sm text-gray-700 text-left hover:text-gray-900 transition-colors"
                  >
                    {tag.name}
                  </button>
                  <button
                    onClick={() => deleteTag(tag.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
