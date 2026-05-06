"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";

// ── Training Log ─────────────────────────────────────────────────────────────

interface TrainingRow {
  id: string;
  name: string;
  course: string;
  provider: string;
  completed: string;
  durationHrs: string;
  delivery: string;
  status: "current" | "expiring" | "expired";
}

const STORAGE = "hawkeye.training.v2";

const DEFAULT_ROWS: TrainingRow[] = [
  {
    id: "t1",
    name: "Luisa Fernanda",
    course: "FDL 10/2025 · AML/CFT refresher",
    provider: "CBUAE",
    completed: "2026-02-14",
    durationHrs: "8",
    delivery: "Online",
    status: "current",
  },
  {
    id: "t2",
    name: "Luisa Fernanda",
    course: "LBMA Responsible Gold Guidance v9",
    provider: "LBMA",
    completed: "2025-11-08",
    durationHrs: "4",
    delivery: "Online",
    status: "current",
  },
  {
    id: "t3",
    name: "Luisa Fernanda",
    course: "goAML Web Submission · Reporter module",
    provider: "UNODC",
    completed: "2025-03-02",
    durationHrs: "3",
    delivery: "Online",
    status: "expiring",
  },
  {
    id: "t4",
    name: "Analyst 1",
    course: "FATF R.10 / R.12 — CDD + PEP",
    provider: "ACAMS",
    completed: "2024-06-18",
    durationHrs: "6",
    delivery: "Classroom",
    status: "expired",
  },
];

function parseDMY(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  if (!d || !mo) return "";
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function fmtDMY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function deriveStatus(completedIso: string): TrainingRow["status"] {
  if (!completedIso) return "current";
  const expiresTs = new Date(completedIso).getTime() + 365 * 86_400_000;
  const now = Date.now();
  if (expiresTs - now > 30 * 86_400_000) return "current";
  if (expiresTs > now) return "expiring";
  return "expired";
}

function load(): TrainingRow[] {
  if (typeof window === "undefined") return DEFAULT_ROWS;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as TrainingRow[]) : DEFAULT_ROWS;
  } catch {
    return DEFAULT_ROWS;
  }
}

function save(rows: TrainingRow[]) {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(rows));
  } catch {
    /* */
  }
}

const LOG_STATUS_TONE: Record<TrainingRow["status"], string> = {
  current: "bg-green-dim text-green",
  expiring: "bg-amber-dim text-amber",
  expired: "bg-red-dim text-red",
};

const BLANK = { name: "", course: "", provider: "", completed: "", durationHrs: "", delivery: "" };

// ── Annual Programme ──────────────────────────────────────────────────────────

type ProgrammeStatus = "completed" | "in-progress" | "planned";

interface ProgrammeSession {
  session: number;
  month: string;
  dateWeek: string;
  subject: string;
  durationHrs: number;
  audience: string;
  areas: string;
  activities: string;
  regulatoryBasis: string;
  status: ProgrammeStatus;
}

const PROG_STATUS_TONE: Record<ProgrammeStatus, string> = {
  completed: "bg-green-dim text-green",
  "in-progress": "bg-amber-dim text-amber",
  planned: "bg-bg-2 text-ink-2",
};

const PROG_STATUS_LABEL: Record<ProgrammeStatus, string> = {
  completed: "Completed",
  "in-progress": "In Progress",
  planned: "Planned",
};

const ANNUAL_PROGRAMME: ProgrammeSession[] = [
  // January
  { session: 1, month: "January", dateWeek: "Wk 1 · Jan 5", subject: "AML/CFT Foundations Refresher", durationHrs: 2, audience: "All Staff", areas: "AML/CFT fundamentals; regulatory landscape", activities: "Online module + quiz", regulatoryBasis: "FDL 10/2025 Art. 16", status: "completed" },
  { session: 2, month: "January", dateWeek: "Wk 2 · Jan 12", subject: "Sanctions Screening Procedures", durationHrs: 3, audience: "Operations · Compliance", areas: "Sanctions compliance; list management", activities: "Workshop + scenario drill", regulatoryBasis: "Cabinet Res. 10/2019", status: "completed" },
  { session: 3, month: "January", dateWeek: "Wk 3 · Jan 19", subject: "PEP Identification & EDD", durationHrs: 2, audience: "MLRO · Compliance", areas: "PEP risk; enhanced due diligence", activities: "Case-study review", regulatoryBasis: "FATF R.12", status: "completed" },
  // February
  { session: 4, month: "February", dateWeek: "Wk 1 · Feb 2", subject: "goAML STR/SAR Filing", durationHrs: 3, audience: "MLRO · Compliance", areas: "Suspicious transaction reporting", activities: "Practical drill on goAML portal", regulatoryBasis: "CBUAE Notice 2021/8", status: "completed" },
  { session: 5, month: "February", dateWeek: "Wk 2 · Feb 9", subject: "LBMA Responsible Gold Guidance v9", durationHrs: 4, audience: "All Staff", areas: "Gold sourcing compliance; conflict minerals", activities: "Online module (LBMA e-learning)", regulatoryBasis: "LBMA RGG v9", status: "completed" },
  { session: 6, month: "February", dateWeek: "Wk 3 · Feb 16", subject: "Transaction Monitoring Tuning", durationHrs: 2, audience: "Operations · IT", areas: "TM rules calibration; false-positive reduction", activities: "System walkthrough + workshop", regulatoryBasis: "FATF R.10", status: "completed" },
  // March
  { session: 7, month: "March", dateWeek: "Wk 1 · Mar 2", subject: "CDD & EDD Procedures", durationHrs: 3, audience: "All Staff", areas: "Customer due diligence; ongoing monitoring", activities: "Online module + quiz", regulatoryBasis: "FDL 10/2025 Art. 7", status: "completed" },
  { session: 8, month: "March", dateWeek: "Wk 2 · Mar 9", subject: "UBO Identification & Verification", durationHrs: 2, audience: "Operations · Compliance", areas: "Beneficial ownership; corporate structures", activities: "Case studies + Q&A", regulatoryBasis: "Cabinet Res. 58/2020", status: "completed" },
  { session: 9, month: "March", dateWeek: "Wk 3 · Mar 16", subject: "Annual Risk Assessment Workshop", durationHrs: 4, audience: "Senior Management · MLRO", areas: "EWRA/BWRA methodology; risk scoring", activities: "Facilitated workshop", regulatoryBasis: "FATF R.1", status: "completed" },
  // April
  { session: 10, month: "April", dateWeek: "Wk 1 · Apr 6", subject: "Tipping-Off & Confidentiality Obligations", durationHrs: 2, audience: "All Staff", areas: "Legal prohibitions; internal escalation", activities: "Online module + quiz", regulatoryBasis: "FDL 10/2025 Art. 29", status: "completed" },
  { session: 11, month: "April", dateWeek: "Wk 2 · Apr 13", subject: "SAR Quality Assurance (Four-Eyes)", durationHrs: 3, audience: "MLRO · Compliance", areas: "SAR drafting; four-eyes review standard", activities: "Live peer-review exercise", regulatoryBasis: "CBUAE Notice 2021/8", status: "completed" },
  { session: 12, month: "April", dateWeek: "Wk 3 · Apr 20", subject: "Correspondent Banking Risk", durationHrs: 2, audience: "Senior Management · MLRO", areas: "CB due diligence; respondent risk scoring", activities: "Case studies", regulatoryBasis: "FATF R.13", status: "in-progress" },
  // May
  { session: 13, month: "May", dateWeek: "Wk 1 · May 4", subject: "Trade-Based Money Laundering", durationHrs: 3, audience: "Operations · Compliance", areas: "TBML red flags; trade document review", activities: "Workshop + scenario drill", regulatoryBasis: "FATF R.16", status: "planned" },
  { session: 14, month: "May", dateWeek: "Wk 2 · May 11", subject: "UAE PDPL Data Privacy Obligations", durationHrs: 2, audience: "All Staff", areas: "Data subject rights; retention limits", activities: "Online module", regulatoryBasis: "UAE PDPL 2021", status: "planned" },
  { session: 15, month: "May", dateWeek: "Wk 3 · May 18", subject: "Virtual Asset & VASP Risk", durationHrs: 3, audience: "MLRO · Senior Management", areas: "VA typologies; VASP customer due diligence", activities: "Webinar (CBUAE series)", regulatoryBasis: "CBUAE VASP Regs 2023", status: "planned" },
  // June
  { session: 16, month: "June", dateWeek: "Wk 1 · Jun 1", subject: "H1 Programme Review & KPI Debrief", durationHrs: 2, audience: "MLRO · Senior Management", areas: "Training KPIs; gap analysis; H2 planning", activities: "Review meeting", regulatoryBasis: "Internal Charter", status: "planned" },
  { session: 17, month: "June", dateWeek: "Wk 2 · Jun 8", subject: "Proliferation Financing Awareness", durationHrs: 3, audience: "All Staff", areas: "PF red flags; UN/EU/US PF lists", activities: "Online module + quiz", regulatoryBasis: "FDL 10/2025 Art. 2", status: "planned" },
  { session: 18, month: "June", dateWeek: "Wk 3 · Jun 15", subject: "Typology Clinic: Structuring & Layering", durationHrs: 2, audience: "Operations · Compliance", areas: "Transaction structuring; layering techniques", activities: "Case-study clinic", regulatoryBasis: "FATF Typologies 2024", status: "planned" },
  // July
  { session: 19, month: "July", dateWeek: "Wk 1 · Jul 6", subject: "Art. 19 Adverse Media Lookback Audit", durationHrs: 4, audience: "MLRO · Compliance", areas: "10-year FDL Art. 19 lookback; audit trail", activities: "Audit exercise", regulatoryBasis: "FDL 10/2025 Art. 19", status: "planned" },
  { session: 20, month: "July", dateWeek: "Wk 2 · Jul 13", subject: "Correspondent Banking DD — Update", durationHrs: 3, audience: "Operations · MLRO", areas: "Respondent due diligence; updated questionnaire", activities: "Workshop", regulatoryBasis: "FATF R.13", status: "planned" },
  { session: 21, month: "July", dateWeek: "Wk 3 · Jul 21", subject: "Cyber-Enabled Financial Crime", durationHrs: 2, audience: "IT · Operations", areas: "Cyber-enabled fraud; BEC; account takeover", activities: "Webinar", regulatoryBasis: "CBUAE Cyber Regs 2023", status: "planned" },
  // August
  { session: 22, month: "August", dateWeek: "Wk 1 · Aug 3", subject: "Periodic CDD Review Procedures", durationHrs: 3, audience: "Operations · Compliance", areas: "Re-KYC triggers; risk-based review cycle", activities: "Practical drill", regulatoryBasis: "FDL 10/2025 Art. 7", status: "planned" },
  { session: 23, month: "August", dateWeek: "Wk 2 · Aug 10", subject: "Whistleblower & Speak-Up Policy", durationHrs: 2, audience: "All Staff", areas: "Protected disclosure; internal reporting channels", activities: "Online module", regulatoryBasis: "FDL 10/2025 Art. 29", status: "planned" },
  { session: 24, month: "August", dateWeek: "Wk 3 · Aug 17", subject: "MLRO Desk Simulation", durationHrs: 4, audience: "MLRO", areas: "End-to-end case management; STR decision gate", activities: "Full simulation exercise", regulatoryBasis: "CBUAE MLRO Guidance 2022", status: "planned" },
  // September
  { session: 25, month: "September", dateWeek: "Wk 1 · Sep 7", subject: "Mid-Year Regulatory Update", durationHrs: 3, audience: "All Staff", areas: "New regulations; enforcement actions; FATF news", activities: "Webinar (external speaker)", regulatoryBasis: "Multiple — CBUAE/FATF", status: "planned" },
  { session: 26, month: "September", dateWeek: "Wk 2 · Sep 14", subject: "Sanctions Evasion Red Flags", durationHrs: 3, audience: "Operations · Compliance", areas: "Evasion typologies; shell company indicators", activities: "Case-study review", regulatoryBasis: "Cabinet Res. 10/2019", status: "planned" },
  { session: 27, month: "September", dateWeek: "Wk 3 · Sep 21", subject: "ESG & Greenwashing Financial Crime", durationHrs: 2, audience: "Senior Management · MLRO", areas: "Environmental financial crime; green bond risk", activities: "Webinar", regulatoryBasis: "FATF Green Finance 2024", status: "planned" },
  // October
  { session: 28, month: "October", dateWeek: "Wk 1 · Oct 5", subject: "FATF Mutual Evaluation Readiness", durationHrs: 4, audience: "MLRO · Senior Management", areas: "MER preparation; effectiveness criteria", activities: "Workshop (external consultant)", regulatoryBasis: "FATF R.33–34", status: "planned" },
  { session: 29, month: "October", dateWeek: "Wk 2 · Oct 12", subject: "Third-Party & Supplier Due Diligence", durationHrs: 3, audience: "Operations · Procurement", areas: "Third-party risk; outsourcing controls", activities: "Online module + scenario", regulatoryBasis: "FDL 10/2025 Art. 12", status: "planned" },
  { session: 30, month: "October", dateWeek: "Wk 3 · Oct 19", subject: "AI & Deepfake-Enabled Fraud", durationHrs: 2, audience: "All Staff", areas: "AI-enabled financial crime; synthetic identity", activities: "Webinar", regulatoryBasis: "FATF Emerging Risks 2025", status: "planned" },
  // November
  { session: 31, month: "November", dateWeek: "Wk 1 · Nov 2", subject: "goAML Advanced STR/SAR Drafting", durationHrs: 3, audience: "MLRO · Compliance", areas: "Complex case narration; supporting documentation", activities: "Practical drill", regulatoryBasis: "UNODC goAML Guide v4", status: "planned" },
  { session: 32, month: "November", dateWeek: "Wk 2 · Nov 9", subject: "Record-Keeping & Data Quality", durationHrs: 2, audience: "Operations · IT", areas: "Retention obligations; data completeness", activities: "Online module", regulatoryBasis: "FDL 10/2025 Art. 22", status: "planned" },
  { session: 33, month: "November", dateWeek: "Wk 3 · Nov 16", subject: "Year-End Compliance Review", durationHrs: 4, audience: "All Staff", areas: "Annual programme review; gap analysis; lessons learned", activities: "Review session + group discussion", regulatoryBasis: "Internal Charter", status: "planned" },
  // December
  { session: 34, month: "December", dateWeek: "Wk 1 · Dec 7", subject: "2027 Programme Planning", durationHrs: 3, audience: "MLRO · Senior Management", areas: "Regulatory horizon; programme design; resourcing", activities: "Workshop", regulatoryBasis: "CBUAE AML Strategy 2026", status: "planned" },
  { session: 35, month: "December", dateWeek: "Wk 2 · Dec 14", subject: "Annual Assessments & Certifications", durationHrs: 4, audience: "All Staff", areas: "Knowledge assessment; certification renewal", activities: "Online assessment (proctored)", regulatoryBasis: "FDL 10/2025 Art. 16", status: "planned" },
  { session: 36, month: "December", dateWeek: "Wk 3 · Dec 21", subject: "MLRO Annual Report Preparation", durationHrs: 3, audience: "MLRO · Senior Management", areas: "Regulatory reporting; metrics compilation", activities: "Workshop", regulatoryBasis: "CBUAE Notice 2021/4", status: "planned" },
];

const PROG_TOTAL_HRS = ANNUAL_PROGRAMME.reduce((s, r) => s + r.durationHrs, 0);
const PROG_COMPLETED = ANNUAL_PROGRAMME.filter((r) => r.status === "completed").length;
const PROG_IN_PROGRESS = ANNUAL_PROGRAMME.filter((r) => r.status === "in-progress").length;

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "log" | "programme";

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("log");
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(BLANK);

  // Annual Programme state (mutable overlay over static data)
  const [progRows, setProgRows] = useState<ProgrammeSession[]>(() => [...ANNUAL_PROGRAMME]);
  const [progEditingSession, setProgEditingSession] = useState<number | null>(null);
  const [progEditDraft, setProgEditDraft] = useState<Partial<ProgrammeSession>>({});

  const startProgEdit = (s: ProgrammeSession) => {
    setProgEditingSession(s.session);
    setProgEditDraft({ ...s });
  };
  const saveProgEdit = () => {
    if (progEditingSession === null) return;
    setProgRows((prev) => prev.map((s) => s.session === progEditingSession ? { ...s, ...progEditDraft } as ProgrammeSession : s));
    setProgEditingSession(null);
    setProgEditDraft({});
  };
  const deleteProgRow = (session: number) => {
    setProgRows((prev) => prev.filter((s) => s.session !== session));
  };

  useEffect(() => {
    setRows(load());
  }, []);

  const startEdit = (r: TrainingRow) => {
    setEditingId(r.id);
    setEditDraft({ name: r.name, course: r.course, provider: r.provider, completed: fmtDMY(r.completed), durationHrs: r.durationHrs, delivery: r.delivery });
  };

  const saveRowEdit = (id: string) => {
    const completedIso = parseDMY(editDraft.completed);
    const next = rows.map((r) => r.id !== id ? r : {
      ...r,
      name: editDraft.name || r.name,
      course: editDraft.course || r.course,
      provider: editDraft.provider,
      completed: completedIso || r.completed,
      durationHrs: editDraft.durationHrs,
      delivery: editDraft.delivery,
      status: deriveStatus(completedIso || r.completed),
    });
    save(next);
    setRows(next);
    setEditingId(null);
  };

  const setEdit = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditDraft((d) => ({ ...d, [k]: e.target.value }));

  const add = () => {
    if (!draft.name || !draft.course) return;
    const completedIso = parseDMY(draft.completed);
    const next: TrainingRow[] = [
      ...rows,
      {
        id: `t${Date.now()}`,
        name: draft.name,
        course: draft.course,
        provider: draft.provider,
        completed: completedIso || draft.completed,
        durationHrs: draft.durationHrs,
        delivery: draft.delivery,
        status: deriveStatus(completedIso),
      },
    ];
    save(next);
    setRows(next);
    setDraft(BLANK);
  };

  const remove = (id: string) => {
    const next = rows.filter((r) => r.id !== id);
    save(next);
    setRows(next);
  };

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <ModuleLayout asanaModule="training" asanaLabel="Training">
      <ModuleHero
          moduleNumber={18}
          eyebrow="Module 15 · Staff certification"
          title="Training"
          titleEm="log."
          intro={
            <>
              <strong>Who took what, when it expires.</strong> Auditor-demanded
              artefact under FDL 10/2025 Art. 16 — every AML/CFT team member
              must have current training on the relevant frameworks. Log tracks
              individual completion; Annual Programme tracks the 2026 scheduled
              sessions.
            </>
          }
          kpis={[
            {
              value: String(rows.filter((r) => r.status === "expired").length),
              label: "expired",
              tone: rows.some((r) => r.status === "expired") ? "red" : undefined,
            },
            {
              value: String(rows.filter((r) => r.status === "expiring").length),
              label: "expiring soon",
              tone: rows.some((r) => r.status === "expiring") ? "amber" : undefined,
            },
            { value: String(rows.filter((r) => r.status === "current").length), label: "current" },
            { value: `${PROG_COMPLETED}/${ANNUAL_PROGRAMME.length}`, label: "sessions 2026" },
          ]}
        />

        {/* Tab switcher */}
        <div className="flex gap-1 mt-6 mb-4 border-b border-hair-2">
          {(["log", "programme"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-12 font-medium rounded-t transition-colors -mb-px border border-transparent ${
                activeTab === t
                  ? "bg-bg-panel border-hair-2 border-b-bg-panel text-ink-0"
                  : "text-ink-2 hover:text-ink-0"
              }`}
            >
              {t === "log" ? "Training Log" : "Annual Programme 2026"}
            </button>
          ))}
        </div>

        {activeTab === "log" && (
          <>
            <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
              <table className="w-full text-12">
                <thead className="bg-bg-1 border-b border-hair-2">
                  <tr>
                    {["Name", "Course", "Training Provider", "Completed", "Duration (Hrs)", "Delivery Method", "Status", ""].map((h) => (
                      <th
                        key={h}
                        className={`text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono ${h === "" ? "w-8" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    editingId === r.id ? (
                      <tr key={r.id} className={i < rows.length - 1 ? "border-b border-hair" : ""}>
                        <td colSpan={8} className="px-3 py-2">
                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-1.5">
                            <input value={editDraft.name} onChange={setEdit("name")} placeholder="Name" className="text-12 px-2 py-1 rounded border border-brand bg-bg-0 text-ink-0 col-span-1" />
                            <input value={editDraft.course} onChange={setEdit("course")} placeholder="Course" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 col-span-2" />
                            <input value={editDraft.provider} onChange={setEdit("provider")} placeholder="Provider" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                            <input value={editDraft.completed} onChange={setEdit("completed")} placeholder="dd/mm/yyyy" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                            <input value={editDraft.durationHrs} onChange={setEdit("durationHrs")} type="number" min="0" step="0.5" placeholder="Hrs" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                          </div>
                          <div className="flex gap-2 items-center">
                            <input value={editDraft.delivery} onChange={setEdit("delivery")} placeholder="Delivery method" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 w-40" />
                            <button type="button" onClick={() => saveRowEdit(r.id)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">✓</button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-11 font-medium px-3 py-1 rounded text-red">✕</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                    <tr
                      key={r.id}
                      className={i < rows.length - 1 ? "border-b border-hair" : ""}
                    >
                      <td className="px-3 py-2 text-ink-0">{r.name}</td>
                      <td className="px-3 py-2 text-ink-1">{r.course}</td>
                      <td className="px-3 py-2 text-ink-1">{r.provider}</td>
                      <td className="px-3 py-2 font-mono text-11 text-ink-2">{fmtDMY(r.completed)}</td>
                      <td className="px-3 py-2 font-mono text-11 text-ink-2 text-center">{r.durationHrs}</td>
                      <td className="px-3 py-2 text-11 text-ink-2">{r.delivery}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${LOG_STATUS_TONE[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <RowActions
                          label={`training row ${r.id}`}
                          onEdit={() => startEdit(r)}
                          onDelete={() => remove(r.id)}
                          confirmDelete={false}
                        />
                      </td>
                    </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-4">
              <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
                Log new training
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                <input value={draft.name} onChange={set("name")} placeholder="Name" className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
                <input value={draft.course} onChange={set("course")} placeholder="Course" className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
                <input value={draft.provider} onChange={set("provider")} placeholder="Training Provider" className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={draft.completed} onChange={set("completed")} placeholder="Completed dd/mm/yyyy" className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
                <input value={draft.durationHrs} onChange={set("durationHrs")} placeholder="Duration (Hrs)" type="number" min="0" step="0.5" className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
                <input value={draft.delivery} onChange={set("delivery")} placeholder="Delivery Method" className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
              </div>
              <button
                type="button"
                onClick={add}
                disabled={!draft.name || !draft.course}
                className="mt-3 text-11 font-semibold px-3 py-1.5 rounded bg-brand-dim text-brand border border-brand/40 hover:bg-brand/20 disabled:opacity-40 transition-colors"
              >
                + Log training
              </button>
            </div>
          </>
        )}

        {activeTab === "programme" && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Total Sessions", value: "36", sub: "Jan – Dec 2026" },
                { label: "Completed", value: String(PROG_COMPLETED), sub: `${Math.round((PROG_COMPLETED / 36) * 100)}% of programme` },
                { label: "In Progress", value: String(PROG_IN_PROGRESS), sub: "Current week" },
                { label: "Total Hours", value: String(PROG_TOTAL_HRS), sub: "Scheduled training" },
              ].map((s) => (
                <div key={s.label} className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3">
                  <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-mono mb-0.5">{s.label}</div>
                  <div className="text-22 font-semibold text-ink-0 leading-none">{s.value}</div>
                  <div className="text-10 text-ink-3 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Programme table */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-12 min-w-[1100px]">
                  <thead className="bg-bg-1 border-b border-hair-2">
                    <tr>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-10">#</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-24">Month</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-28">Date (Week)</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Subject</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-16">Hrs</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-40">Target Audience</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-52">Areas of Training</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-44">Training Activities</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-40">Regulatory Basis</th>
                      <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono w-28">Status</th>
                      <th className="w-[48px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {progRows.map((s, i) => {
                      const isLast = i === progRows.length - 1;
                      const isMonthStart = i === 0 || progRows[i - 1]?.month !== s.month;
                      const editing = progEditingSession === s.session;
                      return editing ? (
                        <tr key={s.session} className="border-b border-hair bg-bg-1">
                          <td colSpan={11} className="px-3 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                              <input value={progEditDraft.subject ?? ""} onChange={(e) => setProgEditDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Subject" className="col-span-2 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded text-ink-0" />
                              <input value={progEditDraft.dateWeek ?? ""} onChange={(e) => setProgEditDraft((d) => ({ ...d, dateWeek: e.target.value }))} placeholder="Date / Week" className="px-2 py-1 text-11 bg-bg-0 border border-hair-2 rounded text-ink-0 font-mono" />
                              <input value={String(progEditDraft.durationHrs ?? "")} onChange={(e) => setProgEditDraft((d) => ({ ...d, durationHrs: Number(e.target.value) }))} placeholder="Hrs" type="number" min={0} step={0.5} className="px-2 py-1 text-11 bg-bg-0 border border-hair-2 rounded text-ink-0 font-mono" />
                              <input value={progEditDraft.audience ?? ""} onChange={(e) => setProgEditDraft((d) => ({ ...d, audience: e.target.value }))} placeholder="Audience" className="px-2 py-1 text-11 bg-bg-0 border border-hair-2 rounded text-ink-0" />
                              <input value={progEditDraft.activities ?? ""} onChange={(e) => setProgEditDraft((d) => ({ ...d, activities: e.target.value }))} placeholder="Activities" className="px-2 py-1 text-11 bg-bg-0 border border-hair-2 rounded text-ink-0" />
                              <input value={progEditDraft.regulatoryBasis ?? ""} onChange={(e) => setProgEditDraft((d) => ({ ...d, regulatoryBasis: e.target.value }))} placeholder="Regulatory Basis" className="px-2 py-1 text-11 bg-bg-0 border border-hair-2 rounded text-ink-0 font-mono" />
                              <select value={progEditDraft.status ?? "planned"} onChange={(e) => setProgEditDraft((d) => ({ ...d, status: e.target.value as ProgrammeStatus }))} className="px-2 py-1 text-11 bg-bg-0 border border-hair-2 rounded text-ink-0">
                                <option value="completed">Completed</option>
                                <option value="in-progress">In Progress</option>
                                <option value="planned">Planned</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={saveProgEdit} className="text-11 px-3 py-1 bg-brand text-white rounded font-semibold hover:bg-brand-hover">✓</button>
                              <button type="button" onClick={() => { setProgEditingSession(null); setProgEditDraft({}); }} className="text-11 px-3 py-1 border border-hair-2 rounded text-ink-2 hover:text-ink-0">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          key={s.session}
                          className={[
                            !isLast ? "border-b border-hair" : "",
                            isMonthStart && i > 0 ? "border-t-2 border-hair-2" : "",
                          ].join(" ")}
                        >
                          <td className="px-3 py-2 font-mono text-10 text-ink-3">{s.session}</td>
                          <td className="px-3 py-2 text-11 text-ink-2 font-medium">{isMonthStart ? s.month : ""}</td>
                          <td className="px-3 py-2 font-mono text-11 text-ink-2">{s.dateWeek}</td>
                          <td className="px-3 py-2 text-ink-0 font-medium">{s.subject}</td>
                          <td className="px-3 py-2 font-mono text-11 text-ink-2 text-center">{s.durationHrs}</td>
                          <td className="px-3 py-2 text-11 text-ink-1">{s.audience}</td>
                          <td className="px-3 py-2 text-11 text-ink-2">{s.areas}</td>
                          <td className="px-3 py-2 text-11 text-ink-2">{s.activities}</td>
                          <td className="px-3 py-2 font-mono text-10 text-ink-2">{s.regulatoryBasis}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold whitespace-nowrap ${PROG_STATUS_TONE[s.status]}`}>
                              {PROG_STATUS_LABEL[s.status]}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <RowActions
                              label={`session ${s.session}`}
                              onEdit={() => startProgEdit(s)}
                              onDelete={() => deleteProgRow(s.session)}
                              confirmDelete={false}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 text-10 text-ink-3 font-mono">
              Programme reflects FDL 10/2025 Art. 16 annual training obligation. Status as at 24 Apr 2026.
            </div>
          </>
        )}
    </ModuleLayout>
  );
}
