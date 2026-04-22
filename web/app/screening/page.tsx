"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ScreeningHero } from "@/components/screening/ScreeningHero";
import { ScreeningToolbar } from "@/components/screening/ScreeningToolbar";
import { ScreeningTable } from "@/components/screening/ScreeningTable";
import { SubjectDetailPanel } from "@/components/screening/SubjectDetailPanel";
import { QUEUE_FILTERS, SUBJECTS } from "@/lib/data/subjects";
import type { FilterKey, Subject } from "@/lib/types";

const CRITICAL_THRESHOLD = 85;
const SLA_BREACH_THRESHOLD_H = 24;

function parseSlaHours(sla: string): number {
  const match = sla.match(/\+?(\d+)h\s*(\d+)?m?/);
  if (!match || match[1] === undefined) return 999;
  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return hours + minutes / 60;
}

const SANCTIONS_KEYWORDS = /ofac|sdn|un\b|eu\b|ofsi|eocn|sanction|cahra/i;

function applyFilter(subjects: Subject[], filter: FilterKey): Subject[] {
  switch (filter) {
    case "critical":
      return subjects.filter((s) => s.riskScore >= CRITICAL_THRESHOLD);
    case "sanctions":
      return subjects.filter(
        (s) => SANCTIONS_KEYWORDS.test(s.meta) || s.listCoverage.length >= 4,
      );
    case "edd":
      return subjects.filter((s) => s.cddPosture === "EDD");
    case "pep":
      return subjects.filter((s) => /PEP/i.test(s.meta));
    case "sla":
      return subjects.filter((s) => parseSlaHours(s.slaNotify) <= SLA_BREACH_THRESHOLD_H);
    case "a24":
      return [];
    case "closed":
      return subjects.filter((s) => s.status === "cleared");
    case "all":
    default:
      return subjects;
  }
}

export default function ScreeningPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(SUBJECTS[0]?.id ?? "");

  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const filteredByKey = applyFilter(SUBJECTS, activeFilter);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return filteredByKey;
    return filteredByKey.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q) ||
        s.meta.toLowerCase().includes(q),
    );
  }, [activeFilter, deferredQuery]);

  const selected = useMemo(
    () => SUBJECTS.find((s) => s.id === selectedId) ?? SUBJECTS[0],
    [selectedId],
  );

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-54px)]"
        style={{ gridTemplateColumns: "220px 1fr 360px" }}
      >
        <Sidebar
          filters={QUEUE_FILTERS}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <main className="bg-bg-0 px-10 py-8 overflow-y-auto">
          <ScreeningHero />
          <ScreeningToolbar query={query} onQueryChange={setQuery} />
          <ScreeningTable
            subjects={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>

        {selected && <SubjectDetailPanel subject={selected} />}
      </div>
    </>
  );
}
