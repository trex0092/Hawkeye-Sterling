"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { CasesSidebar } from "@/components/cases/CasesSidebar";
import { CasesHero } from "@/components/cases/CasesHero";
import { CasesToolbar } from "@/components/cases/CasesToolbar";
import { CasesTable } from "@/components/cases/CasesTable";
import { CaseDetailPanel } from "@/components/cases/CaseDetailPanel";
import { ReportModal } from "@/components/reports/ReportModal";
import { CASE_FILTERS } from "@/lib/data/cases";
import { deleteCase, loadCases } from "@/lib/data/case-store";
import type { CaseFilter, CaseFilterKey, CaseRecord } from "@/lib/types";
import { ActivityFeed } from "@/components/screening/ActivityFeed";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

interface TriagedCase {
  id: string;
  typologies: string[];
  narrative: string;
  mostSerious: string;
  escalation: "immediate" | "urgent" | "routine" | "none";
  similarityGroup?: string;
}
interface TriageResult {
  ok: boolean;
  triaged: TriagedCase[];
}

// Shape a case record into the compliance-report payload so the modal
// renders the same MLRO dossier the screening panel produces.
//
// When the case carries a screeningSnapshot (cases opened after the
// snapshot field was introduced), we use that verbatim — the report
// renders with the actual composite score, typology hits, signatures
// and entityType the operator saw in the screening panel.
//
// When the snapshot is missing (legacy case records, or a case opened
// outside the screening flow), we fall back to a minimal payload that
// lets the report builder render *something* without crashing —
// status-derived severity, entityType "other", empty hits — and flag
// the absence so the case detail panel can warn the operator that the
// rendered report is degraded.
function caseToReportPayload(c: CaseRecord): unknown {
  if (c.screeningSnapshot) {
    return {
      subject: c.screeningSnapshot.subject,
      result: c.screeningSnapshot.result,
      superBrain: c.screeningSnapshot.superBrain ?? null,
    };
  }
  return {
    subject: {
      id: c.id,
      name: c.subject,
      entityType: "other" as const,
    },
    result: {
      topScore: c.status === "reported" ? 85 : c.status === "review" ? 65 : 40,
      severity:
        c.status === "reported"
          ? ("critical" as const)
          : c.status === "review"
            ? ("high" as const)
            : ("low" as const),
      hits: [],
    },
    superBrain: null,
  };
}

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
  const [reportCase, setReportCase] = useState<CaseRecord | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);

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

  const runBatchTriage = async () => {
    setTriageLoading(true);
    setTriageResult(null);
    try {
      const activeCases = cases.slice(0, 10).map((c) => ({
        id: c.id,
        subject: c.subject,
        meta: c.meta ?? "",
        status: c.status,
        evidence: c.evidence ?? [],
      }));
      const res = await fetch("/api/cases/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cases: activeCases }),
      });
      if (!res.ok) return;
      const data = await res.json() as TriageResult;
      if (data.ok) setTriageResult(data);
    } catch { /* silent */ }
    finally { setTriageLoading(false); }
  };

  return (
    <>
      <Header />
      <div className="grid min-h-[calc(100vh-54px)] grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[220px_1fr_360px]">
        <div className="hidden md:block">
          <CasesSidebar
            filters={filtersWithCounts}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>

        <main className="px-4 py-4 md:px-10 md:py-8 overflow-y-auto">
          <div className="flex items-start justify-between mb-0">
            <CasesHero />
            <div className="mt-1 flex items-center gap-2">
              <AsanaReportButton payload={{ module: "cases", label: "Cases Dashboard", summary: "Case management report from Hawkeye Sterling — active, escalated and reported STR/SAR cases reviewed." }} />
              <button type="button" onClick={() => void runBatchTriage()} disabled={triageLoading || cases.length === 0}
                className="text-11 font-semibold px-3 py-1.5 rounded border border-brand/50 bg-brand-dim text-brand-deep hover:bg-brand/20 disabled:opacity-40">
                {triageLoading ? "Triaging…" : "✦AI"}
              </button>
            </div>
          </div>
          <CasesToolbar query={query} onQueryChange={setQuery} />
          {triageResult && (
            <div className="mb-4 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-hair-2 bg-bg-1">
                <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">AI Triage Results</span>
                <button type="button" onClick={() => setTriageResult(null)} className="text-11 text-ink-3 hover:text-ink-1">×</button>
              </div>
              <div className="divide-y divide-hair">
                {triageResult.triaged.map((t) => {
                  const escCls = t.escalation === "immediate" ? "bg-red text-white" : t.escalation === "urgent" ? "bg-red-dim text-red" : t.escalation === "routine" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div key={t.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-mono text-10 text-ink-3">{t.id}</span>
                          <span className={`font-mono text-9 px-1.5 py-px rounded uppercase font-semibold ${escCls}`}>{t.escalation}</span>
                          {t.typologies.map((typ) => <span key={typ} className="font-mono text-9 px-1.5 py-px rounded bg-bg-2 text-ink-2">{typ}</span>)}
                        </div>
                        <p className="text-11 text-ink-1 leading-snug">{t.narrative}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <CasesTable
            cases={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={(id) => {
              deleteCase(id);
              setCases(loadCases());
              if (selectedId === id) setSelectedId("");
              if (reportCase?.id === id) setReportCase(null);
            }}
            onOpenReport={(record) => setReportCase(record)}
          />
        </main>

        <div className="hidden lg:block">
          {selected ? (
            <CaseDetailPanel
              record={selected}
              onExport={() => setReportCase(selected)}
              onViewTimeline={() => setTimelineOpen(true)}
            />
          ) : (
            <aside className="border-l border-hair-2 overflow-y-auto px-5 py-6 print:hidden">
              <ActivityFeed label="Compliance engine" />
            </aside>
          )}
        </div>
      </div>
      <ReportModal
        open={reportCase !== null}
        title={reportCase ? `${reportCase.subject} · ${reportCase.id}` : ""}
        payload={reportCase ? caseToReportPayload(reportCase) : null}
        onClose={() => setReportCase(null)}
      />
      {timelineOpen && selected && (
        <TimelineModal record={selected} onClose={() => setTimelineOpen(false)} />
      )}
    </>
  );
}

function TimelineModal({
  record,
  onClose,
}: {
  record: CaseRecord;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Timeline for case ${record.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] max-h-[80vh] bg-bg-panel rounded-xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-hair-2">
          <div className="text-13 font-semibold text-ink-0">
            Timeline · Case {record.id} · {record.subject}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close timeline"
            className="w-8 h-8 rounded flex items-center justify-center text-ink-2 hover:bg-bg-1"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {record.timeline.length === 0 ? (
            <div className="text-12 text-ink-2">
              No timeline events yet.
            </div>
          ) : (
            <ol className="relative border-l-2 border-hair-2 ml-3 space-y-4 py-2">
              {record.timeline.map((e, i) => (
                <li key={`${e.timestamp}-${i}`} className="pl-4">
                  <div className="absolute -left-[7px] w-3 h-3 rounded-full bg-brand border-2 border-white" />
                  <div className="font-mono text-10.5 text-ink-3">
                    {e.timestamp}
                  </div>
                  <div className="text-12 text-ink-0 mt-0.5">{e.event}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
