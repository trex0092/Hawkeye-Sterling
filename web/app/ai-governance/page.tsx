"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// ── Types (mirror API shapes) ────────────────────────────────────────────────

interface RiskEntry {
  modelId: string;
  purpose: string;
  riskTier: "critical" | "high" | "medium" | "low";
  humanReviewRequired: boolean;
  fdlReference: string;
  registeredAt: string;
  redTeamLastRunAt: string | null;
  approval: {
    approvedBy: string;
    nextAttestationDue: string;
    attestationStatus: "current" | "due" | "overdue";
  };
}

interface RiskRegisterData {
  ok?: boolean;
  generatedAt?: string;
  overallStatus?: string;
  totalModels: number;
  overdueCount: number;
  criticalOrHighOverdueCount?: number;
  entries: RiskEntry[];
  overdueModels?: { modelId: string; purpose: string; riskTier: string; nextAttestationDue: string }[];
}

interface RmfFunction {
  fn: "GOVERN" | "MAP" | "MEASURE" | "MANAGE";
  label: string;
  score: number;
  status: "green" | "amber" | "red";
  controls: string[];
  gaps: string[];
}

interface RmfStatusData {
  ok?: boolean;
  generatedAt?: string;
  tenantId?: string;
  overallRmfScore: number;
  rmfFunctions: RmfFunction[];
  overdueCount?: number;
  models?: unknown[];
  atlasTactics: { id: string; name: string; phase: string; probeIds: string[]; covered: boolean }[];
  atlasGapCount: number;
  policyVersion: string;
  policyAttestation: string;
}

interface AIIncident {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "investigating" | "mitigated" | "closed";
  title: string;
  description: string;
  affectedModel: string;
  detectedAt: string;
  reportedBy: string;
  lessonsLearned?: string;
  regulatoryNotificationRequired: boolean;
  regulatoryNotificationSent?: boolean;
}

interface GapResult {
  ok?: boolean;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  gradeRationale: string;
  criticalGaps: string[];
  findings: { area: string; finding: string; severity: "critical" | "high" | "medium" | "low"; regulatoryRef: string }[];
  recommendations: { priority: "immediate" | "short-term" | "medium-term"; action: string; owner: string; deadline: string }[];
  regulatoryRisks?: { risk: string; likelihood: string; impact: string; mitigant: string }[];
  summary: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  "Stakeholder Ownership",
  "Governance Structure",
  "Policy Framework",
  "Risk Management",
  "Responsible AI",
  "Model Lifecycle",
  "Data Governance",
  "Compliance & Audit",
  "Monitoring & Reporting",
  "Incident Management",
  "Continuous Improvement",
] as const;

const TIER_CLR: Record<string, string>   = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e" };
const ATTEST_CLR: Record<string, string> = { current: "#22c55e", due: "#f59e0b", overdue: "#ef4444" };
const SEV_CLR: Record<string, string>    = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e" };
const INC_CLR: Record<string, string>    = { open: "#ef4444", investigating: "#f59e0b", mitigated: "#3b82f6", closed: "#22c55e" };
const RMF_CLR: Record<string, string>    = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

const STAKEHOLDERS = [
  { role: "CEO", owns: "AI strategy & programme approvals",      tier: "Business" },
  { role: "CFO", owns: "AI budget allocation & risk appetite",   tier: "Business" },
  { role: "CRO", owns: "AI risk policy & enterprise risk gates", tier: "Business" },
  { role: "CPO", owns: "AI product roadmap & ethics alignment",  tier: "Business" },
  { role: "CAO", owns: "AI governance implementation & controls",tier: "Technical" },
  { role: "CIO", owns: "AI infrastructure & data architecture",  tier: "Technical" },
  { role: "CDO", owns: "Data quality & governance alignment",    tier: "Technical" },
  { role: "CSO", owns: "AI security & adversarial threat model", tier: "Technical" },
];

const ESCALATION = [
  { level: "Low",    path: "Auto-approved within system guardrails",              colour: "#22c55e" },
  { level: "Medium", path: "MLRO sign-off required — 2-business-day SLA",         colour: "#f59e0b" },
  { level: "High",   path: "Board + Four-Eyes gate — TOCTOU-protected sign-off",  colour: "#ef4444" },
];

const GOV_BODIES = [
  { name: "AI Governance Committee", freq: "Quarterly",      chair: "CRO",  colour: "#3b82f6" },
  { name: "Model Review Board",       freq: "Per deployment", chair: "CAO",  colour: "#8b5cf6" },
  { name: "Bias & Ethics Panel",      freq: "Monthly",        chair: "MLRO", colour: "#ec4899" },
  { name: "Incident Response Team",   freq: "Ad-hoc",         chair: "CSO",  colour: "#ef4444" },
];

const HIERARCHY = [
  { level: "1", label: "Board of Directors",      desc: "Final approval on AI risk appetite, policy, and model bans",              colour: "#ec4899" },
  { level: "2", label: "Executive Committee",     desc: "High-risk model approvals, incident escalation, regulatory response",     colour: "#f97316" },
  { level: "3", label: "MLRO / Responsible AI Officer", desc: "Day-to-day governance, four-eyes sign-offs, bias reviews",          colour: "#f59e0b" },
  { level: "4", label: "Compliance Analysts",     desc: "Model monitoring, incident logging, screening decisions",                 colour: "#22c55e" },
];

const RESP_AI_CARDS = [
  { label: "Bias Monitoring",   colour: "#ec4899", href: "/responsible-ai",   desc: "FPR disparity by entity · biasRatio ≤ 1.15" },
  { label: "UNESCO Alignment",  colour: "#8b5cf6", href: "/responsible-ai",   desc: "11 AI ethics principles — all compliant" },
  { label: "Hallucination Gate",colour: "#f97316", href: "/responsible-ai",   desc: "Fire-and-forget confidence check on every output" },
  { label: "Human Override",    colour: "#3b82f6", href: "/responsible-ai",   desc: "AI is advisory only — all decisions human-confirmed" },
  { label: "Shadow AI Register",colour: "#ef4444", href: "/shadow-ai",         desc: "Detect & remediate unauthorised AI tool usage" },
  { label: "Vendor AI Audit",   colour: "#22c55e", href: "/vendor-ai-audit",  desc: "12-point DPA + security + bias audit checklist" },
];

const DATA_CONTROLS = [
  { policy: "PII Redaction",     detail: "Names, IDs, dates redacted before LLM transmission",   file: "llm.ts" },
  { policy: "Data Minimisation", detail: "Only compliance-relevant fields sent to AI",            file: "llm.ts" },
  { policy: "Access Control",    detail: "Bearer token + role-gate on every API route",           file: "enforce.ts" },
  { policy: "Audit Logging",     detail: "Every AI decision in append-only HMAC chain",           file: "audit-chain.ts" },
  { policy: "Rate Limiting",     detail: "Upstash Redis per-tenant rate caps",                    file: "rate-limit.ts" },
  { policy: "Egress Gate",       detail: "Tipping-off check before any external disclosure",      file: "egress-check.ts" },
];

const COMPLIANCE_LINKS = [
  { label: "🏛️ Inspection Room",     href: "/governance/inspection-room", desc: "Regulator-ready evidence pack" },
  { label: "🔒 Audit Trail",          href: "/audit-trail",                desc: "Immutable AI decision log (10-yr)" },
  { label: "📋 Policies & SOPs",      href: "/policies",                   desc: "AML programme charter" },
  { label: "🤖 AI Incident Playbook", href: "/ai-incident-playbook",       desc: "AI failure response log" },
  { label: "📘 System Card",          href: "/system-card",                desc: "Model governance disclosures" },
];

const OPEN_GAPS = [
  { id: "CG-2",       status: "PARTIAL",    colour: "#f59e0b", desc: "False-positive whitelist — mechanism implemented; MLRO workflow approval pending" },
  { id: "CG-3",       status: "PARTIAL",    colour: "#f59e0b", desc: "Periodic re-screening — cadences implemented; enrollment confirmation pending" },
  { id: "CG-4",       status: "OPEN",       colour: "#ef4444", desc: "goAML entity IDs — REPLACE_ME placeholders; operator must set real goAML Rentity IDs" },
  { id: "CG-6",       status: "PARTIAL",    colour: "#f59e0b", desc: "Audit chain 10-yr retention — S3/WORM backup implemented; MLRO/CTO must configure bucket" },
  { id: "CG-8",       status: "OPEN",       colour: "#ef4444", desc: "HSTS preload — operator must submit domain to hstspreload.org" },
  { id: "CG-BIAS-001",status: "DELIBERATE", colour: "#8b5cf6", desc: "Bias threshold 1.15 (tighter than FATF floor 1.5) — MLRO acknowledgement required" },
];

const INC_ESCALATION = [
  { sev: "Critical", path: "Immediate: CSO + MLRO + Board within 1 hour",                   colour: "#ef4444" },
  { sev: "High",     path: "2 hours: MLRO notified, containment steps, CAO briefed",         colour: "#f97316" },
  { sev: "Medium",   path: "4 hours: Compliance lead assigned, investigation opened",        colour: "#f59e0b" },
  { sev: "Low",      path: "24 hours: Logged for next weekly review cycle",                  colour: "#22c55e" },
];

const GRADE_CLR: Record<string, string> = { A: "#22c55e", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444" };

// ── Shared UI primitives ─────────────────────────────────────────────────────

function Pill({ label, colour }: { label: string; colour: string }) {
  return (
    <span style={{ background: `${colour}18`, border: `1px solid ${colour}40`, color: colour, borderRadius: 3, padding: "1px 7px", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Heading({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ink-2)", marginBottom: 10 }}>
      {title}
    </div>
  );
}

function Card({ children, colour = "var(--color-hair-2)" }: { children: ReactNode; colour?: string }) {
  return (
    <div style={{ border: `1px solid ${colour}`, borderRadius: 6, padding: "12px 16px", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <Heading title={title} />
      {children}
    </div>
  );
}

function Spinner() {
  return <p style={{ color: "var(--color-ink-2)", fontSize: 13 }}>Loading…</p>;
}

function Err({ msg }: { msg: string }) {
  return <p style={{ color: "#ef4444", fontSize: 13 }}>{msg}</p>;
}

function TH({ labels }: { labels: string[] }) {
  return (
    <thead>
      <tr style={{ borderBottom: "1px solid var(--color-hair-2)" }}>
        {labels.map(h => (
          <th key={h} style={{ textAlign: "left", padding: "4px 12px 8px 0", fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AIGovernancePage() {
  const [activeTab, setActiveTab] = useState(0);
  const [riskData,  setRiskData]  = useState<RiskRegisterData | null>(null);
  const [rmfData,   setRmfData]   = useState<RmfStatusData | null>(null);
  const [incidents, setIncidents] = useState<AIIncident[] | null>(null);
  const [gapResult, setGapResult] = useState<GapResult | null>(null);

  const [ldRisk, setLdRisk]       = useState(false);
  const [ldRmf,  setLdRmf]        = useState(false);
  const [ldInc,  setLdInc]        = useState(false);
  const [ldGap,  setLdGap]        = useState(false);
  const [errRisk, setErrRisk]     = useState("");
  const [errRmf,  setErrRmf]      = useState("");
  const [errInc,  setErrInc]      = useState("");
  const [errGap,  setErrGap]      = useState("");

  const fetchRisk = useCallback(async () => {
    if (riskData || ldRisk) return;
    setLdRisk(true);
    try {
      const r = await fetch("/api/ai-governance/risk-register");
      if (!r.ok) throw new Error(`${r.status}`);
      setRiskData(await r.json() as RiskRegisterData);
    } catch (e) { setErrRisk(e instanceof Error ? e.message : "Failed"); }
    finally { setLdRisk(false); }
  }, [riskData, ldRisk]);

  const fetchRmf = useCallback(async () => {
    if (rmfData || ldRmf) return;
    setLdRmf(true);
    try {
      const r = await fetch("/api/governance/rmf-status");
      if (!r.ok) throw new Error(`${r.status}`);
      setRmfData(await r.json() as RmfStatusData);
    } catch (e) { setErrRmf(e instanceof Error ? e.message : "Failed"); }
    finally { setLdRmf(false); }
  }, [rmfData, ldRmf]);

  const fetchInc = useCallback(async () => {
    if (incidents || ldInc) return;
    setLdInc(true);
    try {
      const r = await fetch("/api/ai-incident-playbook");
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json() as { incidents: AIIncident[] };
      setIncidents(d.incidents ?? []);
    } catch (e) { setErrInc(e instanceof Error ? e.message : "Failed"); }
    finally { setLdInc(false); }
  }, [incidents, ldInc]);

  const runGap = useCallback(async () => {
    setLdGap(true); setErrGap("");
    try {
      const r = await fetch("/api/governance-gap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionName: "Hawkeye Sterling" }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setGapResult(await r.json() as GapResult);
    } catch (e) { setErrGap(e instanceof Error ? e.message : "Failed"); }
    finally { setLdGap(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 3 || activeTab === 5) void fetchRisk();
    if (activeTab === 7 || activeTab === 8) void fetchRmf();
    if (activeTab === 9 || activeTab === 10) void fetchInc();
  }, [activeTab, fetchRisk, fetchRmf, fetchInc]);

  // ── Tab content ──────────────────────────────────────────────────────────

  function renderTab() {
    switch (activeTab) {

      // 0 — Stakeholder Ownership & Decision Rights
      case 0: return (
        <>
          <Section title="Ownership Matrix">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <TH labels={["Role", "Owns", "Tier"]} />
              <tbody>
                {STAKEHOLDERS.map(s => (
                  <tr key={s.role} style={{ borderBottom: "1px solid var(--color-hair-2)" }}>
                    <td style={{ padding: "8px 12px 8px 0", fontWeight: 700 }}>{s.role}</td>
                    <td style={{ padding: "8px 12px 8px 0", color: "var(--color-ink-1)" }}>{s.owns}</td>
                    <td style={{ padding: "8px 0" }}><Pill label={s.tier} colour={s.tier === "Business" ? "#3b82f6" : "#8b5cf6"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Escalation Path by Risk Level">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ESCALATION.map(e => (
                <div key={e.level} style={{ display: "flex", gap: 12, alignItems: "center", background: `${e.colour}0d`, border: `1px solid ${e.colour}30`, borderRadius: 6, padding: "10px 14px" }}>
                  <Pill label={e.level} colour={e.colour} />
                  <span style={{ fontSize: 13, color: "var(--color-ink-1)" }}>{e.path}</span>
                </div>
              ))}
            </div>
          </Section>
        </>
      );

      // 1 — Governance Structure
      case 1: return (
        <>
          <Section title="Decision Hierarchy">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {HIERARCHY.map(d => (
                <div key={d.level} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: `${d.colour}0d`, border: `1px solid ${d.colour}25`, borderRadius: 6 }}>
                  <span style={{ minWidth: 22, height: 22, borderRadius: "50%", background: d.colour, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{d.level}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{d.label}</div>
                    <div style={{ fontSize: 12, color: "var(--color-ink-2)" }}>{d.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Governance Bodies">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
              {GOV_BODIES.map(b => (
                <Card key={b.name} colour={`${b.colour}30`}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-ink-0)", marginBottom: 4 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>Chair: {b.chair} · {b.freq}</div>
                </Card>
              ))}
            </div>
          </Section>
        </>
      );

      // 2 — Policy Framework (Gap Analysis)
      case 2: return (
        <>
          <Section title="AI Governance Gap Analysis">
            <p style={{ fontSize: 13, color: "var(--color-ink-2)", marginBottom: 12 }}>
              AI-assisted gap analysis against UAE FDL 10/2025, CBUAE AML Standards, LBMA RGG, and FATF Recommendations.
            </p>
            <button type="button" onClick={() => { void runGap(); }} disabled={ldGap}
              style={{ background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.35)", color: "#3b82f6", borderRadius: 5, padding: "7px 18px", fontSize: 12, fontWeight: 600, cursor: ldGap ? "not-allowed" : "pointer" }}>
              {ldGap ? "Analysing…" : "▶ Run Gap Analysis"}
            </button>
            {errGap && <Err msg={errGap} />}
          </Section>
          {gapResult && (
            <>
              <Section title="Overall Grade">
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: 48, fontWeight: 800, color: GRADE_CLR[gapResult.overallGrade] }}>{gapResult.overallGrade}</span>
                  <span style={{ fontSize: 13, color: "var(--color-ink-1)", maxWidth: 500 }}>{gapResult.gradeRationale}</span>
                </div>
              </Section>
              {gapResult.criticalGaps.length > 0 && (
                <Section title={`Critical Gaps (${gapResult.criticalGaps.length})`}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {gapResult.criticalGaps.map((g, i) => <li key={i} style={{ fontSize: 13, color: "#ef4444", marginBottom: 4 }}>{g}</li>)}
                  </ul>
                </Section>
              )}
              <Section title="Findings">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {gapResult.findings.map((f, i) => (
                    <div key={i} style={{ border: `1px solid ${SEV_CLR[f.severity]}30`, borderRadius: 5, padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                        <Pill label={f.severity} colour={SEV_CLR[f.severity] ?? "#888"} />
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{f.area}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--color-ink-2)" }}>{f.regulatoryRef}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-1)" }}>{f.finding}</p>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Recommendations">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {gapResult.recommendations.map((rec, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                      <Pill label={rec.priority} colour={rec.priority === "immediate" ? "#ef4444" : rec.priority === "short-term" ? "#f59e0b" : "#22c55e"} />
                      <span style={{ color: "var(--color-ink-1)" }}>{rec.action} <span style={{ color: "var(--color-ink-3)" }}>— {rec.owner} · {rec.deadline}</span></span>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </>
      );

      // 3 — Risk Management (Risk Register)
      case 3:
        if (ldRisk) return <Spinner />;
        if (!riskData) return errRisk ? <Err msg={errRisk} /> : <Spinner />;
        if (errRisk) return <Err msg={errRisk} />;
        return (
          <Section title={`AI Risk Register — ${riskData.totalModels} models · ${riskData.overdueCount} overdue`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <TH labels={["Model", "Purpose", "Risk Tier", "Attestation", "Due Date", "Approved By"]} />
                <tbody>
                  {riskData.entries.map(e => (
                    <tr key={e.modelId} style={{ borderBottom: "1px solid var(--color-hair-2)" }}>
                      <td style={{ padding: "8px 12px 8px 0", fontWeight: 600, whiteSpace: "nowrap" }}>{e.modelId}</td>
                      <td style={{ padding: "8px 12px 8px 0", color: "var(--color-ink-1)", maxWidth: 200 }}>{e.purpose}</td>
                      <td style={{ padding: "8px 12px 8px 0" }}><Pill label={e.riskTier} colour={TIER_CLR[e.riskTier] ?? "#888"} /></td>
                      <td style={{ padding: "8px 12px 8px 0" }}><Pill label={e.approval.attestationStatus} colour={ATTEST_CLR[e.approval.attestationStatus] ?? "#888"} /></td>
                      <td style={{ padding: "8px 12px 8px 0", color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>{e.approval.nextAttestationDue}</td>
                      <td style={{ padding: "8px 0", color: "var(--color-ink-2)" }}>{e.approval.approvedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );

      // 4 — Responsible AI Practices
      case 4: return (
        <Section title="Responsible AI Controls">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
            {RESP_AI_CARDS.map(c => (
              <Link key={c.label} href={c.href} style={{ border: `1px solid ${c.colour}30`, borderRadius: 6, padding: "12px 14px", background: `${c.colour}0a`, textDecoration: "none", display: "block" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: c.colour, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{c.desc}</div>
              </Link>
            ))}
          </div>
        </Section>
      );

      // 5 — Model Lifecycle Oversight
      case 5:
        if (ldRisk) return <Spinner />;
        if (!riskData) return errRisk ? <Err msg={errRisk} /> : <Spinner />;
        if (errRisk) return <Err msg={errRisk} />;
        return (
          <>
            <Section title="Model Pipeline Stages">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {["Registered", "In Review", "Approved", "Deployed", "Overdue"].map((s, i, arr) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--color-ink-2)", background: "var(--color-bg-2)", padding: "3px 10px", borderRadius: 3, border: "1px solid var(--color-hair-2)" }}>{s}</span>
                    {i < arr.length - 1 && <span style={{ color: "var(--color-ink-3)" }}>→</span>}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Models">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {riskData.entries.map(e => {
                  const c = TIER_CLR[e.riskTier] ?? "#888";
                  return (
                    <div key={e.modelId} style={{ border: `1px solid ${c}25`, borderRadius: 6, padding: "12px 16px", background: `${c}08` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{e.modelId}</span>
                        <Pill label={e.riskTier} colour={c} />
                        <Pill label={e.approval.attestationStatus} colour={ATTEST_CLR[e.approval.attestationStatus] ?? "#888"} />
                        {e.humanReviewRequired && <Pill label="human review" colour="#8b5cf6" />}
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-ink-2)" }}>Due: {e.approval.nextAttestationDue}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-ink-2)" }}>{e.purpose}</div>
                      <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 4 }}>
                        Approved by {e.approval.approvedBy} · {e.fdlReference}
                        {e.redTeamLastRunAt && ` · Red-team: ${e.redTeamLastRunAt}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        );

      // 6 — Data Governance Alignment
      case 6: return (
        <Section title="Data Governance Controls">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DATA_CONTROLS.map(p => (
              <div key={p.policy} style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 12, alignItems: "center", padding: "10px 14px", border: "1px solid var(--color-hair-2)", borderRadius: 5 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.policy}</span>
                <span style={{ fontSize: 13, color: "var(--color-ink-1)" }}>{p.detail}</span>
                <code style={{ fontSize: 10, color: "var(--color-ink-3)", whiteSpace: "nowrap" }}>{p.file}</code>
              </div>
            ))}
          </div>
        </Section>
      );

      // 7 — Compliance & Audit
      case 7:
        if (ldRmf) return <Spinner />;
        if (!rmfData) return errRmf ? <Err msg={errRmf} /> : <Spinner />;
        if (errRmf) return <Err msg={errRmf} />;
        return (
          <>
            <Section title="Regulatory Compliance">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
                {COMPLIANCE_LINKS.map(l => (
                  <Link key={l.href} href={l.href} style={{ border: "1px solid var(--color-hair-2)", borderRadius: 6, padding: "12px 14px", textDecoration: "none", display: "block" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{l.label}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{l.desc}</div>
                  </Link>
                ))}
              </div>
            </Section>
            <Section title="NIST AI RMF Summary">
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: rmfData.overallRmfScore >= 80 ? "#22c55e" : rmfData.overallRmfScore >= 60 ? "#f59e0b" : "#ef4444" }}>{rmfData.overallRmfScore}</div>
                  <div style={{ fontSize: 10, color: "var(--color-ink-2)", letterSpacing: "0.05em" }}>OVERALL SCORE</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {rmfData.rmfFunctions.map(f => (
                    <div key={f.fn} style={{ textAlign: "center", border: `1px solid ${RMF_CLR[f.status]}40`, borderRadius: 5, padding: "6px 12px", background: `${RMF_CLR[f.status]}0d` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: RMF_CLR[f.status] }}>{f.fn}</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{f.score}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 10 }}>Policy v{rmfData.policyVersion} · Attestation: {rmfData.policyAttestation}</div>
            </Section>
          </>
        );

      // 8 — Monitoring & Reporting (full RMF + ATLAS)
      case 8:
        if (ldRmf) return <Spinner />;
        if (!rmfData) return errRmf ? <Err msg={errRmf} /> : <Spinner />;
        if (errRmf) return <Err msg={errRmf} />;
        return (
          <>
            <Section title="NIST AI RMF — Full Scorecard">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rmfData.rmfFunctions.map(f => (
                  <div key={f.fn} style={{ border: `1px solid ${RMF_CLR[f.status]}35`, borderRadius: 6, padding: "14px 16px", background: `${RMF_CLR[f.status]}08` }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: RMF_CLR[f.status] }}>{f.fn}</span>
                      <span style={{ fontSize: 12, color: "var(--color-ink-2)" }}>{f.label}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 18, color: RMF_CLR[f.status] }}>{f.score}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span></span>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", color: "var(--color-ink-2)", marginBottom: 4 }}>CONTROLS</div>
                    <ul style={{ margin: "0 0 8px", paddingLeft: 16 }}>
                      {f.controls.map((c, i) => <li key={i} style={{ fontSize: 12, color: "var(--color-ink-1)", marginBottom: 2 }}>{c}</li>)}
                    </ul>
                    {f.gaps.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", color: "#ef4444", marginBottom: 4 }}>GAPS</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {f.gaps.map((g, i) => <li key={i} style={{ fontSize: 12, color: "#ef4444", marginBottom: 2 }}>{g}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Section>
            <Section title={`MITRE ATLAS Probe Coverage — ${rmfData.atlasGapCount} uncovered`}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8 }}>
                {rmfData.atlasTactics.map(t => {
                  const c = t.covered ? "#22c55e" : "#ef4444";
                  return (
                    <div key={t.id} style={{ border: `1px solid ${c}35`, borderRadius: 5, padding: "8px 12px", background: `${c}08` }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{t.id}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-ink-1)" }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: "var(--color-ink-3)", marginTop: 2 }}>{t.phase} · {t.probeIds.length} probe{t.probeIds.length !== 1 ? "s" : ""}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        );

      // 9 — Incident Management
      case 9:
        if (ldInc) return <Spinner />;
        if (!incidents) return errInc ? <Err msg={errInc} /> : <Spinner />;
        if (errInc) return <Err msg={errInc} />;
        return (
          <>
            <Section title={`AI Incident Register — ${incidents.length} incident${incidents.length !== 1 ? "s" : ""}`}>
              {incidents.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-ink-2)" }}>No incidents logged.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {incidents.map(inc => {
                    const s = SEV_CLR[inc.severity] ?? "#888";
                    return (
                      <div key={inc.id} style={{ border: `1px solid ${s}25`, borderRadius: 6, padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                          <Pill label={inc.severity} colour={s} />
                          <Pill label={inc.status}   colour={INC_CLR[inc.status] ?? "#888"} />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{inc.title}</span>
                          {inc.regulatoryNotificationRequired && (
                            <Pill label={(inc.regulatoryNotificationSent ?? false) ? "notified" : "notification due"} colour={(inc.regulatoryNotificationSent ?? false) ? "#22c55e" : "#ef4444"} />
                          )}
                          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-ink-2)" }}>{inc.detectedAt.slice(0, 10)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--color-ink-1)", marginBottom: 4 }}>{inc.description}</div>
                        <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Model: {inc.affectedModel} · {inc.type} · {inc.reportedBy}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
            <Section title="Escalation Paths">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {INC_ESCALATION.map(e => (
                  <div key={e.sev} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 14px", background: `${e.colour}0a`, border: `1px solid ${e.colour}25`, borderRadius: 5 }}>
                    <Pill label={e.sev} colour={e.colour} />
                    <span style={{ fontSize: 13, color: "var(--color-ink-1)" }}>{e.path}</span>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Links">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "AI Incident Playbook", href: "/ai-incident-playbook" },
                  { label: "Grievances & Whistleblowing", href: "/governance/grievances-whistleblowing" },
                  { label: "Inspection Room", href: "/governance/inspection-room" },
                ].map(l => (
                  <Link key={l.href} href={l.href} style={{ fontSize: 12, color: "#3b82f6", border: "1px solid rgba(59,130,246,.3)", borderRadius: 4, padding: "4px 12px", textDecoration: "none" }}>{l.label}</Link>
                ))}
              </div>
            </Section>
          </>
        );

      // 10 — Continuous Governance Improvement
      case 10: return (
        <>
          <Section title="Improvement Cycle">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["1. Run Gap Analysis", "2. Triage Findings", "3. Assign Owners", "4. Implement Controls", "5. Re-assess"].map((s, i, arr) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--color-ink-1)", background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)", padding: "4px 12px", borderRadius: 4 }}>{s}</span>
                  {i < arr.length - 1 && <span style={{ color: "var(--color-ink-3)" }}>→</span>}
                </div>
              ))}
            </div>
          </Section>
          <Section title="Open Compliance Gaps">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {OPEN_GAPS.map(g => (
                <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", border: `1px solid ${g.colour}25`, borderRadius: 5 }}>
                  <Pill label={g.id} colour={g.colour} />
                  <Pill label={g.status} colour={g.colour} />
                  <span style={{ fontSize: 13, color: "var(--color-ink-1)" }}>{g.desc}</span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Run New Gap Analysis">
            <button type="button" onClick={() => { setActiveTab(2); void runGap(); }} disabled={ldGap}
              style={{ background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.35)", color: "#3b82f6", borderRadius: 5, padding: "7px 18px", fontSize: 12, fontWeight: 600, cursor: ldGap ? "not-allowed" : "pointer" }}>
              ▶ Go to Policy Framework → Run Analysis
            </button>
          </Section>
          {incidents && incidents.filter(i => i.lessonsLearned).length > 0 && (
            <Section title="Lessons Learned">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {incidents.filter(i => i.lessonsLearned).map(inc => (
                  <Card key={inc.id}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{inc.title}</div>
                    <div style={{ fontSize: 13, color: "var(--color-ink-1)" }}>{inc.lessonsLearned}</div>
                  </Card>
                ))}
              </div>
            </Section>
          )}
        </>
      );

      default: return null;
    }
  }

  return (
    <ModuleLayout asanaModule="ai-governance" asanaLabel="AI Governance Framework">
      <ModuleHero eyebrow="Governance & Audit" title="AI Governance" titleEm="Framework." />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--color-hair-2)", marginBottom: 24 }}>
        {TABS.map((label, i) => (
          <button key={label} type="button" onClick={() => setActiveTab(i)}
            style={{ padding: "7px 12px", fontSize: 11, fontWeight: activeTab === i ? 700 : 400, color: activeTab === i ? "#ec4899" : "var(--color-ink-2)", background: "none", border: "none", borderBottom: `2px solid ${activeTab === i ? "#ec4899" : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap", marginBottom: -1 }}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {renderTab()}
    </ModuleLayout>
  );
}
