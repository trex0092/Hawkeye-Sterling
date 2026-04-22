"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { CasesSidebar } from "@/components/cases/CasesSidebar";
import { CasesHero } from "@/components/cases/CasesHero";
import { CasesToolbar } from "@/components/cases/CasesToolbar";
import { CasesTable } from "@/components/cases/CasesTable";
import { CaseDetailPanel } from "@/components/cases/CaseDetailPanel";
import { CASES, CASE_FILTERS } from "@/lib/data/cases";
import type { CaseFilterKey, CaseRecord } from "@/lib/types";

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

export default function CasesPage() {
  const [activeFilter, setActiveFilter] = useState<CaseFilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(CASES[0]?.id ?? "");

  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const byKey = applyCaseFilter(CASES, activeFilter);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return byKey;
    return byKey.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.meta.toLowerCase().includes(q) ||
        (c.goAMLReference?.toLowerCase().includes(q) ?? false),
    );
  }, [activeFilter, deferredQuery]);

  const selected = useMemo(
    () => CASES.find((c) => c.id === selectedId) ?? CASES[0],
    [selectedId],
  );

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-54px)]"
        style={{ gridTemplateColumns: "220px 1fr 360px" }}
      >
        <CasesSidebar
          filters={CASE_FILTERS}
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
