"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import { RowActions } from "@/components/shared/RowActions";
import type { CaseRecord } from "@/lib/types";
import { formatDMY, parseDMY } from "@/lib/utils/dateFormat";

// ── EDD Checklist types ──────────────────────────────────────────────────────
interface EddItem { item: string; regulatoryBasis: string; }
interface EddChecklistResult {
  documents: EddItem[];
  questions: EddItem[];
  verifications: EddItem[];
  redFlagsToMonitor: EddItem[];
  estimatedDays: number;
}

const EDD_STORAGE = "hawkeye.edd-checklist.v1";

function loadEddChecks(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const r = window.localStorage.getItem(EDD_STORAGE);
    return r ? (JSON.parse(r) as Record<string, boolean>) : {};
  } catch { return {}; }
}
function saveEddChecks(c: Record<string, boolean>) {
  try { window.localStorage.setItem(EDD_STORAGE, JSON.stringify(c)); } catch { /* quota exceeded — acceptable */ }
}

type EddSection = "documents" | "questions" | "verifications" | "redFlagsToMonitor";
const EDD_SECTION_LABELS: Record<EddSection, string> = {
  documents: "Documents to Obtain",
  questions: "Questions to Ask",
  verifications: "Third-Party Verifications",
  redFlagsToMonitor: "Red Flags to Monitor",
};
const EDD_SECTION_ICONS: Record<EddSection, string> = {
  documents: "📄",
  questions: "💬",
  verifications: "🔍",
  redFlagsToMonitor: "🚩",
};

// ── CDD Adequacy types ────────────────────────────────────────────────────────
interface CddAdequacyAssessment {
  id: string;
  adequacyScore: number;
  adequacyLevel: "adequate" | "marginal" | "inadequate";
  gaps: string[];
  recommendedActions: string[];
  enhancedMeasuresRequired: boolean;
  regulatoryRisk: string;
}
interface CddAdequacy {
  assessments: CddAdequacyAssessment[];
  portfolioStatus: "compliant" | "attention_required" | "breach";
  criticalSubjects: string[];
  summary: string;
}

// ── Review record types ───────────────────────────────────────────────────────
type ReviewTier = "high" | "medium" | "standard";
type ReviewStatus = "overdue" | "due-soon" | "current" | "unknown";
type ReviewOutcome = "passed" | "deferred" | "escalated" | "exited";
type StatusFilter = "all" | ReviewStatus;
type SortCol = "subject" | "tier" | "status" | "nextDue";
type SortDir = "asc" | "desc";

const OUTCOME_LABEL: Record<ReviewOutcome, string> = {
  passed: "Passed — relationship continues",
  deferred: "Deferred — awaiting documents",
  escalated: "Escalated — referred to MLRO",
  exited: "Exited — relationship terminated",
};
const OUTCOME_TONE: Record<ReviewOutcome, string> = {
  passed: "bg-green-dim text-green",
  deferred: "bg-amber-dim text-amber",
  escalated: "bg-red-dim text-red",
  exited: "bg-bg-2 text-ink-2",
};

interface ReviewRecord {
  id: string;
  subject: string;
  tier: ReviewTier;
  lastReview: string; // dd/mm/yyyy — "" if never reviewed
  notes: string;
  source: "case" | "manual";
  lastOutcome?: ReviewOutcome;
  lastOutcomeAt?: string; // ISO timestamp
}

const STORAGE = "hawkeye.cdd-review.v1";
const CADENCE_DAYS: Record<ReviewTier, number> = { high: 90, medium: 180, standard: 365 };
const TIER_LABEL: Record<ReviewTier, string> = { high: "High risk", medium: "Medium risk", standard: "Low risk" };
const TIER_TONE: Record<ReviewTier, string> = {
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  standard: "bg-green-dim text-green",
};
const STATUS_TONE: Record<ReviewStatus, string> = {
  overdue: "bg-red-dim text-red",
  "due-soon": "bg-amber-dim text-amber",
  current: "bg-green-dim text-green",
  unknown: "bg-bg-2 text-ink-3",
};

function deriveStatus(record: ReviewRecord): { status: ReviewStatus; daysOverdue: number; nextDue: string; nextDueTs: number } {
  if (!record.lastReview) return { status: "unknown", daysOverdue: 0, nextDue: "—", nextDueTs: Infinity };
  const last = parseDMY(record.lastReview);
  if (!last) return { status: "unknown", daysOverdue: 0, nextDue: "—", nextDueTs: Infinity };
  const cadence = CADENCE_DAYS[record.tier];
  const nextTs = last.getTime() + cadence * 86_400_000;
  const now = Date.now();
  const days = Math.round((nextTs - now) / 86_400_000);
  const nextDue = formatDMY(new Date(nextTs));
  if (days < 0) return { status: "overdue", daysOverdue: Math.abs(days), nextDue, nextDueTs: nextTs };
  if (days <= 60) return { status: "due-soon", daysOverdue: 0, nextDue, nextDueTs: nextTs };
  return { status: "current", daysOverdue: 0, nextDue, nextDueTs: nextTs };
}

function loadManual(): ReviewRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as ReviewRecord[]) : [];
  } catch { return []; }
}

function saveManual(rows: ReviewRecord[]) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(rows.filter((r) => r.source === "manual"))); }
  catch { /* quota exceeded */ }
}

function casesToRecords(cases: CaseRecord[]): ReviewRecord[] {
  return cases.map((c) => {
    const lastTs = c.timeline?.length
      ? Math.max(...c.timeline.map((e) => new Date(e.timestamp).getTime()))
      : 0;
    const tier: ReviewTier =
      c.badge === "CRITICAL" || c.badge === "HIGH" ? "high" :
      c.badge === "MEDIUM" ? "medium" : "standard";
    return {
      id: `case-${c.id}`,
      subject: c.subject,
      tier,
      lastReview: lastTs ? formatDMY(new Date(lastTs)) : "",
      notes: `Auto-imported from case ${c.id} · badge: ${c.badge}`,
      source: "case" as const,
    };
  });
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateDateInput(v: string): string | null {
  if (!v) return null;
  const d = parseDMY(v);
  if (!d) return "Use dd/mm/yyyy";
  if (d.getTime() > Date.now()) return "Cannot be in the future";
  return null;
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand transition-colors";
const BLANK = { subject: "", tier: "high" as ReviewTier, lastReview: "", notes: "" };

// ── Icons ─────────────────────────────────────────────────────────────────────
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform ${open ? "rotate-180" : ""}`}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SortIcon = ({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) => (
  <span className={`ml-1 font-mono text-9 ${active ? "text-brand" : "text-ink-3"}`}>
    {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
  </span>
);

// ── Export to CSV ─────────────────────────────────────────────────────────────
type EnrichedRecord = ReviewRecord & { status: ReviewStatus; daysOverdue: number; nextDue: string; nextDueTs: number };

function exportCsv(rows: EnrichedRecord[]) {
  const header = "Subject,Tier,Last Review,Next Due,Status,Last Outcome,Notes";
  const lines = rows.map((r) =>
    [r.subject, TIER_LABEL[r.tier], r.lastReview || "—", r.nextDue, r.status,
      r.lastOutcome ?? "—", r.notes].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
  );
  const csv = [header, ...lines].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `cdd-review-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CddReviewPage() {
  const [manualRecords, setManualRecords] = useState<ReviewRecord[]>([]);
  const [caseRecords, setCaseRecords] = useState<ReviewRecord[]>([]);
  const [draft, setDraft] = useState(BLANK);
  const [draftDateErr, setDraftDateErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(BLANK);
  const [editDateErr, setEditDateErr] = useState<string | null>(null);

  // Adequacy
  const [adequacy, setAdequacy] = useState<CddAdequacy | null>(null);
  const [adequacyLoading, setAdequacyLoading] = useState(false);
  const [adequacyError, setAdequacyError] = useState<string | null>(null);
  const [expandedAdequacy, setExpandedAdequacy] = useState(false);

  // EDD Checklist
  const [eddOpen, setEddOpen] = useState(false);
  const [eddClientName, setEddClientName] = useState("");
  const [eddClientType, setEddClientType] = useState("Individual");
  const [eddJurisdiction, setEddJurisdiction] = useState("UAE");
  const [eddRiskScore, setEddRiskScore] = useState(75);
  const [eddSow, setEddSow] = useState("");
  const [eddPep, setEddPep] = useState(false);
  const [eddAdverseMedia, setEddAdverseMedia] = useState(false);
  const [eddPatterns, setEddPatterns] = useState("");
  const [eddResult, setEddResult] = useState<EddChecklistResult | null>(null);
  const [eddLoading, setEddLoading] = useState(false);
  const [eddError, setEddError] = useState<string | null>(null);
  const [eddChecks, setEddChecks] = useState<Record<string, boolean>>({});
  const [eddOpenSections, setEddOpenSections] = useState<Record<EddSection, boolean>>({
    documents: true, questions: true, verifications: true, redFlagsToMonitor: true,
  });
  const eddRef = useRef<HTMLDivElement>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Table controls
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortCol, setSortCol] = useState<SortCol>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => { setEddChecks(loadEddChecks()); }, []);
  useEffect(() => {
    setManualRecords(loadManual());
    setCaseRecords(casesToRecords(loadCases()));
  }, []);

  const toggleEddCheck = (key: string) => {
    setEddChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveEddChecks(next);
      return next;
    });
  };
  const toggleEddSection = (s: EddSection) => setEddOpenSections((p) => ({ ...p, [s]: !p[s] }));

  const clearEddResult = () => {
    setEddResult(null);
    setEddError(null);
    setEddChecks({});
    saveEddChecks({});
  };

  const runEddChecklist = async () => {
    setEddLoading(true);
    setEddResult(null);
    setEddError(null);
    try {
      const res = await fetch("/api/cdd-review/edd-checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientName: eddClientName,
          clientType: eddClientType,
          jurisdiction: eddJurisdiction,
          riskScore: eddRiskScore,
          sourceOfWealth: eddSow,
          pep: eddPep,
          adverseMedia: eddAdverseMedia,
          transactionPatterns: eddPatterns,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        if (mountedRef.current) setEddError(err.error ?? `Server error ${res.status} — please retry`);
        return;
      }
      const data = await res.json() as EddChecklistResult;
      if (!mountedRef.current) return;
      if (!data.documents || !data.questions) {
        setEddError("Unexpected response from server — please retry");
        return;
      }
      setEddResult(data);
      setEddChecks({});
      saveEddChecks({});
      setTimeout(() => eddRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      if (mountedRef.current) setEddError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { if (mountedRef.current) setEddLoading(false); }
  };

  const eddTotalItems = eddResult
    ? eddResult.documents.length + eddResult.questions.length + eddResult.verifications.length + eddResult.redFlagsToMonitor.length
    : 0;
  const eddDoneItems = Object.values(eddChecks).filter(Boolean).length;
  const eddPct = eddTotalItems > 0 ? Math.round((eddDoneItems / eddTotalItems) * 100) : 0;

  // ── Enriched + sorted records ────────────────────────────────────────────
  const all = useMemo(() => [...caseRecords, ...manualRecords], [caseRecords, manualRecords]);
  const enriched = useMemo<EnrichedRecord[]>(() => all.map((r) => ({ ...r, ...deriveStatus(r) })), [all]);

  const filtered = useMemo<EnrichedRecord[]>(() => {
    if (statusFilter === "all") return enriched;
    return enriched.filter((r) => r.status === statusFilter);
  }, [enriched, statusFilter]);

  const sorted = useMemo<EnrichedRecord[]>(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "status") {
        const order: Record<ReviewStatus, number> = { overdue: 0, "due-soon": 1, unknown: 2, current: 3 };
        cmp = order[a.status] - order[b.status];
      } else if (sortCol === "tier") {
        const t: Record<ReviewTier, number> = { high: 0, medium: 1, standard: 2 };
        cmp = t[a.tier] - t[b.tier];
      } else if (sortCol === "subject") {
        cmp = a.subject.localeCompare(b.subject);
      } else if (sortCol === "nextDue") {
        cmp = (a.nextDueTs ?? Infinity) - (b.nextDueTs ?? Infinity);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const overdue = enriched.filter((r) => r.status === "overdue").length;
  const dueSoon = enriched.filter((r) => r.status === "due-soon").length;
  const passedThisMonth = enriched.filter((r) => {
    if (r.lastOutcome !== "passed" || !r.lastOutcomeAt) return false;
    const d = new Date(r.lastOutcomeAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // ── Sort toggle ──────────────────────────────────────────────────────────
  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  // ── Draft helpers ────────────────────────────────────────────────────────
  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      setDraft((d) => ({ ...d, [k]: v }));
      if (k === "lastReview") setDraftDateErr(validateDateInput(v));
    };

  const add = () => {
    if (!draft.subject || draftDateErr) return;
    const rec: ReviewRecord = { ...draft, id: `manual-${Date.now()}`, source: "manual" };
    const next = [...manualRecords, rec];
    saveManual(next);
    setManualRecords(next);
    setDraft(BLANK);
    setDraftDateErr(null);
  };

  const markReviewed = (id: string, outcome: ReviewOutcome) => {
    const nowIso = new Date().toISOString();
    const today = formatDMY(nowIso);
    const update = (r: ReviewRecord) =>
      r.id === id ? { ...r, lastReview: today, lastOutcome: outcome, lastOutcomeAt: nowIso } : r;
    if (id.startsWith("manual-")) {
      const next = manualRecords.map(update);
      saveManual(next);
      setManualRecords(next);
    } else {
      setCaseRecords((prev) => prev.map(update));
    }
  };

  const remove = (id: string) => {
    const next = manualRecords.filter((r) => r.id !== id);
    saveManual(next);
    setManualRecords(next);
  };

  const startEdit = (r: ReviewRecord) => {
    setEditingId(r.id);
    setEditDraft({ subject: r.subject, tier: r.tier, lastReview: r.lastReview, notes: r.notes });
    setEditDateErr(null);
  };

  const setE = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      setEditDraft((d) => ({ ...d, [k]: v }));
      if (k === "lastReview") setEditDateErr(validateDateInput(v));
    };

  const saveRecordEdit = (id: string) => {
    if (editDateErr) return;
    const update = (r: ReviewRecord) => r.id === id ? { ...r, ...editDraft } : r;
    if (id.startsWith("manual-")) {
      const next = manualRecords.map(update);
      saveManual(next);
      setManualRecords(next);
    } else {
      setCaseRecords((prev) => prev.map(update));
    }
    setEditingId(null);
  };

  const runAdequacyCheck = async () => {
    setAdequacyLoading(true);
    setAdequacyError(null);
    try {
      const reviews = enriched.map((r) => ({
        id: r.id, subject: r.subject, tier: r.tier,
        lastReview: r.lastReview, notes: r.notes,
        lastOutcome: r.lastOutcome, daysOverdue: r.daysOverdue, status: r.status,
      }));
      const res = await fetch("/api/cdd-adequacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviews }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        if (mountedRef.current) setAdequacyError(err.error ?? `Assessment failed (${res.status}) — please retry`);
        return;
      }
      const data = await res.json() as CddAdequacy;
      if (!mountedRef.current) return;
      if (!data.assessments || !data.portfolioStatus) {
        setAdequacyError("Unexpected response — please retry");
        return;
      }
      setAdequacy(data);
    } catch (err) {
      if (mountedRef.current) setAdequacyError(err instanceof Error ? err.message : "Network error — please retry");
    } finally { if (mountedRef.current) setAdequacyLoading(false); }
  };

  const statusCounts: Record<StatusFilter, number> = {
    all: enriched.length,
    overdue: enriched.filter((r) => r.status === "overdue").length,
    "due-soon": enriched.filter((r) => r.status === "due-soon").length,
    current: enriched.filter((r) => r.status === "current").length,
    unknown: enriched.filter((r) => r.status === "unknown").length,
  };

  const thCls = "text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono cursor-pointer select-none hover:text-ink-0 transition-colors";
  const thStatic = "text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono";

  return (
    <ModuleLayout asanaModule="cdd-review" asanaLabel="CDD Review">
      {/* ── Section 1: Module Header & KPIs ── */}
      <ModuleHero

        eyebrow="Module 22 · CDD Lifecycle"
        title="Periodic CDD"
        titleEm="review."
        intro={
          <>
            <strong>Who needs re-KYC and when.</strong> Risk-tiered review
            cadences per FDL 10/2025 Art.11 — high-risk (PEP / sanctions)
            every 3 months, medium every 6 months, low risk annually.
            Cases auto-imported; manual subjects can be added.
          </>
        }
        kpis={[
          { value: String(overdue), label: "overdue", tone: overdue > 0 ? "red" : undefined },
          { value: String(dueSoon), label: "due within 60d", tone: dueSoon > 0 ? "amber" : undefined },
          { value: String(passedThisMonth), label: "passed this month" },
          { value: String(all.length), label: "total tracked" },
        ]}
      />

      {/* ── Section 2: AI Adequacy Check ── */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => { void runAdequacyCheck(); }}
            disabled={adequacyLoading || enriched.length === 0}
            className="text-11 font-semibold px-4 py-1.5 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-40 transition-colors"
          >
            {adequacyLoading ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Assessing portfolio…
              </span>
            ) : "✦ AI Adequacy Check"}
          </button>
          {adequacy && (
            <button
              type="button"
              onClick={() => setExpandedAdequacy((v) => !v)}
              className="text-11 font-medium px-3 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors"
            >
              {expandedAdequacy ? "Hide details ▲" : "View details ▼"}
            </button>
          )}
          {adequacy && (
            <button
              type="button"
              onClick={() => setAdequacy(null)}
              className="text-10 font-medium px-2 py-1 rounded border border-hair-2 text-ink-3 hover:text-red hover:border-red/40 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {adequacyError && (
          <div className="rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
            <span className="text-red text-14 shrink-0">⚠</span>
            <div>
              <p className="text-12 font-semibold text-red">Adequacy check failed</p>
              <p className="text-11 text-ink-2 mt-0.5">{adequacyError}</p>
            </div>
          </div>
        )}

        {adequacy && (
          <div className={`rounded-lg border p-4 ${
            adequacy.portfolioStatus === "breach"
              ? "bg-red-dim border-red/30"
              : adequacy.portfolioStatus === "attention_required"
                ? "bg-amber-dim border-amber/30"
                : "bg-green-dim border-green/30"
          }`}>
            <div className="flex items-start gap-3 flex-wrap">
              <span className={`shrink-0 font-mono text-10 font-semibold px-2 py-px rounded uppercase ${
                adequacy.portfolioStatus === "breach"
                  ? "bg-red text-white"
                  : adequacy.portfolioStatus === "attention_required"
                    ? "bg-amber-dim text-amber border border-amber/40"
                    : "bg-green-dim text-green border border-green/40"
              }`}>
                {adequacy.portfolioStatus.replace(/_/g, " ")}
              </span>
              <p className="text-12 text-ink-1 flex-1">{adequacy.summary}</p>
            </div>

            {adequacy.criticalSubjects.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-10 text-ink-3 font-semibold uppercase tracking-wide-3">Immediate attention:</span>
                {adequacy.criticalSubjects.map((name) => (
                  <span key={name} className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red border border-red/20">{name}</span>
                ))}
              </div>
            )}

            {expandedAdequacy && adequacy.assessments.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Per-subject findings</p>
                {adequacy.assessments.map((a) => {
                  const rec = enriched.find((r) => r.id === a.id);
                  const lvlCls = a.adequacyLevel === "inadequate"
                    ? "bg-red-dim text-red border-red/20"
                    : a.adequacyLevel === "marginal"
                      ? "bg-amber-dim text-amber border-amber/20"
                      : "bg-green-dim text-green border-green/20";
                  return (
                    <div key={a.id} className="bg-bg-panel border border-hair-2 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-12 font-semibold text-ink-0">{rec?.subject ?? a.id}</span>
                        <span className={`font-mono text-10 px-1.5 py-px rounded border font-semibold uppercase ${lvlCls}`}>
                          {a.adequacyLevel}
                        </span>
                        <span className="font-mono text-10 text-ink-3">{a.adequacyScore}/100</span>
                        {a.enhancedMeasuresRequired && (
                          <span className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red border border-red/20">EDD required</span>
                        )}
                        {a.regulatoryRisk && (
                          <span className="font-mono text-9 px-1.5 py-px rounded bg-brand-dim text-brand-deep border border-brand/20">{a.regulatoryRisk}</span>
                        )}
                      </div>
                      {a.gaps.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {a.gaps.map((g, i) => (
                            <span key={i} className="text-10 text-amber italic">{g}</span>
                          ))}
                        </div>
                      )}
                      {a.recommendedActions.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5 text-10 text-ink-2">
                          {a.recommendedActions.map((act, i) => <li key={i}>{act}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: EDD Checklist Generator ── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-14">📋</span>
            <span className="text-13 font-semibold text-ink-0">EDD Checklist Generator</span>
            <span className="text-10 font-mono text-ink-3 ml-1">AI-tailored enhanced due diligence</span>
          </div>
          <button
            type="button"
            onClick={() => setEddOpen((v) => !v)}
            className="flex items-center gap-1 text-11 font-medium px-3 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors"
          >
            {eddOpen ? "Collapse" : "Expand"} <ChevronIcon open={eddOpen} />
          </button>
        </div>

        {eddOpen && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Client Name <span className="text-red">*</span></label>
                <input
                  value={eddClientName}
                  onChange={(e) => setEddClientName(e.target.value)}
                  placeholder="e.g. Ahmad Al-Rashid"
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Source of Wealth</label>
                <input
                  value={eddSow}
                  onChange={(e) => setEddSow(e.target.value)}
                  placeholder="e.g. Business sale proceeds, real estate"
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Client Type</label>
                <select
                  value={eddClientType}
                  onChange={(e) => setEddClientType(e.target.value)}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                >
                  <option>Individual</option>
                  <option>Corporate</option>
                  <option>PEP</option>
                  <option>VASP</option>
                  <option>DNFBP</option>
                  <option>Trust / Foundation</option>
                  <option>NPO / Charity</option>
                  <option>Correspondent Bank</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Jurisdiction</label>
                <select
                  value={eddJurisdiction}
                  onChange={(e) => setEddJurisdiction(e.target.value)}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                >
                  <option>UAE</option>
                  <option>UK</option>
                  <option>US</option>
                  <option>SG</option>
                  <option>EU</option>
                  <option>CH</option>
                  <option>HK</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            {/* Risk Score Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Risk Score</label>
                <span className={`font-mono text-11 font-semibold px-2 py-px rounded ${
                  eddRiskScore >= 80 ? "bg-red-dim text-red" : eddRiskScore >= 60 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"
                }`}>
                  {eddRiskScore}/100 · {eddRiskScore >= 80 ? "Critical" : eddRiskScore >= 60 ? "High" : eddRiskScore >= 40 ? "Medium" : "Low"}
                </span>
              </div>
              <input
                type="range" min={0} max={100} value={eddRiskScore}
                onChange={(e) => setEddRiskScore(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-9 text-ink-3 font-mono">
                <span>0 · Low</span><span>40 · Medium</span><span>60 · High</span><span>80 · Critical</span>
              </div>
            </div>

            {/* Risk flags */}
            <div className="flex gap-6 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={eddPep} onChange={(e) => setEddPep(e.target.checked)} className="accent-brand w-4 h-4" />
                <span className="text-12 text-ink-1">Politically Exposed Person (PEP)</span>
                {eddPep && <span className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red border border-red/20">EDD mandatory · FDL Art.17</span>}
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={eddAdverseMedia} onChange={(e) => setEddAdverseMedia(e.target.checked)} className="accent-brand w-4 h-4" />
                <span className="text-12 text-ink-1">Adverse Media</span>
                {eddAdverseMedia && <span className="font-mono text-10 px-1.5 py-px rounded bg-amber-dim text-amber border border-amber/20">Enhanced scrutiny required</span>}
              </label>
            </div>

            {/* Transaction patterns */}
            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Observed Transaction Patterns <span className="font-normal text-ink-4 normal-case">(optional)</span></label>
              <input
                value={eddPatterns}
                onChange={(e) => setEddPatterns(e.target.value)}
                placeholder="e.g. Frequent large cash deposits, wire transfers to free-trade zones, round-dollar amounts…"
                className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { void runEddChecklist(); }}
                disabled={eddLoading || !eddClientName.trim()}
                className="text-12 font-semibold px-5 py-2 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {eddLoading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Generating checklist…
                  </>
                ) : "Generate EDD Checklist →"}
              </button>
              {eddResult && (
                <button type="button" onClick={clearEddResult}
                  className="text-11 font-medium px-3 py-2 rounded border border-hair-2 text-ink-3 hover:text-red hover:border-red/40 transition-colors">
                  Clear results
                </button>
              )}
            </div>

            {eddError && (
              <div className="rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
                <span className="text-red text-14 shrink-0">⚠</span>
                <div>
                  <p className="text-12 font-semibold text-red">Checklist generation failed</p>
                  <p className="text-11 text-ink-2 mt-0.5">{eddError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Checklist results */}
        {eddResult && (
          <div ref={eddRef} className="border-t border-hair-2">
            {/* Progress header */}
            <div className="px-4 py-3 bg-bg-1 border-b border-hair-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-12 font-semibold text-ink-0">EDD Progress</span>
                  {eddClientName && <span className="text-ink-3 font-normal ml-1.5 text-12">— {eddClientName}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-12 font-semibold ${eddDoneItems === eddTotalItems && eddTotalItems > 0 ? "text-green" : "text-brand"}`}>
                    {eddDoneItems}/{eddTotalItems}
                  </span>
                  <span className="font-mono text-10 px-1.5 py-px rounded bg-amber-dim text-amber border border-amber/30">
                    Est. {eddResult.estimatedDays}d
                  </span>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-10 font-mono px-2.5 py-1 rounded border font-semibold"
                    style={{ color: "#7c3aed", borderColor: "#7c3aed", background: "rgba(124,58,237,0.07)" }}
                  >
                    Export PDF
                  </button>
                </div>
              </div>
              <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${eddDoneItems === eddTotalItems && eddTotalItems > 0 ? "bg-green" : "bg-brand"}`}
                  style={{ width: `${eddPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-10 text-ink-3 font-mono">{eddPct}% complete</span>
                {eddDoneItems === eddTotalItems && eddTotalItems > 0 && (
                  <span className="text-11 text-green font-semibold">✓ All items complete — ready for MLRO sign-off</span>
                )}
              </div>
            </div>

            {/* Accordion sections */}
            <div className="divide-y divide-hair-2">
              {(["documents", "questions", "verifications", "redFlagsToMonitor"] as EddSection[]).map((section) => {
                const items = eddResult[section];
                const sectionDone = items.filter((_, i) => eddChecks[`${section}:${i}`]).length;
                const isOpen = eddOpenSections[section];
                const allDone = sectionDone === items.length && items.length > 0;
                return (
                  <div key={section}>
                    <button
                      type="button"
                      onClick={() => toggleEddSection(section)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-bg-panel hover:bg-bg-1 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-14">{EDD_SECTION_ICONS[section]}</span>
                        <span className="text-12 font-semibold text-ink-0">{EDD_SECTION_LABELS[section]}</span>
                        <span className={`font-mono text-10 px-1.5 py-px rounded ${allDone ? "bg-green-dim text-green" : "bg-bg-2 text-ink-3"}`}>
                          {sectionDone}/{items.length}
                        </span>
                        {allDone && <span className="text-10 text-green">✓</span>}
                      </div>
                      <ChevronIcon open={isOpen} />
                    </button>

                    {isOpen && (
                      <ul className="divide-y divide-hair bg-bg-0">
                        {items.map((item, idx) => {
                          const key = `${section}:${idx}`;
                          const done = Boolean(eddChecks[key]);
                          return (
                            <li key={idx}>
                              <label className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-bg-1 transition-colors ${done ? "bg-green-dim/10" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={done}
                                  onChange={() => toggleEddCheck(key)}
                                  className="mt-0.5 accent-brand shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className={`text-12 leading-relaxed ${done ? "text-ink-3 line-through" : "text-ink-0"}`}>
                                    {item.item}
                                  </span>
                                  <div className="mt-0.5">
                                    <span className="font-mono text-9 px-1.5 py-px rounded bg-brand-dim text-brand-deep border border-brand/10">
                                      {item.regulatoryBasis}
                                    </span>
                                  </div>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Add Subject Form ── */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Add subject to review register</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3">Subject Name <span className="text-red">*</span></label>
            <input value={draft.subject} onChange={set("subject")} placeholder="Full name or entity" className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3">Risk Tier</label>
            <select value={draft.tier} onChange={set("tier")} className={inputCls}>
              <option value="high">High risk (90 days)</option>
              <option value="medium">Medium risk (180 days)</option>
              <option value="standard">Low risk (365 days)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3">Last Review Date</label>
            <input
              value={draft.lastReview}
              onChange={set("lastReview")}
              placeholder="dd/mm/yyyy"
              className={`${inputCls} ${draftDateErr ? "border-red" : ""}`}
            />
            {draftDateErr && <span className="text-9 text-red">{draftDateErr}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3">Notes</label>
            <input value={draft.notes} onChange={set("notes")} placeholder="Optional notes" className={inputCls} />
          </div>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!draft.subject || !!draftDateErr}
          className="mt-3 text-11 font-semibold px-4 py-1.5 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-40 transition-colors"
        >
          + Add to Register
        </button>
      </div>

      {/* ── Section 5: Review Records Table ── */}
      <div className="mt-4 space-y-2">
        {/* Filter bar + export */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", "overdue", "due-soon", "current", "unknown"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`text-10 font-mono font-semibold px-2.5 py-1 rounded border transition-colors ${
                  statusFilter === f
                    ? f === "overdue"
                      ? "bg-red text-white border-red"
                      : f === "due-soon"
                        ? "bg-amber text-white border-amber"
                        : f === "current"
                          ? "bg-green text-white border-green"
                          : "bg-ink-0 text-bg-0 border-ink-0"
                    : "border-hair-2 text-ink-2 hover:border-brand hover:text-brand"
                }`}
              >
                {f === "all" ? "All" : f === "due-soon" ? "Due soon" : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1 opacity-70">({statusCounts[f]})</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => exportCsv(sorted)}
            disabled={sorted.length === 0}
            className="text-10 font-mono font-semibold px-3 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors disabled:opacity-40"
          >
            ↓ Export CSV
          </button>
        </div>

        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
          <table className="w-full text-11">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                <th className={thCls} onClick={() => toggleSort("subject")}>
                  Subject <SortIcon col="subject" active={sortCol === "subject"} dir={sortDir} />
                </th>
                <th className={thCls} onClick={() => toggleSort("tier")}>
                  Tier <SortIcon col="tier" active={sortCol === "tier"} dir={sortDir} />
                </th>
                <th className={thStatic}>Last Review</th>
                <th className={thCls} onClick={() => toggleSort("nextDue")}>
                  Next Due <SortIcon col="nextDue" active={sortCol === "nextDue"} dir={sortDir} />
                </th>
                <th className={thCls} onClick={() => toggleSort("status")}>
                  Status <SortIcon col="status" active={sortCol === "status"} dir={sortDir} />
                </th>
                <th className={thStatic}>Notes</th>
                <th className={thStatic}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-ink-3 text-12">
                    {statusFilter !== "all"
                      ? `No records match filter "${statusFilter}" — try "All".`
                      : "No subjects tracked yet. Cases auto-import when filed; add manual subjects above."}
                  </td>
                </tr>
              ) : sorted.map((r, i) => (
                editingId === r.id ? (
                  <tr key={r.id} className={i < sorted.length - 1 ? "border-b border-hair" : ""}>
                    <td colSpan={7} className="px-3 py-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                        <input value={editDraft.subject} onChange={setE("subject")} placeholder="Subject"
                          className="text-12 px-2 py-1.5 rounded border border-brand bg-bg-0 text-ink-0 focus:outline-none" />
                        <select value={editDraft.tier} onChange={setE("tier")}
                          className="text-12 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 focus:outline-none focus:border-brand">
                          <option value="high">High risk (90d)</option>
                          <option value="medium">Medium risk (180d)</option>
                          <option value="standard">Low risk (365d)</option>
                        </select>
                        <div className="flex flex-col gap-0.5">
                          <input value={editDraft.lastReview} onChange={setE("lastReview")} placeholder="dd/mm/yyyy"
                            className={`text-12 px-2 py-1.5 rounded border bg-bg-0 text-ink-0 focus:outline-none focus:border-brand ${editDateErr ? "border-red" : "border-hair-2"}`} />
                          {editDateErr && <span className="text-9 text-red">{editDateErr}</span>}
                        </div>
                        <input value={editDraft.notes} onChange={setE("notes")} placeholder="Notes"
                          className="text-12 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 focus:outline-none focus:border-brand" />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => saveRecordEdit(r.id)} disabled={!!editDateErr}
                          className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0 disabled:opacity-40">✓ Save</button>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="text-11 font-medium px-3 py-1 rounded border border-hair-2 text-red hover:border-red/40">✕ Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className={i < sorted.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2.5 text-ink-0 font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{r.subject}</span>
                        {r.source === "case" && (
                          <span className="font-mono text-9 px-1 py-px rounded bg-bg-2 text-ink-3">case</span>
                        )}
                      </div>
                      {adequacy && (() => {
                        const a = adequacy.assessments.find((x) => x.id === r.id);
                        if (!a) return null;
                        const lvlCls = a.adequacyLevel === "inadequate"
                          ? "bg-red-dim text-red"
                          : a.adequacyLevel === "marginal"
                            ? "bg-amber-dim text-amber"
                            : "bg-green-dim text-green";
                        return (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className={`font-mono text-9 px-1.5 py-px rounded uppercase font-semibold ${lvlCls}`}>{a.adequacyLevel}</span>
                            <span className="font-mono text-9 text-ink-3">{a.adequacyScore}/100</span>
                            {a.enhancedMeasuresRequired && (
                              <span className="font-mono text-9 px-1.5 py-px rounded bg-red-dim text-red">EDD required</span>
                            )}
                            {a.gaps[0] && <span className="text-9 text-amber italic">{a.gaps[0]}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${TIER_TONE[r.tier]}`}>
                        {TIER_LABEL[r.tier]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-2">{r.lastReview || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-2">{r.nextDue}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${STATUS_TONE[r.status]}`}>
                          {r.status === "due-soon" ? "due soon" : r.status === "overdue" ? `${r.daysOverdue}d overdue` : r.status}
                        </span>
                        {r.lastOutcome && (
                          <span
                            className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${OUTCOME_TONE[r.lastOutcome]}`}
                            title={r.lastOutcomeAt ? `Stamped ${new Date(r.lastOutcomeAt).toLocaleString()}` : ""}
                          >
                            {r.lastOutcome}
                          </span>
                        )}
                        <select
                          value=""
                          onChange={(e) => {
                            const v = e.target.value as ReviewOutcome | "";
                            if (v) markReviewed(r.id, v);
                          }}
                          className="text-10 font-mono px-1.5 py-px rounded border border-hair-2 bg-bg-panel text-brand hover:border-brand whitespace-nowrap cursor-pointer"
                          title="Stamp review outcome — captures timestamp for audit trail"
                        >
                          <option value="">mark reviewed…</option>
                          {(Object.keys(OUTCOME_LABEL) as ReviewOutcome[]).map((o) => (
                            <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-3 text-10 max-w-[160px] truncate" title={r.notes || ""}>{r.notes || "—"}</td>
                    <td className="px-2 py-2.5 text-right">
                      {r.source === "manual" ? (
                        <RowActions
                          label={`review ${r.id}`}
                          onEdit={() => startEdit(r)}
                          onDelete={() => remove(r.id)}
                          confirmDelete={false}
                        />
                      ) : (
                        <RowActions
                          label={`review ${r.id}`}
                          onEdit={() => startEdit(r)}
                          onDelete={(e) => { e.preventDefault(); }}
                          confirmDelete={false}
                        />
                      )}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer ── */}
      <p className="text-10 text-ink-3 mt-4 leading-relaxed">
        Review cadences per <strong className="text-ink-2">FDL 10/2025 Art.11</strong>:
        High risk (PEP / sanctions) — 90 days · Medium risk — 180 days · Low risk — 365 days.
        Case records auto-imported from the screening register (last activity used as proxy).
        Manual records persist in localStorage. AI adequacy assessment powered by Claude Haiku.
      </p>
    </ModuleLayout>
  );
}
