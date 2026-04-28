"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { WorkbenchSidebar } from "@/components/workbench/WorkbenchSidebar";
import { WorkbenchToolbar } from "@/components/workbench/WorkbenchToolbar";
import { PresetsCard } from "@/components/workbench/PresetsCard";
import { ModeGrid } from "@/components/workbench/ModeGrid";
import { TaxonomyLibrary } from "@/components/workbench/TaxonomyLibrary";
import { CoveragePanel } from "@/components/workbench/CoveragePanel";
import {
  DEFAULT_SELECTED_MODE_IDS,
  FACULTY_FILTERS,
  MODES,
  PRESETS,
} from "@/lib/data/modes";
import type { FacultyFilterKey, ReasoningPreset } from "@/lib/types";
import {
  BrainConsole,
  BrainManifestPanel,
} from "@/components/brain/BrainComponents";

interface ScreenHit {
  listId: string;
  listRef: string;
  candidateName: string;
  score: number;
  method: string;
  programs?: string[];
}

interface BrainResult {
  ok: boolean;
  screen: {
    topScore: number;
    severity: string;
    hits: ScreenHit[];
    listsChecked?: number;
    candidatesChecked?: number;
    durationMs?: number;
  };
  pep: { tier: string; type: string; salience: number } | null;
  adverseMedia: Array<{ categoryId: string; keyword: string; offset: number }>;
  jurisdiction: {
    iso2: string;
    name: string;
    region: string;
    cahra: boolean;
    regimes: string[];
  } | null;
  redlines: { fired: Array<{ keyword: string; rule?: string }> };
  composite: { score: number; breakdown: Record<string, number> };
  adverseKeywordGroups: Array<{ group: string; label: string; count: number }>;
  typologies: { hits: Array<{ id: string; name: string; family: string; weight: number; snippet: string }>; compositeScore: number };
}

const SEVERITY_COLOUR: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high:     "bg-orange-100 text-orange-700 border-orange-300",
  medium:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  low:      "bg-green-100 text-green-700 border-green-300",
  clear:    "bg-emerald-50 text-emerald-700 border-emerald-300",
};

type TabKey = "screening" | "manifest";

const TABS: Array<{ id: TabKey; label: string; sub: string }> = [
  { id: "screening", label: "Screening", sub: "Pick modes · run super-brain" },
  { id: "manifest",  label: "Manifest",  sub: "Audit · catalogues · charter" },
];

export default function WorkbenchPage() {
  const [tab, setTab] = useState<TabKey>("screening");
  const [hypotheticalOpen, setHypotheticalOpen] = useState(false);

  const [activeFilter, setActiveFilter] = useState<FacultyFilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED_MODE_IDS),
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Subject screening state
  const [subjectName, setSubjectName] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [brainResult, setBrainResult] = useState<BrainResult | null>(null);
  const [brainError, setBrainError] = useState<string | null>(null);

  const [runResult, setRunResult] = useState<
    | null
    | {
        ranAt: string;
        modeCount: number;
        preset: string | null;
        modes: { id: string; name: string; faculty: string }[];
        taxonomyIds: string[];
      }
  >(null);

  const deferredQuery = useDeferredValue(query);

  const byFaculty = useMemo(() => {
    if (activeFilter === "all") return MODES;
    return MODES.filter((mode) => mode.faculty === activeFilter);
  }, [activeFilter]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return byFaculty;
    return byFaculty.filter(
      (mode) =>
        mode.id.toLowerCase().includes(q) ||
        mode.name.toLowerCase().includes(q) ||
        mode.faculty.includes(q),
    );
  }, [byFaculty, deferredQuery]);

  const activeCategoryLabel = useMemo(() => {
    const match = FACULTY_FILTERS.find((f) => f.key === activeFilter);
    return match?.label ?? "All";
  }, [activeFilter]);

  const totalInFaculty = useMemo(() => {
    const match = FACULTY_FILTERS.find((f) => f.key === activeFilter);
    return Number.parseInt(match?.count ?? "0", 10);
  }, [activeFilter]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActivePresetId(null);
  };

  const handlePreset = (preset: ReasoningPreset) => {
    setSelectedIds(new Set(preset.modeIds));
    setActivePresetId(preset.id);
  };

  const handleRun = async () => {
    const name = subjectName.trim();
    if (!name) return;

    setIsRunning(true);
    setBrainError(null);
    setBrainResult(null);

    const ids = Array.from(selectedIds);
    const selectedModes = MODES.filter((m) => ids.includes(m.id));
    const taxonomyIds = Array.from(
      new Set(selectedModes.flatMap((m) => m.taxonomyIds)),
    );
    setRunResult({
      ranAt: new Date().toISOString(),
      modeCount: ids.length,
      preset: activePresetId,
      modes: selectedModes.map((m) => ({
        id: m.id,
        name: m.name,
        faculty: m.faculty,
      })),
      taxonomyIds,
    });

    try {
      const res = await fetch("/api/super-brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: { name } }),
      });
      const data = (await res.json()) as BrainResult & { error?: string };
      if (!res.ok || !data.ok) {
        setBrainError(data.error ?? `HTTP ${res.status}`);
      } else {
        setBrainResult(data);
      }
    } catch (err) {
      setBrainError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsRunning(false);
      window.requestAnimationFrame(() => {
        document.getElementById("pipeline-run-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  const showFacultySidebar = tab === "screening";

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-54px)]"
        style={{ gridTemplateColumns: showFacultySidebar ? "220px 1fr" : "0px 1fr" }}
      >
        {showFacultySidebar ? (
          <WorkbenchSidebar
            filters={FACULTY_FILTERS}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        ) : (
          <div />
        )}

        <main className="px-10 py-8 overflow-y-auto">
          {/* Unified hero */}
          <div className="mb-6">
            <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
              MODULE 03 · WORKBENCH BRAIN
            </div>
            <h1 className="font-display font-normal text-48 tracking-tightest m-0 mb-2 text-ink-0">
              The full <em className="italic text-brand">arsenal.</em>
            </h1>
            <p className="max-w-[72ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
              <strong>One signed contract · 19 catalogues · every screening inherits it.</strong>{" "}
              Pick the reasoning modes you want to engage and screen a subject, or
              inspect the catalogues, charter directives and audit state of the brain
              itself. <span className="text-ink-3">Live reasoning is now available
              inline on every queued subject (Screening → subject row → Live reasoning
              tab) — or on a hypothetical via the button below.</span>
            </p>
          </div>

          {/* Tab strip */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-1 inline-flex gap-1 mb-6">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    "px-4 py-2 rounded-lg text-13 font-semibold transition-colors text-left " +
                    (active
                      ? "bg-brand text-white"
                      : "text-ink-1 hover:text-ink-0 hover:bg-bg-1")
                  }
                >
                  <div>{t.label}</div>
                  <div className={"text-10 font-mono uppercase tracking-wide-3 mt-0.5 " + (active ? "text-white/70" : "text-ink-3")}>
                    {t.sub}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── SCREENING TAB ───────────────────────────────────────────── */}
          {tab === "screening" && (
            <>
              {/* Subject name input */}
              <div className="flex items-center gap-3 mb-3 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg">
                <label className="text-11.5 font-semibold text-ink-2 whitespace-nowrap tracking-wide-3 uppercase">
                  Subject
                </label>
                <input
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && subjectName.trim() && !isRunning) {
                      void handleRun();
                    }
                  }}
                  placeholder="Full name to screen — e.g. Mohammed Al-Hassan, Владимир Путин, محمد"
                  className="flex-1 px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel"
                />
                {subjectName.trim() === "" && (
                  <span className="text-11 text-ink-3 whitespace-nowrap">
                    Required to run
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setHypotheticalOpen(true)}
                  className="text-11 font-mono uppercase tracking-wide-3 px-2.5 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand whitespace-nowrap"
                  title="Open the brain inspector on a synthetic subject — full reasoning chain rendered without enrolling in the screening queue"
                >
                  Run on hypothetical
                </button>
              </div>

              <WorkbenchToolbar
                query={query}
                onQueryChange={setQuery}
                selectedCount={selectedIds.size}
                categoryLabel={activeCategoryLabel}
                onRun={() => { void handleRun(); }}
                running={isRunning}
                subjectRequired={subjectName.trim() === ""}
              />
              <PresetsCard
                presets={PRESETS}
                onSelect={handlePreset}
                activePresetId={activePresetId}
              />
              <ModeGrid
                modes={filtered}
                selectedIds={selectedIds}
                onToggle={handleToggle}
                totalInFaculty={totalInFaculty}
              />
              <CoveragePanel selectedModeIds={selectedIds} />

              {/* Brain result + pipeline run panel */}
              {(brainResult || brainError || runResult) && (
                <div id="pipeline-run-result" className="my-6 space-y-4">
                  {brainError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-13 text-red-700">
                      <span className="font-semibold">Super-brain error:</span> {brainError}
                    </div>
                  )}
                  {brainResult && (
                    <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                      <div className="flex items-baseline justify-between mb-4">
                        <div>
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-1">
                            Super-brain screening
                          </div>
                          <div className="text-15 font-semibold text-ink-0">{subjectName}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-12 font-semibold uppercase tracking-wide-3 ${SEVERITY_COLOUR[brainResult.screen.severity] ?? ""}`}
                          >
                            {brainResult.screen.severity}
                          </span>
                          <span className="text-20 font-bold tabular-nums text-ink-0">
                            {brainResult.composite.score}
                            <span className="text-13 font-normal text-ink-2">/100</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => { setBrainResult(null); setBrainError(null); }}
                            className="ml-2 text-11 text-ink-3 hover:text-ink-0"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-4 text-11.5">
                        {Object.entries(brainResult.composite.breakdown).map(([k, v]) =>
                          v > 0 ? (
                            <div key={k} className="flex justify-between bg-bg-1 rounded px-2.5 py-1.5 border border-hair-1">
                              <span className="text-ink-2 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className="font-semibold text-ink-0">+{v}</span>
                            </div>
                          ) : null,
                        )}
                      </div>

                      {brainResult.screen.hits.length > 0 && (
                        <div className="mb-4">
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
                            Watchlist hits ({brainResult.screen.hits.length})
                          </div>
                          <div className="space-y-1.5">
                            {brainResult.screen.hits.slice(0, 10).map((h, i) => (
                              <div
                                key={h.candidateName ?? i}
                                className="flex items-baseline justify-between bg-bg-1 rounded px-3 py-1.5 border border-hair-1 text-12"
                              >
                                <div className="flex items-baseline gap-2">
                                  <span className="font-mono text-10 font-semibold uppercase text-ink-3">{h.listId}</span>
                                  <span className="text-ink-0">{h.candidateName}</span>
                                </div>
                                <span className="font-semibold text-ink-0">{Math.round(h.score * 100)}%</span>
                              </div>
                            ))}
                            {brainResult.screen.hits.length > 10 && (
                              <div className="text-11 text-ink-3 text-center">
                                +{brainResult.screen.hits.length - 10} more hits
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {brainResult.pep && brainResult.pep.salience > 0 && (
                        <div className="mb-4">
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">PEP</div>
                          <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-12 text-amber-800">
                            {brainResult.pep.type.replace(/_/g, " ")} · Tier {brainResult.pep.tier} · Salience{" "}
                            {Math.round(brainResult.pep.salience * 100)}%
                          </div>
                        </div>
                      )}

                      {brainResult.jurisdiction && (
                        <div className="mb-4">
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">Jurisdiction</div>
                          <div className={`rounded px-3 py-2 text-12 border ${brainResult.jurisdiction.cahra ? "bg-red-50 border-red-200 text-red-800" : "bg-bg-1 border-hair-1 text-ink-0"}`}>
                            {brainResult.jurisdiction.name} ({brainResult.jurisdiction.iso2})
                            {brainResult.jurisdiction.cahra && " · CAHRA"}
                            {brainResult.jurisdiction.regimes.length > 0 && (
                              <span className="ml-2 text-ink-2">
                                Regimes: {brainResult.jurisdiction.regimes.slice(0, 5).join(", ")}
                                {brainResult.jurisdiction.regimes.length > 5 && ` +${brainResult.jurisdiction.regimes.length - 5}`}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {brainResult.adverseKeywordGroups.length > 0 && (
                        <div className="mb-4">
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
                            Adverse media groups
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {brainResult.adverseKeywordGroups.map((g) => (
                              <span
                                key={g.group}
                                className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 rounded px-2 py-0.5 text-11 font-medium"
                              >
                                {g.label}
                                <span className="font-bold">{g.count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {brainResult.typologies.hits.length > 0 && (
                        <div className="mb-4">
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
                            Typology matches ({brainResult.typologies.hits.length}) · Score {brainResult.typologies.compositeScore}
                          </div>
                          <div className="space-y-1">
                            {brainResult.typologies.hits.slice(0, 5).map((t) => (
                              <div key={t.id} className="text-12 text-ink-0 bg-bg-1 rounded px-2.5 py-1 border border-hair-1">
                                <span className="font-mono text-10 text-ink-3 mr-2">{t.id}</span>
                                {t.name}
                                <span className="ml-2 text-ink-2 text-11">({t.family})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {brainResult.redlines.fired.length > 0 && (
                        <div className="mb-2">
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-red-600 mb-2">
                            Redlines fired ({brainResult.redlines.fired.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {brainResult.redlines.fired.map((r) => (
                              <span key={r.keyword} className="bg-red-600 text-white rounded px-2 py-0.5 text-11 font-medium">
                                {r.keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {runResult && (
                    <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                      <div className="flex items-baseline justify-between mb-3">
                        <div>
                          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-1">
                            Pipeline configuration
                          </div>
                          <div className="text-12 text-ink-2">
                            {new Date(runResult.ranAt).toLocaleString()} · {runResult.modeCount} mode
                            {runResult.modeCount === 1 ? "" : "s"} ·{" "}
                            {runResult.taxonomyIds.length} taxonomy reference
                            {runResult.taxonomyIds.length === 1 ? "" : "s"}
                            {runResult.preset ? ` · preset ${runResult.preset}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRunResult(null)}
                          className="text-11 text-ink-3 hover:text-ink-0"
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                        {runResult.modes.map((m) => (
                          <div
                            key={m.id}
                            className="border border-hair-2 rounded px-2.5 py-1.5 bg-bg-1"
                          >
                            <div className="font-mono text-10 font-semibold text-ink-3 tracking-wide-4 uppercase">
                              {m.id} · {m.faculty}
                            </div>
                            <div className="text-12 text-ink-0">{m.name}</div>
                          </div>
                        ))}
                      </div>
                      {runResult.taxonomyIds.length > 0 && (
                        <div className="mt-4 text-10.5 text-ink-2 font-mono break-all">
                          <span className="uppercase tracking-wide-3 text-ink-3">
                            Taxonomy IDs:
                          </span>{" "}
                          {runResult.taxonomyIds.slice(0, 60).join(" · ")}
                          {runResult.taxonomyIds.length > 60 && ` … +${runResult.taxonomyIds.length - 60} more`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <TaxonomyLibrary />
            </>
          )}

          {/* ── MANIFEST TAB ────────────────────────────────────────────── */}
          {tab === "manifest" && (
            <BrainManifestPanel />
          )}

          {/* ── HYPOTHETICAL-SUBJECT MODAL ──────────────────────────────── */}
          {hypotheticalOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-10 px-4"
              onClick={(e) => { if (e.target === e.currentTarget) setHypotheticalOpen(false); }}
            >
              <div className="bg-bg-0 border border-hair-2 rounded-xl max-w-5xl w-full">
                <div className="flex items-center justify-between px-5 py-3 border-b border-hair-2">
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                      Brain inspector · hypothetical subject
                    </div>
                    <div className="text-13 text-ink-0 font-semibold">
                      Run the brain on a synthetic profile
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHypotheticalOpen(false)}
                    className="text-11 font-medium px-3 py-1.5 rounded text-ink-2 hover:bg-bg-1"
                  >
                    Close
                  </button>
                </div>
                <div className="p-5">
                  <BrainConsole />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
