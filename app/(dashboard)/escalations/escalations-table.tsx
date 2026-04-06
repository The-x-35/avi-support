"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime, categoryLabel } from "@/lib/utils/format";
import {
  Search, X, ChevronDown, ChevronUp, ChevronsUpDown,
  Calendar, SlidersHorizontal, RotateCcw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EscalationRow {
  id: string;
  title: string;
  status: string;
  categories: string[];
  tagIds: string[];
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string } | null;
  conversation: {
    id: number;
    status: string;
    categories: string[];
    user: { id: string; name: string | null; email: string | null; avatarUrl: string | null; externalId: string };
  };
}

interface PageData {
  escalations: EscalationRow[];
  total: number;
  page: number;
  pages: number;
}

interface Team { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = [
  { value: "OPEN",        label: "Open",        color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "IN_PROGRESS", label: "In Progress",  color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "RESOLVED",    label: "Resolved",     color: "bg-green-50 text-green-700 border-green-200" },
  { value: "CLOSED",      label: "Closed",       color: "bg-gray-100 text-gray-500 border-gray-200" },
];

const CATEGORIES = ["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"];

const SORT_OPTIONS = [
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
  { value: "dueDate",   label: "Due date" },
  { value: "title",     label: "Title" },
  { value: "status",    label: "Status" },
];

const statusColor = (s: string) =>
  STATUSES.find((x) => x.value === s)?.color ?? "bg-gray-100 text-gray-500 border-gray-200";
const statusLabel = (s: string) =>
  STATUSES.find((x) => x.value === s)?.label ?? s;

// ─── Filter state ─────────────────────────────────────────────────────────────
interface Filters {
  q: string;
  status: string[];
  category: string[];
  teamId: string[];
  dueBefore: string;
  dueAfter: string;
  hasNotes: string;    // ""|"true"|"false"
  hasDue: string;      // ""|"true"|"false"
  sort: string;
  dir: "asc" | "desc";
  page: number;
}

const DEFAULT: Filters = {
  q: "", status: [], category: [], teamId: [],
  dueBefore: "", dueAfter: "", hasNotes: "", hasDue: "",
  sort: "createdAt", dir: "desc", page: 1,
};

function buildQS(f: Filters) {
  const p = new URLSearchParams();
  if (f.q)          p.set("q", f.q);
  f.status.forEach((s)   => p.append("status", s));
  f.category.forEach((c) => p.append("category", c));
  f.teamId.forEach((t)   => p.append("teamId", t));
  if (f.dueBefore)  p.set("dueBefore", f.dueBefore);
  if (f.dueAfter)   p.set("dueAfter", f.dueAfter);
  if (f.hasNotes)   p.set("hasNotes", f.hasNotes);
  if (f.hasDue)     p.set("hasDue", f.hasDue);
  p.set("sort", f.sort);
  p.set("dir", f.dir);
  p.set("page", String(f.page));
  p.set("limit", "50");
  return p.toString();
}

function activeFilterCount(f: Filters) {
  return (
    (f.q ? 1 : 0) +
    f.status.length +
    f.category.length +
    f.teamId.length +
    (f.dueBefore ? 1 : 0) +
    (f.dueAfter ? 1 : 0) +
    (f.hasNotes ? 1 : 0) +
    (f.hasDue ? 1 : 0)
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MultiChip({
  label, values, options, onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
          values.length > 0
            ? "bg-gray-900 text-white border-gray-900"
            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
        )}
      >
        {label}
        {values.length > 0 && <span className="bg-white/20 text-white text-[10px] rounded px-1">{values.length}</span>}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 left-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
            {options.map((o) => {
              const on = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-gray-900 border-gray-900" : "border-gray-300"}`}>
                    {on && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SortButton({ field, label, current, dir, onClick }: {
  field: string; label: string; current: string; dir: "asc" | "desc"; onClick: () => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={onClick}
      className={cn("flex items-center gap-1 text-xs font-medium transition-colors", active ? "text-gray-900" : "text-gray-400 hover:text-gray-600")}
    >
      {label}
      {active ? (dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EscalationsTable() {
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Load teams once
  useEffect(() => {
    fetch("/api/teams").then((r) => r.json()).then((d) => setTeams(Array.isArray(d) ? d : []));
  }, []);

  const load = useCallback((f: Filters) => {
    setLoading(true);
    fetch(`/api/escalations?${buildQS(f)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(filters); }, [filters, load]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

  function toggleSort(field: string) {
    setFilters((f) => ({
      ...f,
      sort: field,
      dir: f.sort === field && f.dir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }

  function reset() { setFilters(DEFAULT); }

  const active = activeFilterCount(filters);
  const escalations = data?.escalations ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Filter bar ── */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-100 bg-white space-y-3">
        {/* Row 1: search + toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Search title…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 w-52"
            />
            {filters.q && (
              <button onClick={() => set("q", "")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status */}
          <MultiChip
            label="Status"
            values={filters.status}
            options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => set("status", v)}
          />

          {/* Category */}
          <MultiChip
            label="Category"
            values={filters.category}
            options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
            onChange={(v) => set("category", v)}
          />

          {/* Team */}
          {teams.length > 0 && (
            <MultiChip
              label="Team"
              values={filters.teamId}
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => set("teamId", v)}
            />
          )}

          {/* More filters toggle */}
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              filtersOpen ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            More
          </button>

          {active > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              Clear ({active})
            </button>
          )}

          {/* Sort */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {SORT_OPTIONS.map((o) => (
              <SortButton key={o.value} field={o.value} label={o.label} current={filters.sort} dir={filters.dir} onClick={() => toggleSort(o.value)} />
            ))}
          </div>
        </div>

        {/* Row 2: expanded filters */}
        {filtersOpen && (
          <div className="flex items-center gap-4 flex-wrap pb-1">
            {/* Due before */}
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <label className="text-xs text-gray-500 shrink-0">Due before</label>
              <input type="date" value={filters.dueBefore} onChange={(e) => set("dueBefore", e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-gray-400" />
              {filters.dueBefore && <button onClick={() => set("dueBefore", "")} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
            </div>

            {/* Due after */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Due after</label>
              <input type="date" value={filters.dueAfter} onChange={(e) => set("dueAfter", e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-gray-400" />
              {filters.dueAfter && <button onClick={() => set("dueAfter", "")} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
            </div>

            {/* Has notes */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Notes</label>
              <select value={filters.hasNotes} onChange={(e) => set("hasNotes", e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-gray-400 appearance-none">
                <option value="">Any</option>
                <option value="true">Has notes</option>
                <option value="false">No notes</option>
              </select>
            </div>

            {/* Has due date */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Due date</label>
              <select value={filters.hasDue} onChange={(e) => set("hasDue", e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-gray-400 appearance-none">
                <option value="">Any</option>
                <option value="true">Has due date</option>
                <option value="false">No due date</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading && escalations.length === 0 ? (
          <div className="p-6 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-white border border-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : escalations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <p className="text-sm text-gray-500 font-medium">No escalations found</p>
            {active > 0 && (
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-white border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-[35%]">Title</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Team</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Due</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className={cn("transition-opacity", loading && "opacity-50")}>
              {escalations.map((esc) => {
                const isOverdue = esc.dueDate && new Date(esc.dueDate) < new Date() && esc.status !== "RESOLVED" && esc.status !== "CLOSED";
                return (
                  <tr key={esc.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    {/* Title + conversation link */}
                    <td className="px-6 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{esc.title}</p>
                        <Link
                          href={`/conversations/${esc.conversation.id}`}
                          className="text-[11px] text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          #{esc.conversation.id}
                        </Link>
                        {esc.notes && (
                          <p className="text-[11px] text-gray-400 truncate max-w-xs">{esc.notes}</p>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(esc.status)}`}>
                        {statusLabel(esc.status)}
                      </span>
                    </td>

                    {/* Team */}
                    <td className="px-4 py-3.5">
                      {esc.team ? (
                        <span className="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{esc.team.name}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Categories */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {esc.categories.length > 0
                          ? esc.categories.map((c) => (
                              <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                                {categoryLabel(c)}
                              </span>
                            ))
                          : <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3.5">
                      <Link href={`/users/${esc.conversation.user.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <Avatar
                          name={esc.conversation.user.name ?? esc.conversation.user.externalId}
                          src={esc.conversation.user.avatarUrl}
                          size="xs"
                        />
                        <span className="text-xs text-gray-700 truncate max-w-[120px]">
                          {esc.conversation.user.name ?? esc.conversation.user.email ?? esc.conversation.user.externalId}
                        </span>
                      </Link>
                    </td>

                    {/* Due date */}
                    <td className="px-4 py-3.5">
                      {esc.dueDate ? (
                        <span className={cn("text-xs font-medium", isOverdue ? "text-red-500" : "text-gray-600")}>
                          {new Date(esc.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          {isOverdue && <span className="ml-1 text-[10px]">overdue</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-gray-400">{formatRelativeTime(esc.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {data && data.pages > 1 && (
        <div className="shrink-0 px-6 py-3 border-t border-gray-100 bg-white flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {((data.page - 1) * 50) + 1}–{Math.min(data.page * 50, data.total)} of <span className="font-medium text-gray-600">{data.total}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => set("page", filters.page - 1)}
              disabled={filters.page <= 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
              const p = data.pages <= 7 ? i + 1 : (data.page <= 4 ? i + 1 : data.page - 3 + i);
              if (p < 1 || p > data.pages) return null;
              return (
                <button
                  key={p}
                  onClick={() => set("page", p)}
                  className={cn(
                    "w-7 h-7 text-xs font-medium rounded-lg transition-colors",
                    p === data.page ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => set("page", filters.page + 1)}
              disabled={filters.page >= data.pages}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Total count when no pagination */}
      {data && data.pages <= 1 && data.total > 0 && (
        <div className="shrink-0 px-6 py-2.5 border-t border-gray-100 bg-white">
          <p className="text-xs text-gray-400">{data.total} escalation{data.total !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}
