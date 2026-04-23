"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { CasesSidebar } from "@/components/cases/CasesSidebar";
import { CasesHero } from "@/components/cases/CasesHero";
import { CasesToolbar } from "@/components/cases/CasesToolbar";
import { CasesTable } from "@/components/cases/CasesTable";
import { CaseDetailPanel } from "@/components/cases/CaseDetailPanel";
import { CASE_FILTERS } from "@/lib/data/cases";
import { loadCases } from "@/lib/data/case-store";
import type { CaseFilter, CaseFilterKey, CaseRecord } from "@/lib/types";

function applyCaseFilter(cases: CaseRecord[], filter: CaseFilterKey): CaseRecord[] {
  switch (filter) {
    case "active":
      return cases.filter((c) => c.status === "active");
    case "awaiting":
      return cases.filter((c) => c.status === "review");
    case "escalated":
      return cases.filter((c) => c.status === "reported");
    case "closed-cleared":
      return cases.filter((c) => c.status === "closed");
    case "closed-reported":
      return cases.filter((c) => c.status === "reported" && Boolean(c.goAMLReference));
    case "all":
    default:
      return cases;
  }
}

function count(cases: CaseRecord[], filter: CaseFilterKey): string {
  return applyCaseFilter(cases, filter).length.toString().padStart(2, "0");
}

export default function CasesPage() {
  const [activeFilter, setActiveFilter] = useState<CaseFilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [cases, setCases] = useState<CaseRecord[]>([]);

  // Hydrate from localStorage on mount + react to writes from other
  // modules (STR filing form, screening-panel escalations, etc.).
  useEffect(() => {
    const refresh = (): void => setCases(loadCases());
    refresh();
    const onUpdate = (): void => refresh();
    window.addEventListener("hawkeye:cases-updated", onUpdate);
    // Cross-tab sync via the native storage event.
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("hawkeye:cases-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  useEffect(() => {
    if (!selectedId && cases[0]) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const byKey = applyCaseFilter(cases, activeFilter);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return byKey;
    return byKey.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.meta.toLowerCase().includes(q) ||
        (c.goAMLReference?.toLowerCase().includes(q) ?? false),
    );
  }, [activeFilter, deferredQuery, cases]);

  const selected = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? cases[0],
    [selectedId, cases],
  );

  const filtersWithCounts: CaseFilter[] = useMemo(
    () =>
      CASE_FILTERS.map((f) => ({
        ...f,
        count: count(cases, f.key),
      })),
    [cases],
  );

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-54px)]"
        style={{ gridTemplateColumns: "220px 1fr 360px" }}
      >
        <CasesSidebar
          filters={filtersWithCounts}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <main className="bg-bg-0 px-10 py-8 overflow-y-auto">
          <CasesHero />
          <CasesToolbar query={query} onQueryChange={setQuery} />
          <CasesTable
            cases={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>

        {selected && <CaseDetailPanel record={selected} />}
      </div>
    </>
  );
}
