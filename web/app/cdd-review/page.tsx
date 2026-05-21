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

// ── Policy Reviewer types ─────────────────────────────────────────────────────
interface PolicyMissingProvision {
  provision: string;
  legalBasis: string;
  severity: "critical" | "high" | "medium" | "low";
  suggestedText: string;
}
interface PolicyOutdatedReference {
  reference: string;
  currentLaw: string;
  detail: string;
}
interface PolicyReviewResult {
  overallCompliance: "compliant" | "partially_compliant" | "non_compliant";
  complianceScore: number;
  missingProvisions: PolicyMissingProvision[];
  outdatedReferences: PolicyOutdatedReference[];
  strengths: string[];
  recommendations: string[];
  nextReviewDate: string;
  regulatoryBasis: string;
}

// ── Exit Letter types ─────────────────────────────────────────────────────────
type ExitReason =
  | "aml_risk"
  | "sanctions_risk"
  | "edd_failure"
  | "unacceptable_risk"
  | "pep_not_accepted"
  | "business_exit"
  | "other";

interface ExitLetterResult {
  customerName: string;
  exitDate: string;
  noticePeriodDays: number;
  tippingOffRisk: boolean;
  letterText: string;
  internalCoverNote: string;
  complianceChecklist: Array<{ item: string; status: "required" | "recommended"; done: boolean }>;
  generatedAt: string;
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

const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  aml_risk: "Elevated AML risk",
  sanctions_risk: "Potential sanctions exposure",
  edd_failure: "Failed to provide EDD documentation",
  unacceptable_risk: "Risk outside appetite",
  pep_not_accepted: "PEP not accepted per policy",
  business_exit: "Geographic / product exit (non-AML)",
  other: "Other",
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

const SortIcon = ({ col: _col, active, dir }: { col: string; active: boolean; dir: SortDir }) => (
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

  // Policy Reviewer state
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyText, setPolicyText] = useState("");
  const [policyType, setPolicyType] = useState("AML/CFT Policy");
  const [institutionType, setInstitutionType] = useState("UAE DPMS");
  const [policyLastReview, setPolicyLastReview] = useState("");
  const [policyResult, setPolicyResult] = useState<PolicyReviewResult | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  // Exit Letter state
  const [exitOpen, setExitOpen] = useState(false);
  const [exitCustomerName, setExitCustomerName] = useState("");
  const [exitCustomerType, setExitCustomerType] = useState<"individual" | "corporate">("individual");
  const [exitReason, setExitReason] = useState<ExitReason>("edd_failure");
  const [exitStrFiled, setExitStrFiled] = useState(false);
  const [exitNoticeDays, setExitNoticeDays] = useState(30);
  const [exitMlroName, setExitMlroName] = useState("");
  const [exitNotes, setExitNotes] = useState("");
  const [exitResult, setExitResult] = useState<ExitLetterResult | null>(null);
  const [exitLoading, setExitLoading] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  const [exitChecklist, setExitChecklist] = useState<Record<number, boolean>>({});
  const [exitCoverOpen, setExitCoverOpen] = useState(false);

  // EDD File Completeness state
  type EddSubjectType = "individual" | "corporate" | "trust" | "foundation";
  type EddRiskClass = "medium" | "high" | "critical";
  interface EddRequirementItem {
    id: string;
    label: string;
    mandatory: boolean;
    present: boolean;
    regulatoryBasis: string;
    guidance: string;
  }
  interface EddCompletenessResult {
    completenessScore: number;
    mandatoryScore: number;
    status: "complete" | "minor_gaps" | "material_gaps" | "incomplete";
    requirements: EddRequirementItem[];
    missing: string[];
    gapNarrative: string;
    recommendations: string[];
    aiGapAnalysis?: string;
  }
  const [eddComplOpen, setEddComplOpen] = useState(false);
  const [eddComplSubjectName, setEddComplSubjectName] = useState("");
  const [eddComplSubjectType, setEddComplSubjectType] = useState<EddSubjectType>("individual");
  const [eddComplRisk, setEddComplRisk] = useState<EddRiskClass>("high");
  const [eddComplIsPep, setEddComplIsPep] = useState(false);
  const [eddComplHighRiskJuris, setEddComplHighRiskJuris] = useState(false);
  const [eddComplFlags, setEddComplFlags] = useState<Record<string, boolean>>({
    hasIdentityDocument: false,
    hasSourceOfWealth: false,
    hasSourceOfFunds: false,
    hasBusinessPurpose: false,
    hasBeneficialOwnership: false,
    hasPepDeclaration: false,
    hasAdverseMediaSearch: false,
    hasSanctionsConfirmation: false,
    hasSeniorManagementApproval: false,
    hasGeoRiskJustification: false,
    hasOngoingMonitoringPlan: false,
    hasLastReviewDate: false,
    hasFinancialStatements: false,
    hasNetworkDiagram: false,
  });
  const [eddComplResult, setEddComplResult] = useState<EddCompletenessResult | null>(null);
  const [eddComplLoading, setEddComplLoading] = useState(false);
  const [eddComplError, setEddComplError] = useState<string | null>(null);
  const [eddComplGenerateNarrative, setEddComplGenerateNarrative] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Table controls
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortCol, setSortCol] = useState<SortCol>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");

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

  const runEddCompleteness = async () => {
    setEddComplLoading(true);
    setEddComplResult(null);
    setEddComplError(null);
    try {
      const res = await fetch("/api/edd-completeness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eddFile: {
            subjectName: eddComplSubjectName || undefined,
            subjectType: eddComplSubjectType,
            riskClassification: eddComplRisk,
            isPep: eddComplIsPep,
            hasHighRiskJurisdiction: eddComplHighRiskJuris,
            ...eddComplFlags,
          },
          generateNarrative: eddComplGenerateNarrative,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `EDD completeness check failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as EddCompletenessResult & { ok?: boolean; error?: string };
      if (!mountedRef.current) return;
      setEddComplResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "EDD completeness check failed — please retry";
      if (mountedRef.current) setEddComplError(msg);
    } finally {
      if (mountedRef.current) setEddComplLoading(false);
    }
  };

  const runPolicyReview = async () => {
    setPolicyLoading(true);
    setPolicyResult(null);
    setPolicyError(null);
    try {
      const res = await fetch("/api/policy-reviewer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyText,
          policyType,
          institutionType,
          lastReviewDate: policyLastReview || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        if (mountedRef.current) setPolicyError(err.error ?? `Server error ${res.status} — please retry`);
        return;
      }
      const data = await res.json().catch(() => ({})) as PolicyReviewResult & { ok?: boolean };
      if (!mountedRef.current) return;
      if (typeof data.complianceScore !== "number") {
        setPolicyError("Unexpected response from server — please retry");
        return;
      }
      setPolicyResult(data);
    } catch (err) {
      if (mountedRef.current) setPolicyError(err instanceof Error ? err.message : "Network error — please retry");
    } finally {
      if (mountedRef.current) setPolicyLoading(false);
    }
  };

  const runExitLetter = async () => {
    setExitLoading(true);
    setExitResult(null);
    setExitError(null);
    setExitChecklist({});
    try {
      const res = await fetch("/api/exit-letter-gen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: exitCustomerName,
          customerType: exitCustomerType,
          exitReason,
          strFiled: exitStrFiled,
          noticePeriodDays: exitNoticeDays,
          mlroName: exitMlroName || undefined,
          internalNotes: exitNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        if (mountedRef.current) setExitError(err.error ?? `Server error ${res.status} — please retry`);
        return;
      }
      const data = await res.json().catch(() => ({})) as ExitLetterResult & { ok?: boolean };
      if (!mountedRef.current) return;
      if (!data.letterText) {
        setExitError("No letter generated — please retry");
        return;
      }
      setExitResult(data);
    } catch (err) {
      if (mountedRef.current) setExitError(err instanceof Error ? err.message : "Network error — please retry");
    } finally {
      if (mountedRef.current) setExitLoading(false);
    }
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
      const data = await res.json().catch(() => ({})) as EddChecklistResult;
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
  const eddDoneItems = (Object.values(eddChecks) as boolean[]).filter(Boolean).length;
  const eddPct = eddTotalItems > 0 ? Math.round((eddDoneItems / eddTotalItems) * 100) : 0;

  // ── Enriched + sorted records ────────────────────────────────────────────
  const all = useMemo(() => [...caseRecords, ...manualRecords], [caseRecords, manualRecords]);
  const enriched = useMemo<EnrichedRecord[]>(() => all.map((r) => ({ ...r, ...deriveStatus(r) })), [all]);

  const filtered = useMemo<EnrichedRecord[]>(() => {
    let result = statusFilter === "all" ? enriched : enriched.filter((r) => r.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.subject.toLowerCase().includes(q));
    }
    return result;
  }, [enriched, statusFilter, searchQuery]);

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
    const target = all.find((r) => r.id === id);
    if (id.startsWith("manual-")) {
      const next = manualRecords.map(update);
      saveManual(next);
      setManualRecords(next);
    } else {
      setCaseRecords((prev) => prev.map(update));
    }
    if (target) {
      const outcomeMap: Record<ReviewOutcome, "adequate" | "marginal" | "inadequate"> = {
        passed: "adequate",
        deferred: "marginal",
        escalated: "marginal",
        exited: "inadequate",
      };
      void fetch("/api/cdd-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: id.startsWith("manual-") ? id : undefined,
          subject: target.subject,
          tier: target.tier,
          reviewDate: new Date().toISOString().split("T")[0],
          notes: target.notes,
          outcome: outcomeMap[outcome],
          status: "completed",
          caseId: id.startsWith("case-") ? id.slice(5) : undefined,
        }),
      }).catch((err) => console.warn("[cdd-review] server sync failed:", err));
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
      const data = await res.json().catch(() => ({})) as CddAdequacy;
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

      {/* ── Section 3.4: EDD File Completeness Check ── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-14">✅</span>
            <span className="text-13 font-semibold text-ink-0">EDD File Completeness Check</span>
            <span className="text-10 font-mono text-ink-3 ml-1">Mandatory document checklist · FDL 10/2025 Art.8 · FATF R.10</span>
          </div>
          <button
            type="button"
            onClick={() => setEddComplOpen((v) => !v)}
            className="flex items-center gap-1 text-11 font-medium px-3 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors"
          >
            {eddComplOpen ? "Collapse" : "Expand"} <ChevronIcon open={eddComplOpen} />
          </button>
        </div>

        {eddComplOpen && (
          <div className="p-4 space-y-4">
            {/* Profile inputs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">Subject name</label>
                <input
                  value={eddComplSubjectName}
                  onChange={(e) => setEddComplSubjectName(e.target.value)}
                  placeholder="Customer / entity name"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">Subject type</label>
                <select value={eddComplSubjectType} onChange={(e) => setEddComplSubjectType(e.target.value as EddSubjectType)} className={inputCls}>
                  {(["individual", "corporate", "trust", "foundation"] as const).map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">Risk classification</label>
                <select value={eddComplRisk} onChange={(e) => setEddComplRisk(e.target.value as EddRiskClass)} className={inputCls}>
                  {(["medium", "high", "critical"] as const).map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2 justify-end pb-1">
                {([
                  ["PEP", eddComplIsPep, setEddComplIsPep] as const,
                  ["High-risk jurisdiction", eddComplHighRiskJuris, setEddComplHighRiskJuris] as const,
                  ["AI gap analysis", eddComplGenerateNarrative, setEddComplGenerateNarrative] as const,
                ] as Array<[string, boolean, (v: boolean) => void]>).map(([label, val, setter]) => (
                  <label key={label} className="flex items-center gap-1.5 text-11 text-ink-2 cursor-pointer">
                    <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} className="accent-brand w-3.5 h-3.5" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Document flags */}
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Document checklist — tick each item that is present and satisfactory</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {([
                  ["hasIdentityDocument", "Identity document (passport / Emirates ID / trade licence)"],
                  ["hasSourceOfFunds", "Source of funds (SoF) documentation"],
                  ["hasSourceOfWealth", "Source of wealth (SoW) documentation"],
                  ["hasBusinessPurpose", "Business purpose / transaction rationale"],
                  ["hasBeneficialOwnership", "Beneficial ownership chain (UBO documentation)"],
                  ["hasPepDeclaration", "PEP status declaration and enhanced checks"],
                  ["hasAdverseMediaSearch", "Adverse media / negative news search"],
                  ["hasSanctionsConfirmation", "Sanctions screening confirmation"],
                  ["hasSeniorManagementApproval", "Senior management / MLRO approval"],
                  ["hasGeoRiskJustification", "Geographic risk justification"],
                  ["hasOngoingMonitoringPlan", "Ongoing monitoring plan / review schedule"],
                  ["hasLastReviewDate", "Last EDD review date recorded"],
                  ["hasFinancialStatements", "Financial statements (corporate / high-value)"],
                  ["hasNetworkDiagram", "Corporate structure / network diagram"],
                ] as Array<[string, string]>).map(([flag, label]) => (
                  <label key={flag} className="flex items-start gap-2 text-12 text-ink-1 cursor-pointer bg-bg-1 rounded px-3 py-2 hover:bg-bg-2 transition-colors">
                    <input
                      type="checkbox"
                      checked={eddComplFlags[flag] ?? false}
                      onChange={(e) => setEddComplFlags((prev) => ({ ...prev, [flag]: e.target.checked }))}
                      className="accent-brand w-3.5 h-3.5 mt-0.5 shrink-0"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {eddComplError && (
              <div className="rounded-lg border border-red/30 bg-red-dim px-4 py-2.5 text-11 text-red">⚠ {eddComplError}</div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void runEddCompleteness()}
                disabled={eddComplLoading}
                className="inline-flex items-center gap-2 text-12 font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
              >
                {eddComplLoading ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking…</>
                ) : "Check EDD File Completeness"}
              </button>
              {eddComplResult && (
                <button type="button" onClick={() => setEddComplResult(null)} className="text-10 text-ink-3 hover:text-ink-1 underline">Clear result</button>
              )}
            </div>

            {eddComplResult && (
              <div className="border-t border-hair-2 pt-4 space-y-4">
                {/* Score display */}
                <div className="flex flex-wrap gap-4 items-center">
                  {(() => {
                    const score = eddComplResult.completenessScore;
                    const mandatory = eddComplResult.mandatoryScore;
                    const statusCls = eddComplResult.status === "complete" ? "bg-green text-white" : eddComplResult.status === "minor_gaps" ? "bg-blue-dim text-blue border border-blue/30" : eddComplResult.status === "material_gaps" ? "bg-amber-dim text-amber border border-amber/30" : "bg-red-dim text-red border border-red/30";
                    const scoreColor = score >= 85 ? "#22c55e" : score >= 70 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#ef4444";
                    const circumference = 2 * Math.PI * 32;
                    const dashArray = `${(score / 100) * circumference} ${circumference}`;
                    return (
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 shrink-0">
                          <svg viewBox="0 0 72 72" className="w-16 h-16 -rotate-90">
                            <circle cx="36" cy="36" r="32" fill="none" stroke="var(--color-bg-2)" strokeWidth="6" />
                            <circle cx="36" cy="36" r="32" fill="none" stroke={scoreColor} strokeWidth="6" strokeDasharray={dashArray} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-mono text-13 font-bold leading-none" style={{ color: scoreColor }}>{score}</span>
                            <span className="text-8 text-ink-3 font-mono">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="text-10 uppercase tracking-wide-3 font-semibold text-ink-2">Overall Completeness</div>
                          <span className={`font-mono text-10 font-bold uppercase px-2 py-px rounded w-fit ${statusCls}`}>{eddComplResult.status.replace(/_/g, " ")}</span>
                          <div className="text-10 text-ink-3 font-mono">Mandatory: {mandatory}%</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Gap narrative */}
                <div className="bg-bg-1 border border-hair-2 rounded p-4 text-12 text-ink-1 leading-relaxed">
                  {eddComplResult.gapNarrative}
                </div>

                {/* Requirements list */}
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Requirements</div>
                  <div className="flex flex-col gap-1">
                    {eddComplResult.requirements.map((r) => (
                      <div key={r.id} className={`flex items-start gap-3 px-3 py-2 rounded text-11 ${r.present ? "bg-green-dim/50" : r.mandatory ? "bg-red-dim/50" : "bg-bg-1"}`}>
                        <span className={`shrink-0 font-mono text-12 font-bold mt-0.5 ${r.present ? "text-green" : r.mandatory ? "text-red" : "text-ink-3"}`}>{r.present ? "✓" : r.mandatory ? "✗" : "○"}</span>
                        <div className="flex-1">
                          <div className={`font-medium ${r.present ? "text-ink-1" : r.mandatory ? "text-red" : "text-ink-3"}`}>{r.label}</div>
                          <div className="text-9 font-mono text-ink-3 mt-0.5">{r.regulatoryBasis}</div>
                        </div>
                        <span className={`shrink-0 font-mono text-9 uppercase px-1.5 py-px rounded ${r.mandatory ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-3"}`}>{r.mandatory ? "mandatory" : "optional"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendations */}
                {eddComplResult.recommendations.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Recommendations</div>
                    <ul className="space-y-1.5">
                      {eddComplResult.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-11 text-ink-1">
                          <span className="shrink-0 font-mono text-10 text-brand mt-0.5">{i + 1}.</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI gap analysis */}
                {eddComplResult.aiGapAnalysis && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">AI Gap Analysis Memo</div>
                    <div className="bg-bg-1 border border-brand/20 rounded p-4 text-12 text-ink-1 leading-relaxed whitespace-pre-wrap">{eddComplResult.aiGapAnalysis}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3.5: AML Policy Reviewer ── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-14">📜</span>
            <span className="text-13 font-semibold text-ink-0">AML Policy Reviewer</span>
            <span className="text-10 font-mono text-ink-3 ml-1">AI compliance gap analysis · FDL 10/2025</span>
          </div>
          <button
            type="button"
            onClick={() => setPolicyOpen((v) => !v)}
            className="flex items-center gap-1 text-11 font-medium px-3 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors"
          >
            {policyOpen ? "Collapse" : "Expand"} <ChevronIcon open={policyOpen} />
          </button>
        </div>

        {policyOpen && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Policy Type</label>
                <select
                  value={policyType}
                  onChange={(e) => setPolicyType(e.target.value)}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                >
                  <option>AML/CFT Policy</option>
                  <option>KYC / CDD Procedures</option>
                  <option>EDD Procedure</option>
                  <option>STR / SAR Procedure</option>
                  <option>Sanctions Policy</option>
                  <option>PF / EWRA Policy</option>
                  <option>MLRO Terms of Reference</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Institution Type</label>
                <select
                  value={institutionType}
                  onChange={(e) => setInstitutionType(e.target.value)}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                >
                  <option>UAE DPMS</option>
                  <option>UAE Financial Institution</option>
                  <option>DNFBP</option>
                  <option>VASP / Crypto Exchange</option>
                  <option>Correspondent Bank</option>
                  <option>NPO / Charity</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                  Last Policy Review <span className="font-normal normal-case text-ink-4">(optional)</span>
                </label>
                <input
                  type="text"
                  value={policyLastReview}
                  onChange={(e) => setPolicyLastReview(e.target.value)}
                  placeholder="e.g. January 2024"
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Policy Text <span className="text-red">*</span>
              </label>
              <textarea
                value={policyText}
                onChange={(e) => setPolicyText(e.target.value)}
                rows={8}
                placeholder="Paste your AML/CFT policy document text here. The AI will analyse it against FDL 10/2025, CBUAE AML Standards, and FATF Recommendations…"
                className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors resize-y font-mono leading-relaxed"
              />
              <div className="flex justify-end">
                <span className="text-9 font-mono text-ink-3">{policyText.length.toLocaleString()} chars</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { void runPolicyReview(); }}
                disabled={policyLoading || !policyText.trim()}
                className="text-12 font-semibold px-5 py-2 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {policyLoading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Analysing policy…
                  </>
                ) : "✦ Review Policy →"}
              </button>
              {policyResult && (
                <button
                  type="button"
                  onClick={() => { setPolicyResult(null); setPolicyError(null); }}
                  className="text-11 font-medium px-3 py-2 rounded border border-hair-2 text-ink-3 hover:text-red hover:border-red/40 transition-colors"
                >
                  Clear results
                </button>
              )}
            </div>

            {policyError && (
              <div className="rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
                <span className="text-red text-14 shrink-0">⚠</span>
                <div>
                  <p className="text-12 font-semibold text-red">Policy review failed</p>
                  <p className="text-11 text-ink-2 mt-0.5">{policyError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {policyResult && (
          <div className="border-t border-hair-2 p-4 space-y-5">
            {/* Score + status row */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center ${
                  policyResult.complianceScore >= 80
                    ? "border-green text-green"
                    : policyResult.complianceScore >= 60
                      ? "border-amber text-amber"
                      : "border-red text-red"
                }`}>
                  <span className="text-18 font-bold leading-none">{policyResult.complianceScore}</span>
                  <span className="text-8 font-mono text-ink-3 mt-0.5">/ 100</span>
                </div>
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">Compliance Score</div>
                  <span className={`font-mono text-11 font-semibold px-2.5 py-1 rounded uppercase ${
                    policyResult.overallCompliance === "compliant"
                      ? "bg-green-dim text-green border border-green/30"
                      : policyResult.overallCompliance === "partially_compliant"
                        ? "bg-amber-dim text-amber border border-amber/30"
                        : "bg-red-dim text-red border border-red/30"
                  }`}>
                    {policyResult.overallCompliance.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              {policyResult.regulatoryBasis && (
                <div className="flex-1 text-11 text-ink-2 leading-relaxed">{policyResult.regulatoryBasis}</div>
              )}
              {policyResult.nextReviewDate && (
                <div className="text-right shrink-0">
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-0.5">Next Policy Review</div>
                  <span className="font-mono text-11 font-semibold text-brand">{policyResult.nextReviewDate}</span>
                </div>
              )}
            </div>

            {/* Missing Provisions */}
            {policyResult.missingProvisions.length > 0 && (
              <div>
                <p className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
                  Missing Provisions <span className="text-red ml-1">({policyResult.missingProvisions.length})</span>
                </p>
                <div className="space-y-2">
                  {policyResult.missingProvisions.map((p, i) => {
                    const sevCls = p.severity === "critical"
                      ? "bg-red text-white"
                      : p.severity === "high"
                        ? "bg-red-dim text-red border border-red/30"
                        : p.severity === "medium"
                          ? "bg-amber-dim text-amber border border-amber/30"
                          : "bg-bg-2 text-ink-2 border border-hair-2";
                    return (
                      <div key={i} className="bg-bg-1 border border-hair-2 rounded-lg p-3 space-y-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className={`shrink-0 font-mono text-9 font-semibold px-1.5 py-px rounded uppercase ${sevCls}`}>
                            {p.severity}
                          </span>
                          <span className="text-12 font-semibold text-ink-0 flex-1">{p.provision}</span>
                        </div>
                        <div className="font-mono text-9 px-1.5 py-px inline-flex rounded bg-brand-dim text-brand-deep border border-brand/10">
                          {p.legalBasis}
                        </div>
                        {p.suggestedText && (
                          <p className="text-11 text-ink-2 italic mt-1 pl-2 border-l-2 border-brand/30">{p.suggestedText}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Outdated References */}
            {policyResult.outdatedReferences.length > 0 && (
              <div>
                <p className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
                  Outdated References <span className="text-amber ml-1">({policyResult.outdatedReferences.length})</span>
                </p>
                <div className="space-y-2">
                  {policyResult.outdatedReferences.map((r, i) => (
                    <div key={i} className="bg-bg-1 border border-hair-2 rounded-lg p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-11 line-through text-ink-3">{r.reference}</span>
                        <span className="text-ink-3 text-10">→</span>
                        <span className="font-mono text-11 font-semibold text-ink-0">{r.currentLaw}</span>
                      </div>
                      {r.detail && <p className="text-11 text-ink-2 mt-1">{r.detail}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {policyResult.strengths.length > 0 && (
                <div>
                  <p className="text-10 font-semibold uppercase tracking-wide-3 text-green mb-2">Strengths</p>
                  <ul className="space-y-1.5">
                    {policyResult.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-green mt-0.5 shrink-0">✓</span>
                        <span className="text-12 text-ink-1">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {policyResult.recommendations.length > 0 && (
                <div>
                  <p className="text-10 font-semibold uppercase tracking-wide-3 text-amber mb-2">Recommendations</p>
                  <ul className="space-y-1.5">
                    {policyResult.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber mt-0.5 shrink-0">→</span>
                        <span className="text-12 text-ink-1">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3.6: Exit Letter Generator ── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-14">📮</span>
            <span className="text-13 font-semibold text-ink-0">Exit Letter Generator</span>
            <span className="text-10 font-mono text-ink-3 ml-1">Tipping-off safe · FDL 10/2025 Art.17</span>
          </div>
          <button
            type="button"
            onClick={() => setExitOpen((v) => !v)}
            className="flex items-center gap-1 text-11 font-medium px-3 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors"
          >
            {exitOpen ? "Collapse" : "Expand"} <ChevronIcon open={exitOpen} />
          </button>
        </div>

        {exitOpen && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Customer Name <span className="text-red">*</span></label>
                <input
                  value={exitCustomerName}
                  onChange={(e) => setExitCustomerName(e.target.value)}
                  placeholder="Full name or entity name"
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Customer Type</label>
                <select
                  value={exitCustomerType}
                  onChange={(e) => setExitCustomerType(e.target.value as "individual" | "corporate")}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="individual">Individual</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                  Exit Reason <span className="font-normal normal-case text-ink-4">(internal only — not disclosed)</span>
                </label>
                <select
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value as ExitReason)}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                >
                  {(Object.entries(EXIT_REASON_LABELS) as [ExitReason, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                  MLRO Name <span className="font-normal normal-case text-ink-4">(optional)</span>
                </label>
                <input
                  value={exitMlroName}
                  onChange={(e) => setExitMlroName(e.target.value)}
                  placeholder="e.g. Luisa Fernanda"
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-8 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Notice Period (days)</label>
                <input
                  type="number" min={1} max={180} value={exitNoticeDays}
                  onChange={(e) => setExitNoticeDays(Number(e.target.value))}
                  className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors w-24"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none mt-4">
                <input type="checkbox" checked={exitStrFiled} onChange={(e) => setExitStrFiled(e.target.checked)} className="accent-brand w-4 h-4" />
                <span className="text-12 text-ink-1">STR / SAR has been filed</span>
                {exitStrFiled && (
                  <span className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red border border-red/20">
                    Tipping-off prohibition applies
                  </span>
                )}
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Internal Notes <span className="font-normal normal-case text-ink-4">(not disclosed to customer)</span>
              </label>
              <input
                value={exitNotes}
                onChange={(e) => setExitNotes(e.target.value)}
                placeholder="Additional context for the AI (internal use only)…"
                className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { void runExitLetter(); }}
                disabled={exitLoading || !exitCustomerName.trim()}
                className="text-12 font-semibold px-5 py-2 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {exitLoading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Generating letter…
                  </>
                ) : "✦ Generate Exit Letter"}
              </button>
              {exitResult && (
                <button type="button" onClick={() => { setExitResult(null); setExitError(null); setExitChecklist({}); }}
                  className="text-11 font-medium px-3 py-2 rounded border border-hair-2 text-ink-3 hover:text-red hover:border-red/40 transition-colors">
                  Clear
                </button>
              )}
            </div>

            {exitError && (
              <div className="rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
                <span className="text-red text-14 shrink-0">⚠</span>
                <div>
                  <p className="text-12 font-semibold text-red">Generation failed</p>
                  <p className="text-11 text-ink-2 mt-0.5">{exitError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {exitResult && (
          <div className="border-t border-hair-2 p-4 space-y-4">
            {exitResult.tippingOffRisk && (
              <div className="rounded-lg border border-red/40 bg-red-dim px-4 py-3 flex items-start gap-2">
                <span className="text-red text-14 shrink-0">🚨</span>
                <div>
                  <p className="text-12 font-semibold text-red">TIPPING-OFF WARNING — STR filed</p>
                  <p className="text-11 text-ink-2 mt-0.5">This letter has been drafted to avoid disclosing AML/STR details per FDL 10/2025 Art.17. Review carefully before sending. Legal review recommended.</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap text-11 text-ink-2">
              <span>Exit date: <strong className="text-ink-0">{exitResult.exitDate}</strong></span>
              <span>Notice: <strong className="text-ink-0">{exitResult.noticePeriodDays} days</strong></span>
              <span>Customer: <strong className="text-ink-0">{exitResult.customerName}</strong></span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Generated Letter</span>
                <button type="button"
                  onClick={() => { void navigator.clipboard.writeText(exitResult.letterText); }}
                  className="text-10 font-mono px-2.5 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors">
                  Copy text
                </button>
              </div>
              <pre className="text-11 font-mono leading-relaxed bg-bg-1 border border-hair-2 rounded-lg p-4 whitespace-pre-wrap break-words overflow-auto max-h-80 text-ink-1">
                {exitResult.letterText}
              </pre>
            </div>

            <div className="rounded-lg border border-amber/30 bg-amber-dim overflow-hidden">
              <button type="button" onClick={() => setExitCoverOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber/5 transition-colors">
                <span className="text-11 font-semibold text-amber uppercase tracking-wide-3">
                  🔒 Internal Cover Note — Not for Customer Disclosure
                </span>
                <ChevronIcon open={exitCoverOpen} />
              </button>
              {exitCoverOpen && (
                <pre className="text-10 font-mono leading-relaxed px-4 pb-4 whitespace-pre-wrap break-words text-ink-1 border-t border-amber/20">
                  {exitResult.internalCoverNote}
                </pre>
              )}
            </div>

            {exitResult.complianceChecklist.length > 0 && (
              <div>
                <p className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Pre-send Compliance Checklist</p>
                <div className="space-y-1.5">
                  {exitResult.complianceChecklist.map((item, i) => (
                    <label key={i} className={`flex items-start gap-2.5 cursor-pointer rounded-lg px-3 py-2 border transition-colors ${exitChecklist[i] ? "bg-green-dim/40 border-green/20" : "bg-bg-1 border-hair-2 hover:border-brand/30"}`}>
                      <input type="checkbox" checked={exitChecklist[i] ?? false}
                        onChange={() => setExitChecklist((prev) => ({ ...prev, [i]: !prev[i] }))}
                        className="mt-0.5 accent-brand shrink-0" />
                      <div className="flex-1">
                        <span className={`text-11 ${exitChecklist[i] ? "text-ink-3 line-through" : "text-ink-1"}`}>{item.item}</span>
                        <span className={`ml-2 font-mono text-9 px-1 py-px rounded ${item.status === "required" ? "bg-red-dim text-red" : "bg-bg-2 text-ink-3"}`}>
                          {item.status}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-10 text-ink-3 mt-2">
                  {Object.values(exitChecklist).filter(Boolean).length} / {exitResult.complianceChecklist.filter((c) => c.status === "required").length} required items checked
                </p>
              </div>
            )}
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
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subjects…"
              className="text-11 px-3 py-1 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand transition-colors min-w-[150px]"
            />
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
