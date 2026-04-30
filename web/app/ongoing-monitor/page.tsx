"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { writeAuditEvent } from "@/lib/audit";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
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

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface ScreenResult {
  severity: string;
  topScore: number;
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

  // Enrichment state
  const [enrichName, setEnrichName] = useState("");
  const [enrichLei, setEnrichLei] = useState("");
  const [enrichDomain, setEnrichDomain] = useState("");
  const [enableOsint, setEnableOsint] = useState(false);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  useEffect(() => {
    setSubjects(load());
    (async () => {
      try {
        const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
        const res = await fetch("/api/ongoing", {
          headers: { ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}) },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          subjects?: Array<{ id: string; name: string; caseId?: string; jurisdiction?: string; enrolledAt: string }>;
        };
        if (!data.ok || !Array.isArray(data.subjects)) return;
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
        setSubjects(merged);
        save(merged);
      } catch { /* offline — keep local cache */ }
    })();
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
    const now = new Date().toISOString();
    const subject: MonitoredSubject = {
      ...draft, id: `om-${Date.now()}`, status: "active",
      lastRun: "", nextDue: fmtDateTime(now), enrolledAt: fmtDate(now),
    };
    const next = [...subjects, subject];
    save(next); setSubjects(next); setDraft(BLANK);
    writeAuditEvent(draft.enrolledBy || "analyst", "ongoing.enrolled", `${subject.name} — ${subject.cadence} cadence`);
    try {
      const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
      await fetch("/api/ongoing", {
        method: "POST",
        headers: { "content-type": "application/json", ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}) },
        body: JSON.stringify({ id: subject.id, name: subject.name, ...(subject.caseId ? { caseId: subject.caseId } : {}), cadence: subject.cadence }),
      });
    } catch { /* non-fatal */ }
  };

  const togglePause = (id: string) => {
    const next = subjects.map((s) =>
      s.id === id ? { ...s, status: s.status === "paused" ? "active" as const : "paused" as const } : s,
    );
    save(next); setSubjects(next);
  };

  const remove = async (id: string) => {
    const next = subjects.filter((s) => s.id !== id);
    save(next); setSubjects(next);
    try {
      const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
      await fetch(`/api/ongoing?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}) },
      });
    } catch { /* non-fatal */ }
  };

  const screenNow = async (s: MonitoredSubject) => {
    setScreening((prev) => ({ ...prev, [s.id]: true }));
    try {
      const res = await fetch("/api/quick-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: { name: s.name } }),
      });
      const data = (await res.json()) as { ok: boolean; topScore?: number; severity?: string };
      const nowStr = fmtDateTime(new Date().toISOString());
      const next = subjects.map((sub) =>
        sub.id === s.id ? { ...sub, lastRun: nowStr, nextDue: computeNextDue(nowStr, sub.cadence), status: "active" as const } : sub,
      );
      save(next); setSubjects(next);
      if (data.ok && data.topScore !== undefined) {
        setLastResults((prev) => ({ ...prev, [s.id]: { severity: data.severity ?? "low", topScore: data.topScore ?? 0 } }));
        writeAuditEvent("system", "screening.completed", `${s.name} (${s.id}) — score ${data.topScore} · ${data.severity ?? "low"}`);
      }
    } catch { /* non-fatal */ }
    finally { setScreening((prev) => ({ ...prev, [s.id]: false })); }
  };

  const enrich = async () => {
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
      const data = await res.json() as EnrichResult;
      if (!data.ok) setEnrichError(data.error ?? "Enrichment failed");
      else setEnrichResult(data);
    } catch { setEnrichError("Request failed"); }
    finally { setEnrichLoading(false); }
  };

  const active = subjects.filter((s) => s.status === "active").length;
  const paused = subjects.filter((s) => s.status === "paused").length;
  const overdue = subjects.filter((s) => s.status === "overdue").length;

  return (
    <ModuleLayout asanaModule="ongoing-monitor" asanaLabel="Ongoing Monitor">
      <ModuleHero
        eyebrow="Module 24 · Continuous Monitoring"
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
        <button type="button" onClick={() => setSection("enrichment")} className={tabCls(section === "enrichment")}>
          Subject Enrichment
        </button>
      </div>

      {/* ── Monitoring section ──────────────────────────────────────────────── */}
      {section === "monitoring" && (
        <>
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-0">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Enrol subject</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input value={draft.name} onChange={set("name")} placeholder="Subject name" className={inputCls} />
              <input value={draft.caseId} onChange={set("caseId")} placeholder="Case ID (optional)" className={inputCls} />
              <input value={draft.enrolledBy} onChange={set("enrolledBy")} placeholder="Enrolled by" className={inputCls} />
            </div>
            <div className="grid grid-cols-3 gap-2">
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

          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-4">
            <table className="w-full text-11">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Subject", "Case", "Tier", "Cadence", "Last Run / Result", "Next Due", "Status", "Enrolled by", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                  ))}
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
                        <div className="grid grid-cols-5 gap-2 mb-1.5">
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
                          <button type="button" onClick={() => saveSubjectEdit(s.id)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">Save</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-11 font-medium px-3 py-1 rounded text-ink-2">Cancel</button>
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
                    </td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2">{s.caseId || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${TIER_TONE[s.tier]}`}>
                        {s.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-1">{CADENCE_LABEL[s.cadence]}</td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2">
                      <div>{s.lastRun || "—"}</div>
                      {lastResults[s.id] && (
                        <>
                          <div className={`text-10 font-semibold mt-0.5 ${lastResults[s.id]!.severity === "critical" ? "text-red" : lastResults[s.id]!.severity === "high" ? "text-amber" : "text-green"}`}>
                            {lastResults[s.id]!.severity.toUpperCase()} · {lastResults[s.id]!.topScore}/100
                          </div>
                          <div className="mt-1">
                            <AsanaReportButton payload={{
                              module: "ongoing-monitor",
                              label: s.name,
                              summary: `Ongoing monitoring: ${s.name}; Tier: ${s.tier}; Cadence: ${s.cadence}; Severity: ${lastResults[s.id]!.severity}; Score: ${lastResults[s.id]!.topScore}/100`,
                              metadata: { caseId: s.caseId, tier: s.tier, severity: lastResults[s.id]!.severity, topScore: lastResults[s.id]!.topScore },
                            }} />
                          </div>
                        </>
                      )}
                      <button type="button" onClick={() => { void screenNow(s); }} disabled={screening[s.id]}
                        className="mt-1 text-10 font-mono text-brand hover:text-brand-deep underline disabled:opacity-50">
                        {screening[s.id] ? "screening…" : "screen now"}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2">{s.nextDue || "—"}</td>
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
                    <td className="px-3 py-2 text-ink-3 text-10">{s.enrolledBy || "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <RowActions
                        label={`subject ${s.id}`}
                        onEdit={() => startEdit(s)}
                        onDelete={() => remove(s.id)}
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
            Twice-daily cadence is recommended for all sanctions-hit and PEP subjects per FDL 10/2025 Art.12.
          </p>
        </>
      )}

      {/* ── Enrichment section ──────────────────────────────────────────────── */}
      {section === "enrichment" && (
        <>
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4">
            <div>
              <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                Subject Enrichment / OSINT
              </div>
              <div className="text-12 text-ink-2">
                GLEIF LEI chain · yente sanctions match · Domain intelligence · SpiderFoot OSINT — all in parallel
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-11 font-medium text-ink-2 mb-1">Subject Name *</label>
                <input
                  className="w-full px-3 py-2 border border-hair-2 rounded text-12 bg-bg-1 focus:outline-none focus:border-brand text-ink-0"
                  placeholder="Emirates NBD PJSC"
                  value={enrichName}
                  onChange={(e) => setEnrichName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-11 font-medium text-ink-2 mb-1">LEI (optional)</label>
                <input
                  className="w-full px-3 py-2 border border-hair-2 rounded text-12 font-mono bg-bg-1 focus:outline-none focus:border-brand text-ink-0"
                  placeholder="20-char LEI"
                  value={enrichLei}
                  onChange={(e) => setEnrichLei(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div>
                <label className="block text-11 font-medium text-ink-2 mb-1">Domain (optional)</label>
                <input
                  className="w-full px-3 py-2 border border-hair-2 rounded text-12 bg-bg-1 focus:outline-none focus:border-brand text-ink-0"
                  placeholder="example.com"
                  value={enrichDomain}
                  onChange={(e) => setEnrichDomain(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-12 text-ink-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableOsint}
                  onChange={(e) => setEnableOsint(e.target.checked)}
                  className="rounded"
                />
                Enable SpiderFoot OSINT scan (passive, ~90s)
              </label>
              <button
                type="button"
                onClick={() => { void enrich(); }}
                disabled={enrichLoading || !enrichName.trim()}
                className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {enrichLoading ? "Enriching…" : "Enrich Subject"}
              </button>
            </div>
          </div>

          {enrichLoading && (
            <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center">
              <span className="animate-pulse font-mono text-brand">●</span>
              Running parallel enrichment pipeline…
            </div>
          )}

          {enrichError && (
            <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mt-4">
              <span className="font-semibold">Error:</span> {enrichError}
            </div>
          )}

          {enrichResult && (
            <div className="space-y-4 mt-4">
              {enrichResult.yente && (
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                    Sanctions / PEP Match (yente)
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-12 font-bold ${enrichResult.yente.score >= 0.8 ? "bg-red-dim text-red" : enrichResult.yente.score >= 0.5 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>
                      {Math.round(enrichResult.yente.score * 100)}
                    </div>
                    <div>
                      <p className="font-medium text-ink-0 text-13">{enrichResult.yente.caption}</p>
                      <p className="text-11 text-ink-3">{enrichResult.yente.schema} · Datasets: {enrichResult.yente.datasets.join(", ")}</p>
                    </div>
                  </div>
                </div>
              )}

              {enrichResult.gleif?.ok && enrichResult.gleif.ownershipChain.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                    Beneficial Ownership Chain (GLEIF)
                  </div>
                  <div className="space-y-2">
                    {enrichResult.gleif.ownershipChain.map((node) => (
                      <div key={node.lei} className="flex items-center gap-3 text-12">
                        <div className="w-6 h-6 rounded-full bg-brand-dim text-brand text-10 flex items-center justify-center font-bold flex-shrink-0">{node.depth}</div>
                        <span className="font-medium text-ink-0">{node.legalName}</span>
                        <span className="text-ink-3 text-11">{node.jurisdiction}</span>
                        {node.relationshipType === "ultimate" && (
                          <span className="text-10 bg-brand-dim text-brand px-1.5 py-px rounded font-semibold">UBO</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enrichResult.domainIntel?.ok && (
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                    Domain Intelligence ({enrichResult.domainIntel.domain})
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-12 font-bold px-3 py-1 rounded ${enrichResult.domainIntel.riskScore >= 70 ? "bg-red-dim text-red" : enrichResult.domainIntel.riskScore >= 40 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>
                      Risk: {enrichResult.domainIntel.riskScore}/100
                    </span>
                    {enrichResult.domainIntel.malware?.flagged && (
                      <span className="text-11 bg-red-dim text-red px-2 py-0.5 rounded font-semibold">MALWARE FLAGGED</span>
                    )}
                    {enrichResult.domainIntel.emailSecurity && (
                      <span className={`text-11 px-2 py-0.5 rounded font-semibold ${enrichResult.domainIntel.emailSecurity.spoofingRisk === "high" ? "bg-red-dim text-red" : "bg-bg-1 text-ink-2"}`}>
                        Spoofing: {enrichResult.domainIntel.emailSecurity.spoofingRisk.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {enrichResult.domainIntel.riskFactors.length > 0 && (
                    <ul className="space-y-1">
                      {enrichResult.domainIntel.riskFactors.map((f, i) => (
                        <li key={i} className="text-11 text-red flex gap-1.5"><span>⚠</span>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {enrichResult.osint && (
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                    OSINT Scan (SpiderFoot) — {enrichResult.osint.status}
                  </div>
                  {enrichResult.osint.ok ? (
                    <div className="grid grid-cols-2 gap-4 text-12">
                      <div>
                        <p className="text-ink-3 text-11 mb-1">Email Addresses ({enrichResult.osint.summary.emailAddresses.length})</p>
                        {enrichResult.osint.summary.emailAddresses.slice(0, 5).map((e) => (
                          <p key={e} className="font-mono text-11 text-ink-1">{e}</p>
                        ))}
                      </div>
                      <div>
                        <p className="text-ink-3 text-11 mb-1">Social Profiles ({enrichResult.osint.summary.socialProfiles.length})</p>
                        {enrichResult.osint.summary.socialProfiles.slice(0, 5).map((s) => (
                          <p key={s} className="text-11 text-ink-1 truncate">{s}</p>
                        ))}
                      </div>
                      {enrichResult.osint.summary.riskIndicators.length > 0 && (
                        <div className="col-span-2">
                          <p className="text-ink-3 text-11 mb-1">Risk Indicators ({enrichResult.osint.summary.riskIndicators.length})</p>
                          {enrichResult.osint.summary.riskIndicators.slice(0, 5).map((r) => (
                            <p key={r} className="text-11 text-red">{r}</p>
                          ))}
                        </div>
                      )}
                      {enrichResult.osint.summary.breachData.length > 0 && (
                        <div className="col-span-2">
                          <p className="text-11 font-semibold text-red">{enrichResult.osint.summary.breachData.length} breach record(s) found</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-11 text-ink-3">SpiderFoot not configured (set SPIDERFOOT_URL) or scan failed.</p>
                  )}
                </div>
              )}

              <p className="text-11 text-ink-3 text-right">
                Enriched at {new Date(enrichResult.enrichedAt).toLocaleString()}
              </p>
            </div>
          )}
        </>
      )}
    </ModuleLayout>
  );
}
