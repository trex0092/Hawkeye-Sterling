"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import type { FilterKey, SavedSearch, SubjectStatus } from "@/lib/types";

interface Props {
  /** Currently active filter — used by the "Save current" button. */
  active: {
    query: string;
    filter: FilterKey;
    statusFilter: SubjectStatus | "all";
    minRisk?: number;
  };
  /** Apply a saved search's predicates to the page state. */
  onApply: (search: SavedSearch) => void;
  /** ID of the search currently rendered, if any (for highlight). */
  appliedId: string | null;
}

interface ListResponse { ok: boolean; searches?: SavedSearch[]; error?: string }
interface PostResponse { ok: boolean; search?: SavedSearch; error?: string }

// Saved searches as toolbar pills. Persisted via /api/saved-searches (Blob
// store) so the daily MLRO huddle sees the same set across browsers and
// machines. localStorage was a bad fit because it splits the team's view.
export function SavedSearchBar({ active, onApply, appliedId }: Props) {
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  const refresh = async () => {
    setLoading(true);
    const res = await fetchJson<ListResponse>("/api/saved-searches", {
      label: "Saved searches load failed",
      timeoutMs: 10_000,
    });
    setLoading(false);
    if (!res.ok || !res.data?.ok) {
      setError(res.error ?? "load failed");
      setSearches([]);
      return;
    }
    setError(null);
    setSearches(res.data.searches ?? []);
  };

  useEffect(() => { void refresh(); }, []);

  const save = async () => {
    if (!draftLabel.trim()) return;
    const body: Record<string, unknown> = { label: draftLabel.trim() };
    if (active.query.trim()) body.query = active.query.trim();
    if (active.filter !== "all") body.filter = active.filter;
    if (active.statusFilter !== "all") body.statusFilter = active.statusFilter;
    if (active.minRisk !== undefined && active.minRisk > 0) body.minRisk = active.minRisk;
    const res = await fetchJson<PostResponse>("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      label: "Save search failed",
    });
    if (!res.ok || !res.data?.ok) {
      setError(res.error ?? "save failed");
      return;
    }
    setDraftLabel("");
    setAdding(false);
    void refresh();
  };

  const remove = async (id: string) => {
    await fetchJson(`/api/saved-searches?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      label: "Delete search failed",
    });
    void refresh();
  };

  if (searches == null) {
    return (
      <div className="text-10 text-ink-3 py-1">{loading ? "Loading saved searches…" : ""}</div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-10 text-ink-3 uppercase tracking-wide-2 mr-1">Saved:</span>
      {searches.length === 0 && (
        <span className="text-10 text-ink-3 italic">none yet</span>
      )}
      {searches.map((s) => (
        <span
          key={s.id}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11 border ${
            appliedId === s.id
              ? "bg-brand-dim text-brand-deep border-brand"
              : "bg-bg-panel text-ink-1 border-hair-2 hover:border-hair-3"
          }`}
        >
          <button
            type="button"
            onClick={() => onApply(s)}
            className="font-medium"
            title={
              [s.query && `q: ${s.query}`, s.filter && `filter: ${s.filter}`, s.statusFilter && `status: ${s.statusFilter}`, s.minRisk != null && `minRisk: ${s.minRisk}`]
                .filter(Boolean).join(" · ") || s.label
            }
          >
            {s.label}
          </button>
          <button
            type="button"
            onClick={() => { void remove(s.id); }}
            className="text-ink-3 hover:text-red leading-none"
            aria-label={`Delete ${s.label}`}
            title="Delete"
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <div className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-bg-1 border border-brand">
          <input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setAdding(false); }}
            placeholder="search name"
            className="bg-transparent text-11 text-ink-0 px-1 py-0 border-none focus:outline-none w-28"
          />
          <button type="button" onClick={() => { void save(); }} className="text-11 text-brand font-semibold px-1">Save</button>
          <button type="button" onClick={() => { setAdding(false); setDraftLabel(""); }} className="text-11 text-ink-3 px-1">Cancel</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11 border border-dashed border-hair-2 text-ink-2 hover:text-ink-0 hover:border-brand"
          title="Save the current filter as a named search"
        >
          + Save current
        </button>
      )}
      {error && <span className="text-10 text-red ml-2">{error}</span>}
    </div>
  );
}
