"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { WorkbenchSidebar } from "@/components/workbench/WorkbenchSidebar";
import { WorkbenchHero } from "@/components/workbench/WorkbenchHero";
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

export default function WorkbenchPage() {
  const [activeFilter, setActiveFilter] = useState<FacultyFilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED_MODE_IDS),
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
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

  const handleRun = () => {
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
    // Scroll the result into view so the user sees the output immediately.
    window.requestAnimationFrame(() => {
      document.getElementById("pipeline-run-result")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-54px)]"
        style={{ gridTemplateColumns: "220px 1fr" }}
      >
        <WorkbenchSidebar
          filters={FACULTY_FILTERS}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <main className="bg-bg-0 px-10 py-8 overflow-y-auto">
          <WorkbenchHero />
          <WorkbenchToolbar
            query={query}
            onQueryChange={setQuery}
            selectedCount={selectedIds.size}
            categoryLabel={activeCategoryLabel}
            onRun={handleRun}
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
          {runResult && (
            <div
              id="pipeline-run-result"
              className="bg-white border border-hair-2 rounded-xl p-5 my-6"
            >
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-1">
                    Pipeline run
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
          <TaxonomyLibrary />
        </main>
      </div>
    </>
  );
}
