"use client";

// Hawkeye Sterling — Hit Triage Panel.
//
// World-Check-One-style case-manager: shows every match across local
// watchlist, OpenSanctions, country sanctions, registries, and country
// registries in one triage table. Filter sidebar lets the operator
// narrow by type, citizenship, etc. Click a row to expand identity
// detail. Resolution buttons (Positive / Possible / False / Unspecified)
// post to /api/screening/resolve which writes to audit and — for
// Positive — auto-creates the ongoing-monitoring task.

import { useMemo, useState } from "react";

export interface TriageHit {
  id: string;                       // unique within this screening
  source: string;                    // "qa-namlc" | "opensanctions" | "ofac-sdn" | etc.
  sourceList: string;                // human-readable list name
  name: string;                      // matched candidate name
  matchedAlias?: string;
  matchStrength: number;             // 0..100
  type?: "LE" | "PEP" | "OB" | "SIC" | "MIL" | "TER" | "OTHER";
  gender?: "Male" | "Female" | "Unspecified";
  dob?: string;
  placeOfBirth?: string;
  citizenship?: string;
  countryLocation?: string;
  category?: string;
  programs?: string[];
  listRef?: string;
  enteredDate?: string;
  url?: string;
}

export type Resolution = "positive" | "possible" | "false" | "unspecified";

interface Props {
  subjectId: string;
  subjectName: string;
  hits: TriageHit[];
  resolutions?: Record<string, Resolution>;
  onResolve?: (hitId: string, resolution: Resolution, reason?: string) => Promise<void>;
  /** True when the API expanded the hit caps because the subject name
   *  was detected as common (Mohamed Ali, John Smith, etc.). Triggers
   *  the "common-name expansion" banner above the table. */
  commonNameExpansion?: boolean;
}

const TYPE_STYLE: Record<string, string> = {
  LE: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  PEP: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  OB: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  SIC: "bg-red-500/20 text-red-300 border-red-500/40",
  MIL: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  TER: "bg-red-500/20 text-red-300 border-red-500/40",
  OTHER: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
};

const RESOLUTION_STYLE: Record<Resolution, string> = {
  positive: "bg-red-500/15 text-red-300 border-red-500/40",
  possible: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  false: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  unspecified: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const RESOLUTION_LABEL: Record<Resolution, string> = {
  positive: "Positive — Same person",
  possible: "Possible — Needs review",
  false: "False — Different person",
  unspecified: "Unresolved",
};

type ResolutionTab = "unresolved" | Resolution;

export function HitTriagePanel({ subjectId, subjectName, hits, resolutions = {}, onResolve, commonNameExpansion }: Props): React.ReactElement {
  const [activeTab, setActiveTab] = useState<ResolutionTab>("unresolved");
  const [expandedHitId, setExpandedHitId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | "all">("all");
  const [filterCitizenship, setFilterCitizenship] = useState<string | "all">("all");
  const [filterMinStrength, setFilterMinStrength] = useState<number>(0);
  const [resolveReason, setResolveReason] = useState<Record<string, string>>({});
  const [busyHitId, setBusyHitId] = useState<string | null>(null);
  const [page, setPage] = useState<number>(0);
  const PAGE_SIZE = 50;

  // Bucket counts
  const bucketCounts: Record<ResolutionTab, number> = useMemo(() => {
    const counts: Record<ResolutionTab, number> = { unresolved: 0, positive: 0, possible: 0, false: 0, unspecified: 0 };
    for (const h of hits) {
      const r = resolutions[h.id];
      if (!r || r === "unspecified") {
        counts.unresolved += 1;
        counts.unspecified += 1;
      } else {
        counts[r] += 1;
      }
    }
    return counts;
  }, [hits, resolutions]);

  // Filter sidebar values (computed from hits)
  const allTypes = useMemo(
    () => Array.from(new Set(hits.map((h) => h.type ?? "OTHER"))).sort(),
    [hits],
  );
  const allCitizenships = useMemo(
    () => Array.from(new Set(hits.map((h) => h.citizenship).filter(Boolean) as string[])).sort(),
    [hits],
  );

  const filteredHits = useMemo(() => {
    return hits.filter((h) => {
      // Tab filter
      const r = resolutions[h.id] ?? "unspecified";
      if (activeTab === "unresolved" && r !== "unspecified") return false;
      if (activeTab !== "unresolved" && r !== activeTab) return false;
      // Sidebar filters
      if (filterType !== "all" && (h.type ?? "OTHER") !== filterType) return false;
      if (filterCitizenship !== "all" && h.citizenship !== filterCitizenship) return false;
      if (h.matchStrength < filterMinStrength) return false;
      return true;
    });
  }, [hits, resolutions, activeTab, filterType, filterCitizenship, filterMinStrength]);

  const totalPages = Math.max(1, Math.ceil(filteredHits.length / PAGE_SIZE));
  const pagedHits = useMemo(
    () => filteredHits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredHits, page],
  );
  // Reset page on filter change
  useMemo(() => { setPage(0); }, [activeTab, filterType, filterCitizenship, filterMinStrength]);

  async function handleResolve(hitId: string, resolution: Resolution) {
    if (!onResolve) return;
    setBusyHitId(hitId);
    try {
      await onResolve(hitId, resolution, resolveReason[hitId]);
    } finally {
      setBusyHitId(null);
    }
  }

  if (hits.length === 0) {
    return (
      <section className="mt-4 rounded-lg border border-white/10 bg-bg-2 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-2 mb-2">Hit triage</h3>
        <p className="text-12 text-ink-3">No watchlist matches to triage. Subject screened against all configured corpora with zero positive hits.</p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-bg-2">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
            Hit triage · <span className="text-ink-1">{hits.length}</span> matches for {subjectName}
          </h3>
          <p className="text-11 text-ink-3 mt-0.5">
            Review each match against the subject's identity. Mark <strong className="text-red-300">Positive</strong> to auto-add to ongoing monitoring, <strong className="text-emerald-300">False</strong> to dismiss, <strong className="text-amber-300">Possible</strong> for MLRO review.
          </p>
        </div>
        <div className="text-11 text-ink-3 font-mono">case#{subjectId}</div>
      </header>

      {/* Common-name expansion banner */}
      {commonNameExpansion && (
        <div className="mx-4 mt-3 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2">
          <div className="text-10 uppercase tracking-wide text-amber-300 font-bold mb-0.5">
            ⚠️ Common name detected — expanded match population
          </div>
          <p className="text-11 text-ink-2">
            Subject is a common name; hit caps were lifted to surface every name-similar candidate
            ({hits.length} total). Use the filter sidebar to narrow by citizenship / type / strength,
            then triage each match individually. World-Check displays the same number; we now match it.
          </p>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex items-center gap-1 px-3 pt-2 border-b border-white/5">
        {(["unresolved", "positive", "possible", "false"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-11 px-3 py-1.5 border-b-2 transition-colors ${
              activeTab === tab
                ? "border-pink-500 text-ink-1 font-semibold"
                : "border-transparent text-ink-3 hover:text-ink-1"
            }`}
          >
            {tab === "unresolved" ? "Unresolved" : RESOLUTION_LABEL[tab]} ({bucketCounts[tab]})
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-0">
        {/* Filter sidebar */}
        <aside className="border-r border-white/5 p-3 space-y-3">
          <div>
            <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Type</div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full text-11 bg-bg-1 border border-white/10 rounded px-2 py-1 text-ink-2"
            >
              <option value="all">All ({hits.length})</option>
              {allTypes.map((t) => (
                <option key={t} value={t}>{t} ({hits.filter((h) => (h.type ?? "OTHER") === t).length})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Citizenship</div>
            <select
              value={filterCitizenship}
              onChange={(e) => setFilterCitizenship(e.target.value)}
              className="w-full text-11 bg-bg-1 border border-white/10 rounded px-2 py-1 text-ink-2"
            >
              <option value="all">All</option>
              {allCitizenships.map((c) => (
                <option key={c} value={c}>{c} ({hits.filter((h) => h.citizenship === c).length})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Min match strength</div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={filterMinStrength}
              onChange={(e) => setFilterMinStrength(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-11 text-ink-3 mt-0.5">≥ {filterMinStrength}%</div>
          </div>
          <button
            onClick={() => { setFilterType("all"); setFilterCitizenship("all"); setFilterMinStrength(0); }}
            className="w-full text-11 px-2 py-1 bg-bg-1 border border-white/10 rounded text-ink-2 hover:border-white/30"
          >
            Reset filters
          </button>
        </aside>

        {/* Hit table */}
        <div className="overflow-x-auto">
          <table className="w-full text-12">
            <thead className="text-10 uppercase text-ink-3 bg-bg-1/40 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-right px-3 py-2">Strength</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">DOB</th>
                <th className="text-left px-3 py-2">Citizenship</th>
                <th className="text-left px-3 py-2">Programs</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedHits.map((h) => {
                const r = resolutions[h.id] ?? "unspecified";
                const expanded = expandedHitId === h.id;
                return (
                  <>
                    <tr
                      key={h.id}
                      className="border-t border-white/5 hover:bg-bg-1/30 cursor-pointer"
                      onClick={() => setExpandedHitId(expanded ? null : h.id)}
                    >
                      <td className="px-3 py-2 text-ink-1 font-medium">
                        {h.name}
                        {h.matchedAlias && <div className="text-11 text-ink-3 font-mono">↳ {h.matchedAlias}</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-3 text-11">{h.source}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-bg-1 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                h.matchStrength >= 80 ? "bg-red-500" :
                                h.matchStrength >= 60 ? "bg-amber-500" :
                                "bg-sky-500"
                              }`}
                              style={{ width: `${h.matchStrength}%` }}
                            />
                          </div>
                          <span className="text-11 text-ink-2 font-mono">{h.matchStrength}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {h.type && (
                          <span className={`text-10 font-bold uppercase px-1.5 py-0.5 rounded border ${TYPE_STYLE[h.type] ?? TYPE_STYLE.OTHER}`}>
                            {h.type}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-3">{h.dob ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-3">{h.citizenship ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-3 text-11">{h.programs?.join(", ") ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`text-10 font-bold uppercase px-1.5 py-0.5 rounded border ${RESOLUTION_STYLE[r]}`}>
                          {r === "unspecified" ? "Unresolved" : r}
                        </span>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${h.id}-detail`} className="border-t border-white/5 bg-bg-1/30">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Comparison data */}
                            <div>
                              <div className="text-10 uppercase tracking-wide text-ink-3 mb-2">Comparison data</div>
                              <table className="w-full text-11">
                                <thead className="text-10 text-ink-3">
                                  <tr>
                                    <th className="text-left py-1">Field</th>
                                    <th className="text-left py-1">Subject</th>
                                    <th className="text-left py-1">Matched</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="py-1 text-ink-3">Name</td>
                                    <td className="py-1 text-ink-2">{subjectName}</td>
                                    <td className="py-1 text-ink-2">{h.name}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 text-ink-3">DOB</td>
                                    <td className="py-1 text-ink-2">—</td>
                                    <td className="py-1 text-ink-2">{h.dob ?? "—"}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 text-ink-3">Citizenship</td>
                                    <td className="py-1 text-ink-2">—</td>
                                    <td className="py-1 text-ink-2">{h.citizenship ?? "—"}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 text-ink-3">Place of birth</td>
                                    <td className="py-1 text-ink-2">—</td>
                                    <td className="py-1 text-ink-2">{h.placeOfBirth ?? "—"}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <p className="text-10 text-amber-300 mt-2">
                                ⚠️ Subject record has no DOB / citizenship / passport. Add identifiers in subject profile to enable automatic disambiguation.
                              </p>
                            </div>

                            {/* Record details */}
                            <div>
                              <div className="text-10 uppercase tracking-wide text-ink-3 mb-2">Record details</div>
                              <dl className="text-11 grid grid-cols-[110px_1fr] gap-y-1">
                                <dt className="text-ink-3">Source list</dt>
                                <dd className="text-ink-2 font-mono">{h.sourceList}</dd>
                                <dt className="text-ink-3">List ref</dt>
                                <dd className="text-ink-2 font-mono">{h.listRef ?? "—"}</dd>
                                <dt className="text-ink-3">Category</dt>
                                <dd className="text-ink-2">{h.category ?? "—"}</dd>
                                <dt className="text-ink-3">Country</dt>
                                <dd className="text-ink-2">{h.countryLocation ?? "—"}</dd>
                                <dt className="text-ink-3">Entered</dt>
                                <dd className="text-ink-2">{h.enteredDate ?? "—"}</dd>
                                {h.url && (
                                  <>
                                    <dt className="text-ink-3">Source URL</dt>
                                    <dd>
                                      <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">
                                        Open ↗
                                      </a>
                                    </dd>
                                  </>
                                )}
                              </dl>
                            </div>
                          </div>

                          {/* Resolution actions */}
                          <div className="mt-3 pt-3 border-t border-white/5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="text"
                                placeholder="Optional reason / note for the audit trail…"
                                value={resolveReason[h.id] ?? ""}
                                onChange={(e) => setResolveReason((p) => ({ ...p, [h.id]: e.target.value }))}
                                className="flex-1 min-w-[200px] text-11 bg-bg-1 border border-white/10 rounded px-2 py-1 text-ink-2"
                              />
                              <button
                                onClick={() => handleResolve(h.id, "positive")}
                                disabled={busyHitId === h.id}
                                className="text-11 px-3 py-1 rounded border bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25 disabled:opacity-50"
                              >
                                Positive — same person
                              </button>
                              <button
                                onClick={() => handleResolve(h.id, "possible")}
                                disabled={busyHitId === h.id}
                                className="text-11 px-3 py-1 rounded border bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 disabled:opacity-50"
                              >
                                Possible — needs review
                              </button>
                              <button
                                onClick={() => handleResolve(h.id, "false")}
                                disabled={busyHitId === h.id}
                                className="text-11 px-3 py-1 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-50"
                              >
                                False — different person
                              </button>
                            </div>
                            <p className="text-10 text-ink-3 mt-1.5">
                              <strong>Positive</strong> auto-creates an ongoing-monitoring task in Asana and locks this match into the audit trail. <strong>False</strong> documents the disambiguation rationale (FATF R.10 / FDL Art.19).
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filteredHits.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-ink-3 py-6 text-11">
                    No matches in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Pagination footer */}
          {filteredHits.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-white/5 bg-bg-1/30">
              <div className="text-11 text-ink-3">
                Showing <span className="text-ink-2 font-mono">{page * PAGE_SIZE + 1}</span>–
                <span className="text-ink-2 font-mono">{Math.min((page + 1) * PAGE_SIZE, filteredHits.length)}</span>{" "}
                of <span className="text-ink-2 font-mono">{filteredHits.length}</span> filtered ·{" "}
                <span className="text-ink-3">{hits.length} total</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-11 px-2 py-1 rounded border border-white/10 text-ink-2 hover:border-white/30 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="text-11 text-ink-3 px-2">
                  Page <span className="text-ink-2 font-mono">{page + 1}</span> / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-11 px-2 py-1 rounded border border-white/10 text-ink-2 hover:border-white/30 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
