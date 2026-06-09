"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import { writeAuditEvent } from "@/lib/audit";
import { apiErrorMessage } from "@/lib/client/error-utils";
import { AsanaStatus } from "@/components/shared/AsanaStatus";
import { RowActions } from "@/components/shared/RowActions";
import { formatDMY as fmtDate, formatDMYTime as fmtDateTime } from "@/lib/utils/dateFormat";

type Cadence = "daily" | "twice-daily" | "weekly" | "monthly";
type MonitorStatus = "active" | "paused" | "overdue";

interface MonitoredSubject {
  id: string;
  name: string;
  caseId: string;
  tier: "high" | "medium" | "standard";
  cadence: Cadence;
  status: MonitorStatus;
  lastRun: string;
  nextDue: string;
  enrolledBy: string;
  enrolledAt: string;
  notes: string;
  /** Asana task permalink for the most recent ongoing-monitor delta
   *  alert posted to the screening board. Renders the green
   *  "Reported to Asana · view task" pill on the subject row. */
  asanaTaskUrl?: string;
}

// ── Enrichment types ──────────────────────────────────────────────────────────

interface EnrichResult {
  ok: boolean;
  subject: string;
  gleif?: {
    ok: boolean;
    lei: string;
    record?: { legalName: string; jurisdiction: string; registrationStatus: string };
    ownershipChain: Array<{ lei: string; legalName: string; jurisdiction: string; depth: number; relationshipType?: string }>;
  } | null;
  domainIntel?: {
    ok: boolean;
    domain: string;
    riskScore: number;
    riskFactors: string[];
    malware?: { flagged: boolean };
    emailSecurity?: { hasSPF: boolean; hasDKIM: boolean; hasDMARC: boolean; spoofingRisk: string };
  } | null;
  yente?: {
    score: number;
    caption: string;
    datasets: string[];
    schema: string;
  } | null;
  osint?: {
    ok: boolean;
    status: string;
    summary: {
      totalFindings: number;
      emailAddresses: string[];
      socialProfiles: string[];
      breachData: string[];
      riskIndicators: string[];
    };
  } | null;
  enrichedAt: string;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE = "hawkeye.ongoing-monitor.v1";

const CADENCE_LABEL: Record<Cadence, string> = {
  "daily": "Daily",
  "twice-daily": "Twice daily",
  "weekly": "Weekly",
  "monthly": "Monthly",
};

const CADENCE_HOURS: Record<Cadence, number> = {
  "daily": 24,
  "twice-daily": 12,
  "weekly": 168,
  "monthly": 720,
};

const STATUS_TONE: Record<MonitorStatus, string> = {
  active: "bg-green-dim text-green",
  paused: "bg-bg-2 text-ink-3",
  overdue: "bg-red-dim text-red",
};

const TIER_TONE: Record<string, string> = {
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  standard: "bg-green-dim text-green",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeNextDue(lastRun: string, cadence: Cadence): string {
  if (!lastRun) return "—";
  const m = lastRun.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return "—";
  const d = new Date(parseInt(m[3]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[1]!, 10), parseInt(m[4]!, 10), parseInt(m[5]!, 10));
  return fmtDateTime(new Date(d.getTime() + CADENCE_HOURS[cadence] * 3_600_000).toISOString());
}

const DEFAULT_SUBJECTS: MonitoredSubject[] = [
  {
    id: "om-1", name: "Demo Subject Alpha", caseId: "CASE-2026-598596",
    tier: "high", cadence: "twice-daily", status: "active",
    lastRun: fmtDateTime(new Date(Date.now() - 6 * 3_600_000).toISOString()),
    nextDue: fmtDateTime(new Date(Date.now() + 6 * 3_600_000).toISOString()),
    enrolledBy: "MLRO", enrolledAt: fmtDate(new Date().toISOString()), notes: "demo seed — replace with real subject",
  },
  {
    id: "om-2", name: "IGR FZCO", caseId: "CASE-2026-441120",
    tier: "high", cadence: "daily", status: "active",
    lastRun: fmtDateTime(new Date(Date.now() - 20 * 3_600_000).toISOString()),
    nextDue: fmtDateTime(new Date(Date.now() + 4 * 3_600_000).toISOString()),
    enrolledBy: "CO", enrolledAt: fmtDate(new Date().toISOString()), notes: "Counterparty EDD",
  },
];

function load(): MonitoredSubject[] {
  if (typeof window === "undefined") return DEFAULT_SUBJECTS;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as MonitoredSubject[]) : DEFAULT_SUBJECTS;
  } catch { return DEFAULT_SUBJECTS; }
}

function save(rows: MonitoredSubject[]) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(rows)); } catch { /* */ }
}

const BLANK = {
  name: "", caseId: "", tier: "high" as const, cadence: "daily" as Cadence,
  enrolledBy: "", notes: "",
};

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0";
const tabCls = (active: boolean) =>
  `px-3 py-1 rounded text-11 font-medium border transition-colors ${
    active ? "bg-brand text-white border-brand" : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
  }`;

const _XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface ScreenResult {
  severity: string;
  topScore: number;
}

interface MonitorAlert {
  subjectId: string;
  subjectName: string;
  alertType: "overdue_escalation" | "cadence_mismatch" | "pattern_detected" | "tier_upgrade_recommended" | "immediate_review_required";
  severity: "critical" | "high" | "medium";
  description: string;
  recommendedAction: string;
  regulatoryBasis: string;
}

interface CadenceRecommendation {
  subjectId: string;
  currentCadence: string;
  recommendedCadence: string;
  reason: string;
}

interface MonitorAlertsResult {
  alerts: MonitorAlert[];
  portfolioHealth: "healthy" | "attention_required" | "critical";
  immediateEscalations: string[];
  cadenceRecommendations: CadenceRecommendation[];
  summary: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OngoingMonitorPage() {
  const [section, setSection] = useState<"monitoring" | "enrichment">("monitoring");

  // Monitoring state
  const [subjects, setSubjects] = useState<MonitoredSubject[]>([]);
  const [draft, setDraft] = useState(BLANK);
  const [screening, setScreening] = useState<Record<string, boolean>>({});
  const [lastResults, setLastResults] = useState<Record<string, ScreenResult>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; caseId: string; tier: MonitoredSubject["tier"]; cadence: Cadence; enrolledBy: string; notes: string }>(BLANK);

  // AI pattern scan state
  const [monitorAlerts, setMonitorAlerts] = useState<MonitorAlertsResult | null>(null);
  const [monitorAlertsLoading, setMonitorAlertsLoading] = useState(false);

  // Background-operation error banner
  const [bgError, setBgError] = useState<string | null>(null);

  // Unenrolment confirmation dialog
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string } | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  // Enrichment state
  const [enrichName, _setEnrichName] = useState("");
  const [enrichLei, _setEnrichLei] = useState("");
  const [enrichDomain, _setEnrichDomain] = useState("");
  const [enableOsint, _setEnableOsint] = useState(false);
  const [_enrichLoading, setEnrichLoading] = useState(false);
  const [_enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [_enrichError, setEnrichError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    setSubjects(load());
    (async () => {
      try {
        const res = await fetch("/api/ongoing");
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({})) as {
          ok: boolean;
          subjects?: Array<{ id: string; name: string; caseId?: string; jurisdiction?: string; enrolledAt: string }>;
        };
        if (!data.ok || !Array.isArray(data.subjects) || cancelled) return;
        const local = load();
        const localById = new Map(local.map((s) => [s.id, s]));
        const merged: MonitoredSubject[] = data.subjects.map((srv) => {
          const existing = localById.get(srv.id);
          if (existing) return existing;
          return {
            id: srv.id, name: srv.name, caseId: srv.caseId ?? "",
            tier: "high", cadence: "daily", status: "active",
            lastRun: "", nextDue: fmtDateTime(srv.enrolledAt),
            enrolledBy: "", enrolledAt: fmtDate(srv.enrolledAt), notes: "",
          };
        });
        if (!cancelled) { setSubjects(merged); save(merged); }
      } catch { /* offline — keep local cache */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  const setE = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditDraft((d) => ({ ...d, [k]: e.target.value }));

  const startEdit = (s: MonitoredSubject) => {
    setEditingId(s.id);
    setEditDraft({ name: s.name, caseId: s.caseId, tier: s.tier, cadence: s.cadence, enrolledBy: s.enrolledBy, notes: s.notes });
  };

  const saveSubjectEdit = (id: string) => {
    const next = subjects.map((s) => s.id !== id ? s : {
      ...s,
      name: editDraft.name || s.name,
      caseId: editDraft.caseId,
      tier: editDraft.tier,
      cadence: editDraft.cadence,
      enrolledBy: editDraft.enrolledBy,
      notes: editDraft.notes,
    });
    save(next);
    setSubjects(next);
    setEditingId(null);
  };

  const add = async () => {
    if (!draft.name) return;
    setBgError(null);
    const now = new Date().toISOString();
    const subject: MonitoredSubject = {
      ...draft, id: `om-${Date.now()}`, status: "active",
      lastRun: "", nextDue: fmtDateTime(now), enrolledAt: fmtDate(now),
    };
    const next = [...subjects, subject];
    save(next); setSubjects(next); setDraft(BLANK);
    writeAuditEvent(draft.enrolledBy || "compliance_assistant", "ongoing.enrolled", `${subject.name} — ${subject.cadence} cadence`);
    try {
      const res = await fetch("/api/ongoing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: subject.id, name: subject.name, ...(subject.caseId ? { caseId: subject.caseId } : {}), cadence: subject.cadence }),
      });
      if (!res.ok) {
        console.error(`[hawkeye] ongoing enrol HTTP ${res.status} — backend out of sync with UI`);
        if (mountedRef.current) setBgError(`Failed to sync enrolment with server — ${apiErrorMessage(res.status, "Sync")} The subject has been saved locally.`);
      }
    } catch (err) {
      console.error("[hawkeye] ongoing enrol threw — backend out of sync with UI:", err);
      if (mountedRef.current) setBgError("Could not reach the server to sync enrolment. The subject has been saved locally.");
    }
  };

  const togglePause = (id: string) => {
    const next = subjects.map((s) =>
      s.id === id ? { ...s, status: s.status === "paused" ? "active" as const : "paused" as const } : s,
    );
    save(next); setSubjects(next);
  };

  const remove = async (id: string, reason: string) => {
    setBgError(null);
    const next = subjects.filter((s) => s.id !== id);
    save(next); setSubjects(next);
    try {
      const res = await fetch(
        `/api/ongoing?id=${encodeURIComponent(id)}&reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        console.error(`[hawkeye] ongoing DELETE HTTP ${res.status} — backend row may persist as orphan`);
        if (mountedRef.current) setBgError(`Failed to remove subject from server — ${apiErrorMessage(res.status, "Delete")} It has been removed locally but may reappear on next sync.`);
      }
    } catch (err) {
      console.error("[hawkeye] ongoing DELETE threw — backend row may persist as orphan:", err);
      if (mountedRef.current) setBgError("Could not reach the server to remove this subject. It has been removed locally but may reappear on next sync.");
    }
  };

  const confirmRemove = () => {
    if (!removeConfirm) return;
    void remove(removeConfirm.id, removeReason);
    setRemoveConfirm(null);
    setRemoveReason("");
  };

  const screenNow = async (s: MonitoredSubject) => {
    setBgError(null);
    setScreening((prev) => ({ ...prev, [s.id]: true }));
    try {
      const res = await fetch("/api/quick-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: { name: s.name } }),
      });
      if (!res.ok) {
        throw new Error(`Screening failed for "${s.name}" (HTTP ${res.status})`);
      }
      const data = await res.json().catch(() => ({})) as { ok: boolean; topScore?: number; severity?: string };
      const nowStr = fmtDateTime(new Date().toISOString());
      const next = subjects.map((sub) =>
        sub.id === s.id ? { ...sub, lastRun: nowStr, nextDue: computeNextDue(nowStr, sub.cadence), status: "active" as const } : sub,
      );
      save(next);
      if (mountedRef.current) setSubjects(next);
      if (res.ok && data.ok && data.topScore !== undefined && mountedRef.current) {
        setLastResults((prev) => ({ ...prev, [s.id]: { severity: data.severity ?? "low", topScore: data.topScore ?? 0 } }));
        writeAuditEvent("system", "screening.completed", `${s.name} (${s.id}) — score ${data.topScore} · ${data.severity ?? "low"}`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[hawkeye] quick-screen threw — UI lastRun timestamp NOT updated:", err);
      setBgError(`Screening failed for "${s.name}". Please try again.`);
    } finally { if (mountedRef.current) setScreening((prev) => ({ ...prev, [s.id]: false })); }
  };

  const _enrich = async () => {
    if (!enrichName.trim()) return;
    setEnrichLoading(true); setEnrichError(null); setEnrichResult(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: enrichName.trim(),
          ...(enrichLei.trim() ? { lei: enrichLei.trim().toUpperCase() } : {}),
          ...(enrichDomain.trim() ? { domain: enrichDomain.trim().toLowerCase() } : {}),
          enableOsint,
        }),
      });
      const body = await res.json().catch(() => ({})) as ({ error?: string } & Partial<EnrichResult>);
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `Request failed (HTTP ${res.status}) — please retry`);
      }
      const data = body as EnrichResult;
      if (!mountedRef.current) return;
      if (!data.ok) setEnrichError(data.error ?? "Enrichment failed — please retry");
      else setEnrichResult(data);
    } catch { if (mountedRef.current) setEnrichError("Request failed"); }
    finally { if (mountedRef.current) setEnrichLoading(false); }
  };

  const runAiMonitor = async () => {
    setBgError(null);
    setMonitorAlertsLoading(true);
    try {
      const payload = subjects.map((s) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        cadence: s.cadence,
        status: s.status,
        lastRun: s.lastRun,
        nextDue: s.nextDue,
        notes: s.notes,
      }));
      const res = await fetch("/api/ongoing-monitor-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjects: payload }),
      });
      if (!res.ok) {
        console.error(`[hawkeye] ongoing-monitor-ai HTTP ${res.status} — portfolio-health KPI NOT refreshed`);
        setBgError(`AI health check failed — ${apiErrorMessage(res.status, "AI health check")} Portfolio alerts were not updated.`);
        return;
      }
      const data = await res.json().catch(() => ({})) as MonitorAlertsResult;
      if (mountedRef.current) setMonitorAlerts(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[hawkeye] ongoing-monitor-ai threw — portfolio-health KPI NOT refreshed, escalations may be missed:", err);
      setBgError("AI health check could not be reached. Portfolio alerts were not updated.");
    } finally { if (mountedRef.current) setMonitorAlertsLoading(false); }
  };

  const active = subjects.filter((s) => s.status === "active").length;
  const paused = subjects.filter((s) => s.status === "paused").length;
  const overdue = subjects.filter((s) => s.status === "overdue").length;

  return (
    <ModuleLayout
      asanaModule="ongoing-monitor"
      asanaLabel="Ongoing Monitor"
      onRun={() => void runAiMonitor()}
      onSync={() => void runAiMonitor()}
      onAdd={() => void add()}
      sidebarActions={
        section === "monitoring" ? (
          <ActionButton
            variant="ai"
            type="button"
            onClick={() => { void runAiMonitor(); }}
            disabled={monitorAlertsLoading || subjects.length === 0}
          >
            {monitorAlertsLoading ? "Scanning…" : "✦AI"}
          </ActionButton>
        ) : null
      }
    >
      <ModuleHero

        eyebrow=""
        title="Ongoing"
        titleEm="monitoring."
        intro={
          <>
            <strong>Every enrolled subject screened on schedule.</strong>{" "}
            High-risk subjects twice-daily; standard subjects daily or weekly.
            The backend cron ticks hourly and processes all subjects whose cadence window has elapsed.
          </>
        }
        kpis={[
          { value: String(active), label: "active" },
          { value: String(paused), label: "paused", tone: paused > 0 ? "amber" : undefined },
          { value: String(overdue), label: "overdue", tone: overdue > 0 ? "red" : undefined },
          { value: String(subjects.length), label: "total enrolled" },
        ]}
      />


      {/* Section tab bar */}
      <div className="flex items-center gap-1.5 mb-6">
        <button type="button" onClick={() => setSection("monitoring")} className={tabCls(section === "monitoring")}>
          Schedule
        </button>
      </div>

      {/* ── Monitoring section ──────────────────────────────────────────────── */}
      {section === "monitoring" && (
        <>
          {bgError && (
            <div className="mt-3 rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
              <span className="text-red text-14 shrink-0">⚠</span>
              <div>
                <p className="text-12 font-semibold text-red">Error</p>
                <p className="text-11 text-ink-2 mt-0.5">{bgError}</p>
              </div>
            </div>
          )}

          {monitorAlerts && (
            <div className={`mb-4 rounded-lg border p-4 ${monitorAlerts.portfolioHealth === "critical" ? "bg-red-dim border-red/30" : monitorAlerts.portfolioHealth === "attention_required" ? "bg-amber-dim border-amber/30" : "bg-green-dim border-green/30"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-mono text-10 font-semibold px-2 py-px rounded uppercase ${monitorAlerts.portfolioHealth === "critical" ? "bg-red text-white" : monitorAlerts.portfolioHealth === "attention_required" ? "bg-amber-dim text-amber border border-amber/40" : "bg-green-dim text-green border border-green/40"}`}>
                  {monitorAlerts.portfolioHealth.replace("_", " ")}
                </span>
                <span className="text-12 text-ink-1">{monitorAlerts.summary}</span>
              </div>
              {monitorAlerts.immediateEscalations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-10 text-ink-3 font-semibold uppercase tracking-wide-3">Escalate now:</span>
                  {monitorAlerts.immediateEscalations.map((name) => (
                    <span key={name} className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red">{name}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-0">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Enrol subject</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
              <input value={draft.name} onChange={set("name")} placeholder="Subject name" className={inputCls} />
              <input value={draft.caseId} onChange={set("caseId")} placeholder="Case ID (optional)" className={inputCls} />
              <input value={draft.enrolledBy} onChange={set("enrolledBy")} placeholder="Enrolled by" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={draft.tier} onChange={set("tier")} className={inputCls}>
                <option value="high">High risk</option>
                <option value="medium">Medium risk</option>
                <option value="standard">Standard</option>
              </select>
              <select value={draft.cadence} onChange={set("cadence")} className={inputCls}>
                {(Object.entries(CADENCE_LABEL) as [Cadence, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input value={draft.notes} onChange={set("notes")} placeholder="Notes" className={inputCls} />
            </div>
            <button type="button" onClick={add} disabled={!draft.name}
              className="mt-2 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
              + Enrol
            </button>
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-x-auto mt-4">
            <table className="w-full min-w-[400px] text-11">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Subject</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono hidden sm:table-cell">Case</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Tier</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono hidden sm:table-cell">Cadence</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono hidden md:table-cell">Last Run / Result</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono hidden md:table-cell">Next Due</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Status</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono hidden lg:table-cell">Enrolled by</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono"></th>
                </tr>
              </thead>
              <tbody>
                {subjects.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-12 text-ink-3">
                    No subjects enrolled. Use the form above to add subjects.
                  </td></tr>
                ) : subjects.map((s, i) => (
                  editingId === s.id ? (
                    <tr key={s.id} className={i < subjects.length - 1 ? "border-b border-hair" : ""}>
                      <td colSpan={9} className="px-3 py-2">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-1.5">
                          <input value={editDraft.name} onChange={setE("name")} placeholder="Subject name" className="text-12 px-2 py-1 rounded border border-brand bg-bg-0 text-ink-0 col-span-2" />
                          <input value={editDraft.caseId} onChange={setE("caseId")} placeholder="Case ID" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                          <select value={editDraft.tier} onChange={setE("tier")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">
                            <option value="high">High risk</option>
                            <option value="medium">Medium risk</option>
                            <option value="standard">Standard</option>
                          </select>
                          <select value={editDraft.cadence} onChange={setE("cadence")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">
                            {(Object.entries(CADENCE_LABEL) as [Cadence, string][]).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input value={editDraft.notes} onChange={setE("notes")} placeholder="Notes" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 w-56" />
                          <input value={editDraft.enrolledBy} onChange={setE("enrolledBy")} placeholder="Enrolled by" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 w-32" />
                          <button type="button" onClick={() => saveSubjectEdit(s.id)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">✓</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-11 font-medium px-3 py-1 rounded text-red">✕</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                  <tr key={s.id} className={i < subjects.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2 text-ink-0 font-medium">
                      {s.name}
                      {s.asanaTaskUrl && (
                        <AsanaStatus
                          state={{ status: "sent", taskUrl: s.asanaTaskUrl }}
                          className="ml-2 align-middle"
                        />
                      )}
                      {monitorAlerts && (() => {
                        const alert = monitorAlerts.alerts.find((a) => a.subjectId === s.id);
                        if (!alert) return null;
                        const sevCls = alert.severity === "critical" ? "bg-red text-white" : alert.severity === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber";
                        return (
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`font-mono text-9 px-1.5 py-px rounded uppercase ${sevCls}`}>{alert.severity}</span>
                            <span className="text-10 text-ink-2">{alert.description}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2 hidden sm:table-cell">{s.caseId || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${TIER_TONE[s.tier]}`}>
                        {s.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-1 hidden sm:table-cell">{CADENCE_LABEL[s.cadence]}</td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2 hidden md:table-cell">
                      <div>{s.lastRun || "—"}</div>
                      {lastResults[s.id] && (
                        <>
                          <div className={`text-10 font-semibold mt-0.5 ${lastResults[s.id]!.severity === "critical" ? "text-red" : lastResults[s.id]!.severity === "high" ? "text-amber" : "text-green"}`}>
                            {lastResults[s.id]!.severity.toUpperCase()} · {lastResults[s.id]!.topScore}/100
                          </div>
                        </>
                      )}
                      <button type="button" onClick={() => { void screenNow(s); }} disabled={screening[s.id]}
                        className="mt-1 text-10 font-mono text-brand hover:text-brand-deep underline disabled:opacity-50">
                        {screening[s.id] ? "screening…" : "screen now"}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2 hidden md:table-cell">{s.nextDue || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${STATUS_TONE[s.status]}`}>
                          {s.status}
                        </span>
                        <button type="button" onClick={() => togglePause(s.id)}
                          className="text-10 font-mono text-brand hover:text-brand-deep underline">
                          {s.status === "paused" ? "resume" : "pause"}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink-3 text-10 hidden lg:table-cell">{s.enrolledBy || "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <RowActions
                        label={`subject ${s.id}`}
                        onEdit={() => startEdit(s)}
                        onDelete={() => { setRemoveReason(""); setRemoveConfirm({ id: s.id, name: s.name }); }}
                        confirmDelete={false}
                      />
                    </td>
                  </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
            Monitoring runs via the Netlify hourly cron (ongoing-screen function). Results are written to the subject&apos;s case timeline.
            Twice-daily cadence is recommended for all sanctions-hit and PEP subjects per Federal Decree-Law No. 10 of 2025 Art.12.
          </p>
        </>
      )}

      {/* ── Unenrolment confirmation dialog ────────────────────────────────── */}
      {removeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-14 font-semibold text-ink-0 mb-1">Unenrol subject</h3>
            <p className="text-12 text-ink-2 mb-4">
              Remove <span className="font-medium text-ink-0">{removeConfirm.name}</span> from ongoing monitoring?
              This action is recorded in the audit trail (Federal Decree-Law No. 10 of 2025 Art.16).
            </p>
            <label className="block text-11 font-medium text-ink-2 mb-1">
              Reason <span className="text-red">*</span> <span className="text-ink-3">(min 5 characters)</span>
            </label>
            <input
              className="w-full px-3 py-2 border border-hair-2 rounded text-12 bg-bg-1 focus:outline-none focus:border-brand text-ink-0 mb-4"
              placeholder="e.g. Relationship ended, no ongoing risk"
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && removeReason.trim().length >= 5) confirmRemove(); }}
            />
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-12 rounded border border-hair-2 text-ink-2 hover:text-ink-0"
                onClick={() => { setRemoveConfirm(null); setRemoveReason(""); }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-12 rounded bg-red text-white font-medium disabled:opacity-40"
                disabled={removeReason.trim().length < 5}
                onClick={confirmRemove}
              >
                Unenrol
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
