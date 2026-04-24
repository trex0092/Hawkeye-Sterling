"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Ongoing Monitoring Scheduler — manages which subjects are enrolled
// in continuous screening, at what cadence, and tracks last/next run.
// Backend: netlify/functions/ongoing-screen.mts ticks hourly and
// processes subjects whose cadence is due.

type Cadence = "daily" | "twice-daily" | "weekly" | "monthly";
type MonitorStatus = "active" | "paused" | "overdue";

interface MonitoredSubject {
  id: string;
  name: string;
  caseId: string;
  tier: "high" | "medium" | "standard";
  cadence: Cadence;
  status: MonitorStatus;
  lastRun: string; // dd/mm/yyyy HH:MM or ""
  nextDue: string; // dd/mm/yyyy HH:MM or ""
  enrolledBy: string;
  enrolledAt: string; // dd/mm/yyyy
  notes: string;
}

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

/** ISO → "dd/mm/yyyy HH:MM" */
function fmtDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function computeNextDue(lastRun: string, cadence: Cadence): string {
  if (!lastRun) return "—";
  // Try parsing "dd/mm/yyyy HH:MM"
  const m = lastRun.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return "—";
  const d = new Date(parseInt(m[3]!), parseInt(m[2]!) - 1, parseInt(m[1]!), parseInt(m[4]!), parseInt(m[5]!));
  const next = new Date(d.getTime() + CADENCE_HOURS[cadence] * 3_600_000);
  return fmtDateTime(next.toISOString());
}

const DEFAULT_SUBJECTS: MonitoredSubject[] = [
  {
    id: "om-1", name: "Istanbul Gold Refinery", caseId: "CASE-2026-598596",
    tier: "high", cadence: "twice-daily", status: "active",
    lastRun: fmtDateTime(new Date(Date.now() - 6 * 3_600_000).toISOString()),
    nextDue: fmtDateTime(new Date(Date.now() + 6 * 3_600_000).toISOString()),
    enrolledBy: "MLRO", enrolledAt: fmtDate(new Date().toISOString()), notes: "UN-1267 sanctions hit — ongoing EDD",
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
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function OngoingMonitorPage() {
  const [subjects, setSubjects] = useState<MonitoredSubject[]>([]);
  const [draft, setDraft] = useState(BLANK);

  useEffect(() => { setSubjects(load()); }, []);

  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  const add = () => {
    if (!draft.name) return;
    const now = new Date().toISOString();
    const subject: MonitoredSubject = {
      ...draft,
      id: `om-${Date.now()}`,
      status: "active",
      lastRun: "",
      nextDue: fmtDateTime(now),
      enrolledAt: fmtDate(now),
    };
    const next = [...subjects, subject];
    save(next);
    setSubjects(next);
    setDraft(BLANK);
  };

  const togglePause = (id: string) => {
    const next = subjects.map((s) =>
      s.id === id ? { ...s, status: s.status === "paused" ? "active" as const : "paused" as const } : s,
    );
    save(next);
    setSubjects(next);
  };

  const remove = (id: string) => {
    const next = subjects.filter((s) => s.id !== id);
    save(next);
    setSubjects(next);
  };

  const active = subjects.filter((s) => s.status === "active").length;
  const paused = subjects.filter((s) => s.status === "paused").length;
  const overdue = subjects.filter((s) => s.status === "overdue").length;

  return (
    <ModuleLayout narrow>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 24 · Continuous Monitoring"
          title="Ongoing"
          titleEm="monitoring."
          intro={
            <>
              <strong>Every enrolled subject screened on schedule.</strong>{" "}
              High-risk subjects twice-daily; standard subjects daily or
              weekly. The backend cron ticks hourly and processes all
              subjects whose cadence window has elapsed. Results write to
              the case timeline.
            </>
          }
          kpis={[
            { value: String(active), label: "active" },
            { value: String(paused), label: "paused", tone: paused > 0 ? "amber" : undefined },
            { value: String(overdue), label: "overdue", tone: overdue > 0 ? "red" : undefined },
            { value: String(subjects.length), label: "total enrolled" },
          ]}
        />

        {/* Enrol new subject */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
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

        {/* Enrolled subjects */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-4">
          <table className="w-full text-11">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                {["Subject", "Case", "Tier", "Cadence", "Last Run", "Next Due", "Status", "Enrolled by", ""].map((h) => (
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
                <tr key={s.id} className={i < subjects.length - 1 ? "border-b border-hair" : ""}>
                  <td className="px-3 py-2 text-ink-0 font-medium">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-10 text-ink-2">{s.caseId || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${TIER_TONE[s.tier]}`}>
                      {s.tier}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-10 text-ink-1">{CADENCE_LABEL[s.cadence]}</td>
                  <td className="px-3 py-2 font-mono text-10 text-ink-2">{s.lastRun || "—"}</td>
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
                    <button type="button" onClick={() => remove(s.id)}
                      className="text-ink-3 hover:text-red transition-colors"><XIcon /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
          Monitoring runs via the Netlify hourly cron (ongoing-screen function). Results are written to the subject's case timeline.
          Twice-daily cadence is recommended for all sanctions-hit and PEP subjects per FDL 10/2025 Art.12.
          Pausing a subject suspends automatic screening without removing the enrolment record.
        </p>
      </div>
    </ModuleLayout>
  );
}
