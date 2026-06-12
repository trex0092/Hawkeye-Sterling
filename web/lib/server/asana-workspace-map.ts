// Hawkeye Sterling — Canonical Asana workspace map ("workspace-as-code").
//
// Single source of truth for the operator-approved Asana topology:
//   00 · Hawkeye Inbox — Master Landing            (triage / catch-all)
//   88 module boards (1.01–5.14)                   (one per sidebar module)
//   HS · Modules — Daily Attestation               (MLRO single-pane digest)
//
// The bootstrap endpoint (app/api/asana-bootstrap-workspace) builds the
// live workspace from this file; the generated GID artifact
// (asana-workspace-gids.json) records what was built. Structural changes
// here require MLRO sign-off + a CHANGE_CONTROL_LOG.md entry.
//
// Regulatory frame: FDL No.10/2025 (Art.18/24), FDL 20/2018, Cabinet
// Decision 10/2019, Cabinet Resolution 134/2025, FATF Recommendations,
// OECD DDG, LBMA RGG v9.

import { ASANA_MODULE_TASKS, MODULE_FREQUENCY } from "./asana-module-tasks";
import gidArtifact from "./asana-workspace-gids.json";
import narrativeArtifact from "./asana-module-narratives.json";

export type BoardGroup =
  | "onboarding-cdd"
  | "risk-aml-ops"
  | "governance-audit"
  | "kyc-tools"
  | "intelligence";

export const GROUP_META: Record<BoardGroup, { title: string; color: string; prefix: number }> = {
  "onboarding-cdd":   { title: "ONBOARDING & CDD",   color: "light-pink",  prefix: 1 },
  "risk-aml-ops":     { title: "RISK & AML OPS",     color: "dark-red",    prefix: 2 },
  "governance-audit": { title: "GOVERNANCE & AUDIT", color: "dark-purple", prefix: 3 },
  "kyc-tools":        { title: "KYC TOOLS",          color: "dark-blue",   prefix: 4 },
  "intelligence":     { title: "INTELLIGENCE",       color: "dark-green",  prefix: 5 },
};

// Default lifecycle — the operator-approved board workflow.
export const DEFAULT_SECTIONS = [
  "📥 New Arrivals — Unreviewed",
  "🔍 In Review",
  "⚠️ Escalated — Pending Decision",
  "✅ Completed",
  "🗄️ Closed",
] as const;

export interface ModuleBoard {
  /** Unique board key — the module id used by /api/module-report where one exists. */
  key: string;
  /** Board number within its group, e.g. "1.04". */
  num: string;
  emoji: string;
  label: string;
  group: BoardGroup;
  /** Workflow sections (specialized lifecycles override the default). */
  sections: readonly string[];
  /** Charter metadata — registry-sourced for registered modules, supplement below otherwise. */
  purpose: string;
  control: string;
  obligation: string;
  owner: string;
  retention: string;
}

// ── Supplement metadata for sidebar modules outside the 65-module
//    attestation registry (composed from nav hints + module summaries). ──
interface Supplement { purpose: string; control: string; obligation: string; owner: string; retention: string }

const SUPPLEMENT: Record<string, Supplement> = {
  "grievances-whistleblowing": {
    purpose: "Whistleblowing & grievance management — anonymous and named reports with triage, investigation and remediation.",
    control: "Reports triaged within SLA; deliberate reporting failures escalate to MD same-day; reporter protection enforced.",
    obligation: "Internal controls & whistleblowing arrangements — Cabinet 10/2019 Art.21; FDL 10/2025 Art.20.",
    owner: "Compliance Officer; MD on escalation", retention: "5 yrs",
  },
  pkyc: {
    purpose: "Perpetual KYC — continuous CDD lifecycle monitoring with event-driven refresh triggers per customer.",
    control: "Material-change events trigger CDD refresh without waiting for the periodic cycle; overdue refreshes flagged.",
    obligation: "Ongoing CDD & records kept current — Cabinet 10/2019 Art.7; FATF R.10.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  lbma: {
    purpose: "LBMA Responsible Gold — supply-chain declarations and Good Delivery assurance tracking.",
    control: "Gold counterparties verified against LBMA Good Delivery and RGG v9 requirements before reliance.",
    obligation: "LBMA Responsible Gold Guidance v9; OECD DDG; Ministerial Decree 68/2024.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  "esg-risk": {
    purpose: "ESG risk scoring with ML risk overlay and regulatory-exposure mapping per counterparty.",
    control: "ESG score recorded per assessed entity; high ESG-risk outcomes routed to EDD review.",
    obligation: "Responsible sourcing & ESG expectations — OECD DDG; LBMA RGG v9; CSDDD-aligned supply-chain duty.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  training: {
    purpose: "AML/CFT staff training tracker — assignments, completion records and mandatory recertification deadlines.",
    control: "Mandatory training completion tracked; overdue recertification auto-flagged to the Compliance Officer.",
    obligation: "Ongoing employee AML/CFT training — Cabinet 10/2019 Art.21; FATF R.18.",
    owner: "Compliance Officer / HR", retention: "5 yrs",
  },
  cases: {
    purpose: "Case management — investigations, dispositions and the case-level audit trail.",
    control: "Every case carries a recorded disposition and links to its evidence in the audit chain.",
    obligation: "Investigation & record-keeping duties — FDL 10/2025; Cabinet 10/2019 Art.24; FATF R.10/R.20.",
    owner: "Compliance Officer; MLRO on escalation", retention: "5 yrs",
  },
  "responsible-sourcing": {
    purpose: "OECD 5-step due-diligence guidance implementation and Ministerial Decree 68/2024 compliance tracking.",
    control: "Five-step DDG assessments recorded per supply-chain counterparty; gaps escalate to MLRO.",
    obligation: "OECD DDG · Ministerial Decree 68/2024 · LBMA RGG responsible-sourcing requirements.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  rmap: {
    purpose: "RMAP-conformant smelter database — conformance lookups supporting minerals due diligence.",
    control: "Smelter conformance status verified against the RMI/RMAP list before supply-chain reliance.",
    obligation: "Responsible Minerals Initiative / RMAP; OECD DDG Step 4 (independent audit reliance).",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  pnmr: {
    purpose: "Positive Name Match Report queue — confirmed-match reporting workflow to EOCN.",
    control: "Positive matches against UAE/UNSC lists generate a PNMR with freeze-without-delay handling.",
    obligation: "Targeted financial sanctions — Cabinet 74/2020; EOCN Executive Office guidance; FATF R.6.",
    owner: "MLRO", retention: "10 yrs",
  },
  "fp-optimizer": {
    purpose: "ML false-positive pattern analysis and screening threshold tuning proposals.",
    control: "Threshold changes are proposals only — four-eyes approval required before any tuning takes effect.",
    obligation: "Screening effectiveness & model governance — FDL 10/2025 Art.18; FATF R.1 (risk-based approach).",
    owner: "Compliance Officer (maker) + MLRO (checker)", retention: "5 yrs",
  },
  "tm-rules": {
    purpose: "Transaction-monitoring rule management — calibration, change requests and approvals.",
    control: "Rule changes require recorded approval (four-eyes) with before/after calibration evidence.",
    obligation: "Ongoing monitoring obligations — Cabinet 10/2019 Art.16; FATF R.10/R.20.",
    owner: "Compliance Officer + MLRO", retention: "5 yrs",
  },
  "audit-findings": {
    purpose: "Internal audit findings tracker — remediation ownership, due dates and closure evidence.",
    control: "Findings tracked to closure with owner + due date; overdue items escalate to senior management.",
    obligation: "Independent audit function — Cabinet 10/2019 Art.21; FATF R.18.",
    owner: "Compliance Officer; Board visibility", retention: "5 yrs",
  },
  "dormant-accounts": {
    purpose: "Dormant account monitoring and reactivation review workflow.",
    control: "Reactivation of dormant relationships requires refreshed CDD before any transaction.",
    obligation: "Ongoing CDD & monitoring — Cabinet 10/2019 Art.7/16.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  "outsourcing-register": {
    purpose: "Third-party outsourcing register with periodic arrangement reviews.",
    control: "Material outsourcing recorded, risk-rated and reviewed on cadence; exit plans documented.",
    obligation: "Outsourcing risk management — Cabinet 10/2019 Art.21; MoE DNFBP guidance.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  "coi-register": {
    purpose: "Conflicts-of-interest register — declarations, assessments and dispositions.",
    control: "Declared conflicts assessed and dispositioned; unresolved conflicts escalate to senior management.",
    obligation: "Internal controls & governance — Cabinet 10/2019 Art.21; FDL 10/2025 Art.20.",
    owner: "Compliance Officer; MD on escalation", retention: "5 yrs",
  },
  "voluntary-disclosure": {
    purpose: "Voluntary disclosure management — drafting, approval and submission tracking to regulators.",
    control: "Disclosures require MLRO + senior-management approval; submission evidence retained.",
    obligation: "Regulator cooperation duties — FDL 10/2025; MoE supervisory expectations.",
    owner: "MLRO + senior management", retention: "10 yrs",
  },
  "ai-governance": {
    purpose: "Enterprise AI governance framework — stakeholder matrix, AI risk register, NIST AI RMF and MITRE ATLAS mapping.",
    control: "Every production model carries riskTier, approval and model card; changes go through governance review.",
    obligation: "AI governance & audit trail — FDL 10/2025 Art.18/24; ISO/IEC 42001; EU AI Act-aligned.",
    owner: "MLRO + AI governance committee", retention: "10 yrs",
  },
  "shadow-ai": {
    purpose: "Shadow AI register — detection and remediation of unauthorized AI tools and no-DPA vendors.",
    control: "Unauthorized AI usage logged, risk-classified and remediated; repeat findings escalate.",
    obligation: "AI governance & data protection — FDL 10/2025 Art.18; UAE PDPL.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  "vendor-ai-audit": {
    purpose: "AI vendor due diligence — DPA, model card, penetration-test and SLA evidence per vendor.",
    control: "AI vendors onboarded only with complete due-diligence evidence; annual re-audit.",
    obligation: "Third-party AI risk — FDL 10/2025 Art.18; ISO/IEC 42001; UAE PDPL.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  geopolitical: {
    purpose: "Live geopolitical events feed with portfolio impact assessment and risk-map overlay.",
    control: "Material geopolitical events assessed for portfolio exposure; impacts routed to country-risk review.",
    obligation: "Risk-based approach to geographic risk — FATF R.1/R.10; Cabinet 10/2019 Art.4.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  "country-risk-map": {
    purpose: "Country risk heat-map — global jurisdiction risk overview feeding onboarding and EDD decisions.",
    control: "High-risk jurisdiction exposure triggers EDD per the country-risk methodology.",
    obligation: "Geographic risk assessment — FATF R.1/R.19 (higher-risk countries); Cabinet 10/2019 Art.4.",
    owner: "Compliance Officer", retention: "5 yrs",
  },
  workbench: {
    purpose: "Analyst cognitive workbench — structured analysis workspace for compliance analysts.",
    control: "Analyst work products linked to cases and preserved as evidence.",
    obligation: "Investigation support & record-keeping — Cabinet 10/2019 Art.24.",
    owner: "Compliance Analyst; MLRO oversight", retention: "5 yrs",
  },
  telemetry: {
    purpose: "Live system telemetry and metrics — operational health of compliance controls.",
    control: "Control-plane metrics monitored; anomalies alert operations.",
    obligation: "Operational resilience — SOC2 CC7; FDL 10/2025 system-integrity expectations.",
    owner: "Operations / Compliance Officer", retention: "5 yrs",
  },
  "red-team": {
    purpose: "Adversarial red-team probe console — 16 probes across 6 categories against the AI layer.",
    control: "Probe results reviewed; failures open AI incidents per the AI incident playbook.",
    obligation: "AI adversarial robustness — FDL 10/2025 Art.18; MITRE ATLAS-aligned testing.",
    owner: "MLRO + security", retention: "10 yrs",
  },
  "security-audit": {
    purpose: "Security audit dashboard — control posture and audit results across the platform.",
    control: "Security findings tracked to remediation; criticals escalate immediately.",
    obligation: "Information security controls — SOC2 CC6/CC7; FDL 10/2025 Art.24.",
    owner: "Security / Compliance Officer", retention: "5 yrs",
  },
  "system-status": {
    purpose: "Live service status & health — availability evidence for compliance-critical services.",
    control: "Availability monitored; incidents recorded with recovery evidence per the incident runbook.",
    obligation: "Operational resilience & incident response — SOC2 CC7.4.",
    owner: "Operations", retention: "5 yrs",
  },
  "api-docs": {
    purpose: "API reference documentation — integration surface of the compliance platform.",
    control: "API changes documented and versioned; auth requirements stated per endpoint.",
    obligation: "Change management & access documentation — SOC2 CC8.",
    owner: "Operations", retention: "5 yrs",
  },
  "system-card": {
    purpose: "Model system card & governance disclosures for the platform's AI layer.",
    control: "System card kept current with model registry; discloses risk tiers and approvals.",
    obligation: "AI transparency — FDL 10/2025 Art.18; ISO/IEC 42001 documentation duties.",
    owner: "MLRO + AI governance committee", retention: "10 yrs",
  },
  "security-scan": {
    purpose: "Dependency & code security scanning — SAST/SCA results and remediation tracking.",
    control: "HIGH/CRITICAL findings block release until remediated or risk-accepted with sign-off.",
    obligation: "Secure development — SOC2 CC8; supply-chain security expectations.",
    owner: "Security / Operations", retention: "5 yrs",
  },
  "board-dashboard": {
    purpose: "Board-level compliance dashboard — programme posture for senior management oversight.",
    control: "Board pack metrics generated from live controls; reviewed at governance committee cadence.",
    obligation: "Senior-management accountability — FDL 10/2025 Art.20; CBUAE AML Standards §6.",
    owner: "MLRO → Board", retention: "10 yrs",
  },
  "kri-dashboard": {
    purpose: "Key risk indicator dashboard — KRI thresholds, breaches and trend review.",
    control: "KRI breaches alert the MLRO and are dispositioned with recorded rationale.",
    obligation: "Risk monitoring & governance — FATF R.1; Cabinet 10/2019 Art.4.",
    owner: "MLRO", retention: "5 yrs",
  },
};

// ── Specialized lifecycles (carried over from the platform's board templates). ──
const SECTIONS_OVERRIDE: Record<string, readonly string[]> = {
  screening: ["📥 New Screens", "🔍 Under Review", "⚠️ Hit — Escalated to MLRO", "✅ Cleared", "🗄️ Closed"],
  "transaction-monitor": ["📥 New Alerts", "🔍 Under Review", "⚠️ Escalated to MLRO", "📤 SAR Filed", "✅ Cleared"],
  "sar-qa": ["📥 New Reports", "✏️ Draft", "🔍 MLRO Review", "📤 Filed to goAML", "✅ Closed"],
  shipments: ["📥 New Consignments", "🔍 AML Screen Required", "✈️ In Transit", "🏦 At Vault", "🚨 Held — Review Required", "✅ Cleared & Delivered"],
  employees: ["📥 New Joiners", "📄 Documents Pending", "⏰ Expiring Soon", "✅ Compliant", "🚪 Offboarded"],
  training: ["📥 Assigned", "📚 In Progress", "✅ Completed", "⏰ Recertification Due"],
  "cdd-review": ["📥 New Onboarding", "📄 Pending Documents", "🔍 Under Review", "✅ Approved", "❌ Rejected", "🔄 Periodic Re-KYC"],
  "ongoing-monitor": ["⏰ Scheduled", "🔄 Running", "✅ Completed", "❌ Failed — Retry"],
  approvals: ["📥 Awaiting Reviewer", "🔍 Under Review", "✅ Approved", "↩️ Returned for Revision"],
  "audit-trail": ["📥 New Events", "🔐 Sealed Chain", "📦 Archived (Year-end)"],
  oversight: ["📥 New Items", "🔍 Under Review", "📋 Awaiting Board Sign-off", "✅ Approved", "🗄️ Archived"],
  "inspection-room": ["📥 New Handoffs", "📦 Evidence Pack Assembly", "🔍 MLRO Review", "📤 Delivered to Regulator", "✅ Acknowledged / Closed"],
  "grievances-whistleblowing": ["📥 New Reports", "🔍 Triage & Investigation", "⚠️ Escalated — MLRO/MD", "🛠️ Remediation In Progress", "✅ Resolved", "🗄️ Closed"],
  eocn: ["📥 New Declarations", "🔍 Under Review", "⚠️ Dual-Use Flagged", "✅ Cleared"],
  "supply-chain": ["📥 New Checks", "🔍 Under Review", "🚨 Sanctions Hit", "✅ Cleared"],
};

// ── The 88 module boards, in sidebar order (web/lib/nav-groups.ts). ──
// [key, emoji, label]
const G1: Array<[string, string, string]> = [
  ["grievances-whistleblowing", "🛡️", "Grievances"],
  ["pkyc", "🔄", "pKYC Monitor"],
  ["onboarding", "🪄", "Onboarding Wizard"],
  ["client-portal", "🪪", "Client Portal"],
  ["ubo-declaration", "👥", "UBO Declaration"],
  ["pep-profile", "👤", "PEP Profiles"],
  ["esg-risk", "🌱", "ESG Risk"],
  ["vendor-dd", "🤝", "Supplier DD"],
  ["cdd-review", "📋", "CDD Review"],
  ["ownership", "🏢", "Ownership Explorer"],
  ["employees", "🧑‍💼", "Employees"],
  ["training", "🎓", "Training"],
  ["approvals", "✅", "Approvals"],
];
const G2: Array<[string, string, string]> = [
  ["screening", "🔎", "Screening"],
  ["transaction-monitor", "💸", "Transaction Monitor"],
  ["ongoing-monitor", "👁️", "Ongoing Monitor"],
  ["cases", "🗂️", "Cases"],
  ["ewra", "📊", "EWRA / BWRA"],
  ["sar-qa", "📋", "STR/SAR Filing Suite"],
  ["supply-chain", "🔗", "Supply Chain & Responsible Sourcing"],
  ["rmi", "🏭", "RMI / RMAP"],
  ["responsible-sourcing", "⛏️", "Responsible Sourcing"],
  ["oecd-ddg", "📋", "OECD DDG"],
  ["rmap", "🗄️", "RMAP Database"],
  ["lbma", "🥇", "LBMA Gold"],
  ["reg-change", "📋", "Reg Changes"],
  ["shipments", "📦", "Shipments"],
  ["eocn", "🇦🇪", "EOCN"],
  ["tfs-alerts", "🚨", "Sanctions Alerts & Name Match"],
  ["cnmr", "📝", "CNMR"],
  ["pnmr", "📋", "PNMR Queue"],
  ["dpmsr", "💵", "DPMSR"],
  ["moe-survey", "📋", "MoE Survey"],
  ["enforcement", "👮", "Enforcement"],
  ["oversight", "⚖️", "Oversight"],
  ["fp-optimizer", "🎯", "FP Optimizer"],
  ["tm-rules", "📐", "TM Rule Changes"],
  ["audit-findings", "📋", "Audit Findings"],
  ["dormant-accounts", "💤", "Dormant Accounts"],
  ["outsourcing-register", "🏢", "Outsourcing Register"],
  ["coi-register", "⚖️", "COI Register"],
  ["voluntary-disclosure", "📣", "Voluntary Disclosure"],
  ["eval-kpi", "📊", "Eval KPIs"],
];
const G3: Array<[string, string, string]> = [
  ["mlro-advisor", "🧠", "MLRO Advisor"],
  ["responsible-ai", "🤖", "Responsible AI"],
  ["inspection-room", "🏛️", "Inspection Room"],
  ["regulatory", "📜", "Regulatory Library"],
  ["policies", "📑", "Policies & SOPs"],
  ["typology-library", "📚", "Typology Library"],
  ["playbook", "📖", "Playbook"],
  ["corrections", "✏️", "Corrections"],
  ["ai-incident-playbook", "🤖", "AI Incident Playbook"],
  ["ai-governance", "🏛️", "AI Governance Framework"],
  ["shadow-ai", "👁️", "Shadow AI Register"],
  ["vendor-ai-audit", "🏢", "Vendor AI Audit"],
];
const G4: Array<[string, string, string]> = [
  ["osint", "🌐", "OSINT"],
  ["gleif", "🆔", "GLEIF / LEI"],
  ["entity-graph", "🕸️", "Entity Graph"],
  ["domain-intel", "🌍", "Domain Intel"],
  ["crypto-risk", "₿", "Crypto Risk"],
  ["vessel-check", "🚢", "Vessel Check"],
  ["benford", "🔢", "Benford Analysis"],
  ["investigation", "🕵️", "Investigation"],
  ["country-risk", "📍", "Single Country"],
  ["geopolitical", "🌏", "Geopolitical"],
  ["country-risk-map", "🗺️", "Risk Map"],
  ["sanctions-evasion", "🚫", "Sanctions Evasion"],
  ["intelligence-tools", "🧪", "Intelligence Tools"],
  ["audit-trail", "🔒", "Audit Trail"],
];
const G5: Array<[string, string, string]> = [
  ["intel", "🛰️", "Live Intelligence Feed"],
  ["workbench", "🔧", "Workbench"],
  ["telemetry", "📡", "Telemetry"],
  ["red-team", "🥷", "Red-Team"],
  ["security-audit", "🛡️", "Security"],
  ["system-status", "💚", "Status"],
  ["api-docs", "📘", "API Docs"],
  ["system-card", "📋", "System Card"],
  ["security-scan", "🛡️", "Security Scan"],
  ["analyst-behavior", "👁️", "Analyst Behavior"],
  ["board-dashboard", "🎯", "Board Dashboard"],
  ["kri-dashboard", "📊", "KRI Dashboard"],
  ["access-control", "🔐", "Access Control"],
];

const REGISTRY = new Map(ASANA_MODULE_TASKS.map((t) => [t.key, t]));

function buildBoards(group: BoardGroup, defs: Array<[string, string, string]>): ModuleBoard[] {
  const prefix = GROUP_META[group].prefix;
  return defs.map(([key, emoji, label], i) => {
    const reg = REGISTRY.get(key);
    const sup = SUPPLEMENT[key];
    const meta = reg ?? sup;
    if (!meta) throw new Error(`asana-workspace-map: no charter metadata for module "${key}"`);
    return {
      key,
      num: `${prefix}.${String(i + 1).padStart(2, "0")}`,
      emoji,
      label,
      group,
      sections: SECTIONS_OVERRIDE[key] ?? DEFAULT_SECTIONS,
      purpose: reg ? reg.description : (sup as Supplement).purpose,
      control: meta.control,
      obligation: meta.obligation,
      owner: meta.owner,
      retention: meta.retention,
    };
  });
}

export const MODULE_BOARDS: ModuleBoard[] = [
  ...buildBoards("onboarding-cdd", G1),
  ...buildBoards("risk-aml-ops", G2),
  ...buildBoards("governance-audit", G3),
  ...buildBoards("kyc-tools", G4),
  ...buildBoards("intelligence", G5),
];

// ── Inbox + digest boards. ──
export const INBOX_BOARD = {
  key: "inbox",
  name: "00 · Hawkeye Inbox — Master Landing",
  color: "dark-orange",
  sections: [
    "📥 New Arrivals — Unreviewed",
    "🔍 MLRO Triage — In Review",
    "⚠️ Escalated — Pending Decision",
    "📤 Routed to Module Boards",
    "🗄️ Closed",
  ] as readonly string[],
  charter: [
    "HAWKEYE STERLING · MASTER LANDING BOARD 00",
    "PURPOSE          Catch-all triage queue. Any platform task whose module is not explicitly",
    "                 mapped lands here; the MLRO triages, escalates or routes to a module board.",
    "SYSTEM OF RECORD Hawkeye Sterling platform; evidentiary record = append-only audit chain",
    "                 (FDL No.10/2025 Art.24). This board is the operator work queue.",
    "WORKFLOW         📥 New Arrivals → 🔍 MLRO Triage → ⚠️ Escalated → 📤 Routed → 🗄️ Closed",
    "OWNER            MLRO (single controller — CG-6)",
    "RETENTION        5 yrs operational / 10 yrs AI decisions · archive — never delete",
    "CHANGE CONTROL   MLRO sign-off + docs/operations/CHANGE_CONTROL_LOG.md",
  ].join("\n"),
};

export const DIGEST_BOARD = {
  key: "digest",
  name: "HS · Modules — Daily Attestation",
  color: "dark-teal",
  // One section per platform group; each holds that group's module tasks.
  sections: Object.values(GROUP_META).map((g) => g.title) as readonly string[],
  charter: [
    "HAWKEYE STERLING · DAILY ATTESTATION DIGEST",
    "PURPOSE          MLRO single-pane digest — one task per module board. Each task receives",
    "                 the automated compliance attestation (09:30 GST, Monday to Friday),",
    "                 11-section audit format per FDL No.10/2025 Art.24.",
    "OWNER            MLRO (single controller — CG-6)",
    "RETENTION        10 yrs (AI decision & attestation records) · archive — never delete",
    "CHANGE CONTROL   MLRO sign-off + docs/operations/CHANGE_CONTROL_LOG.md",
  ].join("\n"),
};

export function boardName(b: ModuleBoard): string {
  return `${b.num} · ${b.emoji} ${b.label}`;
}

export function boardColor(b: ModuleBoard): string {
  return GROUP_META[b.group].color;
}

export function attestationTaskName(b: ModuleBoard): string {
  return `📌 ${b.label} — Compliance Attestation`;
}

export function digestTaskName(b: ModuleBoard): string {
  return `${b.num} · ${b.label}`;
}

/** Long-form audit narrative for a module board, keyed by board num
 *  (operator-approved narrative companion, 2026-06-11). Empty string when
 *  a board has no narrative — boardCharter() then omits the section. */
export function boardNarrative(num: string): string {
  const n = (narrativeArtifact as { narratives: Record<string, string> }).narratives;
  return n[num] ?? "";
}

/** Audit-ready charter (project description) for a module board. */
export function boardCharter(b: ModuleBoard): string {
  const frequency = MODULE_FREQUENCY[b.key] ?? "Per applicable control cadence";
  const lines = [
    `HAWKEYE STERLING · MODULE BOARD ${b.num} — ${b.label.toUpperCase()}`,
    `PURPOSE          ${b.purpose}`,
    `CONTROL IN FORCE ${b.control}`,
    `REGULATORY BASIS ${b.obligation}`,
    `WORKFLOW         ${b.sections.join(" → ")}`,
    `CADENCE / SLA    ${frequency}`,
    `OWNER            ${b.owner} (MLRO single controller — CG-6)`,
    `EVIDENCE         Append-only audit chain (FDL No.10/2025 Art.24) · 09:30 GST (Mon–Fri) attestation`,
    `                 on the pinned task · retention ${b.retention} · archive — never delete`,
    `CHANGE CONTROL   MLRO sign-off + docs/operations/CHANGE_CONTROL_LOG.md`,
  ];
  const narrative = boardNarrative(b.num);
  if (narrative) {
    lines.push("", "NARRATIVE", narrative);
  }
  return lines.join("\n");
}

// ── Routing aliases: every module id /api/module-report may receive → board key. ──
// Boards keyed by their own module id need no alias. Unlisted ids fall back
// to the 00 Inbox (master landing) by design.
export const MODULE_BOARD_ALIASES: Record<string, string> = {
  batch: "screening",
  "batch-screening": "screening",
  "adverse-media": "screening",
  "adverse-media-lookback": "screening",
  "adverse-media-live": "screening",
  "screening-replay": "screening",
  "screening-ab-test": "screening",
  "screening-four-eyes": "approvals",
  "str-cases": "sar-qa",
  "sar-narrative": "sar-qa",
  analytics: "kri-dashboard",
  "analytics-dashboard": "kri-dashboard",
  "intelligence-hub": "workbench",
  heatmap: "country-risk-map",
  "intel-status": "system-status",
  "weaponized-brain": "workbench",
  "brain-map": "workbench",
  "document-intelligence": "cdd-review",
  "training-tracker": "training",
  "incident-runbook": "ai-incident-playbook",
  "maker-checker": "approvals",
  profile: "access-control",
  gdpr: "corrections",
  privacy: "corrections",
  "predictive-risk": "fp-optimizer",
  workflow: "cases",
  "env-check": "system-status",
  webhooks: "api-docs",
  functions: "system-status",
  comtrade: "supply-chain",
};

/** Resolve any module id to its board key (or null → inbox). */
export function boardKeyForModule(moduleId: string): string | null {
  if (MODULE_BOARDS.some((b) => b.key === moduleId)) return moduleId;
  return MODULE_BOARD_ALIASES[moduleId] ?? null;
}

// ── Generated GID artifact (populated by the bootstrap run, committed). ──
export interface WorkspaceGids {
  teamGid?: string;
  inbox?: { projectGid: string; governanceTaskGid?: string };
  digest?: { projectGid: string; tasks?: Record<string, string> };
  boards?: Record<string, { projectGid: string; attestationTaskGid?: string }>;
}

export const WORKSPACE_GIDS: WorkspaceGids = gidArtifact as WorkspaceGids;

export function boardProjectGid(boardKey: string): string | undefined {
  if (boardKey === "inbox") return WORKSPACE_GIDS.inbox?.projectGid;
  if (boardKey === "digest") return WORKSPACE_GIDS.digest?.projectGid;
  return WORKSPACE_GIDS.boards?.[boardKey]?.projectGid;
}
