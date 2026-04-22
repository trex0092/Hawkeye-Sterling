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

function nextSubjectId(existing: Subject[]): string {
  const used = new Set(
    existing
      .map((s) => Number.parseInt(s.id.replace(/^HS-/, ""), 10))
      .filter((n) => Number.isFinite(n)),
  );
  let n = 10001;
  while (used.has(n)) n += 1;
  return `HS-${n}`;
}

function buildSubject(name: string, existing: Subject[]): Subject {
  const id = nextSubjectId(existing);
  const badgeNum = id.replace(/^HS-/, "").slice(-5);
  return {
    id,
    badge: badgeNum,
    badgeTone: "violet",
    name,
    meta: "New subject · awaiting enrichment",
    country: "—",
    jurisdiction: "—",
    type: "Individual · UBO",
    entityType: "individual",
    riskScore: 0,
    status: "active",
    cddPosture: "CDD",
    listCoverage: [],
    exposureAED: "0",
    slaNotify: "+72h 00m",
    mostSerious: "—",
    openedAgo: "just now",
  };
}

export default function ScreeningPage() {
  const [subjects, setSubjects] = useState<Subject[]>(SUBJECTS);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    SUBJECTS[0]?.id ?? null,
  );

  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const filteredByKey = applyFilter(subjects, activeFilter);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return filteredByKey;
    return filteredByKey.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q) ||
        s.meta.toLowerCase().includes(q),
    );
  }, [subjects, activeFilter, deferredQuery]);

  const selected = useMemo(
    () => subjects.find((s) => s.id === selectedId) ?? null,
    [subjects, selectedId],
  );

  const handleNewScreening = () => {
    const name = window.prompt("Subject name (person or entity):")?.trim();
    if (!name) return;
    setSubjects((prev) => {
      const subject = buildSubject(name, prev);
      setSelectedId(subject.id);
      return [subject, ...prev];
    });
  };

  const handleDelete = (id: string) => {
    setSubjects((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const criticalCount = subjects.filter((s) => s.riskScore >= CRITICAL_THRESHOLD).length;
  const slaCount = subjects.filter(
    (s) => parseSlaHours(s.slaNotify) <= SLA_BREACH_THRESHOLD_H,
  ).length;

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
          <ScreeningHero
            inQueue={subjects.length}
            critical={criticalCount}
            slaRisk={slaCount}
          />
          <ScreeningToolbar
            query={query}
            onQueryChange={setQuery}
            onNewScreening={handleNewScreening}
          />
          <ScreeningTable
            subjects={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
          />
        </main>

        {selected ? (
          <SubjectDetailPanel subject={selected} />
        ) : (
          <aside className="bg-white border-l border-hair-2 p-6 flex items-center justify-center text-12 text-ink-2 text-center">
            Select a subject, or click{" "}
            <span className="mx-1 font-semibold text-ink-0">+ New screening</span>{" "}
            to start.
          </aside>
        )}
      </div>
    </>
  );
}
