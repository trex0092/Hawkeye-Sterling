"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import { RowActions } from "@/components/shared/RowActions";
import { formatDMY, parseDMY } from "@/lib/utils/dateFormat";

// ── Customer & Counterparty CDD Assessment ────────────────────────────────────
// A live, interactive version of the operator's 8-section CDD assessment
// (Customer Information → Sanctions → Adverse Media → Identifications → PF →
// RBA → Sign-off → Version Control). For a precious-metals dealer the same
// counterparty buys and sells, so this single file serves customers and
// suppliers alike. The form layers a "watchdog" on top of the static
// document: it flags expired licences / IDs, pending documents, and stale
// screening, and refuses an "Approved" sign-off while blocking issues remain
// (FG/KYC asks for "a defined risk rating scale and a record of periodic
// reviews to enhance traceability").

type ScreenResult = "Negative" | "Positive" | "Pending";
type Finding = "Negative" | "Positive" | "Pending";
type RiskLevel = "Low" | "Medium" | "High";
type RiskClass = "Low Risk" | "Medium Risk" | "High Risk";
type CddLevel = "Standard CDD" | "Simplified CDD" | "Enhanced CDD";
type Decision = "Approved" | "Rejected" | "Pending";
type ProofStatus = "Provided" | "Pending";
type YesNeg = "Negative" | "Positive";
type IndividualKind = "Individual" | "Corporate";
type VersionType = "Initial" | "Periodic" | "Trigger";

interface SanctionsRow { list: string; result: ScreenResult; date: string; remarks: string }
interface AdverseRow { category: string; finding: Finding; details: string }
interface IdentificationRow {
  designation: string;
  name: string;
  sharesPct: string;
  kind: IndividualKind;
  nationality: string;
  gender: string;
  dob: string;
  passportNumber: string;
  passportExpiry: string;
  emiratesId: string;
  emiratesIdExpiry: string;
  proofOfAddress: ProofStatus;
  pepStatus: YesNeg;
}
interface PfRow { factor: string; level: RiskLevel; notes: string }
interface VersionRow { ver: string; date: string; by: string; type: VersionType; summary: string }

interface Assessment {
  id: string;
  // Section 1 — Customer information
  companyName: string;
  countryOfRegistration: string;
  dateOfRegistration: string;
  commercialRegister: string;
  licenseExpiry: string;
  goamlStatus: "Registered" | "Not Registered" | "Pending";
  fatfGreyList: YesNeg;
  cahra: YesNeg;
  pepStatus: YesNeg;
  // Section 2 — Sanctions screening
  sanctions: SanctionsRow[];
  // Section 3 — Adverse media
  adverseMedia: AdverseRow[];
  // Section 4 — Identifications
  identifications: IdentificationRow[];
  // Section 5 — Proliferation financing
  pf: PfRow[];
  pfConclusion: RiskLevel;
  // Section 6 — RBA
  overallRisk: RiskClass;
  cddLevel: CddLevel;
  decision: Decision;
  triggerEvents: boolean;
  // Section 7 — Sign-off
  preparedBy: string;
  preparedByRole: string;
  approvedBy: string;
  approvedByRole: string;
  // Section 8 — Version control
  versions: VersionRow[];
  // Meta
  reviewDate: string; // "as-of" date used for expiry checks (dd/mm/yyyy)
  updatedAt: string;
}

const STORAGE = "hawkeye.cdd-assessment.v1";

const SANCTIONS_LISTS = [
  "UAE Local Terrorist List (EOCN / Executive Office)",
  "UN Consolidated Sanctions List (UNSC)",
  "OFAC Specially Designated Nationals List (SDN)",
  "UK OFSI Consolidated Financial Sanctions List",
  "EU Consolidated Financial Sanctions List",
  "INTERPOL Red Notices (where applicable)",
];

const ADVERSE_CATEGORIES = [
  "Criminal / Fraud Allegations",
  "Money Laundering",
  "Terrorist Financing or Proliferation Financing Links",
  "Regulatory Actions, Fines, or Investigations",
  "Negative Reputation or Commercial Disputes",
  "Political Controversy or PEP Connections",
  "Human Rights, Environmental, or Ethical Violations",
];

const PF_FACTORS = [
  "DPMS Sector Inherent PF Exposure (NRA 2024)",
  "Jurisdictional Exposure — Counterparty or Transaction Origin",
  "Dual-Use Goods or Materials (Cabinet Resolution No. 156 of 2025)",
  "UN PF Sanctions List Match (UNSCR 1718/2231/1540)",
  "Unusual Trade Patterns or Transaction Volumes",
  "Links to Proliferation Networks or Controlled Technology",
];

const RISK_TO_CDD: Record<RiskClass, CddLevel> = {
  "Low Risk": "Standard CDD",
  "Medium Risk": "Simplified CDD",
  "High Risk": "Enhanced CDD",
};

function uid(): string {
  return `cdd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankIdentification(): IdentificationRow {
  return {
    designation: "", name: "", sharesPct: "", kind: "Individual",
    nationality: "", gender: "", dob: "", passportNumber: "", passportExpiry: "",
    emiratesId: "", emiratesIdExpiry: "", proofOfAddress: "Pending", pepStatus: "Negative",
  };
}

function blankAssessment(): Assessment {
  return {
    id: uid(),
    companyName: "", countryOfRegistration: "", dateOfRegistration: "",
    commercialRegister: "", licenseExpiry: "", goamlStatus: "Registered",
    fatfGreyList: "Negative", cahra: "Negative", pepStatus: "Negative",
    sanctions: SANCTIONS_LISTS.map((list) => ({ list, result: "Pending" as ScreenResult, date: "", remarks: "" })),
    adverseMedia: ADVERSE_CATEGORIES.map((category) => ({ category, finding: "Pending" as Finding, details: "" })),
    identifications: [blankIdentification()],
    pf: PF_FACTORS.map((factor) => ({ factor, level: "Low" as RiskLevel, notes: "" })),
    pfConclusion: "Low",
    overallRisk: "Low Risk", cddLevel: "Standard CDD", decision: "Pending",
    triggerEvents: false,
    preparedBy: "", preparedByRole: "Compliance Officer",
    approvedBy: "", approvedByRole: "Managing Director",
    versions: [],
    reviewDate: formatDMY(new Date()),
    updatedAt: new Date().toISOString(),
  };
}

// Sanitised demonstration record — mirrors the structure of a real assessment
// (and deliberately contains an expired licence, an expired Emirates ID and a
// pending proof of address) so the watchdog visibly fires. No real customer
// PII is stored in source.
function exampleAssessment(): Assessment {
  const a = blankAssessment();
  a.id = uid();
  a.companyName = "Example Trading DMCC (demo)";
  a.countryOfRegistration = "United Arab Emirates";
  a.dateOfRegistration = "29/09/2022";
  a.commercialRegister = "DMCC000000";
  a.licenseExpiry = "19/12/2023"; // ← expired
  a.goamlStatus = "Registered";
  a.reviewDate = "17/03/2026";
  a.sanctions = SANCTIONS_LISTS.map((list) => ({ list, result: "Negative", date: "17/03/2026", remarks: "No match identified." }));
  a.adverseMedia = ADVERSE_CATEGORIES.map((category) => ({ category, finding: "Negative", details: "Nothing adverse identified." }));
  a.identifications = [{
    designation: "Shareholder & Director", name: "Sample Director", sharesPct: "100",
    kind: "Individual", nationality: "—", gender: "—", dob: "01/01/1980",
    passportNumber: "—", passportExpiry: "28/02/2030",
    emiratesId: "—", emiratesIdExpiry: "23/10/2024", // ← expired
    proofOfAddress: "Pending", // ← incomplete
    pepStatus: "Negative",
  }];
  a.pf = PF_FACTORS.map((factor) => ({ factor, level: "Low", notes: "Consistent with declared business; no PF indicators." }));
  a.pfConclusion = "Low";
  a.overallRisk = "Low Risk"; a.cddLevel = "Standard CDD"; a.decision = "Approved";
  a.preparedBy = "Compliance Department"; a.approvedBy = "—";
  a.versions = [
    { ver: "01", date: "29/09/2022", by: "Compliance Department", type: "Initial", summary: "Account opening" },
    { ver: "02", date: "10/01/2025", by: "Compliance Department", type: "Periodic", summary: "KYC updates" },
    { ver: "03", date: "17/03/2026", by: "Compliance Department", type: "Periodic", summary: "KYC updates" },
  ];
  return a;
}

function loadAll(): Assessment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as Assessment[]) : [];
  } catch (err) {
    console.warn("[hawkeye] cdd-assessment parse failed — starting empty:", err);
    return [];
  }
}
function saveAll(list: Assessment[]) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(list)); }
  catch (err) { console.error("[hawkeye] cdd-assessment persist failed:", err); }
}

// ── Watchdog ──────────────────────────────────────────────────────────────────
type Severity = "blocker" | "warn";
interface WatchFinding { severity: Severity; label: string; detail: string }

function dateState(value: string, asOf: Date): "expired" | "soon" | "ok" | "" {
  const d = parseDMY(value);
  if (!d) return "";
  const diffDays = (d.getTime() - asOf.getTime()) / 86_400_000;
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

function computeFindings(a: Assessment): WatchFinding[] {
  const out: WatchFinding[] = [];
  const asOf = parseDMY(a.reviewDate) ?? new Date();

  // Required Section 1 fields
  if (!a.companyName.trim()) out.push({ severity: "blocker", label: "Customer name missing", detail: "Section 1 — company name is required." });
  if (!a.commercialRegister.trim()) out.push({ severity: "blocker", label: "Commercial register missing", detail: "Section 1 — commercial/trade register is required." });

  // Licence expiry
  if (dateState(a.licenseExpiry, asOf) === "expired") {
    out.push({ severity: "blocker", label: "Trade licence expired", detail: `Licence expired ${a.licenseExpiry} — before the ${a.reviewDate} review.` });
  } else if (dateState(a.licenseExpiry, asOf) === "soon") {
    out.push({ severity: "warn", label: "Trade licence expiring soon", detail: `Licence expires ${a.licenseExpiry} (within 30 days).` });
  } else if (!a.licenseExpiry.trim()) {
    out.push({ severity: "blocker", label: "Trade licence expiry missing", detail: "Section 1 — licence expiry date is required." });
  }

  // Identifications — expiries + completeness
  if (a.identifications.length === 0) {
    out.push({ severity: "blocker", label: "No identified individuals", detail: "Section 4 — at least one shareholder/director must be recorded." });
  }
  a.identifications.forEach((p, i) => {
    const who = p.name.trim() || `Individual #${i + 1}`;
    if (dateState(p.passportExpiry, asOf) === "expired") out.push({ severity: "blocker", label: `Passport expired — ${who}`, detail: `Passport expired ${p.passportExpiry}.` });
    if (dateState(p.emiratesIdExpiry, asOf) === "expired") out.push({ severity: "blocker", label: `Emirates ID expired — ${who}`, detail: `Emirates ID expired ${p.emiratesIdExpiry}.` });
    if (dateState(p.passportExpiry, asOf) === "soon") out.push({ severity: "warn", label: `Passport expiring soon — ${who}`, detail: `Passport expires ${p.passportExpiry}.` });
    if (dateState(p.emiratesIdExpiry, asOf) === "soon") out.push({ severity: "warn", label: `Emirates ID expiring soon — ${who}`, detail: `Emirates ID expires ${p.emiratesIdExpiry}.` });
    if (p.proofOfAddress === "Pending") out.push({ severity: "blocker", label: `Proof of address pending — ${who}`, detail: "Required CDD document not yet provided." });
  });

  // Screening freshness — newest sanctions screening date vs as-of (12-month rule)
  const screenDates = a.sanctions.map((s) => parseDMY(s.date)).filter((d): d is Date => d !== null);
  if (screenDates.length > 0) {
    const newest = new Date(Math.max(...screenDates.map((d) => d.getTime())));
    const ageDays = (asOf.getTime() - newest.getTime()) / 86_400_000;
    if (ageDays > 365) out.push({ severity: "warn", label: "Sanctions screening older than 12 months", detail: `Last screened ${formatDMY(newest)} — re-screen due (FG/KYC: re-screen ≥ every 12 months).` });
  }
  if (a.sanctions.some((s) => s.result === "Positive")) {
    out.push({ severity: "blocker", label: "Positive sanctions match", detail: "Section 2 — a positive sanctions hit must be escalated to the MLRO before any decision." });
  }
  if (a.sanctions.some((s) => s.result === "Pending")) {
    out.push({ severity: "warn", label: "Sanctions screening incomplete", detail: "Section 2 — one or more lists still show Pending." });
  }

  // Trigger events
  if (a.triggerEvents) out.push({ severity: "warn", label: "Trigger events flagged", detail: "Immediate review required per FG/KYC trigger-event policy." });

  return out;
}

// ── Small presentational helpers ──────────────────────────────────────────────
const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors";
const labelCls = "block text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1";

function Field({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (_v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red"> *</span>}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </div>
  );
}

function DateField({ label, value, onChange, asOf, required }: {
  label: string; value: string; onChange: (_v: string) => void; asOf: Date; required?: boolean;
}) {
  const st = dateState(value, asOf);
  const invalid = value.trim() !== "" && parseDMY(value) === null;
  const border = st === "expired" ? "border-red" : st === "soon" ? "border-amber" : invalid ? "border-red" : "border-hair-2";
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red"> *</span>}</label>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="dd/mm/yyyy"
          className={`w-full text-12 px-3 py-1.5 rounded border ${border} bg-bg-1 text-ink-0 focus:outline-none focus:border-brand transition-colors`}
        />
        {st === "expired" && <span className="absolute right-2 top-1.5 font-mono text-9 px-1.5 py-px rounded bg-red-dim text-red border border-red/30">EXPIRED</span>}
        {st === "soon" && <span className="absolute right-2 top-1.5 font-mono text-9 px-1.5 py-px rounded bg-amber-dim text-amber border border-amber/30">≤30d</span>}
        {invalid && st === "" && <span className="absolute right-2 top-1.5 font-mono text-9 text-red">dd/mm/yyyy</span>}
      </div>
    </div>
  );
}

function Select<T extends string>({ label, value, onChange, options, required }: {
  label: string; value: T; onChange: (_v: T) => void; options: readonly T[]; required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red"> *</span>}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SectionCard({ n, emoji, title, subtitle, children, right }: {
  n: number; emoji: string; title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-14">{emoji}</span>
          <span className="font-mono text-10 text-ink-3">SECTION {n}</span>
          <span className="text-13 font-semibold text-ink-0 truncate">{title}</span>
          {subtitle && <span className="text-10 text-ink-3 hidden md:inline">— {subtitle}</span>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const RESULT_TONE: Record<ScreenResult, string> = {
  Negative: "bg-green-dim text-green",
  Positive: "bg-red-dim text-red",
  Pending: "bg-amber-dim text-amber",
};
const LEVEL_TONE: Record<RiskLevel, string> = {
  Low: "bg-green-dim text-green",
  Medium: "bg-amber-dim text-amber",
  High: "bg-red-dim text-red",
};

function updateRow<T>(arr: T[], idx: number, patch: Partial<T>): T[] {
  return arr.map((r, i) => (i === idx ? { ...r, ...patch } : r));
}

export default function CddAssessmentPage() {
  const [saved, setSaved] = useState<Assessment[]>([]);
  const [a, setA] = useState<Assessment>(blankAssessment);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const list = loadAll();
    setSaved(list);
    if (list.length > 0 && list[0]) setA(list[0]);
  }, []);

  const asOf = useMemo(() => parseDMY(a.reviewDate) ?? new Date(), [a.reviewDate]);
  const findings = useMemo(() => computeFindings(a), [a]);
  const blockers = findings.filter((f) => f.severity === "blocker");
  const warns = findings.filter((f) => f.severity === "warn");
  const approvedButBlocked = a.decision === "Approved" && blockers.length > 0;

  const set = <K extends keyof Assessment>(k: K, v: Assessment[K]) => setA((prev) => ({ ...prev, [k]: v }));

  const persist = (next: Assessment) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setA(stamped);
    setSaved((prev) => {
      const exists = prev.some((x) => x.id === stamped.id);
      const list = exists ? prev.map((x) => (x.id === stamped.id ? stamped : x)) : [stamped, ...prev];
      saveAll(list);
      return list;
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const logReview = () => {
    const type: VersionType = a.versions.length === 0 ? "Initial" : a.triggerEvents ? "Trigger" : "Periodic";
    const ver = String(a.versions.length + 1).padStart(2, "0");
    const row: VersionRow = {
      ver, date: formatDMY(new Date()),
      by: a.preparedBy.trim() || "Compliance Department",
      type,
      summary: type === "Initial" ? "Account opening" : type === "Trigger" ? "Trigger-event review" : "Periodic KYC review",
    };
    persist({ ...a, versions: [...a.versions, row] });
  };

  const loadExample = () => setA(exampleAssessment());
  const newBlank = () => setA(blankAssessment());
  const remove = (id: string) => {
    setSaved((prev) => { const list = prev.filter((x) => x.id !== id); saveAll(list); return list; });
    if (id === a.id) newBlank();
  };

  const exportCsv = () => {
    const rows: string[][] = [
      ["Field", "Value"],
      ["Company", a.companyName], ["Country", a.countryOfRegistration],
      ["Commercial register", a.commercialRegister], ["Licence expiry", a.licenseExpiry],
      ["Review (as-of) date", a.reviewDate],
      ["Overall risk", a.overallRisk], ["CDD level", a.cddLevel], ["Decision", a.decision],
      ["Blocking issues", String(blockers.length)], ["Warnings", String(warns.length)],
      ...findings.map((f) => [`${f.severity === "blocker" ? "BLOCKER" : "WARN"}`, `${f.label} — ${f.detail}`]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `cdd-assessment-${(a.companyName || "record").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModuleLayout
      asanaModule="cdd-review"
      asanaLabel="CDD Assessment"
      onAdd={() => set("identifications", [...a.identifications, blankIdentification()])}
      onCsv={exportCsv}
      onRun={logReview}
      sidebarActions={
        <>
          <ActionButton variant="add" type="button" onClick={() => persist(a)}>
            {savedFlash ? "✓ Saved" : "Save assessment"}
          </ActionButton>
          <ActionButton variant="screening" type="button" onClick={logReview}>Log review →</ActionButton>
          <ActionButton variant="ai" type="button" onClick={loadExample}>Load example</ActionButton>
          <ActionButton variant="import" type="button" onClick={newBlank}>New blank</ActionButton>
        </>
      }
    >
      <ModuleHero eyebrow="" title="Customer & counterparty" titleEm="due diligence." />

      {/* Saved files selector */}
      {saved.length > 0 && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <span className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Saved files:</span>
          <select
            value={saved.some((x) => x.id === a.id) ? a.id : ""}
            onChange={(e) => { const f = saved.find((x) => x.id === e.target.value); if (f) setA(f); }}
            className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand"
          >
            <option value="">— select —</option>
            {saved.map((x) => <option key={x.id} value={x.id}>{x.companyName || "(unnamed)"} · {x.overallRisk}</option>)}
          </select>
          {saved.some((x) => x.id === a.id) && (
            <button type="button" onClick={() => remove(a.id)} className="text-10 font-medium px-2 py-1 rounded border border-hair-2 text-ink-3 hover:text-red hover:border-red/40 transition-colors">Delete</button>
          )}
        </div>
      )}

      {/* ── Watchdog banner ── */}
      <div className={`mb-6 rounded-xl border p-4 ${
        blockers.length > 0 ? "bg-red-dim border-red/30" : warns.length > 0 ? "bg-amber-dim border-amber/30" : "bg-green-dim border-green/30"
      }`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-16">{blockers.length > 0 ? "⛔" : warns.length > 0 ? "⚠️" : "✅"}</span>
          <span className="text-13 font-semibold text-ink-0">
            {blockers.length > 0
              ? `${blockers.length} blocking issue${blockers.length > 1 ? "s" : ""} — file cannot be signed “Approved”`
              : warns.length > 0 ? `${warns.length} warning${warns.length > 1 ? "s" : ""} — review before sign-off`
              : "No issues detected — file is clean as of " + a.reviewDate}
          </span>
          <span className="ml-auto font-mono text-10 text-ink-3">watchdog · as of {a.reviewDate}</span>
        </div>
        {findings.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`shrink-0 font-mono text-9 px-1.5 py-px rounded font-semibold uppercase ${f.severity === "blocker" ? "bg-red text-white" : "bg-amber-dim text-amber border border-amber/40"}`}>
                  {f.severity === "blocker" ? "BLOCK" : "WARN"}
                </span>
                <span className="text-11 text-ink-1"><strong className="text-ink-0">{f.label}.</strong> {f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-5 pb-24">
        {/* ── Section 1 — Customer information ── */}
        <SectionCard n={1} emoji="🏢" title="Customer information">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Company name" value={a.companyName} onChange={(v) => set("companyName", v)} placeholder="e.g. Example Trading DMCC" required />
            <Field label="Country of registration" value={a.countryOfRegistration} onChange={(v) => set("countryOfRegistration", v)} placeholder="United Arab Emirates" />
            <DateField label="Date of registration" value={a.dateOfRegistration} onChange={(v) => set("dateOfRegistration", v)} asOf={asOf} />
            <Field label="Commercial register" value={a.commercialRegister} onChange={(v) => set("commercialRegister", v)} placeholder="DMCC######" required />
            <DateField label="Licence expiry" value={a.licenseExpiry} onChange={(v) => set("licenseExpiry", v)} asOf={asOf} required />
            <Select label="goAML registration" value={a.goamlStatus} onChange={(v) => set("goamlStatus", v)} options={["Registered", "Not Registered", "Pending"] as const} />
            <Select label="FATF grey-list status" value={a.fatfGreyList} onChange={(v) => set("fatfGreyList", v)} options={["Negative", "Positive"] as const} />
            <Select label="CAHRA exposure" value={a.cahra} onChange={(v) => set("cahra", v)} options={["Negative", "Positive"] as const} />
            <Select label="PEP status (entity)" value={a.pepStatus} onChange={(v) => set("pepStatus", v)} options={["Negative", "Positive"] as const} />
            <DateField label="Review (as-of) date" value={a.reviewDate} onChange={(v) => set("reviewDate", v)} asOf={asOf} />
          </div>
        </SectionCard>

        {/* ── Section 2 — Sanctions screening ── */}
        <SectionCard n={2} emoji="🛡️" title="Sanctions screening" subtitle="re-screen ≥ every 12 months">
          <div className="space-y-2">
            {a.sanctions.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_120px_120px_2fr] gap-2 items-center bg-bg-1 rounded p-2">
                <span className="text-11 text-ink-1">{row.list}</span>
                <Select label="" value={row.result} onChange={(v) => set("sanctions", updateRow(a.sanctions, i, { result: v }))} options={["Negative", "Positive", "Pending"] as const} />
                <input value={row.date} onChange={(e) => set("sanctions", updateRow(a.sanctions, i, { date: e.target.value }))} placeholder="dd/mm/yyyy" className={inputCls} />
                <input value={row.remarks} onChange={(e) => set("sanctions", updateRow(a.sanctions, i, { remarks: e.target.value }))} placeholder="Remarks" className={inputCls} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Section 3 — Adverse media ── */}
        <SectionCard n={3} emoji="📰" title="Adverse media screening">
          <div className="space-y-2">
            {a.adverseMedia.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_120px_3fr] gap-2 items-center bg-bg-1 rounded p-2">
                <span className="text-11 text-ink-1">{row.category}</span>
                <Select label="" value={row.finding} onChange={(v) => set("adverseMedia", updateRow(a.adverseMedia, i, { finding: v }))} options={["Negative", "Positive", "Pending"] as const} />
                <input value={row.details} onChange={(e) => set("adverseMedia", updateRow(a.adverseMedia, i, { details: e.target.value }))} placeholder="Details / source" className={inputCls} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Section 4 — Identifications ── */}
        <SectionCard
          n={4} emoji="🪪" title="Identifications" subtitle="shareholders · directors · signatories"
          right={<button type="button" onClick={() => set("identifications", [...a.identifications, blankIdentification()])} className="text-11 font-semibold px-2.5 py-1 rounded bg-brand text-white border border-brand hover:bg-brand-hover transition-colors">+ Add person</button>}
        >
          <div className="space-y-3">
            {a.identifications.map((p, i) => (
              <div key={i} className="bg-bg-1 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">Individual #{i + 1}</span>
                  {a.identifications.length > 1 && (
                    <RowActions label={`Individual #${i + 1}`} onDelete={() => set("identifications", a.identifications.filter((_, j) => j !== i))} confirmDelete={false} />
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                  <Field label="Designation" value={p.designation} onChange={(v) => set("identifications", updateRow(a.identifications, i, { designation: v }))} placeholder="Shareholder & Director" />
                  <Field label="Name" value={p.name} onChange={(v) => set("identifications", updateRow(a.identifications, i, { name: v }))} placeholder="Full legal name" />
                  <Field label="Shares %" value={p.sharesPct} onChange={(v) => set("identifications", updateRow(a.identifications, i, { sharesPct: v.replace(/[^\d.]/g, "") }))} placeholder="100" />
                  <Select label="Type" value={p.kind} onChange={(v) => set("identifications", updateRow(a.identifications, i, { kind: v }))} options={["Individual", "Corporate"] as const} />
                  <Field label="Nationality" value={p.nationality} onChange={(v) => set("identifications", updateRow(a.identifications, i, { nationality: v }))} />
                  <Field label="Gender" value={p.gender} onChange={(v) => set("identifications", updateRow(a.identifications, i, { gender: v }))} />
                  <DateField label="Date of birth" value={p.dob} onChange={(v) => set("identifications", updateRow(a.identifications, i, { dob: v }))} asOf={asOf} />
                  <Field label="Passport no." value={p.passportNumber} onChange={(v) => set("identifications", updateRow(a.identifications, i, { passportNumber: v }))} />
                  <DateField label="Passport expiry" value={p.passportExpiry} onChange={(v) => set("identifications", updateRow(a.identifications, i, { passportExpiry: v }))} asOf={asOf} />
                  <Field label="Emirates ID" value={p.emiratesId} onChange={(v) => set("identifications", updateRow(a.identifications, i, { emiratesId: v }))} />
                  <DateField label="Emirates ID expiry" value={p.emiratesIdExpiry} onChange={(v) => set("identifications", updateRow(a.identifications, i, { emiratesIdExpiry: v }))} asOf={asOf} />
                  <Select label="Proof of address" value={p.proofOfAddress} onChange={(v) => set("identifications", updateRow(a.identifications, i, { proofOfAddress: v }))} options={["Provided", "Pending"] as const} />
                  <Select label="PEP status" value={p.pepStatus} onChange={(v) => set("identifications", updateRow(a.identifications, i, { pepStatus: v }))} options={["Negative", "Positive"] as const} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Section 5 — Proliferation financing ── */}
        <SectionCard
          n={5} emoji="☢️" title="Proliferation financing (PF) assessment"
          right={<span className={`font-mono text-10 px-2 py-0.5 rounded font-semibold ${LEVEL_TONE[a.pfConclusion]}`}>Overall: {a.pfConclusion}</span>}
        >
          <div className="space-y-2">
            {a.pf.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_120px_3fr] gap-2 items-center bg-bg-1 rounded p-2">
                <span className="text-11 text-ink-1">{row.factor}</span>
                <Select label="" value={row.level} onChange={(v) => set("pf", updateRow(a.pf, i, { level: v }))} options={["Low", "Medium", "High"] as const} />
                <input value={row.notes} onChange={(e) => set("pf", updateRow(a.pf, i, { notes: e.target.value }))} placeholder="Assessment notes" className={inputCls} />
              </div>
            ))}
            <div className="pt-2 max-w-xs">
              <Select label="Overall PF risk conclusion" value={a.pfConclusion} onChange={(v) => set("pfConclusion", v)} options={["Low", "Medium", "High"] as const} />
            </div>
          </div>
        </SectionCard>

        {/* ── Section 6 — RBA ── */}
        <SectionCard n={6} emoji="🎯" title="Risk-based assessment (RBA) — customer risk scoring">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select label="Overall risk classification" value={a.overallRisk}
              onChange={(v) => set("overallRisk", v)} options={["Low Risk", "Medium Risk", "High Risk"] as const} />
            <div>
              <Select label="CDD level required" value={a.cddLevel} onChange={(v) => set("cddLevel", v)} options={["Standard CDD", "Simplified CDD", "Enhanced CDD"] as const} />
              {a.cddLevel !== RISK_TO_CDD[a.overallRisk] && (
                <p className="text-9 text-amber mt-1">Manual maps {a.overallRisk} → {RISK_TO_CDD[a.overallRisk]}.</p>
              )}
            </div>
            <Select label="Business relationship decision" value={a.decision} onChange={(v) => set("decision", v)} options={["Pending", "Approved", "Rejected"] as const} />
            <label className="flex items-center gap-2 cursor-pointer select-none mt-6">
              <input type="checkbox" checked={a.triggerEvents} onChange={(e) => set("triggerEvents", e.target.checked)} className="accent-brand w-4 h-4" />
              <span className="text-12 text-ink-1">Trigger events present</span>
            </label>
          </div>
          {approvedButBlocked && (
            <div className="mt-3 rounded-lg border border-red/40 bg-red-dim px-4 py-3 flex items-start gap-2">
              <span className="text-red text-14 shrink-0">⛔</span>
              <p className="text-12 text-red"><strong>Completeness gate:</strong> this file is set to “Approved” but has {blockers.length} blocking issue{blockers.length > 1 ? "s" : ""} (see the watchdog above). Resolve them or change the decision before sign-off.</p>
            </div>
          )}
        </SectionCard>

        {/* ── Section 7 — Sign-off ── */}
        <SectionCard n={7} emoji="✍️" title="Sign-off & authorization">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Prepared by" value={a.preparedBy} onChange={(v) => set("preparedBy", v)} placeholder="Name" />
            <Field label="Prepared — role" value={a.preparedByRole} onChange={(v) => set("preparedByRole", v)} />
            <Field label="Approved by" value={a.approvedBy} onChange={(v) => set("approvedBy", v)} placeholder="Name" />
            <Field label="Approved — role" value={a.approvedByRole} onChange={(v) => set("approvedByRole", v)} />
          </div>
          <p className="text-10 text-ink-3 mt-3">Record retention: this assessment and supporting documents must be retained for a minimum of <strong className="text-ink-2">10 years</strong> from the end of the business relationship or completion of the transaction, whichever is later.</p>
        </SectionCard>

        {/* ── Section 8 — Version control ── */}
        <SectionCard
          n={8} emoji="🗂️" title="Review & version control"
          right={<button type="button" onClick={logReview} className="text-11 font-semibold px-2.5 py-1 rounded bg-brand text-white border border-brand hover:bg-brand-hover transition-colors">+ Log review</button>}
        >
          {a.versions.length === 0 ? (
            <p className="text-11 text-ink-3">No reviews logged yet. Use <strong className="text-ink-2">+ Log review</strong> to append a timestamped entry (auto-numbered).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-12">
                <thead>
                  <tr className="text-left text-10 uppercase tracking-wide-3 text-ink-3 font-mono border-b border-hair-2">
                    <th className="px-2 py-1.5">Ver.</th><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">By</th><th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {a.versions.map((v, i) => (
                    <tr key={i} className="border-b border-hair">
                      <td className="px-2 py-1.5 font-mono text-ink-2">{v.ver}</td>
                      <td className="px-2 py-1.5 text-ink-1">{v.date}</td>
                      <td className="px-2 py-1.5 text-ink-1">{v.by}</td>
                      <td className="px-2 py-1.5"><span className="font-mono text-10 px-1.5 py-px rounded bg-brand-dim text-brand-deep border border-brand/20">{v.type}</span></td>
                      <td className="px-2 py-1.5 text-ink-1">{v.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Sticky save footer ── */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[220px] bg-bg-panel/95 backdrop-blur border-t border-hair-2 px-4 md:px-10 py-3 flex items-center gap-3 z-20 print:hidden">
        <span className={`font-mono text-10 px-2 py-0.5 rounded font-semibold ${
          blockers.length > 0 ? "bg-red-dim text-red" : warns.length > 0 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"
        }`}>
          {blockers.length} blockers · {warns.length} warnings
        </span>
        <span className={`font-mono text-10 px-2 py-0.5 rounded font-semibold ${RESULT_TONE[a.decision === "Approved" ? "Negative" : a.decision === "Rejected" ? "Positive" : "Pending"]}`}>
          {a.decision}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="text-11 font-medium px-3 py-1.5 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors">Export PDF</button>
          <button type="button" onClick={() => persist(a)} className="text-11 font-semibold px-4 py-1.5 rounded bg-brand text-white border border-brand hover:bg-brand-hover transition-colors">
            {savedFlash ? "✓ Saved" : "Save assessment"}
          </button>
        </div>
      </div>
    </ModuleLayout>
  );
}
