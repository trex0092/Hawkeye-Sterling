"use client";

import { useEffect, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

type UnescoStatus = "IMPLEMENTED" | "PARTIAL" | "IN PROGRESS" | "PLANNED";
type RiskTier = "High" | "Medium" | "Low";
type BiasAuditStatus = "Pass" | "Conditional Pass" | "Fail" | "Pending" | "Not Started";
type IncidentSeverity = "Critical" | "High" | "Medium" | "Low";
type IncidentType =
  | "Bias / Discrimination"
  | "Hallucination"
  | "Data Leak"
  | "Model Drift"
  | "Adversarial Attack"
  | "Unexplained Decision"
  | "System Failure"
  | "Other";

interface UnescopPrinciple {
  id: string; // P1–P11
  name: string;
  description: string;
  evidence: string;
  owner: string;
  lastReviewed: string;
  status: UnescoStatus;
}

interface AiModel {
  id: string;
  name: string;
  version: string;
  provider: string;
  riskTier: RiskTier;
  purpose: string;
  humanInLoop: boolean;
  lastValidated: string;
  biasAuditStatus: BiasAuditStatus;
  modelCardLink: string;
  notes: string;
}

interface AiIncident {
  id: string;
  date: string;
  model: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  resolution: string;
  resolved: boolean;
}

interface BiasSegment {
  id: string;
  label: string;
  category: "entity-type" | "jurisdiction";
  fprPct: number; // false-positive rate as %
  sampleSize: number;
  lastUpdated: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  model: string;
  subjectAnon: string; // anonymised
  disposition: string;
  confidence: number; // 0–100
  humanReviewed: boolean;
  reviewer?: string;
  policyRef: string;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_PRINCIPLES = "hawkeye.responsible-ai.principles.v1";
const STORAGE_MODELS = "hawkeye.responsible-ai.models.v1";
const STORAGE_INCIDENTS = "hawkeye.responsible-ai.incidents.v1";
const STORAGE_BIAS = "hawkeye.responsible-ai.bias.v1";
const STORAGE_AUDIT = "hawkeye.responsible-ai.audit.v1";

// ─── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_PRINCIPLES: UnescopPrinciple[] = [
  {
    id: "P1",
    name: "Proportionality and Do No Harm",
    description:
      "AI systems must be used only for legitimate purposes with benefits proportionate to risks. Harm to individuals or groups must be identified and mitigated.",
    evidence:
      "All AI models are classified by risk tier (EU AI Act). High-risk models require human-in-the-loop review for any adverse customer outcome. Model use is restricted to documented AML/CFT purposes only.",
    owner: "MLRO",
    lastReviewed: "2026-04-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P2",
    name: "Safety and Security",
    description:
      "AI systems must be technically robust, reliable, and secure. Failure modes must be identified and mitigated throughout the lifecycle.",
    evidence:
      "Quarterly red-team adversarial testing for all Tier-1 models. OWASP LLM Top-10 controls applied at procurement. Drift thresholds (PSI / KS) monitored daily. Fallback logic on all API routes.",
    owner: "CTO",
    lastReviewed: "2026-04-01",
    status: "IMPLEMENTED",
  },
  {
    id: "P3",
    name: "Fairness and Non-Discrimination",
    description:
      "AI systems must not perpetuate bias or create unfair outcomes for protected cohorts. Disparate impact must be measured and remediated.",
    evidence:
      "Annual independent bias audits covering disparate impact, equalised odds, and calibration by group. Automated false-positive rate monitoring by entity type and jurisdiction. Alert threshold: 2× deviation from mean FPR.",
    owner: "AI Governance Committee",
    lastReviewed: "2026-04-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P4",
    name: "Sustainability",
    description:
      "AI development and deployment must consider environmental impact and long-term societal sustainability.",
    evidence:
      "Inference infrastructure on renewable-energy cloud regions. Model efficiency tracked (tokens per decision). Use of smaller, fine-tuned models where Haiku achieves equivalent accuracy to Sonnet.",
    owner: "CTO",
    lastReviewed: "2026-03-01",
    status: "PARTIAL",
  },
  {
    id: "P5",
    name: "Right to Privacy and Data Protection",
    description:
      "AI systems must respect privacy and comply with applicable data-protection law throughout the data lifecycle.",
    evidence:
      "All AI training uses pseudonymised data. Subject identifiers are anonymised in the AI Audit Trail. Data minimisation principle applied — only fields required for the AI task are passed. PDPL compliance documented.",
    owner: "DPO",
    lastReviewed: "2026-04-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P6",
    name: "Human Oversight and Determination",
    description:
      "Humans must retain meaningful oversight and final decision-making authority over AI systems, especially for high-stakes outcomes.",
    evidence:
      "Human-in-the-loop mandatory for all adverse customer dispositions (freeze, exit, STR). Four-eyes procedure applies to AI-assisted STR filings. AI recommendations are clearly labelled. Customers may contest AI-derived dispositions within 5 days.",
    owner: "MLRO",
    lastReviewed: "2026-04-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P7",
    name: "Transparency and Explainability",
    description:
      "AI systems must be transparent in purpose and operation. Decisions must be explainable to affected individuals and regulators.",
    evidence:
      "All AI-derived scores include human-readable feature attribution. Model cards published for all registered models. AI labels appear in every case file and audit chain entry. Black-box models prohibited from terminal decisions.",
    owner: "MLRO",
    lastReviewed: "2026-04-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P8",
    name: "Responsibility and Accountability",
    description:
      "Clear lines of accountability must exist for AI systems. Organisations must be able to demonstrate compliance and accept responsibility for AI outcomes.",
    evidence:
      "MLRO is designated accountable owner for all AML/CFT AI models. AI Governance Committee approves go-live. Immutable AI Audit Trail maintained for 10 years. Board-level AI governance reporting quarterly.",
    owner: "MLRO",
    lastReviewed: "2026-04-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P9",
    name: "Awareness and Literacy",
    description:
      "Those who design, deploy, and use AI systems must have appropriate knowledge and skills. Affected communities must understand how AI affects them.",
    evidence:
      "Annual AI governance training mandatory for all MLRO function staff. AI explainability sessions for frontline analysts quarterly. Customer-facing disclosures explain AI use in screening. CPD tracks AI-specific skills.",
    owner: "Training Manager",
    lastReviewed: "2026-03-15",
    status: "IMPLEMENTED",
  },
  {
    id: "P10",
    name: "Multi-Stakeholder and Adaptive Governance",
    description:
      "AI governance must be multi-stakeholder and adaptive, incorporating diverse perspectives and responding to emerging risks.",
    evidence:
      "AI Governance Committee includes Compliance, Technology, Legal, and Risk functions. Annual external ethics review planned. Regulator engagement on AI use in AML/CFT initiated. Governance framework reviewed annually.",
    owner: "AI Governance Committee",
    lastReviewed: "2026-04-01",
    status: "PARTIAL",
  },
  {
    id: "P11",
    name: "Promotion of Peaceful AI Societies",
    description:
      "AI must be designed and used to promote peaceful, just, and inclusive societies and must not be weaponised for harm.",
    evidence:
      "Strict use-case restrictions in AI procurement policy. Prohibited AI practices screen applied at procurement (EU AI Act Art. 5). No social-scoring or predictive policing applications permitted. Ethics review required for any new AI use case.",
    owner: "AI Governance Committee",
    lastReviewed: "2026-04-01",
    status: "IN PROGRESS",
  },
];

const DEFAULT_MODELS: AiModel[] = [
  {
    id: "MDL-001",
    name: "claude-sonnet-4-6",
    version: "claude-sonnet-4-6-20250514",
    provider: "Anthropic",
    riskTier: "High",
    purpose: "Narrative generation, STR drafting, case summary, MLRO advisor",
    humanInLoop: true,
    lastValidated: "2026-04-01",
    biasAuditStatus: "Pass",
    modelCardLink: "https://www.anthropic.com/claude",
    notes: "Primary reasoning model. All outputs reviewed by qualified human before regulatory filing. Prompt caching enabled for cost efficiency.",
  },
  {
    id: "MDL-002",
    name: "claude-haiku-4-5",
    version: "claude-haiku-4-5-20250514",
    provider: "Anthropic",
    riskTier: "Medium",
    purpose: "Adverse media classification, quick-screen scoring, entity type classification",
    humanInLoop: true,
    lastValidated: "2026-04-01",
    biasAuditStatus: "Pass",
    modelCardLink: "https://www.anthropic.com/claude",
    notes: "Lightweight model for high-volume tasks. Human review required for any adverse classification. Lower latency than Sonnet; used for real-time screening uplift.",
  },
  {
    id: "MDL-003",
    name: "Fuzzy Match Engine",
    version: "v4.2.1",
    provider: "Internal",
    riskTier: "High",
    purpose: "Sanctions list matching (OFAC, UN, EU, EOCN) — fuzzy name matching at ≥ 85%",
    humanInLoop: true,
    lastValidated: "2026-03-15",
    biasAuditStatus: "Pass",
    modelCardLink: "/api-docs#fuzzy-match",
    notes: "Deterministic rule-based model. Phonetic and transliteration variants computed. False-positive rate monitored monthly. MLRO reviews all positive matches.",
  },
  {
    id: "MDL-004",
    name: "Transaction Anomaly Detector",
    version: "v2.1.0",
    provider: "Internal",
    riskTier: "High",
    purpose: "Behavioural transaction monitoring — structuring, velocity, jurisdiction anomalies",
    humanInLoop: true,
    lastValidated: "2026-02-28",
    biasAuditStatus: "Conditional Pass",
    modelCardLink: "/api-docs#transaction-anomaly",
    notes: "Isolation forest + rule layer. Bias audit found slight over-alerting on cash-intensive SME segment. Threshold recalibration completed Q1 2026.",
  },
  {
    id: "MDL-005",
    name: "PEP Classifier",
    version: "v1.8.3",
    provider: "Internal",
    riskTier: "Medium",
    purpose: "PEP role classification and family/associate link inference",
    humanInLoop: true,
    lastValidated: "2026-03-01",
    biasAuditStatus: "Pass",
    modelCardLink: "/api-docs#pep-classifier",
    notes: "Rule-based with LLM-assisted disambiguation for edge cases. Human escalation required for all tier-1 PEP classifications.",
  },
  {
    id: "MDL-006",
    name: "Adverse Media Scorer",
    version: "v3.0.2",
    provider: "Internal",
    riskTier: "Medium",
    purpose: "Adverse media keyword classification and severity scoring across 50k+ sources",
    humanInLoop: false,
    lastValidated: "2026-03-20",
    biasAuditStatus: "Pass",
    modelCardLink: "/api-docs#adverse-media",
    notes: "Human review triggered for score ≥ 70. Low-severity hits auto-cleared after analyst acknowledgement. Covers Arabic, English, French, Chinese, Russian, Spanish.",
  },
];

const DEFAULT_INCIDENTS: AiIncident[] = [
  {
    id: "INC-001",
    date: "2026-01-14",
    model: "claude-sonnet-4-6",
    type: "Hallucination",
    severity: "High",
    description:
      "STR narrative draft cited a FATF guidance document with an incorrect article number (Art. 22 instead of Art. 16). Analyst caught the error during four-eyes review before submission.",
    resolution:
      "Added fact-checking prompt layer to narrative generation pipeline. Implemented citation verification step against the regulatory library. Retrained prompt template. No STR was filed with the error.",
    resolved: true,
  },
  {
    id: "INC-002",
    date: "2026-02-03",
    model: "Transaction Anomaly Detector",
    type: "Bias / Discrimination",
    severity: "Medium",
    description:
      "Q1 bias audit identified over-alerting rate 1.9× higher for UAE-national cash-intensive SMEs compared to the general population. Not yet at the 2× threshold but approaching.",
    resolution:
      "Threshold recalibration completed 2026-02-28. False-positive disparity reduced to 1.4×. Enhanced monitoring in place. Will re-audit at Q2 cycle.",
    resolved: true,
  },
  {
    id: "INC-003",
    date: "2026-02-19",
    model: "Fuzzy Match Engine",
    type: "Unexplained Decision",
    severity: "Low",
    description:
      "Customer contested a 91% match against a sanctioned entity. Feature attribution showed the match was primarily driven by transliteration of surname — not a genuine match. Customer was from India.",
    resolution:
      "Added country-of-origin weighting to transliteration scoring. Introduced analyst guidance note for India-region name patterns. Contestation resolved in customer's favour within 3 business days.",
    resolved: true,
  },
  {
    id: "INC-004",
    date: "2026-03-07",
    model: "claude-haiku-4-5",
    type: "Model Drift",
    severity: "Medium",
    description:
      "Adverse media classification precision dropped from 87% to 79% over 6 weeks as the underlying news dataset shifted with new election-related political coverage. Alert generated by daily PSI monitoring.",
    resolution:
      "Prompt engineering update applied 2026-03-10. Added political-exposure exclusion logic to reduce noise from benign election coverage. Precision recovered to 88%.",
    resolved: true,
  },
  {
    id: "INC-005",
    date: "2026-04-02",
    model: "PEP Classifier",
    type: "Unexplained Decision",
    severity: "Low",
    description:
      "An individual with the same name as a tier-2 PEP (domestic mayor) was incorrectly classified as PEP-related. The individual is a private citizen with no political connection.",
    resolution: "Under investigation. Name-collision logic review in progress. Expected close date: 2026-05-15.",
    resolved: false,
  },
  {
    id: "INC-006",
    date: "2026-04-18",
    model: "Adverse Media Scorer",
    type: "Other",
    severity: "Low",
    description:
      "Arabic-language adverse media sources returning lower hit rates than English equivalents due to tokenisation differences. Gap identified in quarterly coverage audit.",
    resolution: "Arabic NLP tokeniser upgrade scheduled for Q2 2026. Interim manual review for Arabic-primary subjects added to SOP.",
    resolved: false,
  },
];

const DEFAULT_BIAS: BiasSegment[] = [
  // Entity type segments
  { id: "BIA-001", label: "Individual persons", category: "entity-type", fprPct: 2.1, sampleSize: 14823, lastUpdated: "2026-04-15" },
  { id: "BIA-002", label: "Corporate entities", category: "entity-type", fprPct: 1.4, sampleSize: 8245, lastUpdated: "2026-04-15" },
  { id: "BIA-003", label: "PEPs (all tiers)", category: "entity-type", fprPct: 3.7, sampleSize: 1204, lastUpdated: "2026-04-15" },
  { id: "BIA-004", label: "Financial institutions", category: "entity-type", fprPct: 0.8, sampleSize: 412, lastUpdated: "2026-04-15" },
  { id: "BIA-005", label: "Non-profits & NGOs", category: "entity-type", fprPct: 2.9, sampleSize: 387, lastUpdated: "2026-04-15" },
  // Jurisdiction segments
  { id: "BIA-006", label: "UAE (domestic)", category: "jurisdiction", fprPct: 1.6, sampleSize: 9843, lastUpdated: "2026-04-15" },
  { id: "BIA-007", label: "GCC (ex-UAE)", category: "jurisdiction", fprPct: 1.9, sampleSize: 4211, lastUpdated: "2026-04-15" },
  { id: "BIA-008", label: "South Asia", category: "jurisdiction", fprPct: 2.8, sampleSize: 3102, lastUpdated: "2026-04-15" },
  { id: "BIA-009", label: "MENA (ex-GCC)", category: "jurisdiction", fprPct: 3.2, sampleSize: 2456, lastUpdated: "2026-04-15" },
  { id: "BIA-010", label: "EU / EEA", category: "jurisdiction", fprPct: 1.1, sampleSize: 1987, lastUpdated: "2026-04-15" },
  { id: "BIA-011", label: "Sub-Saharan Africa", category: "jurisdiction", fprPct: 3.6, sampleSize: 876, lastUpdated: "2026-04-15" },
  { id: "BIA-012", label: "FATF Grey-List jurisdictions", category: "jurisdiction", fprPct: 4.2, sampleSize: 543, lastUpdated: "2026-04-15" },
];

const DEFAULT_AUDIT: AuditEntry[] = [
  {
    id: "AUD-001",
    timestamp: "2026-04-28T09:14:22Z",
    model: "Fuzzy Match Engine",
    subjectAnon: "IND-****-7291",
    disposition: "Clear — no sanctions match above 85% threshold",
    confidence: 99,
    humanReviewed: false,
    policyRef: "Sanctions Screening Policy",
  },
  {
    id: "AUD-002",
    timestamp: "2026-04-28T10:02:11Z",
    model: "claude-sonnet-4-6",
    subjectAnon: "COR-****-4417",
    disposition: "EDD Required — adverse media score 84, CAHRA jurisdiction nexus",
    confidence: 87,
    humanReviewed: true,
    reviewer: "Analyst A. Rahman",
    policyRef: "AI Explainability Policy; EDD Procedure",
  },
  {
    id: "AUD-003",
    timestamp: "2026-04-27T14:33:05Z",
    model: "Transaction Anomaly Detector",
    subjectAnon: "IND-****-2098",
    disposition: "Escalated to MLRO — velocity anomaly detected (14 transactions / 48 hrs)",
    confidence: 78,
    humanReviewed: true,
    reviewer: "MLRO K. Al-Mansouri",
    policyRef: "Ongoing Monitoring Policy",
  },
  {
    id: "AUD-004",
    timestamp: "2026-04-27T11:18:44Z",
    model: "PEP Classifier",
    subjectAnon: "IND-****-5532",
    disposition: "PEP Tier-2 Classified — domestic municipality official",
    confidence: 91,
    humanReviewed: true,
    reviewer: "Analyst S. Mehta",
    policyRef: "PEP Policy; EDD Procedure",
  },
  {
    id: "AUD-005",
    timestamp: "2026-04-26T16:45:01Z",
    model: "Adverse Media Scorer",
    subjectAnon: "COR-****-8801",
    disposition: "Clear — 3 media hits, max score 34, all pre-2020 local civil disputes",
    confidence: 94,
    humanReviewed: false,
    policyRef: "Adverse Media Screening Methodology",
  },
  {
    id: "AUD-006",
    timestamp: "2026-04-26T09:22:33Z",
    model: "claude-sonnet-4-6",
    subjectAnon: "IND-****-3345",
    disposition: "STR Draft Generated — structuring pattern, 3 linked cash transactions",
    confidence: 82,
    humanReviewed: true,
    reviewer: "MLRO K. Al-Mansouri",
    policyRef: "STR Triage & Filing Policy; AI Explainability Policy",
  },
  {
    id: "AUD-007",
    timestamp: "2026-04-25T13:11:22Z",
    model: "Fuzzy Match Engine",
    subjectAnon: "COR-****-6673",
    disposition: "Positive Match — 93% against OFAC SDN. Account frozen. MLRO notified.",
    confidence: 93,
    humanReviewed: true,
    reviewer: "MLRO K. Al-Mansouri",
    policyRef: "Sanctions Screening Policy; TFS Policy",
  },
  {
    id: "AUD-008",
    timestamp: "2026-04-25T08:55:14Z",
    model: "claude-haiku-4-5",
    subjectAnon: "IND-****-9904",
    disposition: "Clear — adverse media classification: political exposure only, no financial crime indicators",
    confidence: 89,
    humanReviewed: false,
    policyRef: "Adverse Media Screening Methodology",
  },
  {
    id: "AUD-009",
    timestamp: "2026-04-24T15:30:45Z",
    model: "Transaction Anomaly Detector",
    subjectAnon: "COR-****-1122",
    disposition: "Alert Dismissed — velocity spike explained by documented trade settlement",
    confidence: 71,
    humanReviewed: true,
    reviewer: "Analyst T. Ibrahim",
    policyRef: "Ongoing Monitoring Policy",
  },
  {
    id: "AUD-010",
    timestamp: "2026-04-24T10:04:38Z",
    model: "claude-sonnet-4-6",
    subjectAnon: "IND-****-7788",
    disposition: "EDD Required — PEP Tier-1, foreign head of government. CEO sign-off requested.",
    confidence: 96,
    humanReviewed: true,
    reviewer: "MLRO K. Al-Mansouri",
    policyRef: "PEP Policy; AI Explainability Policy; Risk Appetite",
  },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function statusColour(s: UnescoStatus): string {
  return (
    {
      IMPLEMENTED: "bg-emerald-100 text-emerald-800 border-emerald-300",
      PARTIAL: "bg-amber-100 text-amber-800 border-amber-300",
      "IN PROGRESS": "bg-blue-100 text-blue-800 border-blue-300",
      PLANNED: "bg-slate-100 text-slate-600 border-slate-300",
    }[s] ?? "bg-slate-100 text-slate-600 border-slate-300"
  );
}

function riskColour(t: RiskTier): string {
  return (
    {
      High: "bg-red-100 text-red-700 border-red-300",
      Medium: "bg-amber-100 text-amber-700 border-amber-300",
      Low: "bg-emerald-100 text-emerald-700 border-emerald-300",
    }[t] ?? ""
  );
}

function biasColour(b: BiasAuditStatus): string {
  return (
    {
      Pass: "bg-emerald-100 text-emerald-700",
      "Conditional Pass": "bg-amber-100 text-amber-700",
      Fail: "bg-red-100 text-red-700",
      Pending: "bg-blue-100 text-blue-700",
      "Not Started": "bg-slate-100 text-slate-600",
    }[b] ?? ""
  );
}

function severityColour(s: IncidentSeverity): string {
  return (
    {
      Critical: "bg-red-100 text-red-800 border-red-300",
      High: "bg-orange-100 text-orange-800 border-orange-300",
      Medium: "bg-amber-100 text-amber-800 border-amber-300",
      Low: "bg-slate-100 text-slate-600 border-slate-300",
    }[s] ?? ""
  );
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "principles" | "models" | "incidents" | "bias" | "audit" | "assessment";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ResponsibleAiPage() {
  const [tab, setTab] = useState<Tab>("principles");

  // State
  const [principles, setPrinciples] = useState<UnescopPrinciple[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [incidents, setIncidents] = useState<AiIncident[]>([]);
  const [bias, setBias] = useState<BiasSegment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // Principles editing
  const [editingPrinciple, setEditingPrinciple] = useState<string | null>(null);
  const [principleEditDraft, setPrincipleEditDraft] = useState<{ status: UnescoStatus; evidence: string; owner: string }>({
    status: "PLANNED",
    evidence: "",
    owner: "",
  });

  // Incident add form
  const [addingIncident, setAddingIncident] = useState(false);
  const [incidentDraft, setIncidentDraft] = useState<Omit<AiIncident, "id" | "resolved">>({
    date: new Date().toISOString().slice(0, 10),
    model: "",
    type: "Other",
    severity: "Medium",
    description: "",
    resolution: "",
  });

  // Assessment
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<null | {
    overallScore: number;
    rating: string;
    unescoCompliancePct: number;
    summary: string;
    findings: Array<{ area: string; observation: string; severity: string; recommendation: string }>;
    strengths: string[];
    priorities: string[];
    nextReviewDate: string;
  }>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setPrinciples(loadFromStorage(STORAGE_PRINCIPLES, DEFAULT_PRINCIPLES));
    setModels(loadFromStorage(STORAGE_MODELS, DEFAULT_MODELS));
    setIncidents(loadFromStorage(STORAGE_INCIDENTS, DEFAULT_INCIDENTS));
    setBias(loadFromStorage(STORAGE_BIAS, DEFAULT_BIAS));
    setAudit(loadFromStorage(STORAGE_AUDIT, DEFAULT_AUDIT));
  }, []);

  // Persist helpers
  const updatePrinciples = useCallback((next: UnescopPrinciple[]) => {
    setPrinciples(next);
    saveToStorage(STORAGE_PRINCIPLES, next);
  }, []);
  const updateIncidents = useCallback((next: AiIncident[]) => {
    setIncidents(next);
    saveToStorage(STORAGE_INCIDENTS, next);
  }, []);

  // ─── KPI calculations ─────────────────────────────────────────────────────
  const implementedCount = principles.filter((p) => p.status === "IMPLEMENTED").length;
  const unescoCompliancePct =
    principles.length > 0
      ? Math.round(
          (principles.reduce((acc, p) => {
            if (p.status === "IMPLEMENTED") return acc + 1;
            if (p.status === "PARTIAL") return acc + 0.5;
            if (p.status === "IN PROGRESS") return acc + 0.25;
            return acc;
          }, 0) /
            principles.length) *
            100,
        )
      : 0;

  const thisQuarterStart = new Date("2026-01-01");
  const incidentsThisQtr = incidents.filter((i) => new Date(i.date) >= thisQuarterStart).length;
  const openIncidents = incidents.filter((i) => !i.resolved).length;

  // Bias alert calculation
  const avgFpr =
    bias.length > 0 ? bias.reduce((a, b) => a + b.fprPct, 0) / bias.length : 0;
  const alertedSegments = bias.filter((b) => b.fprPct > avgFpr * 2);

  // ─── Principle editor ─────────────────────────────────────────────────────
  const startEditPrinciple = (p: UnescopPrinciple) => {
    setEditingPrinciple(p.id);
    setPrincipleEditDraft({ status: p.status, evidence: p.evidence, owner: p.owner });
  };

  const savePrincipleEdit = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    updatePrinciples(
      principles.map((p) =>
        p.id === id
          ? { ...p, status: principleEditDraft.status, evidence: principleEditDraft.evidence, owner: principleEditDraft.owner, lastReviewed: today }
          : p,
      ),
    );
    setEditingPrinciple(null);
  };

  // ─── Incident add ─────────────────────────────────────────────────────────
  const saveIncident = () => {
    if (!incidentDraft.description.trim()) return;
    const newInc: AiIncident = {
      ...incidentDraft,
      id: `INC-${String(incidents.length + 1).padStart(3, "0")}`,
      resolved: false,
    };
    const next = [newInc, ...incidents];
    updateIncidents(next);
    setAddingIncident(false);
    setIncidentDraft({
      date: new Date().toISOString().slice(0, 10),
      model: "",
      type: "Other",
      severity: "Medium",
      description: "",
      resolution: "",
    });
  };

  const resolveIncident = (id: string) => {
    updateIncidents(incidents.map((i) => (i.id === id ? { ...i, resolved: true } : i)));
  };

  // ─── Ethics Assessment ─────────────────────────────────────────────────────
  const runAssessment = async () => {
    setAssessmentLoading(true);
    setTab("assessment");
    try {
      const res = await fetch("/api/ai-ethics-assessment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          models: models.map((m) => ({
            name: m.name,
            riskTier: m.riskTier,
            purpose: m.purpose,
            biasAuditStatus: m.biasAuditStatus,
          })),
          incidents: incidents.map((i) => ({
            type: i.type,
            severity: i.severity,
            model: i.model,
          })),
          biasData: bias.map((b) => ({ segment: b.label, fprPct: b.fprPct })),
        }),
      });
      const data = await res.json();
      setAssessmentResult(data);
    } catch {
      setAssessmentResult(null);
    } finally {
      setAssessmentLoading(false);
    }
  };

  // ─── TAB STYLES ───────────────────────────────────────────────────────────
  const tabCls = (t: Tab) =>
    `px-4 py-2 text-12 font-semibold rounded-t border-b-2 transition-colors ${
      tab === t
        ? "border-brand text-brand bg-brand/5"
        : "border-transparent text-ink-2 hover:text-ink-0 hover:border-hair"
    }`;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <ModuleLayout asanaModule="responsible-ai" asanaLabel="Responsible AI">
      <ModuleHero
        eyebrow="Module 27 · AI Ethics"
        title="Responsible AI"
        titleEm="governance."
        intro={
          <>
            <strong>UNESCO-aligned AI oversight for every model in scope.</strong>{" "}
            Track all 11 UNESCO principles, maintain a model registry, log AI incidents,
            monitor bias metrics, and review the immutable AI audit trail. Run an
            AI ethics assessment at any time.
          </>
        }
        kpis={[
          { label: "UNESCO compliance", value: `${unescoCompliancePct}%` },
          { label: "Models registered", value: String(models.length) },
          { label: "Incidents this quarter", value: String(incidentsThisQtr), ...(incidentsThisQtr > 2 ? { tone: "amber" as const } : {}) },
          { label: "Open incidents", value: String(openIncidents), ...(openIncidents > 0 ? { tone: "orange" as const } : {}) },
          { label: "Audit entries", value: String(audit.length) },
          { label: "Bias alerts", value: String(alertedSegments.length), ...(alertedSegments.length > 0 ? { tone: "red" as const } : {}) },
        ]}
      />

      {/* Run Ethics Assessment CTA */}
      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void runAssessment()}
          disabled={assessmentLoading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold text-13 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {assessmentLoading ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Running assessment…
            </>
          ) : (
            <>Run AI Ethics Assessment</>
          )}
        </button>
        <span className="text-11 text-ink-3">
          Sends model registry, incident log, and bias data to the Anthropic API for an ethics report.
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-hair flex gap-1 flex-wrap">
        <button type="button" className={tabCls("principles")} onClick={() => setTab("principles")}>
          UNESCO Principles ({implementedCount}/{principles.length})
        </button>
        <button type="button" className={tabCls("models")} onClick={() => setTab("models")}>
          AI Model Registry ({models.length})
        </button>
        <button type="button" className={tabCls("incidents")} onClick={() => setTab("incidents")}>
          Incident Log ({incidents.length})
        </button>
        <button type="button" className={tabCls("bias")} onClick={() => setTab("bias")}>
          Bias Monitoring {alertedSegments.length > 0 && <span className="ml-1 text-red font-bold">!</span>}
        </button>
        <button type="button" className={tabCls("audit")} onClick={() => setTab("audit")}>
          AI Audit Trail ({audit.length})
        </button>
        <button type="button" className={tabCls("assessment")} onClick={() => setTab("assessment")}>
          Ethics Assessment
        </button>
      </div>

      <div className="mt-4">
        {/* ── PRINCIPLES TAB ─────────────────────────────────────────────── */}
        {tab === "principles" && (
          <div className="space-y-3">
            {principles.map((p) => (
              <div key={p.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-11 font-bold text-ink-3 w-7 shrink-0">{p.id}</span>
                    <div>
                      <h3 className="text-13 font-semibold text-ink-0 m-0">{p.name}</h3>
                      <p className="text-11.5 text-ink-2 mt-0.5 m-0 max-w-[60ch]">{p.description}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 text-10 font-semibold rounded border ${statusColour(p.status)}`}
                  >
                    {p.status}
                  </span>
                </div>

                {editingPrinciple === p.id ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Status</label>
                        <select
                          value={principleEditDraft.status}
                          onChange={(e) =>
                            setPrincipleEditDraft({ ...principleEditDraft, status: e.target.value as UnescoStatus })
                          }
                          className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                        >
                          {(["IMPLEMENTED", "PARTIAL", "IN PROGRESS", "PLANNED"] as UnescoStatus[]).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Owner</label>
                        <input
                          type="text"
                          value={principleEditDraft.owner}
                          onChange={(e) =>
                            setPrincipleEditDraft({ ...principleEditDraft, owner: e.target.value })
                          }
                          className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Evidence of implementation</label>
                      <textarea
                        value={principleEditDraft.evidence}
                        onChange={(e) =>
                          setPrincipleEditDraft({ ...principleEditDraft, evidence: e.target.value })
                        }
                        rows={3}
                        className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-0 text-ink-0"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => savePrincipleEdit(p.id)}
                        className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPrinciple(null)}
                        className="text-11 font-medium px-3 py-1 rounded text-ink-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-start">
                    <p className="text-11.5 text-ink-1 leading-relaxed m-0">
                      <strong>Evidence:</strong> {p.evidence}
                    </p>
                    <button
                      type="button"
                      onClick={() => startEditPrinciple(p)}
                      className="text-10 font-mono text-brand hover:underline whitespace-nowrap"
                    >
                      edit
                    </button>
                    <div className="flex gap-4 text-10 text-ink-3 font-mono col-span-2">
                      <span>Owner: {p.owner}</span>
                      <span>Reviewed: {fmtDate(p.lastReviewed)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── MODEL REGISTRY TAB ─────────────────────────────────────────── */}
        {tab === "models" && (
          <div className="overflow-x-auto">
            <table className="w-full text-12 border-collapse">
              <thead>
                <tr className="border-b border-hair-2 text-10 uppercase tracking-wide-4 text-ink-2">
                  <th className="text-left py-2 pr-4 font-semibold">Model</th>
                  <th className="text-left py-2 pr-4 font-semibold">Provider</th>
                  <th className="text-left py-2 pr-4 font-semibold">Risk Tier</th>
                  <th className="text-left py-2 pr-4 font-semibold">Purpose</th>
                  <th className="text-left py-2 pr-4 font-semibold">Human-in-Loop</th>
                  <th className="text-left py-2 pr-4 font-semibold">Last Validated</th>
                  <th className="text-left py-2 pr-4 font-semibold">Bias Audit</th>
                  <th className="text-left py-2 font-semibold">Model Card</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-b border-hair hover:bg-bg-panel transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-ink-0">{m.name}</div>
                      <div className="text-10 text-ink-3 font-mono">{m.version}</div>
                    </td>
                    <td className="py-3 pr-4 text-ink-1">{m.provider}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 text-10 font-semibold rounded border ${riskColour(m.riskTier)}`}>
                        {m.riskTier}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-ink-1 max-w-[220px]">
                      <span className="line-clamp-2">{m.purpose}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {m.humanInLoop ? (
                        <span className="text-emerald-700 font-semibold">Yes</span>
                      ) : (
                        <span className="text-ink-3">No</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-ink-2">{fmtDate(m.lastValidated)}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 text-10 font-medium rounded ${biasColour(m.biasAuditStatus)}`}>
                        {m.biasAuditStatus}
                      </span>
                    </td>
                    <td className="py-3">
                      <a
                        href={m.modelCardLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline font-mono text-10"
                      >
                        view
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 space-y-2">
              {models.map((m) => m.notes && (
                <div key={m.id} className="text-11 text-ink-2 bg-bg-panel rounded p-3 border border-hair">
                  <span className="font-semibold text-ink-1">{m.name}:</span> {m.notes}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INCIDENT LOG TAB ───────────────────────────────────────────── */}
        {tab === "incidents" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-4 text-11 text-ink-2">
                <span><strong>{incidents.length}</strong> total incidents</span>
                <span><strong>{openIncidents}</strong> open</span>
                <span><strong>{incidentsThisQtr}</strong> this quarter</span>
              </div>
              {!addingIncident && (
                <button
                  type="button"
                  onClick={() => setAddingIncident(true)}
                  className="text-11 font-semibold px-3 py-1.5 rounded border border-brand text-brand hover:bg-brand/5 transition-colors"
                >
                  + Log Incident
                </button>
              )}
            </div>

            {addingIncident && (
              <div className="bg-bg-panel border border-brand/40 rounded-lg p-4 mb-4">
                <h3 className="text-12 font-semibold text-ink-0 mb-3">New AI Incident</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Date</label>
                    <input
                      type="date"
                      value={incidentDraft.date}
                      onChange={(e) => setIncidentDraft({ ...incidentDraft, date: e.target.value })}
                      className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                    />
                  </div>
                  <div>
                    <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Model</label>
                    <input
                      type="text"
                      value={incidentDraft.model}
                      onChange={(e) => setIncidentDraft({ ...incidentDraft, model: e.target.value })}
                      placeholder="Model name"
                      className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                    />
                  </div>
                  <div>
                    <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Type</label>
                    <select
                      value={incidentDraft.type}
                      onChange={(e) => setIncidentDraft({ ...incidentDraft, type: e.target.value as IncidentType })}
                      className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                    >
                      {(["Bias / Discrimination", "Hallucination", "Data Leak", "Model Drift", "Adversarial Attack", "Unexplained Decision", "System Failure", "Other"] as IncidentType[]).map(
                        (t) => <option key={t} value={t}>{t}</option>,
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Severity</label>
                    <select
                      value={incidentDraft.severity}
                      onChange={(e) => setIncidentDraft({ ...incidentDraft, severity: e.target.value as IncidentSeverity })}
                      className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0"
                    >
                      {(["Critical", "High", "Medium", "Low"] as IncidentSeverity[]).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Description</label>
                  <textarea
                    value={incidentDraft.description}
                    onChange={(e) => setIncidentDraft({ ...incidentDraft, description: e.target.value })}
                    rows={3}
                    placeholder="What happened?"
                    className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-0 text-ink-0"
                  />
                </div>
                <div className="mb-3">
                  <label className="text-10 uppercase tracking-wide-4 text-ink-3 block mb-1">Resolution / Notes</label>
                  <textarea
                    value={incidentDraft.resolution}
                    onChange={(e) => setIncidentDraft({ ...incidentDraft, resolution: e.target.value })}
                    rows={2}
                    placeholder="Resolution or next steps"
                    className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-0 text-ink-0"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveIncident}
                    disabled={!incidentDraft.description.trim()}
                    className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0 disabled:opacity-40"
                  >
                    Log incident
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingIncident(false)}
                    className="text-11 font-medium px-3 py-1 rounded text-ink-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`bg-bg-panel border rounded-lg p-4 ${inc.resolved ? "border-hair-2 opacity-80" : "border-orange-300"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-10 text-ink-3">{inc.id}</span>
                      <span className={`px-2 py-0.5 text-10 font-semibold rounded border ${severityColour(inc.severity)}`}>
                        {inc.severity}
                      </span>
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 text-10 rounded border border-slate-200">
                        {inc.type}
                      </span>
                      <span className="font-mono text-10 text-ink-3">{inc.model}</span>
                      <span className="text-10 text-ink-3">{fmtDate(inc.date)}</span>
                    </div>
                    {inc.resolved ? (
                      <span className="text-emerald-700 text-10 font-semibold shrink-0">Resolved</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resolveIncident(inc.id)}
                        className="text-10 font-semibold text-brand hover:underline shrink-0"
                      >
                        Mark resolved
                      </button>
                    )}
                  </div>
                  <p className="text-11.5 text-ink-1 mt-2 mb-1">{inc.description}</p>
                  {inc.resolution && (
                    <p className="text-11 text-ink-2 m-0">
                      <strong>Resolution:</strong> {inc.resolution}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BIAS MONITORING TAB ────────────────────────────────────────── */}
        {tab === "bias" && (
          <div>
            <div className="mb-4 flex items-center gap-4">
              <div className="text-11 text-ink-2">
                Average FPR: <strong className="text-ink-0">{avgFpr.toFixed(1)}%</strong>
              </div>
              <div className="text-11 text-ink-2">
                Alert threshold: <strong className="text-ink-0">{(avgFpr * 2).toFixed(1)}%</strong> (2× mean)
              </div>
              {alertedSegments.length > 0 && (
                <div className="px-3 py-1 rounded bg-red-100 border border-red-300 text-red-700 text-11 font-semibold">
                  {alertedSegments.length} segment{alertedSegments.length > 1 ? "s" : ""} exceed 2× mean FPR
                </div>
              )}
            </div>

            {/* By entity type */}
            <div className="mb-6">
              <h3 className="text-10 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3">By Entity Type</h3>
              <div className="space-y-2">
                {bias
                  .filter((b) => b.category === "entity-type")
                  .sort((a, b) => b.fprPct - a.fprPct)
                  .map((seg) => {
                    const isAlerted = seg.fprPct > avgFpr * 2;
                    const barWidth = Math.min((seg.fprPct / 6) * 100, 100);
                    return (
                      <div key={seg.id} className={`bg-bg-panel border rounded-lg p-3 ${isAlerted ? "border-red-300" : "border-hair-2"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-12 font-medium text-ink-0">{seg.label}</span>
                            {isAlerted && (
                              <span className="px-1.5 py-0.5 bg-red-100 border border-red-300 text-red-700 text-10 font-bold rounded">
                                ALERT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-11 font-mono">
                            <span className={isAlerted ? "text-red font-bold" : "text-ink-1"}>
                              FPR {seg.fprPct.toFixed(1)}%
                            </span>
                            <span className="text-ink-3">n={seg.sampleSize.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${isAlerted ? "bg-red-500" : "bg-brand"}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="mt-1 text-10 text-ink-3 font-mono">
                          Last updated: {fmtDate(seg.lastUpdated)}
                          {isAlerted && (
                            <span className="ml-3 text-red-600 font-semibold">
                              {(seg.fprPct / avgFpr).toFixed(1)}× mean — investigate
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* By jurisdiction */}
            <div>
              <h3 className="text-10 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3">By Jurisdiction</h3>
              <div className="space-y-2">
                {bias
                  .filter((b) => b.category === "jurisdiction")
                  .sort((a, b) => b.fprPct - a.fprPct)
                  .map((seg) => {
                    const isAlerted = seg.fprPct > avgFpr * 2;
                    const barWidth = Math.min((seg.fprPct / 6) * 100, 100);
                    return (
                      <div key={seg.id} className={`bg-bg-panel border rounded-lg p-3 ${isAlerted ? "border-red-300" : "border-hair-2"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-12 font-medium text-ink-0">{seg.label}</span>
                            {isAlerted && (
                              <span className="px-1.5 py-0.5 bg-red-100 border border-red-300 text-red-700 text-10 font-bold rounded">
                                ALERT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-11 font-mono">
                            <span className={isAlerted ? "text-red font-bold" : "text-ink-1"}>
                              FPR {seg.fprPct.toFixed(1)}%
                            </span>
                            <span className="text-ink-3">n={seg.sampleSize.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${isAlerted ? "bg-red-500" : "bg-brand"}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="mt-1 text-10 text-ink-3 font-mono">
                          Last updated: {fmtDate(seg.lastUpdated)}
                          {isAlerted && (
                            <span className="ml-3 text-red-600 font-semibold">
                              {(seg.fprPct / avgFpr).toFixed(1)}× mean — investigate
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ── AI AUDIT TRAIL TAB ─────────────────────────────────────────── */}
        {tab === "audit" && (
          <div>
            <p className="text-11 text-ink-2 mb-4">
              Immutable log of AI-assisted decisions. Entries cannot be modified or deleted. Retained 10 years per FDL 10/2025 Art. 24.
            </p>
            <div className="space-y-2">
              {audit.map((a) => (
                <div key={a.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-10 font-semibold text-ink-3">{a.id}</span>
                      <span className="font-mono text-10 text-ink-3">{new Date(a.timestamp).toLocaleString()}</span>
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 text-10 rounded border border-slate-200">
                        {a.model}
                      </span>
                      <span className="font-mono text-10 text-ink-2">{a.subjectAnon}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-10 text-ink-3">conf {a.confidence}%</span>
                      {a.humanReviewed ? (
                        <span className="px-2 py-0.5 text-10 font-semibold rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Human reviewed
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-10 rounded bg-slate-100 text-slate-500 border border-slate-200">
                          Auto
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-12 text-ink-1 mt-2 mb-1 font-medium">{a.disposition}</p>
                  <div className="flex gap-4 text-10 text-ink-3 font-mono">
                    {a.reviewer && <span>Reviewer: {a.reviewer}</span>}
                    <span>Policy: {a.policyRef}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ETHICS ASSESSMENT TAB ──────────────────────────────────────── */}
        {tab === "assessment" && (
          <div>
            {assessmentLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full" />
                <p className="text-13 text-ink-2">Running AI ethics assessment…</p>
              </div>
            )}

            {!assessmentLoading && !assessmentResult && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="text-48 opacity-20">AI</div>
                <p className="text-13 text-ink-2 max-w-[40ch]">
                  Click <strong>Run AI Ethics Assessment</strong> above to generate a UNESCO-aligned ethics report using your current model registry, incident log, and bias data.
                </p>
              </div>
            )}

            {!assessmentLoading && assessmentResult && (
              <div className="space-y-5">
                {/* Score card */}
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="font-mono text-48 font-bold text-ink-0">{assessmentResult.overallScore}</div>
                      <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-semibold">Overall Score</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-48 font-bold text-brand">{assessmentResult.unescoCompliancePct}%</div>
                      <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-semibold">UNESCO Compliance</div>
                    </div>
                    <div>
                      <span
                        className={`px-3 py-1 text-13 font-semibold rounded border ${
                          assessmentResult.rating === "exemplary"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : assessmentResult.rating === "good"
                              ? "bg-blue-100 text-blue-800 border-blue-300"
                              : assessmentResult.rating === "adequate"
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-red-100 text-red-800 border-red-300"
                        }`}
                      >
                        {assessmentResult.rating.toUpperCase()}
                      </span>
                      <div className="mt-2 text-10 text-ink-3">
                        Next review: {assessmentResult.nextReviewDate}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-12 text-ink-1 leading-relaxed m-0">{assessmentResult.summary}</p>
                    </div>
                  </div>
                </div>

                {/* Findings */}
                <div>
                  <h3 className="text-10 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3">Findings</h3>
                  <div className="space-y-2">
                    {assessmentResult.findings.map((f, i) => (
                      <div
                        key={i}
                        className={`bg-bg-panel border rounded-lg p-4 ${
                          f.severity === "critical"
                            ? "border-red-300"
                            : f.severity === "high"
                              ? "border-orange-300"
                              : f.severity === "medium"
                                ? "border-amber-300"
                                : f.severity === "info"
                                  ? "border-blue-200"
                                  : "border-hair-2"
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-semibold text-ink-0 text-12">{f.area}</span>
                          <span
                            className={`px-2 py-0.5 text-10 font-semibold rounded border ${
                              f.severity === "critical"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : f.severity === "high"
                                  ? "bg-orange-100 text-orange-700 border-orange-300"
                                  : f.severity === "medium"
                                    ? "bg-amber-100 text-amber-700 border-amber-300"
                                    : f.severity === "info"
                                      ? "bg-blue-100 text-blue-700 border-blue-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {f.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-11.5 text-ink-1 m-0 mb-1">{f.observation}</p>
                        <p className="text-11 text-ink-2 m-0">
                          <strong>Recommendation:</strong> {f.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths and priorities */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h3 className="text-10 uppercase tracking-wide-4 text-emerald-700 font-semibold mb-2">Strengths</h3>
                    <ul className="list-none p-0 m-0 space-y-1">
                      {assessmentResult.strengths.map((s, i) => (
                        <li key={i} className="text-11.5 text-emerald-800 flex gap-2">
                          <span className="shrink-0 text-emerald-500">+</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="text-10 uppercase tracking-wide-4 text-amber-700 font-semibold mb-2">Priority Actions</h3>
                    <ol className="list-none p-0 m-0 space-y-1">
                      {assessmentResult.priorities.map((p, i) => (
                        <li key={i} className="text-11.5 text-amber-800 flex gap-2">
                          <span className="shrink-0 font-mono text-amber-500 text-10 pt-0.5">{i + 1}.</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
