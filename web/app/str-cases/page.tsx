"use client";

import { useEffect, useState } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import {
  ModuleHeader,
  Kpi,
  KpiGrid,
  Card,
  ActionRow,
  Btn,
  Register,
} from "@/components/ui/ModuleShell";
import { MultiSelect, SingleSelect } from "@/components/ui/MultiSelect";
import { DateParts } from "@/components/ui/DateParts";
import {
  STR_REPORT_KINDS,
  STR_STATUSES,
  STR_RED_FLAGS,
} from "@/lib/data/str-taxonomy";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import {
  appendCase,
  attachAsanaTaskUrl,
  buildCaseRecord,
  deleteCase,
  loadCases,
  saveCases,
} from "@/lib/data/case-store";
import { RowActions } from "@/components/shared/RowActions";
import { GoamlExportModal, type CasePrefill } from "@/components/goaml/GoamlExportModal";
import {
  loadOperatorRole,
  canPerform,
  ROLE_LABEL,
  type OperatorRole,
} from "@/lib/data/operator-role";
import { writeAuditEvent } from "@/lib/audit";
import { openReportWindow } from "@/lib/reportOpen";
import type { PatternDetectResult, DetectedPattern } from "@/app/api/str-cases/pattern-detect/route";

type FlashTone = "success" | "error";
interface Flash {
  tone: FlashTone;
  msg: string;
}

interface MlroBriefing {
  summary: string;
  priorityCases: Array<{ id: string; reason: string }>;
  duplicateRisk: string | null;
  actionItems: string[];
  regulatoryDeadlines: string[];
  mlroSignoff: string;
}

// ── MLRO Inbox Triage types ───────────────────────────────────────────────────
type TriagePriority = "critical" | "high" | "medium" | "low";
interface TriagedItem {
  id: string;
  type: string;
  subject: string;
  priority: TriagePriority;
  priorityReason: string;
  timeToAct: string;
  recommendedAction: string;
  regulatoryBasis?: string;
  suggestedAssignee?: string;
}
interface InboxTriageResult {
  triaged: TriagedItem[];
  summary: { critical: number; high: number; medium: number; low: number; total: number };
  urgentActions: string[];
  triageNarrative?: string;
  processedAt: string;
}

interface SarResult {
  ok: boolean;
  sarProbability: number;
  deterministicScore: number;
  queuePriority: "urgent" | "standard" | "low";
  recommendation: string;
  keyFactors: string[];
  narrative: string;
  confidence: "high" | "medium" | "low";
  feedbackSignals: number;
  error?: string;
}

interface CaseRow {
  id: string;
  title: string;
  reportKind: string;
  subject: string;
  amountAed: string;
  status: string;
  openedAt: string;
  fiuDeadline35Day?: string;
  fiuDeadlineDay20Alert?: string;
}

// ── FIU countdown helpers ────────────────────────────────────────────────────
function calcDaysRemaining(deadline?: string): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fiuBarColor(days: number): string {
  if (days <= 7) return "bg-red";
  if (days <= 15) return "bg-amber";
  return "bg-green";
}

function FiuCountdownBar({ fiuDeadline35Day, fiuDeadlineDay20Alert }: { fiuDeadline35Day?: string; fiuDeadlineDay20Alert?: string }) {
  if (!fiuDeadline35Day) return null;
  const days = calcDaysRemaining(fiuDeadline35Day);
  if (days === null) return null;
  const overdue = days < 0;
  const pct = Math.min(100, Math.max(0, ((35 - days) / 35) * 100));
  const barColor = overdue ? "bg-red" : fiuBarColor(days);
  const day20Passed = fiuDeadlineDay20Alert ? calcDaysRemaining(fiuDeadlineDay20Alert) !== null && (calcDaysRemaining(fiuDeadlineDay20Alert) ?? 1) <= 0 : false;

  return (
    <div className="px-3 pb-2 pt-0.5">
      {/* Progress track */}
      <div className="relative h-1.5 bg-bg-2 rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        {/* Day-20 milestone marker at 20/35 ≈ 57.1% */}
        <div
          className="absolute top-0 h-full w-px bg-amber/70"
          style={{ left: `${(20 / 35) * 100}%` }}
          title="Day 20 investigation deadline"
        />
      </div>
      {/* Labels */}
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        {overdue ? (
          <span className="text-10 font-bold text-red uppercase tracking-wide">
            OVERDUE — {Math.abs(days)} day{Math.abs(days) !== 1 ? "s" : ""} past FIU deadline
          </span>
        ) : (
          <span className={`text-10 font-mono ${days <= 7 ? "text-red font-semibold" : days <= 15 ? "text-amber" : "text-ink-3"}`}>
            {days} day{days !== 1 ? "s" : ""} to FIU deadline
          </span>
        )}
        {day20Passed && (
          <span className="text-10 font-semibold text-amber">· Day 20 investigation deadline passed</span>
        )}
      </div>
    </div>
  );
}

function AccessDeniedScreen({
  role,
}: {
  role: OperatorRole;
  onRoleChange?: (_r: OperatorRole) => void;
}) {
  return (
    <ModuleLayout asanaModule="str-cases" asanaLabel="STR / SAR Cases">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="max-w-md text-center p-8 bg-bg-panel border border-hair-2 rounded-xl">
          <div className="text-3xl mb-4">🔒</div>
          <h2 className="text-16 font-bold text-ink-0 mb-2">
            Access restricted — FDL Art. 29
          </h2>
          <p className="text-13 text-ink-2 mb-4">
            The STR / SAR case register is restricted to Compliance Officers
            and the MLRO. Viewing this register by unauthorised personnel
            risks tipping-off the subject under investigation.
          </p>
          <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-13 text-red font-medium mb-5">
            Your current role is <strong>{ROLE_LABEL[role]}</strong>. Contact
            your administrator to request CO or MLRO access.
          </div>
          <p className="text-11 text-ink-3">
            This access attempt has been logged to the immutable audit chain.
          </p>
        </div>
      </div>
    </ModuleLayout>
  );
}

export default function StrCasesPage() {
  const [role, setRole] = useState<OperatorRole>("analyst");
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    const r = loadOperatorRole();
    setRole(r);
    setRoleLoaded(true);

    // Log every access attempt to the audit chain regardless of role,
    // so there is a server-side record that this page was visited.
    // The server enforces str_read >= co — a 403 back here for analyst
    // is expected and harmless; the denied attempt is still visible in
    // the chain via the 403 status code being returned.
    fetch("/api/audit/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "str_read",
        target: "str-cases-page",
        actor: { role: r },
        body: { at: new Date().toISOString() },
      }),
    }).catch((err: unknown) => {
      console.warn("[hawkeye] str_read audit-sign failed — page-visit not in chain:", err);
    });
  }, []);

  // Hydrate the in-page register from the shared case store so refreshing
  // this page, opening it in a new tab, or filing from elsewhere all
  // stay in sync. Previously this list was session-only state — a page
  // reload erased every filing, and the /cases module never saw them.
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  // goAML export modal — prefilled from the row clicked.
  const [goamlPrefill, setGoamlPrefill] = useState<CasePrefill | null>(null);
  const [editCaseDraft, setEditCaseDraft] = useState({ title: "", subject: "", status: "" });
  useEffect(() => {
    if (!canPerform(role, "str_read")) return;
    const rows = loadCases()
      .filter((c) => c.meta?.startsWith("STR") || c.meta?.startsWith("SAR"))
      .map((c) => ({
        id: c.id,
        title: c.subject,
        reportKind: c.meta?.split(" · ")[0] ?? "STR",
        subject: c.subject,
        amountAed: "",
        status: c.statusLabel,
        openedAt: c.opened,
        fiuDeadline35Day: (c as unknown as { fiuDeadline35Day?: string }).fiuDeadline35Day,
        fiuDeadlineDay20Alert: (c as unknown as { fiuDeadlineDay20Alert?: string }).fiuDeadlineDay20Alert,
      }));
    // Sort ascending by days remaining — closest deadline first; no deadline goes last
    rows.sort((a, b) => {
      const da = calcDaysRemaining(a.fiuDeadline35Day);
      const db = calcDaysRemaining(b.fiuDeadline35Day);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
    setCases(rows);
  }, [role]);

  const [status, setStatus] = useState("Draft");
  const [reportKind, setReportKind] = useState("STR");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectCountry, setSubjectCountry] = useState("");
  const [amount, setAmount] = useState("");
  const [detectedOn, setDetectedOn] = useState("");
  const [deadline, setDeadline] = useState("");
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [goamlRef, setGoamlRef] = useState("");
  const [mlro, setMlro] = useState("Luisa Fernanda");
  const [approver, setApprover] = useState("");
  const [entityId, setEntityId] = useState<string>("");
  const [entityOptions, setEntityOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/entities")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { entities?: Array<{ id: string; name: string }>; defaultId?: string } | null) => {
        if (cancelled || !j?.entities) return;
        setEntityOptions(j.entities);
        if (j.defaultId) setEntityId(j.defaultId);
        else if (j.entities[0]) setEntityId(j.entities[0].id);
      })
      .catch(() => {/* leave dropdown empty — server will fall back to legacy entity */});
    return () => {
      cancelled = true;
    };
  }, []);
  const [noTippingOff, setNoTippingOff] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [briefing, setBriefing] = useState<MlroBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  // Cross-case pattern detection
  const [patternResult, setPatternResult] = useState<PatternDetectResult | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternExpanded, setPatternExpanded] = useState(false);
  const [patternError, setPatternError] = useState<string | null>(null);

  // MLRO Inbox Triage state
  const [triageResult, setTriageResult] = useState<InboxTriageResult | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [triageNarrativeEnabled, setTriageNarrativeEnabled] = useState(false);
  const [triageExpanded, setTriageExpanded] = useState(false);

  // SAR Probability Scorer state
  const [sarResult, setSarResult] = useState<SarResult | null>(null);
  const [sarLoading, setSarLoading] = useState(false);
  const [sarError, setSarError] = useState<string | null>(null);
  const [sarRiskScore, setSarRiskScore] = useState("65");
  const [sarSanctionsHits, setSarSanctionsHits] = useState("0");
  const [sarPepStatus, setSarPepStatus] = useState(false);
  const [sarAdverseMedia, setSarAdverseMedia] = useState("0");
  const [sarJurisdictionRisk, setSarJurisdictionRisk] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [sarCashIntensity, setSarCashIntensity] = useState<"low" | "medium" | "high">("medium");
  const [sarUboVerified, setSarUboVerified] = useState(true);
  const [sarTmAlerts, setSarTmAlerts] = useState("0");
  const [sarCddLevel, setSarCddLevel] = useState<"basic" | "standard" | "enhanced">("standard");
  const [sarStrHistory, setSarStrHistory] = useState(false);
  const [sarBehavioralDrift, setSarBehavioralDrift] = useState(false);
  const [sarTypologyMatch, setSarTypologyMatch] = useState(false);

  const open = cases.filter(
    (c) => c.status !== "Submitted" && c.status !== "Closed",
  ).length;
  const submitted = cases.filter((c) => c.status === "Submitted").length;
  const overdue = 0;

  const valid =
    title.trim().length > 0 &&
    subject.trim().length > 0 &&
    noTippingOff &&
    canPerform(role, "str");

  const clear = () => {
    setTitle("");
    setSubject("");
    setSubjectCountry("");
    setAmount("");
    setDetectedOn("");
    setDeadline("");
    setRedFlags([]);
    setNarrative("");
    setGoamlRef("");
    setApprover("");
    setStatus("Draft");
    setReportKind("STR");
    setNoTippingOff(false);
  };

  const flashFor = (tone: FlashTone, msg: string) => {
    setFlash({ tone, msg });
    if (typeof window !== "undefined") {
      window.setTimeout(() => setFlash(null), 3500);
    }
  };

  const generateBriefing = async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const res = await fetch("/api/str-briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cases }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Briefing generation failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as { ok: boolean; briefing: MlroBriefing };
      if (data.ok) setBriefing(data.briefing);
    } catch (err) {
      const msg = caughtErrorMessage(err, "Briefing generation failed — please retry");
      setBriefingError(msg);
    } finally { setBriefingLoading(false); }
  };

  const runPatternDetection = async () => {
    setPatternLoading(true);
    setPatternError(null);
    try {
      const res = await fetch("/api/str-cases/pattern-detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cases: cases.map((c) => ({
            id: c.id,
            subject: c.subject,
            amount: c.amountAed,
            jurisdiction: "",
            typology: c.reportKind,
            status: c.status,
            date: c.openedAt,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Pattern detection failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as PatternDetectResult;
      if (!Array.isArray(data.patterns)) data.patterns = [];
      setPatternResult(data);
      setPatternExpanded(true);
    } catch (err) {
      const msg = caughtErrorMessage(err, "Pattern detection failed — please retry");
      setPatternError(msg);
    } finally { setPatternLoading(false); }
  };

  const runTriage = async () => {
    setTriageLoading(true);
    setTriageResult(null);
    setTriageError(null);
    try {
      if (cases.length === 0) {
        setTriageError("No STR cases to triage — file a case first");
        setTriageLoading(false);
        return;
      }
      const items = cases.map((c) => ({
        id: c.id,
        type: "str_referral",
        subject: `${c.reportKind} — ${c.subject}`,
        subjectName: c.subject,
        createdAt: c.openedAt || undefined,
        source: "str-cases",
      }));
      const res = await fetch("/api/mlro-inbox-triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, generateNarrative: triageNarrativeEnabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Triage failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as InboxTriageResult & { ok?: boolean };
      if (!data.triaged) throw new Error("Unexpected response — please retry");
      setTriageResult(data);
      setTriageExpanded(true);
    } catch (err) {
      const msg = caughtErrorMessage(err, "Triage failed — please retry");
      setTriageError(msg);
    } finally { setTriageLoading(false); }
  };

  const runSarProbability = async () => {
    setSarLoading(true);
    setSarResult(null);
    setSarError(null);
    try {
      const res = await fetch("/api/sar-probability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          riskScore: Number(sarRiskScore) || 65,
          sanctionsHits: Number(sarSanctionsHits) || 0,
          pepStatus: sarPepStatus,
          adverseMediaCount: Number(sarAdverseMedia) || 0,
          jurisdictionRisk: sarJurisdictionRisk,
          cashIntensity: sarCashIntensity,
          uboVerified: sarUboVerified,
          tmAlerts: Number(sarTmAlerts) || 0,
          cddLevel: sarCddLevel,
          strHistory: sarStrHistory,
          behavioralDrift: sarBehavioralDrift,
          typologyMatch: sarTypologyMatch,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `SAR scoring failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as SarResult;
      if (!data.ok) throw new Error(data.error ?? "SAR scoring failed — please retry");
      setSarResult(data);
    } catch (err) {
      const msg = caughtErrorMessage(err, "SAR scoring failed — please retry");
      setSarError(msg);
    } finally { setSarLoading(false); }
  };

  const openCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      // fetchJson handles 5xx retries (3 attempts × 750ms), 15s timeout,
      // safe JSON parsing and colon-free error copy. Previously the form
      // surfaced raw "Filing failed — server 502" on any Netlify cold
      // start — regulators saw infra chatter in the case file.
      const res = await fetchJson<{ ok: boolean; taskUrl?: string }>(
        "/api/sar-report",
        {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
            subject: {
              id: `STR-${Date.now()}`,
              name: subject.trim(),
              jurisdiction: subjectCountry.trim() || undefined,
            },
            filingType: reportKind,
            narrative: narrative.trim() || undefined,
            mlro,
            approver: approver.trim() || undefined,
            ...(entityId ? { entityId } : {}),
      }),
      label: "Filing failed",
        },
      );
      if (!res.ok) {
        flashFor("error", res.error ?? "Filing failed");
        return;
      }
      if (res.data?.ok) {
        // Persist to the shared case store so /cases shows the filing.
        // Same record powers this page's in-module register (on next
        // hydration) via the loadCases() effect above.
        const caseStatus =
      status === "Submitted"
            ? "reported"
            : status === "Closed"
              ? "closed"
              : status === "Under review"
                ? "review"
                : "active";
        const record = buildCaseRecord({
      subject: subject.trim(),
      ...(subjectCountry.trim()
            ? { subjectJurisdiction: subjectCountry.trim() }
            : {}),
      reportKind,
      ...(amount ? { amountAed: amount } : {}),
      status: caseStatus,
      statusLabel: status,
      statusDetail: `${reportKind} filed by ${mlro || "MLRO"}`,
      ...(goamlRef.trim() ? { goAMLReference: goamlRef.trim() } : {}),
        });
        appendCase(record);

        // Persist the Asana task permalink against the case so the
        // green "Reported to Asana · view task" pill renders in the
        // /cases detail panel across reloads, not just for this tab's
        // lifetime.
        if (res.data.taskUrl) {
          attachAsanaTaskUrl(record.id, res.data.taskUrl);
        }

        // Immutable audit event — four-eyes sign-off recorded in chain
        writeAuditEvent(
          mlro || "MLRO",
          "str.filed",
          `${reportKind} · ${subject.trim()} · approver: ${approver.trim() || "none"} · case ${record.id}`,
        );

        flashFor("success", "Filed to STR/SAR Asana board");
        // Re-read from the authoritative store so the in-page list reflects
        // what was actually persisted (guards against silent quota failures
        // where appendCase wrote nothing but the local variable still exists).
        const refreshed = loadCases()
          .filter((c) => c.meta?.startsWith("STR") || c.meta?.startsWith("SAR"))
          .map((c) => ({
            id: c.id,
            title: c.subject,
            reportKind: c.meta?.split(" · ")[0] ?? "STR",
            subject: c.subject,
            amountAed: "",
            status: c.statusLabel,
            openedAt: c.opened,
            fiuDeadline35Day: (c as unknown as { fiuDeadline35Day?: string }).fiuDeadline35Day,
            fiuDeadlineDay20Alert: (c as unknown as { fiuDeadlineDay20Alert?: string }).fiuDeadlineDay20Alert,
          }));
        refreshed.sort((a, b) => {
          const da = calcDaysRemaining(a.fiuDeadline35Day);
          const db = calcDaysRemaining(b.fiuDeadline35Day);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        });
        setCases(refreshed);
        clear();
      } else {
        flashFor("error", "Filing failed check Asana token");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Show a skeleton until role resolves so the page never renders an empty shell
  // (blank-page issue caused by SSR/initial-hydration returning null).
  if (!roleLoaded)
    return (
      <ModuleLayout asanaModule="str-cases" asanaLabel="STR / SAR Cases">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-12 text-ink-3 font-mono animate-pulse">
            Loading STR module…
          </div>
        </div>
      </ModuleLayout>
    );
  if (!canPerform(role, "str_read")) return <AccessDeniedScreen role={role} />;

  return (
    <ModuleLayout asanaModule="str-cases" asanaLabel="STR / SAR Cases">
      <ModuleHeader
            title="STR Case"
            titleEm="Management"
            subtitle="file without delay · no tipping-off"
            dotColor="brand"
            badge={{
              label: "FDL Art. 26–27 · File without delay",
              tone: "critical",
            }}
            actions={
              <div className="flex items-center gap-2">
                <Btn variant="ghost" onClick={() => void generateBriefing()} disabled={briefingLoading || cases.length === 0}>
                  {briefingLoading ? "Generating…" : "✦AI"}
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() => {
                    const open = cases.filter((c) => c.status === "open" || c.status === "under_review");
                    openReportWindow("/api/str-report", {
                      subject: open[0]?.subject ?? "Multiple subjects",
                      narrative: `STR case register export — ${cases.length} total cases, ${open.length} open. Generated for MLRO review.`,
                      transactions: [],
                      composite: 75,
                      jurisdiction: "AE",
                    });
                  }}
                >
                  <span style={{ color: "#7c3aed", fontWeight: 600 }}>PDF</span>
                </Btn>
                <Btn variant="ghost">+ New case</Btn>
              </div>
            }
      />

      <KpiGrid cols={5}>
            <Kpi value={cases.length} label="Total" tone="brand" />
            <Kpi value={open} label="Open" tone="amber" />
            <Kpi value={submitted} label="Submitted" tone="green" />
            <Kpi value={overdue} label="Overdue" tone="red" />
            <Kpi
              value={patternResult ? `⚠️ ${patternResult.patterns.length}` : "—"}
              label="Patterns detected"
              tone={patternResult && patternResult.patterns.length > 0 ? "red" : undefined}
            />
      </KpiGrid>

      {briefingError && (
        <div className="mt-4 mb-2 rounded-lg border border-red/30 bg-red-dim px-4 py-3 text-12 text-red">
          ⚠ {briefingError}
        </div>
      )}

      {briefing && (
        <div className="mt-4 mb-2 bg-bg-panel border border-brand/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-11 font-semibold uppercase tracking-wide-3 text-brand-deep">MLRO Daily Briefing</span>
            <button type="button" onClick={() => setBriefing(null)} className="text-11 text-ink-3 hover:text-ink-1">×</button>
          </div>
          <p className="text-12 text-ink-1 leading-relaxed">{briefing.summary}</p>
          {briefing.duplicateRisk && (
            <div className="text-11 font-semibold text-amber">Duplicate risk: {briefing.duplicateRisk}</div>
          )}
          {briefing.priorityCases.length > 0 && (
            <div>
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Priority cases</div>
              <ul className="space-y-0.5">
                {briefing.priorityCases.map((pc) => (
                  <li key={pc.id} className="text-11 text-ink-1"><span className="font-mono text-brand-deep">{pc.id}</span> — {pc.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {briefing.actionItems.length > 0 && (
            <ul className="text-11 text-ink-2 list-disc list-inside space-y-0.5">
              {briefing.actionItems.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          )}
          {briefing.regulatoryDeadlines.length > 0 && (
            <div className="text-10 font-mono text-red">{briefing.regulatoryDeadlines.join(" · ")}</div>
          )}
          {briefing.mlroSignoff && (
            <div className="text-11 italic text-ink-3">{briefing.mlroSignoff}</div>
          )}
        </div>
      )}

      {/* Pattern Detection banner */}
      <div className="mt-4 mb-2 bg-bg-panel border border-hair-2 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-1">
              🔍 Pattern Detection
            </span>
            <span className="ml-2 text-11 text-ink-3">
              Cross-case analysis · structuring · linked subjects · jurisdiction clustering
            </span>
          </div>
          <div className="flex items-center gap-2">
            {patternResult && !patternLoading && (
              <button
                type="button"
                onClick={() => setPatternExpanded((v) => !v)}
                className="text-11 text-ink-3 hover:text-ink-1"
              >
                {patternExpanded ? "Hide ▲" : `Show ${patternResult.patterns.length} pattern(s) ▾`}
              </button>
            )}
            <button
              type="button"
              onClick={() => void runPatternDetection()}
              disabled={patternLoading || cases.length === 0}
              className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {patternLoading ? "Analysing…" : "Run Cross-Case Analysis"}
            </button>
          </div>
        </div>

        {patternError && (
          <div className="mt-2 rounded border border-red/30 bg-red-dim px-3 py-2 text-11 text-red">
            ⚠ {patternError}
          </div>
        )}

        {patternExpanded && patternResult && (
          <div className="mt-3 border-t border-hair-2 pt-3">
            {patternResult.summary && (
              <p className="text-12 text-ink-1 leading-relaxed mb-3">{patternResult.summary}</p>
            )}
            {patternResult.patterns.length === 0 ? (
              <p className="text-11 text-ink-3 italic">No significant patterns detected across current cases.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {patternResult.patterns.map((p: DetectedPattern, i) => {
                  const sevCls =
                    p.severity === "critical"
                      ? "bg-red-dim text-red border-red/20"
                      : p.severity === "high"
                      ? "bg-amber-dim text-amber border-amber/20"
                      : p.severity === "medium"
                      ? "bg-blue-dim text-blue border-blue/20"
                      : "bg-bg-2 text-ink-2 border-hair-2";
                  const sevBadgeCls =
                    p.severity === "critical"
                      ? "bg-red/15 text-red"
                      : p.severity === "high"
                      ? "bg-amber/15 text-amber"
                      : p.severity === "medium"
                      ? "bg-blue/15 text-blue"
                      : "bg-bg-2 text-ink-3";
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 flex flex-col gap-1.5 ${sevCls}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm ${sevBadgeCls}`}
                        >
                          {p.severity}
                        </span>
                        <span className="font-mono text-10 text-ink-2 uppercase">
                          {p.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-12 text-ink-0 leading-snug">{p.description}</p>
                      {p.caseIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {p.caseIds.map((id) => (
                            <span
                              key={id}
                              className="font-mono text-10 bg-bg-0/50 text-ink-2 px-1.5 py-px rounded"
                            >
                              {id}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3 mt-0.5">{p.regulatoryRef}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MLRO Inbox Triage */}
      <div className="mt-4 mb-2 bg-bg-panel border border-hair-2 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-1">
              📥 MLRO Inbox Triage
            </span>
            <span className="ml-2 text-11 text-ink-3">
              Priority-sort STR queue · time-to-act · assignee routing
            </span>
          </div>
          <div className="flex items-center gap-3">
            {triageResult && !triageLoading && (
              <button type="button" onClick={() => setTriageExpanded((v) => !v)}
                className="text-11 text-ink-3 hover:text-ink-1">
                {triageExpanded ? "Hide ▲" : `Show ${triageResult.triaged.length} item(s) ▾`}
              </button>
            )}
            <label className="flex items-center gap-1.5 text-11 text-ink-3 cursor-pointer select-none">
              <input type="checkbox" checked={triageNarrativeEnabled}
                onChange={(e) => setTriageNarrativeEnabled(e.target.checked)} className="accent-brand" />
              Narrative
            </label>
            <button type="button" onClick={() => void runTriage()}
              disabled={triageLoading || cases.length === 0}
              className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors">
              {triageLoading ? "Triaging…" : "Triage STR Queue"}
            </button>
          </div>
        </div>

        {triageError && (
          <div className="mt-2 rounded border border-red/30 bg-red-dim px-3 py-2 text-11 text-red">⚠ {triageError}</div>
        )}

        {triageResult && triageExpanded && (
          <div className="mt-3 border-t border-hair-2 pt-3 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-11 text-ink-3">{triageResult.summary.total} item(s):</span>
              {triageResult.summary.critical > 0 && (
                <span className="font-mono text-10 font-semibold px-2 py-px rounded bg-red text-white">{triageResult.summary.critical} critical</span>
              )}
              {triageResult.summary.high > 0 && (
                <span className="font-mono text-10 font-semibold px-2 py-px rounded bg-amber-dim text-amber border border-amber/30">{triageResult.summary.high} high</span>
              )}
              {triageResult.summary.medium > 0 && (
                <span className="font-mono text-10 font-semibold px-2 py-px rounded bg-bg-2 text-ink-2 border border-hair-2">{triageResult.summary.medium} medium</span>
              )}
              {triageResult.summary.low > 0 && (
                <span className="font-mono text-10 font-semibold px-2 py-px rounded bg-bg-2 text-ink-3 border border-hair-2">{triageResult.summary.low} low</span>
              )}
            </div>

            {triageResult.urgentActions.length > 0 && (
              <div className="rounded-lg bg-red-dim border border-red/20 px-3 py-2.5">
                <p className="text-10 font-semibold uppercase tracking-wide-3 text-red mb-1">Urgent Actions</p>
                <ul className="space-y-0.5">
                  {triageResult.urgentActions.map((a, i) => (
                    <li key={i} className="text-11 text-ink-1 leading-relaxed">{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {triageResult.triageNarrative && (
              <p className="text-12 text-ink-1 leading-relaxed bg-bg-1 border border-hair-2 rounded-lg px-3 py-2.5">{triageResult.triageNarrative}</p>
            )}

            <div className="rounded-lg border border-hair-2 overflow-hidden">
              <table className="w-full text-11">
                <thead className="bg-bg-1 border-b border-hair-2">
                  <tr>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Priority</th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Subject</th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Time to Act</th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Recommended Action</th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Assignee</th>
                  </tr>
                </thead>
                <tbody>
                  {triageResult.triaged.map((t, i) => {
                    const priCls = t.priority === "critical"
                      ? "bg-red text-white"
                      : t.priority === "high"
                        ? "bg-amber-dim text-amber border border-amber/30"
                        : t.priority === "medium"
                          ? "bg-bg-2 text-ink-2 border border-hair-2"
                          : "bg-bg-2 text-ink-3 border border-hair-2";
                    return (
                      <tr key={t.id} className={i < triageResult.triaged.length - 1 ? "border-b border-hair" : ""}>
                        <td className="px-3 py-2.5">
                          <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded uppercase ${priCls}`}>{t.priority}</span>
                        </td>
                        <td className="px-3 py-2.5 text-ink-0 font-medium">
                          <div>{t.subject}</div>
                          <div className="text-9 text-ink-3 font-mono mt-0.5 leading-relaxed">{t.priorityReason}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{t.timeToAct}</td>
                        <td className="px-3 py-2.5 text-10 text-ink-1 max-w-[220px] leading-relaxed">{t.recommendedAction}</td>
                        <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{t.suggestedAssignee ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Card>
            <form onSubmit={openCase}>
              {(() => {
                const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";
                const taCls = `${iCls} min-h-[56px] leading-relaxed resize-y`;
                const lCls = "block text-10 uppercase tracking-wide-3 text-ink-3 mb-1";
                const row = "grid gap-3 mb-2";
                return (
                  <>
                    <div className={`${row} grid-cols-1 md:grid-cols-3`}>
                      <div><label className={lCls}>Case title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short case descriptor" className={iCls} /></div>
                      <div><label className={lCls}>Report kind</label><SingleSelect options={STR_REPORT_KINDS} value={reportKind} onChange={setReportKind} /></div>
                      <div><label className={lCls}>Subject / entity</label><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Customer, counterparty, or entity" className={iCls} /></div>
                    </div>
                    <div className={`${row} grid-cols-1 md:grid-cols-3`}>
                      <div><label className={lCls}>Subject country</label><input value={subjectCountry} onChange={(e) => setSubjectCountry(e.target.value)} placeholder="e.g. UAE, IN, RU" className={iCls} /></div>
                      <div><label className={lCls}>Transaction amount <span className="normal-case font-normal">(AED, USD, EUR)</span></label><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={iCls} /></div>
                      <div><label className={lCls}>Detected on</label><DateParts value={detectedOn} onChange={setDetectedOn} className={iCls} /></div>
                    </div>
                    <div className={`${row} grid-cols-1 md:grid-cols-3`}>
                      <div><label className={lCls}>Filing deadline <span className="normal-case font-normal">FDL Art. 26–27</span></label><DateParts value={deadline} onChange={setDeadline} className={iCls} /></div>
                      <div><label className={lCls}>goAML reference</label><input value={goamlRef} onChange={(e) => setGoamlRef(e.target.value)} placeholder="e.g. RPT-2026-0001" className={iCls} /></div>
                      <div><label className={lCls}>MLRO (preparer)</label><input value={mlro} onChange={(e) => setMlro(e.target.value)} placeholder="MLRO name" className={iCls} /></div>
                    </div>
                    <div className={`${row} grid-cols-1 md:grid-cols-2`}>
                      <div><label className={lCls}>Four-eyes approver</label><input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Second approver" className={iCls} /></div>
                      <div><label className={lCls}>Red-flag category</label><MultiSelect groups={STR_RED_FLAGS} placeholder="Select red-flag category…" value={redFlags} onChange={setRedFlags} /></div>
                    </div>
                    <div className="mb-2"><label className={lCls}>Suspicion narrative</label><textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Who, what, when, where, why it is suspicious. Do NOT tip off the subject (FDL Art. 29)." className={taCls} /></div>
                    {entityOptions.length > 1 && (
                      <div className="mb-2">
                        <label className={lCls}>Reporting entity</label>
                        <select
                          value={entityId}
                          onChange={(e) => setEntityId(e.target.value)}
                          className={iCls}
                          aria-label="Reporting entity for goAML filing"
                        >
                          {entityOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Tipping-off acknowledgment — must be checked before filing */}
              <div
                className={`mb-4 rounded-lg border px-4 py-3 ${
                  noTippingOff
                    ? "bg-green/5 border-green/30"
                    : "bg-amber/10 border-amber/40"
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noTippingOff}
                    onChange={(e) => setNoTippingOff(e.target.checked)}
                    className="accent-brand mt-0.5 shrink-0"
                  />
                  <span className="text-12 text-ink-1 leading-snug">
                    <strong>No tipping-off acknowledgment — FDL Art. 29</strong>
                    <br />I confirm that the subject of this report has not been
                    informed, directly or indirectly, that a suspicious
                    transaction report is being or has been filed. Disclosure
                    constitutes a criminal offence under UAE AML law.
                  </span>
                </label>
                {!noTippingOff && (
                  <p className="text-11 text-amber font-medium mt-2 ml-6">
                    You must acknowledge the no tipping-off obligation before
                    filing this report.
                  </p>
                )}
              </div>

              {/* MLRO-only filing notice for CO role */}
              {role === "co" && (
                <div className="mb-4 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-12 text-ink-1">
                  <strong>Note (CO role):</strong> You may view and prepare
                  cases but final filing requires the MLRO. Switch to MLRO role
                  in the sidebar to submit.
                </div>
              )}

              {flash && (
                <div
                  className={`text-11 font-medium mb-3 ${
                    flash.tone === "success" ? "text-green" : "text-red"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {flash.msg}
                </div>
              )}

              <ActionRow
                left={
                  <>
                    <Btn
                      type="submit"
                      variant="primary"
                      disabled={!valid || submitting}
                      title={
                        !noTippingOff
                          ? "Acknowledge no tipping-off to enable filing"
                          : !canPerform(role, "str")
                          ? "MLRO role required to file"
                          : undefined
                      }
                    >
                      {submitting ? "Filing…" : "Open case"}
                    </Btn>
                    <Btn variant="secondary" onClick={clear}>
                      Cancel
                    </Btn>
                  </>
                }
                right={
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-10 uppercase tracking-wide-3 text-ink-2">
                      Status
                    </span>
                    <div className="w-[180px]">
                      <SingleSelect
                        options={STR_STATUSES}
                        value={status}
                        onChange={setStatus}
                      />
                    </div>
                  </div>
                }
              />
            </form>
      </Card>

      {cases.length === 0 ? (
            <Register title="Register" empty="No STR cases opened yet." />
      ) : (
            <div className="mt-8 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
              <table className="w-full text-12">
                <thead className="bg-bg-1 border-b border-hair-2">
                  <tr>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Case
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Kind
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Subject
                    </th>
                    <th className="text-right px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Amount (AED, USD, EUR)
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Status
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Opened
                    </th>
                    <th className="w-[44px]" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    editingCaseId === c.id ? (
                      <tr key={c.id} className="border-b border-hair last:border-0 bg-bg-1">
                        <td colSpan={7} className="px-3 py-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-1.5">
                            <div>
                              <label className="block text-10 text-ink-3 mb-0.5">Title / Case name</label>
                              <input value={editCaseDraft.title} onChange={(e) => setEditCaseDraft((d) => ({ ...d, title: e.target.value }))}
                                className="w-full text-12 px-2 py-1 rounded border border-brand bg-bg-0 text-ink-0" />
                            </div>
                            <div>
                              <label className="block text-10 text-ink-3 mb-0.5">Subject</label>
                              <input value={editCaseDraft.subject} onChange={(e) => setEditCaseDraft((d) => ({ ...d, subject: e.target.value }))}
                                className="w-full text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                            </div>
                            <div>
                              <label className="block text-10 text-ink-3 mb-0.5">Status</label>
                              <input value={editCaseDraft.status} onChange={(e) => setEditCaseDraft((d) => ({ ...d, status: e.target.value }))}
                                className="w-full text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => {
                              // Update case in case-store
                              const allCases = loadCases();
                              const updated = allCases.map((x) => x.id === c.id ? { ...x, subject: editCaseDraft.subject || x.subject, statusLabel: editCaseDraft.status || x.statusLabel } : x);
                              saveCases(updated);
                              setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, title: editCaseDraft.title || x.title, subject: editCaseDraft.subject || x.subject, status: editCaseDraft.status || x.status } : x));
                              setEditingCaseId(null);
                            }} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">✓</button>
                            <button type="button" onClick={() => setEditingCaseId(null)} className="text-11 font-medium px-3 py-1 rounded text-red">✕</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                    <>
                    <tr
                      key={c.id}
                      className={`border-b ${c.fiuDeadline35Day && (calcDaysRemaining(c.fiuDeadline35Day) ?? 1) < 0 ? "border-l-4 border-l-red-500 bg-red-950/20" : "border-hair last:border-0"} hover:bg-bg-1`}
                    >
                      <td className="px-3 py-2 text-ink-0">
                        <div className="flex items-center gap-1.5">
                          {c.fiuDeadline35Day && (calcDaysRemaining(c.fiuDeadline35Day) ?? 1) < 0 && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-bold bg-red text-white uppercase">OVERDUE</span>
                          )}
                          {c.title}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-2">
                        {c.reportKind}
                      </td>
                      <td className="px-3 py-2 text-ink-0">{c.subject}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {c.amountAed || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-brand-dim text-brand-deep">
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-10 text-ink-3">
                        {(() => {
                          const v = c.openedAt;
                          if (!v) return "—";
                          const d = new Date(v);
                          return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
                        })()}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setGoamlPrefill({
                              id: c.id,
                              subject: c.subject,
                              reportKind: c.reportKind,
                              amountAed: c.amountAed,
                            })}
                            aria-label={`Export case ${c.id} to goAML`}
                            title="Export to goAML"
                            className="w-[18px] h-[18px] rounded-sm flex items-center justify-center text-11 leading-none text-ink-3/60 hover:bg-brand-dim hover:text-brand-deep transition-all hover:scale-110 font-mono"
                          >
                            ⇪
                          </button>
                          <RowActions
                            label={`case ${c.id}`}
                            onEdit={() => {
                              setEditingCaseId(c.id);
                              setEditCaseDraft({ title: c.title, subject: c.subject, status: c.status });
                            }}
                            onDelete={() => {
                              deleteCase(c.id);
                              setCases((prev) => prev.filter((x) => x.id !== c.id));
                            }}
                            deleteConfirmMessage={`Delete case ${c.id}? Audit-trail entries remain in the sealed chain; only the register row is removed.`}
                          />
                        </div>
                      </td>
                    </tr>
                    {c.fiuDeadline35Day && (
                      <tr key={`${c.id}-fiu`} className={`${(calcDaysRemaining(c.fiuDeadline35Day) ?? 1) < 0 ? "border-l-4 border-l-red-500 bg-red-950/20" : ""} border-b border-hair last:border-0`}>
                        <td colSpan={7} className="p-0">
                          <FiuCountdownBar fiuDeadline35Day={c.fiuDeadline35Day} fiuDeadlineDay20Alert={c.fiuDeadlineDay20Alert} />
                        </td>
                      </tr>
                    )}
                    </>
                    )
                  ))}
                </tbody>
              </table>
            </div>
      )}
      {/* ── SAR Probability Scorer ───────────────────────────────────────────── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">SAR Probability Scorer</div>
            <div className="text-10 text-ink-3 mt-0.5">Evidence-based STR filing probability · FDL 10/2025 Art.15 · FATF R.20</div>
          </div>
          {sarResult && (
            <button type="button" onClick={() => setSarResult(null)} className="text-10 text-ink-3 hover:text-ink-1 underline">Clear</button>
          )}
        </div>

        {/* Signal inputs */}
        {(() => {
          const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2 py-1.5 text-11 text-ink-0 focus:outline-none focus:border-brand";
          const lCls = "block text-9 uppercase tracking-wide-3 text-ink-3 mb-0.5";
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className={lCls}>Risk Score (0–100)</label>
                <input type="number" min="0" max="100" value={sarRiskScore} onChange={(e) => setSarRiskScore(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className={lCls}>Sanctions Hits</label>
                <input type="number" min="0" value={sarSanctionsHits} onChange={(e) => setSarSanctionsHits(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className={lCls}>Adverse Media Count</label>
                <input type="number" min="0" value={sarAdverseMedia} onChange={(e) => setSarAdverseMedia(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className={lCls}>TM Alerts</label>
                <input type="number" min="0" value={sarTmAlerts} onChange={(e) => setSarTmAlerts(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className={lCls}>Jurisdiction Risk</label>
                <select value={sarJurisdictionRisk} onChange={(e) => setSarJurisdictionRisk(e.target.value as "low" | "medium" | "high" | "critical")} className={iCls}>
                  {(["low", "medium", "high", "critical"] as const).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={lCls}>Cash Intensity</label>
                <select value={sarCashIntensity} onChange={(e) => setSarCashIntensity(e.target.value as "low" | "medium" | "high")} className={iCls}>
                  {(["low", "medium", "high"] as const).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={lCls}>CDD Level</label>
                <select value={sarCddLevel} onChange={(e) => setSarCddLevel(e.target.value as "basic" | "standard" | "enhanced")} className={iCls}>
                  {(["basic", "standard", "enhanced"] as const).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                {([
                  ["PEP", sarPepStatus, setSarPepStatus] as const,
                  ["UBO Verified", sarUboVerified, setSarUboVerified] as const,
                  ["Prior STR", sarStrHistory, setSarStrHistory] as const,
                  ["Behavioral Drift", sarBehavioralDrift, setSarBehavioralDrift] as const,
                  ["Typology Match", sarTypologyMatch, setSarTypologyMatch] as const,
                ] as Array<[string, boolean, (_v: boolean) => void]>).map(([label, val, setter]) => (
                  <label key={label} className="flex items-center gap-1.5 text-10 text-ink-2 cursor-pointer">
                    <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} className="accent-brand w-3 h-3" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          );
        })()}

        {sarError && (
          <div className="mb-3 rounded-lg border border-red/30 bg-red-dim px-4 py-2 text-11 text-red">⚠ {sarError}</div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => void runSarProbability()}
            disabled={sarLoading}
            className="inline-flex items-center gap-2 text-11 font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {sarLoading ? (
              <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Scoring…</>
            ) : "Score SAR Probability"}
          </button>
        </div>

        {sarResult && (
          <div className="flex flex-wrap gap-6 mt-2 border-t border-hair-2 pt-4">
            {/* Probability ring */}
            {(() => {
              const prob = sarResult.sarProbability;
              const color = prob >= 75 ? "#ef4444" : prob >= 50 ? "#f59e0b" : "#22c55e";
              const circumference = 2 * Math.PI * 36;
              const dashArray = `${(prob / 100) * circumference} ${circumference}`;
              const priCls = sarResult.queuePriority === "urgent" ? "bg-red text-white" : sarResult.queuePriority === "standard" ? "bg-amber-dim text-amber border border-amber/30" : "bg-green-dim text-green border border-green/30";
              const recLabel = sarResult.recommendation.replace(/_/g, " ");
              return (
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 shrink-0">
                    <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                      <circle cx="40" cy="40" r="36" fill="none" stroke="var(--color-bg-2)" strokeWidth="7" />
                      <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray={dashArray} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-15 font-bold leading-none" style={{ color }}>{prob}%</span>
                      <span className="text-9 text-ink-3 font-mono uppercase tracking-wide">SAR</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="text-10 uppercase tracking-wide-3 font-semibold text-ink-2">Filing Probability</div>
                    <div className="flex gap-2 flex-wrap">
                      <span className={`font-mono text-10 font-bold uppercase px-2 py-px rounded ${priCls}`}>Queue: {sarResult.queuePriority}</span>
                      <span className="font-mono text-10 px-2 py-px rounded bg-bg-2 text-ink-2 border border-hair-2 capitalize">{recLabel}</span>
                    </div>
                    <div className="text-9 text-ink-3 font-mono">Confidence: {sarResult.confidence} · {sarResult.feedbackSignals} feedback signals</div>
                  </div>
                </div>
              );
            })()}

            {/* Key factors */}
            <div className="flex-1 min-w-[240px]">
              <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Key Factors</div>
              <ul className="space-y-1">
                {sarResult.keyFactors.map((f, i) => (
                  <li key={i} className="text-11 text-ink-1 flex gap-2">
                    <span className="shrink-0 font-mono text-10 text-brand mt-0.5">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Narrative */}
            {sarResult.narrative && (
              <div className="w-full mt-2">
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">AI Rationale</div>
                <div className="bg-bg-1 border border-hair-2 rounded p-3 text-11 text-ink-1 leading-relaxed">{sarResult.narrative}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <GoamlExportModal
        open={goamlPrefill != null}
        onClose={() => setGoamlPrefill(null)}
        prefill={goamlPrefill ?? undefined}
      />
    </ModuleLayout>
  );
}
