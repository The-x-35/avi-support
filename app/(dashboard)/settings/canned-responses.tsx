"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";

interface CannedResponse {
  id: string;
  title: string;
  content: string;
}

export function CannedResponsesSettings() {
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/canned-responses")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  async function add() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/canned-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems((p) => [...p, item]);
        setNewTitle(""); setNewContent(""); setAddOpen(false);
      }
    } finally { setSaving(false); }
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim() || !editContent.trim()) return;
    setEditSaving(true);
    try {
      await fetch(`/api/canned-responses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim() }),
      });
      setItems((p) => p.map((item) => item.id === id ? { ...item, title: editTitle.trim(), content: editContent.trim() } : item));
      setEditingId(null);
    } finally { setEditSaving(false); }
  }

  async function remove(id: string) {
    setRemovingId(id);
    try {
      setItems((p) => p.filter((item) => item.id !== id));
      await fetch(`/api/canned-responses/${id}`, { method: "DELETE" });
    } finally { setRemovingId(null); }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Quick Replies</h3>
          <p className="text-xs text-gray-400 mt-0.5">Pre-written messages available in every conversation</p>
        </div>
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      {/* Add form */}
      {addOpen && (
        <div className="px-5 py-4 border-b border-gray-50 bg-gray-50 space-y-2">
          <input
            autoFocus
            placeholder="Title (e.g. Greeting)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gray-400 placeholder:text-gray-300"
          />
          <textarea
            placeholder="Message content…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gray-400 placeholder:text-gray-300 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={saving || !newTitle.trim() || !newContent.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setAddOpen(false); setNewTitle(""); setNewContent(""); }} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-5 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="h-3.5 w-24 bg-gray-100 rounded" />
              <div className="h-2.5 w-48 bg-gray-50 rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 && !addOpen ? (
        <div className="px-5 py-6 text-xs text-gray-400 text-center">No quick replies yet. Add one above.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((item) => (
            <div key={item.id} className="px-5 py-3.5 group">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-gray-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(item.id)} disabled={editSaving} className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40">
                      {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={editSaving} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap">{item.content}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => { setEditingId(item.id); setEditTitle(item.title); setEditContent(item.content); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => remove(item.id)}
                      disabled={removingId === item.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {removingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
