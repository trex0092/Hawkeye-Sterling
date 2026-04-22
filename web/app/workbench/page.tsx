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
    console.info("[workbench] run pipeline", {
      modeIds: ids,
      count: ids.length,
      preset: activePresetId,
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
          <TaxonomyLibrary />
        </main>
      </div>
    </>
  );
}
