"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

// ── Types ──────────────────────────────────────────────────────────────────────

type CaseStatus = "open" | "review" | "escalated" | "closed";
type SlaVariant = "ok" | "warn" | "danger";
type CategoryVariant = "aml" | "eth" | "ops" | "hr" | "default";

interface GwCase {
  id: string;
  receivedAt: string;
  channel: "EMAIL" | "DIRECT" | "WRITTEN" | "MEETING";
  category: string;
  categoryVariant: CategoryVariant;
  stage: string;
  stageStatus: CaseStatus;
  slaPct: number;
  slaVariant: SlaVariant;
  owner: string;
}

interface ProgrammeStats {
  open: number;
  resolved: number;
  escalated: number;
  slaHitPct: number;
}

// ── Static data ────────────────────────────────────────────────────────────────

const MOCK_STATS: ProgrammeStats = { open: 14, resolved: 31, escalated: 2, slaHitPct: 100 };

const MOCK_CASES: GwCase[] = [
  { id: "FG-WB-2026-014", receivedAt: "02 MAY · 09:14", channel: "EMAIL",   category: "AML/CFT",    categoryVariant: "aml",     stage: "Investigation",    stageStatus: "open",      slaPct: 36,  slaVariant: "warn",   owner: "Compliance Dpt" },
  { id: "FG-WB-2026-013", receivedAt: "28 APR · 16:02", channel: "DIRECT",  category: "BRIBERY",    categoryVariant: "eth",     stage: "Decision",         stageStatus: "review",    slaPct: 88,  slaVariant: "ok",     owner: "Compliance Dpt" },
  { id: "FG-WB-2026-012", receivedAt: "22 APR · 11:48", channel: "WRITTEN", category: "HARASSMENT", categoryVariant: "hr",      stage: "Escalated · MD",   stageStatus: "escalated", slaPct: 94,  slaVariant: "danger", owner: "MD"             },
  { id: "FG-WB-2026-011", receivedAt: "18 APR · 08:30", channel: "MEETING", category: "PROCESS",    categoryVariant: "ops",     stage: "Closed · resolved",stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "Compliance Dpt" },
  { id: "FG-WB-2026-010", receivedAt: "11 APR · 14:21", channel: "EMAIL",   category: "SANCTIONS",  categoryVariant: "aml",     stage: "Closed · STR filed",stageStatus: "closed",   slaPct: 100, slaVariant: "ok",     owner: "Compliance Dpt" },
  { id: "FG-WB-2026-009", receivedAt: "04 APR · 10:55", channel: "EMAIL",   category: "CONFLICT",   categoryVariant: "eth",     stage: "Closed · coaching",stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "Compliance Dpt" },
];

const PIPELINE = [
  { num: "01", phase: "Acknowledge", sla: "≤2",  unit: "business days",  extra: "",                  desc: "Compliance Officer or MD confirms receipt.",                               fill: 100, active: false },
  { num: "02", phase: "Assess",      sla: "≤5",  unit: "business days",  extra: "",                  desc: "Scope confirmed · interim protective steps decided.",                     fill: 100, active: false },
  { num: "03", phase: "Investigate", sla: "≤30", unit: "calendar days",  extra: "(+15 if complex)",  desc: "Information gathered objectively, without bias.",                          fill: 62,  active: true  },
  { num: "04", phase: "Decide",      sla: "≤5",  unit: "business days",  extra: "",                  desc: "Outcome issued in writing (subject to tipping-off rules).",               fill: 0,   active: false },
  { num: "05", phase: "Escalate",    sla: "≤10", unit: "business days",  extra: "",                  desc: "MD reviews if complainant unsatisfied. Final response in 10 BD.",         fill: 0,   active: false },
];

const CATEGORIES = [
  {
    ico: "¶", title: "AML / CFT & Sanctions", sub: "GVW · ROUTED TO COMPLIANCE", ytd: 12,
    about: "Reports concerning suspicious financial activity, money laundering, terrorist financing, or sanctions breaches. This covers unusual transaction patterns, structured payments, high-risk jurisdictions, and any activity that may require an STR/SAR filing under UAE AML law.",
    regs: ["FDL No.10/2025 Arts.16–20", "CR 134/2025 Art.50", "FATF R.20", "CBUAE AML Standards"],
    steps: ["Document the suspicious activity with dates, amounts, and parties involved", "Do NOT alert the subject — tipping-off is a criminal offence (FDL Art.11)", "Compliance Dpt reviews and decides on STR filing within 5 business days", "Goaml submission if STR confirmed · retain records 10 years"],
  },
  {
    ico: "§", title: "Bribery, gifts & influence", sub: "ABC · ROUTED TO COMPLIANCE DPT", ytd: 3,
    about: "Any offer, payment, or receipt of a bribe, kickback, or improper gift intended to influence a business decision or obtain an unfair advantage. Includes facilitation payments, lavish entertainment, and conflicts arising from third-party relationships.",
    regs: ["FDL No.10/2025 Art.22", "UAE Penal Code Art.237–239", "UNCAC Art.15–16", "ABC Policy"],
    steps: ["Record full details of the offer or transaction", "Compliance Officer investigates under ABC procedure", "Disclosure to authorities if criminal threshold met", "Disciplinary action up to termination for perpetrators"],
  },
  {
    ico: "⌘", title: "Fraud, theft & falsification", sub: "INV · ROUTED TO COMPLIANCE DPT", ytd: 5,
    about: "Intentional deception, asset misappropriation, document forgery, or false reporting by employees, clients, or third parties. Includes expense fraud, false KYC documentation, fictitious invoicing, and embezzlement of company funds.",
    regs: ["UAE Penal Code Arts.399–404", "FDL No.10/2025 Art.20", "CR 134/2025", "INV Policy"],
    steps: ["Preserve all documentary evidence without alteration", "CO leads internal investigation with HR and Legal", "Police report filed if financial loss exceeds AED 10,000", "Recovery action and disciplinary proceedings initiated"],
  },
  {
    ico: "∇", title: "Misconduct & harassment", sub: "HR · ROUTED TO MD", ytd: 2,
    about: "Workplace bullying, sexual harassment, discrimination on protected grounds (nationality, gender, religion), verbal or physical abuse, or any behaviour creating a hostile work environment. Also covers retaliation against whistleblowers.",
    regs: ["UAE Labour Law FDL 33/2021", "MoHRE Ministerial Resolution 47/2022", "HR Policy", "ISO 37002:2021 §6.4"],
    steps: ["MD and HR jointly investigate within 10 business days", "Interim protective measures applied immediately if needed", "Mediation offered where appropriate; formal hearing otherwise", "Outcome in writing · corrective action up to termination"],
  },
  {
    ico: "⊟", title: "KYC / EDD failures", sub: "CDD · ROUTED TO COMPLIANCE", ytd: 7,
    about: "Incomplete or inaccurate customer due diligence, failure to apply enhanced measures for high-risk clients or PEPs, missing beneficial ownership data, expired documents, or inadequate ongoing monitoring of existing relationships.",
    regs: ["FDL No.10/2025 Arts.9–14", "CBUAE CDD Standards §3", "FATF R.10–12", "CR 57/2017"],
    steps: ["Compliance Dpt flags the deficiency and pauses transactions if risk is high", "CDD team re-contacts the customer within 5 business days", "Enhanced review applied · escalate to MD if PEP or high-risk", "Update system records and document remediation actions"],
  },
  {
    ico: "⌬", title: "Data & IT security breach", sub: "CIS · ROUTED TO IT + COMPLIANCE DPT", ytd: 1,
    about: "Unauthorised access to personal data, system intrusions, data leakage, loss of devices containing sensitive information, or misuse of confidential client records. Includes both external cyberattacks and insider threats.",
    regs: ["PDPL FDL No.45/2021", "UAE Cybercrime Law FDL 34/2021", "ISO 27001", "CBUAE IT Risk Framework"],
    steps: ["IT isolates affected systems immediately to prevent further exposure", "CO notifies UAE PDPF within 72 hours if personal data affected", "Forensic investigation to determine scope and root cause", "Affected individuals notified where required by PDPL Art.16"],
  },
  {
    ico: "⊞", title: "Operational / safety", sub: "OPS · ROUTED TO MGR", ytd: 4,
    about: "Process failures, regulatory deadline misses, workplace safety incidents, non-compliance with internal SOPs, or near-miss events that could result in harm to staff, clients, or the business. Includes fire safety, equipment failures, and procedural breaches.",
    regs: ["UAE OSH Law FDL 8/1980", "MoHRE OSH Regulations", "OPS Policy", "ISO 45001"],
    steps: ["Immediate containment — secure area or halt process if risk is live", "Manager completes incident report within 24 hours", "Root cause analysis conducted within 5 business days", "Corrective action plan documented and tracked to closure"],
  },
  {
    ico: "∂", title: "Customer service & grievance", sub: "GVW · ROUTED TO COMPLIANCE DPT", ytd: 9,
    about: "Formal complaints from customers regarding service quality, transaction disputes, unfair treatment, delays, or failure to follow commitments. Also covers complaints escalated from the CBUAE Consumer Protection Unit.",
    regs: ["CBUAE Consumer Protection Reg. 2020", "FDL No.10/2025 Art.27", "GVW/004", "ISO 10002"],
    steps: ["Acknowledge complaint to customer within 2 business days", "CO investigates and proposes resolution within 10 business days", "Escalate to MD if unresolved or involves potential regulatory breach", "Regulator notification if required · record retained 5 years"],
  },
  {
    ico: "⚖", title: "Conflict of interest", sub: "ETH · ROUTED TO COMPLIANCE DPT", ytd: 0,
    about: "Undisclosed personal, financial, or professional relationships that could improperly influence business decisions. Includes staff holding interests in clients or suppliers, family members in regulated transactions, and board-level related-party dealings.",
    regs: ["UAE Companies Law FDL 32/2021 Art.162", "CBUAE Governance Standards", "ETH Policy", "ISO 37001 §6.4"],
    steps: ["Disclose the relationship in writing to the Compliance Officer immediately", "CO assesses materiality and decides on recusal or restriction", "Disclosed conflicts logged in the Conflicts Register", "Annual attestation required from all staff and board members"],
  },
  {
    ico: "⚑", title: "Regulatory non-compliance", sub: "REG · ROUTED TO COMPLIANCE", ytd: 0,
    about: "Missed regulatory filing deadlines, failure to respond to authority requests, licence condition breaches, or non-implementation of regulatory changes within required timelines. Includes CBUAE, VARA, MoE, and MoHRE obligations.",
    regs: ["FDL No.10/2025 Art.26", "CR 134/2025 Art.48", "CBUAE Supervisory Standards", "MoE AML Guidelines §8"],
    steps: ["Compliance Dpt logs the breach and notifies the MD within 24 hours", "Voluntary self-disclosure to the regulator assessed within 48 hours", "Remediation plan drafted with clear deadlines and ownership", "Regulatory correspondence retained · lessons-learned documented"],
  },
  {
    ico: "◈", title: "Third-party / supplier misconduct", sub: "VDD · ROUTED TO COMPLIANCE DPT", ytd: 0,
    about: "Fraudulent, unethical, or non-compliant behaviour by vendors, agents, introducers, or outsourced service providers. Includes sanctions-linked suppliers, inflated invoicing, misrepresentation of services, and failure to meet contractual compliance obligations.",
    regs: ["OECD Due Diligence Guidance", "FDL No.10/2025 Art.19", "CSDDD (EU import mirror)", "VDD Policy"],
    steps: ["Document all evidence of the misconduct without alerting the supplier", "CO reviews supplier file and suspends payments if risk is high", "Full re-due-diligence conducted; contract termination if warranted", "Blacklist entry raised for internal procurement register"],
  },
  {
    ico: "⬡", title: "Environmental & ESG violation", sub: "ESG · ROUTED TO COMPLIANCE DPT", ytd: 0,
    about: "Gold or precious metals sourced from conflict zones, illegal mining operations, or child-labour supply chains. Also covers failure to apply OECD 5-step supply chain due diligence, greenwashing claims, or breaches of the UAE's responsible sourcing commitments.",
    regs: ["OECD 5-Step DDG (Minerals)", "MD 68/2024 Responsible Sourcing", "UFLPA (import mirror)", "ESG Policy"],
    steps: ["Suspend procurement from the flagged source immediately", "CO initiates supply chain investigation under OECD 5-step process", "Findings reported to MD and board ESG committee within 10 days", "Remediation or supplier exit plan documented and disclosed"],
  },
];

const PENALTIES = [
  { lab: "Failure to report SAR", prefix: "AED",        em: "200K – 1M",       desc: "Per failure to report a suspicious activity." },
  { lab: "Tipping-off",           prefix: "Up to AED",  em: "500K",            desc: "Disclosing the existence of a report."         },
  { lab: "Poor recordkeeping",    prefix: "AED",        em: "50K – 500K",      desc: "Per breach of CR 134/2025 Art.50."            },
  { lab: "Obstruction",           prefix: "AED",        em: "100K – 1M",       desc: "Non-cooperation with competent authorities."   },
  { lab: "False / malicious",     prefix: "Liability",  em: " + termination",  desc: "Bad-faith reports are not tolerated."          },
];

const CHANNELS = [
  { ix: "01", name: "Direct contact",     sub: "Primary FG representative" },
  { ix: "02", name: "Email reporting",    sub: "compliance@finegold.ae"    },
  { ix: "03", name: "Written submission", sub: "To management · physical"  },
  { ix: "04", name: "Private meeting",    sub: "Scheduled · 1-to-1"       },
];

const CONCERN_OPTIONS = [
  "AML / CFT — suspicious transactions",
  "Sanctions or proliferation financing",
  "Terrorist financing",
  "Bribery, gifts or improper influence",
  "Corruption or abuse of power",
  "Fraud, theft or falsification",
  "Embezzlement or misappropriation",
  "KYC / EDD failure",
  "PEP / UBO non-disclosure",
  "Misconduct / harassment / discrimination",
  "Workplace bullying or retaliation",
  "Conflicts of interest",
  "Data, IT or confidentiality breach",
  "Unauthorised access or system misuse",
  "Regulatory non-compliance",
  "Operational / safety / process failure",
  "Customer service grievance",
  "Third-party / supplier misconduct",
  "Environmental or ESG violation",
  "Other",
];

// ── Design token shortcuts (scoped to this page via CSS custom properties) ────

const V = {
  bg:        "var(--gw-bg)",
  bg2:       "var(--gw-bg-2)",
  bg3:       "var(--gw-bg-3)",
  panel:     "var(--gw-panel)",
  line:      "var(--gw-line)",
  line2:     "var(--gw-line-2)",
  ink:       "var(--gw-ink)",
  ink2:      "var(--gw-ink-2)",
  muted:     "var(--gw-muted)",
  muted2:    "var(--gw-muted-2)",
  ember:     "var(--gw-ember)",
  emberSoft: "var(--gw-ember-soft)",
  teal:      "var(--gw-teal)",
  rose:      "var(--gw-rose)",
  roseSoft:  "var(--gw-rose-soft)",
} as const;

// ── Page-scoped CSS (animations + hover helpers that can't be inline) ─────────

const PAGE_CSS = `
  @keyframes gw-pulse {
    0%   { box-shadow: 0 0 0 0   oklch(74% 0.18 350 / .55); }
    70%  { box-shadow: 0 0 0 8px oklch(74% 0.18 350 / 0);   }
    100% { box-shadow: 0 0 0 0   oklch(74% 0.18 350 / 0);   }
  }
  .gw-pulse { animation: gw-pulse 2.2s infinite; }
  .gw-bar-fill { transition: width 200ms ease-out; }
  .gw-tr:hover td { background: rgba(255,255,255,.015) !important; }
  .gw-ch:hover  { border-color: var(--gw-line-2) !important; background: #1a1813 !important; }
  .gw-ghost:hover { border-color: var(--gw-ink-2) !important; }
  .gw-field input:focus,
  .gw-field select:focus,
  .gw-field textarea:focus {
    border-color: var(--gw-ember) !important;
    box-shadow: 0 0 0 1px var(--gw-ember-soft);
    outline: none;
  }
  .gw-root * { box-sizing: border-box; }
  .gw-serif { font-family: 'Newsreader', 'Cormorant Garamond', Georgia, serif !important; }
  .gw-mono  { font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace !important; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    /* Outer sidebar+main: stack vertically, hide sidebar */
    .gw-outer-grid { grid-template-columns: 1fr !important; }
    .gw-sidebar-panel { display: none !important; }

    /* Main content padding */
    .gw-main-panel { padding: 16px 14px 40px !important; }

    /* Hero title smaller */
    .gw-hero-title { font-size: 36px !important; line-height: 1.1 !important; }

    /* Content + form: stack vertically, form below */
    .gw-content-grid { grid-template-columns: 1fr !important; gap: 24px !important; }

    /* Pipeline: 2 cols on mobile */
    .gw-pipeline-grid { grid-template-columns: repeat(2,1fr) !important; }
    .gw-pipeline-grid > div { border-right: none !important; border-bottom: 1px solid var(--gw-line); }

    /* Reportable matters: 1 col on mobile */
    .gw-matters-grid { grid-template-columns: 1fr !important; }

    /* Case table: horizontal scroll */
    .gw-case-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .gw-case-table-wrap table { min-width: 640px; }

    /* Penalty rail: stack label + items */
    .gw-penalty-outer { grid-template-columns: 1fr !important; }
    .gw-penalty-label { border-right: none !important; border-bottom: 1px solid var(--gw-line) !important; }
    .gw-penalty-items { grid-template-columns: repeat(2,1fr) !important; }

    /* Form mode tabs full width */
    .gw-mode-tabs > div { flex: 1 !important; justify-content: center; }

    /* Footer: stack */
    .gw-footer { flex-direction: column !important; gap: 6px !important; height: auto !important; padding: 10px 14px !important; }
  }

  @media (max-width: 480px) {
    .gw-hero-title { font-size: 28px !important; }
    .gw-pipeline-grid { grid-template-columns: 1fr !important; }
    .gw-penalty-items { grid-template-columns: 1fr !important; }
  }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function mono(style?: React.CSSProperties): React.CSSProperties {
  return { fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", ...style };
}
function serif(style?: React.CSSProperties): React.CSSProperties {
  return { fontFamily: "'Newsreader','Cormorant Garamond',Georgia,serif", ...style };
}

const STATUS_DOT: Record<CaseStatus, string> = {
  open:      V.ember,
  review:    V.teal,
  escalated: V.rose,
  closed:    V.muted,
};
const STATUS_GLOW: Record<CaseStatus, string> = {
  open:      `0 0 6px var(--gw-ember)`,
  review:    "none",
  escalated: `0 0 6px var(--gw-rose)`,
  closed:    "none",
};
const SLA_COLOR: Record<SlaVariant, string> = {
  ok:     V.teal,
  warn:   V.ember,
  danger: V.rose,
};
const CAT_COLOR: Record<CategoryVariant, string> = {
  aml:     V.rose,
  eth:     V.ember,
  ops:     V.teal,
  hr:      V.ink2,
  default: V.ink2,
};

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHead({ index, title, em, meta }: { index: string; title: string; em: string; meta: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `1px solid ${V.line}`, paddingBottom: 8, marginBottom: 16 }}>
      <div>
        <div style={mono({ fontSize: 10, letterSpacing: ".18em", color: V.ember, textTransform: "uppercase" })}>{index}</div>
        <div className="gw-serif" style={{ fontSize: 22, color: V.ink, fontWeight: 500 }}>
          {title} <em style={{ fontStyle: "italic", color: V.muted }}>{em}</em>
        </div>
      </div>
      <div style={mono({ fontSize: 9.5, color: V.muted, letterSpacing: ".1em" })}>{meta}</div>
    </div>
  );
}

// ── Label component ────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={mono({ display: "block", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: V.muted, marginBottom: 5 })}>
      {children}{required && <span style={{ color: V.rose, marginLeft: 3 }}>*</span>}
    </label>
  );
}

// ── Option selector (language / severity) ─────────────────────────────────────

function Opt({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ border: `1px solid ${selected ? V.ember : V.line}`, background: selected ? V.emberSoft : V.bg2, padding: "9px 10px", fontSize: 11.5, color: selected ? V.ember : V.ink2, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
    >
      <div style={{ width: 12, height: 12, border: `1px solid ${selected ? V.ember : V.muted}`, display: "grid", placeItems: "center", flexShrink: 0, background: selected ? V.ember : "transparent" }}>
        {selected && <div style={{ width: 5, height: 9, border: "solid #1a0613", borderWidth: "0 1.6px 1.6px 0", transform: "rotate(45deg) translate(-1px,-1px)" }} />}
      </div>
      {label}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function GrievancesWhistleblowingPage() {
  const [mode, setMode]           = useState<"anonymous" | "named">("anonymous");
  const [severity, setSeverity]   = useState<"Low" | "Medium" | "High">("Medium");
  const [language, setLanguage]   = useState<"en" | "ar">("en");
  const [concern, setConcern]     = useState("");
  const [dateObs, setDateObs]     = useState("02/05/2026");
  const [location, setLocation]   = useState("");
  const [reporterName, setName]   = useState("");
  const [description, setDesc]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]         = useState<string | null>(null);
  const [toastErr, setToastErr]   = useState<string | null>(null);
  const [stats]                   = useState<ProgrammeStats>(MOCK_STATS);
  const [cases, setCases]         = useState<GwCase[]>(MOCK_CASES);

  const formRef     = useRef<HTMLDivElement>(null);
  const registerRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number] | null>(null);
  const [showPdf, setShowPdf]               = useState(false);

  // Keyboard shortcuts: N → intake form, R → case register
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" || e.key === "N") formRef.current?.scrollIntoView({ behavior: "smooth" });
      if (e.key === "r" || e.key === "R") registerRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!concern || submitting) return;
    if (!description.trim()) {
      setToastErr("Please provide a description before submitting.");
      setTimeout(() => setToastErr(null), 6000);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/grievances/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, concern, dateObs: (() => { const [d,m,y] = dateObs.split("/"); return `${y}-${(m||"").padStart(2,"0")}-${(d||"").padStart(2,"0")}`; })(), location, reporterName, description, severity, language }),
      });
      if (res.ok) {
        const data = await res.json() as { caseRef: string };
        setToast(`Disclosure submitted · Case ref: ${data.caseRef}`);
        setConcern(""); setLocation(""); setName(""); setDesc("");
        setTimeout(() => setToast(null), 8000);
      } else {
        setToastErr("Submission failed — please try again or contact compliance directly.");
        setTimeout(() => setToastErr(null), 8000);
      }
    } catch {
      setToastErr("Network error — please check your connection and retry.");
      setTimeout(() => setToastErr(null), 8000);
    } finally {
      setSubmitting(false);
    }
  }, [concern, description, submitting, mode, dateObs, location, reporterName, severity, language]);

  // CSS custom properties scoped to page wrapper
  const gwVars = {
    "--gw-bg":        "#0d0c0a",
    "--gw-bg-2":      "#15130f",
    "--gw-bg-3":      "#1c1a15",
    "--gw-panel":     "#15130f",
    "--gw-line":      "#27241e",
    "--gw-line-2":    "#332f27",
    "--gw-ink":       "#efece4",
    "--gw-ink-2":     "#cbc7bc",
    "--gw-muted":     "#7d786c",
    "--gw-muted-2":   "#5a564c",
    "--gw-ember":     "oklch(74% 0.18 350)",
    "--gw-ember-soft":"oklch(74% 0.18 350 / .14)",
    "--gw-teal":      "oklch(72% 0.10 220)",
    "--gw-teal-soft": "oklch(72% 0.10 220 / .14)",
    "--gw-rose":      "oklch(66% 0.20 20)",
    "--gw-rose-soft": "oklch(66% 0.20 20 / .14)",
  } as React.CSSProperties;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* Toast notification */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "#15130f", border: `1px solid oklch(74% 0.18 350)`, color: "#efece4", padding: "12px 18px", fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", fontSize: 12, maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,.7)" }}>
          <span style={{ color: "oklch(74% 0.18 350)" }}>✓</span> {toast}
        </div>
      )}
      {toastErr && (
        <div style={{ position: "fixed", bottom: toast ? 80 : 24, right: 24, zIndex: 9999, background: "#15130f", border: `1px solid oklch(65% 0.22 25)`, color: "#efece4", padding: "12px 18px", fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", fontSize: 12, maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,.7)" }}>
          <span style={{ color: "oklch(65% 0.22 25)" }}>⚠</span> {toastErr}
        </div>
      )}

      {/* ── PDF Preview modal ── */}
      {showPdf && (
        <>
          <div onClick={() => setShowPdf(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.75)", backdropFilter: "blur(3px)" }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 201, width: "min(620px,96vw)", maxHeight: "92vh", overflowY: "auto", background: "#f5f5f0", boxShadow: "0 24px 80px rgba(0,0,0,.6)", display: "flex", flexDirection: "column" as const }}>
            {/* Toolbar */}
            <div style={{ background: "#141414", color: "#fff", padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "monospace", fontSize: 9.5, letterSpacing: ".16em", color: "#aaa" }}>GVW/004 · POLICY DOCUMENT PREVIEW</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => window.print()} style={{ background: "#ec4899", border: "none", color: "#fff", padding: "5px 14px", fontWeight: 700, fontSize: 10.5, cursor: "pointer", letterSpacing: ".04em" }}>⬇ Save as PDF</button>
                <button type="button" onClick={() => setShowPdf(false)} style={{ background: "transparent", border: "1px solid #444", color: "#aaa", padding: "5px 10px", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            </div>

            {/* A4 page — white */}
            <div style={{ background: "#fff", margin: "12px 16px", padding: 0, boxShadow: "0 2px 16px rgba(0,0,0,.18)", fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#141414", lineHeight: 1.5 }}>

              {/* Security strip */}
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", padding: "3px 0", background: "#fff", fontSize: 5.5, color: "#828282", letterSpacing: ".3px" }}>
                {Array(14).fill("HAWKEYE STERLING  ·  GVW/004  ·  CONFIDENTIAL  ·  DO NOT REDISTRIBUTE  ").join("")}
              </div>

              {/* Header bar */}
              <div style={{ borderBottom: "1px solid #e5e5e5", padding: "0 20px", height: 30, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #141414", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700 }}>H</div>
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1.5px" }}>HAWKEYE  ·  STERLING</span>
                </div>
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: ".8px", color: "#ec4899" }}>CONFIDENTIAL  ·  COMPLIANCE USE ONLY</span>
                <span style={{ fontSize: 7.5, letterSpacing: ".5px", color: "#464646" }}>GVW/004</span>
              </div>

              <div style={{ borderBottom: "1px solid #e5e5e5", margin: "0 32px" }} />

              {/* Cover body */}
              <div style={{ padding: "24px 40px 20px" }}>
                {/* Logo + brand */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid #141414" }} />
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 33, height: 33, borderRadius: "50%", border: "1px solid #141414" }} />
                    <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 13, fontWeight: 700, color: "#141414" }}>HS</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "4px", color: "#141414" }}>HAWKEYE  ·  STERLING</div>
                    <div style={{ fontSize: 7.5, letterSpacing: "2px", color: "#464646", marginTop: 2 }}>GOVERNANCE & WHISTLEBLOWING MODULE</div>
                  </div>
                  <div style={{ fontSize: 7.5, letterSpacing: ".5px", color: "#464646" }}>GVW/004</div>
                </div>

                <div style={{ fontSize: 7, letterSpacing: "2.5px", color: "#828282", marginBottom: 8, textAlign: "center", textTransform: "uppercase" }}>Policy Document</div>

                {/* Drop-cap title */}
                <div style={{ marginBottom: 10, textAlign: "center" }}>
                  <span style={{ fontFamily: "Georgia,'Times New Roman',serif", fontStyle: "italic", fontSize: 34, color: "#ec4899", lineHeight: 1 }}>G</span>
                  <span style={{ fontFamily: "Georgia,'Times New Roman',serif", fontStyle: "italic", fontSize: 22, color: "#141414", lineHeight: 1 }}>rievances &amp; Whistleblowing</span>
                </div>
                <p style={{ fontSize: 8, color: "#464646", maxWidth: 380, textAlign: "center", lineHeight: 1.5, margin: "0 auto 20px" }}>A safe, transparent, and confidential mechanism for employees, clients, and partners to raise concerns or report misconduct — without fear of retaliation.</p>

                {/* Stat cards */}
                <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                  {[{ l: "Open Cases", v: "14" }, { l: "Resolved (30d)", v: "31" }, { l: "SLA Hit Rate", v: "100%" }, { l: "Escalated", v: "2" }].map((c) => (
                    <div key={c.l} style={{ flex: 1, border: "1px solid #e5e5e5", padding: "10px 12px" }}>
                      <div style={{ fontSize: 6.5, letterSpacing: "1.5px", color: "#828282", marginBottom: 4, textTransform: "uppercase" }}>{c.l}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#141414", lineHeight: 1 }}>{c.v}</div>
                    </div>
                  ))}
                </div>

                {/* Meta grid */}
                <div style={{ border: "1px solid #e5e5e5", display: "grid", gridTemplateColumns: "repeat(3,1fr)", fontSize: 7 }}>
                  {[["Policy Code","GVW/004"],["Version","004"],["Effective","28 NOV 2025"],["Next Review","JUN 2026"],["Owner","Compliance Dpt"],["Classification","CONFIDENTIAL"]].map(([k,v],i) => (
                    <div key={k} style={{ padding: "7px 10px", borderRight: i%3<2 ? "1px solid #e5e5e5" : "none", borderBottom: i<3 ? "1px solid #e5e5e5" : "none" }}>
                      <div style={{ color: "#828282", letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
                      <div style={{ fontWeight: 700, color: k==="Classification" ? "#ec4899" : "#141414" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Policy sections */}
                <div style={{ marginTop: 20, borderTop: "1px solid #e5e5e5", paddingTop: 16 }}>
                  {[
                    ["1. Purpose", "Establishes a confidential mechanism for all parties to raise concerns or report misconduct without fear of retaliation. Fine Gold LLC is committed to the highest standards of ethics and regulatory compliance."],
                    ["2. Scope", "Applies to all employees, contractors, board members, agents, and third parties acting on behalf of Fine Gold LLC, for all activities within and outside the UAE."],
                    ["3. Regulatory Basis", "FDL No.10/2025 Arts.16,17,20 · CR No.134/2025 Art.50 · CR No.24/2022 · MoE AML/CFT Guidelines §6 · ISO 37002:2021 · FATF R.18 · PDPL FDL No.45/2021"],
                    ["4. Reportable Matters", "AML/CFT · Bribery · Fraud · Misconduct & Harassment · KYC/EDD Failures · Data Breach · Operational/Safety · Customer Grievances · Conflicts of Interest · Regulatory Non-Compliance · Third-Party Misconduct · ESG Violations"],
                    ["5. Resolution Pipeline", "01 Acknowledge ≤2 BD → 02 Assess ≤5 BD → 03 Investigate ≤30 days → 04 Decide ≤5 BD → 05 Escalate ≤10 BD. All SLA-tracked. Interim protective measures applied at Stage 02 where risk warrants."],
                    ["6. Anti-Retaliation", "Reports made in good faith are protected under FDL No.10/2025 regardless of substantiation. Retaliation = disciplinary offence up to termination and/or legal action."],
                  ].map(([title, body]) => (
                    <div key={title} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 8, marginBottom: 2 }}>{title}</div>
                      <div style={{ color: "#464646", fontSize: 7.5 }}>{body}</div>
                    </div>
                  ))}
                </div>

                {/* Signature block */}
                <div style={{ marginTop: 20, borderTop: "1px solid #e5e5e5", paddingTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {[["Approver","Management"],["Compliance Dpt","Date"]].map(([label]) => (
                    <div key={label}>
                      <div style={{ borderBottom: "1px solid #999", height: 24, marginBottom: 4 }} />
                      <div style={{ fontSize: 7.5, color: "#828282" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div style={{ margin: "0 40px", borderTop: "1px solid #e5e5e5", padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <p style={{ fontFamily: "Georgia,'Times New Roman',serif", fontStyle: "italic", fontSize: 7, color: "#464646", lineHeight: 1.7, margin: 0 }}>
                  Issued in confidence to the addressee. Reproduction,<br />
                  transmission or storage outside the controlled domain<br />
                  of the recipient institution is prohibited.
                </p>
                <div style={{ width: 13, height: 13, borderRadius: "50%", border: "1px solid #aaa", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#828282" }}>H</div>
              </div>
              <div style={{ height: 12 }} />
            </div>
            <div style={{ height: 12, flexShrink: 0 }} />
          </div>
        </>
      )}

      {/* ── Category detail modal ── */}
      {activeCategory && (
        <>
          <div onClick={() => setActiveCategory(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.55)", backdropFilter: "blur(2px)" }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: "min(520px,100vw)", background: "#0d0c0a", borderLeft: `1px solid ${V.line}`, overflowY: "auto", display: "flex", flexDirection: "column" as const }}>
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, background: "linear-gradient(180deg,rgba(28,26,21,.6),transparent)" }}>
              <div>
                <div style={mono({ fontSize: 9.5, color: V.ember, letterSpacing: ".2em", textTransform: "uppercase", marginBottom: 6 })}>{activeCategory.sub}</div>
                <div style={{ fontFamily: "'Newsreader','Georgia',serif", fontSize: 22, fontWeight: 500, color: V.ink, lineHeight: 1.15 }}>{activeCategory.title}</div>
              </div>
              <button type="button" onClick={() => setActiveCategory(null)} style={{ background: "transparent", border: `1px solid ${V.line2}`, color: V.ink2, width: 28, height: 28, display: "grid", placeItems: "center", fontSize: 16, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column" as const, gap: 22 }}>

              {/* About */}
              <div style={{ background: V.panel, border: `1px solid ${V.line}`, padding: "14px 16px", borderLeft: `3px solid ${V.ember}` }}>
                <div style={mono({ fontSize: 9, letterSpacing: ".2em", color: V.ember, textTransform: "uppercase", marginBottom: 8, fontWeight: 700 })}>About this category</div>
                <div style={{ fontSize: 12.5, color: V.ink2, lineHeight: 1.65 }}>{activeCategory.about}</div>
              </div>

              {/* Regulatory basis */}
              <div>
                <div style={mono({ fontSize: 9, letterSpacing: ".2em", color: V.muted, textTransform: "uppercase", marginBottom: 10 })}>Regulatory basis</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {activeCategory.regs.map((r) => (
                    <span key={r} style={mono({ fontSize: 10, border: `1px solid ${V.line2}`, padding: "3px 9px", color: V.ink2, background: V.bg2 })}>{r}</span>
                  ))}
                </div>
              </div>

              {/* What happens */}
              <div>
                <div style={mono({ fontSize: 9, letterSpacing: ".2em", color: V.muted, textTransform: "uppercase", marginBottom: 10 })}>What happens when reported</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {activeCategory.steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={mono({ fontSize: 9.5, color: V.ember, fontWeight: 700, minWidth: 18 })}>{i + 1}.</div>
                      <div style={{ fontSize: 12, color: V.ink2, lineHeight: 1.6 }}>{s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${V.line}` }}>
                <button
                  type="button"
                  onClick={() => { setActiveCategory(null); formRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                  style={{ width: "100%", border: `1px solid oklch(74% 0.18 350)`, background: "oklch(74% 0.18 350)", color: "#1a0613", padding: "11px 18px", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".02em", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 1 }}
                >
                  File a disclosure for this category →
                </button>
              </div>

            </div>
          </div>
        </>
      )}

      <Header />

      {/* ── Page root — scoped dark tokens ── */}
      <div
        className="gw-root"
        style={{ ...gwVars, background: V.bg, color: V.ink, minHeight: "calc(100vh - 54px)", fontSize: 13, lineHeight: 1.5, WebkitFontSmoothing: "antialiased", fontFamily: "'Inter',sans-serif", position: "relative" }}
      >
        {/* Grain overlay */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, backgroundImage: "radial-gradient(rgba(255,255,255,.012) 1px,transparent 1px)", backgroundSize: "3px 3px", mixBlendMode: "overlay" }} />

        {/* ── SIDEBAR + MAIN GRID ── */}
        <div className="gw-outer-grid" style={{ display: "grid", gridTemplateColumns: "268px 1fr", minHeight: "calc(100vh - 54px - 28px - 30px)", position: "relative", zIndex: 2 }}>

          {/* ══ SIDEBAR ══ */}
          <aside className="gw-sidebar-panel" style={{ borderRight: `1px solid ${V.line}`, padding: "22px 18px 30px", background: "linear-gradient(180deg,rgba(28,26,21,.35),transparent 220px)" }}>

            {/* Programme Stats */}
            <div style={mono({ fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: V.muted, marginBottom: 10 })}>Programme · 30 Days</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
              {[
                { n: stats.open,        l: "Cases · Open" },
                { n: stats.resolved,    l: "Resolved"     },
                { n: stats.escalated,   l: "Escalated"    },
                { n: `${stats.slaHitPct}%`, l: "SLA Hit"  },
              ].map((s) => (
                <div key={s.l} style={{ border: `1px solid ${V.line}`, padding: "10px 11px", background: V.panel }}>
                  <div style={serif({ fontWeight: 600, fontSize: 24, color: V.ink, lineHeight: 1 })}>{s.n}</div>
                  <div style={mono({ fontSize: 8.5, letterSpacing: ".18em", textTransform: "uppercase", color: V.muted, marginTop: 6 })}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Reporting Channels */}
            <div style={mono({ fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: V.muted, marginBottom: 10 })}>Reporting Channels</div>
            <div style={{ marginBottom: 18 }}>
              {CHANNELS.map((ch) => (
                <div key={ch.ix} className="gw-ch" style={{ border: `1px solid ${V.line}`, background: V.panel, padding: "10px 12px", marginBottom: 6, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", cursor: "pointer" }}>
                  <div style={mono({ fontSize: 9, color: V.ember, border: `1px solid oklch(74% 0.18 350)`, padding: "2px 5px", letterSpacing: ".08em" })}>{ch.ix}</div>
                  <div>
                    <div style={{ fontSize: 11.5, color: V.ink, fontWeight: 500 }}>{ch.name}</div>
                    <div style={mono({ fontSize: 9, color: V.muted, letterSpacing: ".04em", marginTop: 1 })}>{ch.sub}</div>
                  </div>
                  <div style={mono({ fontSize: 13, color: V.muted })}>→</div>
                </div>
              ))}
            </div>

            {/* Anti-Retaliation */}
            <div style={{ border: `1px solid ${V.line}`, borderLeft: `2px solid oklch(74% 0.18 350)`, background: "linear-gradient(90deg,var(--gw-ember-soft),transparent 70%)", padding: "11px 13px" }}>
              <div style={mono({ fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: V.ember, fontWeight: 700 })}>Anti-Retaliation</div>
              <div style={{ marginTop: 5, fontSize: 11.5, color: V.ink2, lineHeight: 1.5 }}>
                Reports made in <strong style={{ color: V.ink }}>good faith</strong> are protected under{" "}
                <strong style={{ color: V.ink }}>FDL No.10/2025</strong> regardless of whether the concern is later substantiated. Retaliation = corrective action up to termination.
              </div>
            </div>

            {/* Report to Asana */}
            <div style={{ marginTop: 18 }}>
              <div style={mono({ fontSize: 9.5, letterSpacing: ".22em", textTransform: "uppercase", color: V.muted, marginBottom: 10 })}>Report</div>
              <AsanaReportButton
                payload={{
                  module: "grievances-whistleblowing",
                  label: "Grievances & Whistleblowing",
                  summary: `Grievances & Whistleblowing programme report — FG/GVW/004 v004. Programme stats (30d): ${stats.open} open · ${stats.resolved} resolved · ${stats.escalated} escalated · ${stats.slaHitPct}% SLA hit. Routed to 19 · Incidents & Grievances board.`,
                  url: "/governance/grievances-whistleblowing",
                  metadata: {
                    policyCode: "FG/GVW/004",
                    version: "004",
                    effective: "28 NOV 2025",
                    owner: "Compliance Dpt",
                    openCases: stats.open,
                    resolvedCases: stats.resolved,
                    escalatedCases: stats.escalated,
                    slaHitPct: stats.slaHitPct,
                  },
                }}
              />
            </div>

          </aside>

          {/* ══ MAIN ══ */}
          <main className="gw-main-panel" style={{ padding: "28px 36px 60px", minWidth: 0 }}>

            {/* Breadcrumbs */}
            <div style={mono({ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: V.muted, display: "flex", gap: 10, alignItems: "center" })}>
              <span>FORMS</span><span style={{ color: V.muted2 }}>·</span>
              <span>MORE</span><span style={{ color: V.muted2 }}>·</span>
              <span>Governance & Audit</span><span style={{ color: V.muted2 }}>·</span>
              <span style={{ color: V.ember }}>Grievances & Whistleblowing</span>
            </div>

            {/* ── HERO ── */}
            <section style={{ marginTop: 14, paddingBottom: 22, borderBottom: `1px solid ${V.line}` }}>
              <div>
                <h1 className="gw-serif gw-hero-title" style={{ fontWeight: 400, fontSize: 54, letterSpacing: "-0.02em", lineHeight: 1.0, color: V.ink, margin: "6px 0 0" } as React.CSSProperties}>
                  A protected channel<br />to <em style={{ fontStyle: "italic", color: V.ember }}>speak up.</em>
                </h1>
                <p style={{ color: V.ink2, fontSize: 13.5, maxWidth: 560, marginTop: 14, lineHeight: 1.6, margin: "14px 0 0" }}>
                  A safe, transparent, confidential mechanism for customers, partners, employees and third parties to raise concerns or report misconduct — without fear of retaliation. Operated by the Compliance Dpt under the Fine Gold Grievances &amp; Whistleblowing Policy{" "}
                  <span style={mono({ color: V.ember })}>FG/GVW/004</span>.
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" as const }}>
                  <button
                    type="button"
                    onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                    style={{ border: `1px solid oklch(74% 0.18 350)`, background: "oklch(74% 0.18 350)", color: "#1a0613", padding: "10px 18px", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".02em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 1 }}
                  >
                    File a disclosure
                    <span style={mono({ fontSize: 10, border: "1px solid rgba(0,0,0,.25)", padding: "1px 5px", color: "#1a0613", background: "rgba(0,0,0,.08)" })}>N</span>
                  </button>
                  <button
                    type="button"
                    className="gw-ghost"
                    onClick={() => registerRef.current?.scrollIntoView({ behavior: "smooth" })}
                    style={{ border: `1px solid ${V.line2}`, background: "transparent", color: V.ink, padding: "10px 18px", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".02em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 1 }}
                  >
                    Open case register
                    <span style={mono({ fontSize: 10, border: `1px solid ${V.line2}`, padding: "1px 5px", color: V.ink2, background: "transparent" })}>R</span>
                  </button>
                  <button
                    type="button"
                    className="gw-ghost"
                    onClick={() => setShowPdf(true)}
                    style={{ border: `1px solid ${V.line2}`, background: "transparent", color: V.ink, padding: "10px 18px", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".02em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 1 }}
                  >
                    Download policy PDF
                    <span style={mono({ fontSize: 10, border: `1px solid ${V.line2}`, padding: "1px 5px", color: V.ink2, background: "transparent" })}>↓</span>
                  </button>
                  <AsanaReportButton
                    payload={{
                      module: "grievances-whistleblowing",
                      label: "Grievances & Whistleblowing",
                      summary: `Grievances & Whistleblowing programme report — FG/GVW/004 v004. Programme stats (30d): ${stats.open} open · ${stats.resolved} resolved · ${stats.escalated} escalated · ${stats.slaHitPct}% SLA hit. Routed to 19 · Incidents & Grievances board.`,
                      url: "/governance/grievances-whistleblowing",
                      metadata: {
                        policyCode: "FG/GVW/004",
                        version: "004",
                        effective: "28 NOV 2025",
                        owner: "Compliance Dpt",
                        openCases: stats.open,
                        resolvedCases: stats.resolved,
                        escalatedCases: stats.escalated,
                        slaHitPct: stats.slaHitPct,
                      },
                    }}
                  />
                </div>
              </div>
            </section>

            {/* ── TWO-COLUMN CONTENT ── */}
            <div className="gw-content-grid" style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 28, marginTop: 32 }}>

              {/* ── LEFT COLUMN ── */}
              <div>

                {/* A · Resolution Pipeline */}
                <SectionHead index="A · Resolution Pipeline" title="How a report" em="moves through the system." meta="SLA-tracked · auto-escalated" />
                <div className="gw-pipeline-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", border: `1px solid ${V.line}`, background: V.panel }}>
                  {PIPELINE.map((step, i) => (
                    <div
                      key={i}
                      style={{ padding: "16px 16px 20px", borderRight: i < PIPELINE.length - 1 ? `1px solid ${V.line}` : "none", position: "relative", minHeight: 140, display: "flex", flexDirection: "column" as const, background: step.active ? "linear-gradient(180deg,var(--gw-ember-soft),transparent 60%)" : "transparent" }}
                    >
                      <div style={mono({ fontSize: 10, color: V.ember, letterSpacing: ".14em", fontWeight: step.active ? 600 : 400 })}>
                        {step.active ? `${step.num} · ACTIVE` : step.num}
                      </div>
                      <div className="gw-serif" style={{ marginTop: 4, fontSize: 18, color: V.ink, fontWeight: 500 }}>{step.phase}</div>
                      <div style={mono({ marginTop: 6, fontSize: 10, color: V.ink2 })}>
                        <span style={{ color: V.ember }}>{step.sla}</span> {step.unit}
                        {step.extra && <span style={{ color: V.muted }}> {step.extra}</span>}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11.5, color: V.muted, lineHeight: 1.5, flex: 1 }}>{step.desc}</div>
                      {/* Chevron arrow */}
                      {i < PIPELINE.length - 1 && (
                        <div style={{ position: "absolute", right: -7, top: "50%", width: 12, height: 12, borderTop: `1px solid ${V.line}`, borderRight: `1px solid ${V.line}`, transform: "translateY(-50%) rotate(45deg)", background: V.bg, zIndex: 2 }} />
                      )}
                      {/* Progress bar */}
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: V.line }}>
                        <div className="gw-bar-fill" style={{ height: "100%", width: `${step.fill}%`, background: V.ember }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* B · Reportable Matters */}
                <div style={{ marginTop: 36 }}>
                  <SectionHead index="B · Reportable Matters" title="What should be raised" em="through this channel." meta="categorised · routed" />
                  <div className="gw-matters-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                    {CATEGORIES.map((cat) => (
                      <div
                        key={cat.title}
                        onClick={() => setActiveCategory(cat)}
                        style={{ border: `1px solid ${V.line}`, background: V.panel, padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", cursor: "pointer", transition: "border-color .15s" }}
                        className="gw-tr"
                      >
                        <div style={{ width: 36, height: 36, border: `1px solid ${V.line2}`, display: "grid", placeItems: "center", fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", fontSize: 13, color: V.ember, background: V.bg2 }}>{cat.ico}</div>
                        <div>
                          <div style={{ fontSize: 13, color: V.ink, fontWeight: 500 }}>{cat.title}</div>
                          <div style={mono({ fontSize: 9.5, color: V.muted, letterSpacing: ".06em", marginTop: 3, textTransform: "uppercase" })}>{cat.sub}</div>
                        </div>
                        <div style={mono({ fontSize: 11, color: V.ink2, textAlign: "right" })}>
                          {cat.ytd}
                          <span style={mono({ fontSize: 8.5, color: V.muted, letterSpacing: ".16em", textTransform: "uppercase", display: "block", marginTop: 2 })}>YTD</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* C · Case Register */}
                <div ref={registerRef} className="gw-case-table-wrap" style={{ marginTop: 36 }}>
                  <SectionHead index="C · Case Register" title="Master log" em="(Compliance Dpt custodian)." meta="retention 10 yr · MOE production ≤48h" />
                  <table style={{ border: `1px solid ${V.line}`, background: V.panel, width: "100%", borderCollapse: "separate" as const, borderSpacing: 0, fontSize: 11.5 }}>
                    <thead>
                      <tr>
                        {["Case Ref", "Received", "Channel", "Category", "Stage", "SLA", "Owner", ""].map((h) => (
                          <th key={h} style={mono({ textAlign: "left", fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: V.muted, padding: "9px 12px", borderBottom: `1px solid ${V.line}`, fontWeight: 500, background: V.bg2 })}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map((c, i) => (
                        <tr key={c.id} className="gw-tr" style={{ cursor: "pointer" }}>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none", fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", color: V.ember, fontSize: 11 }}>{c.id}</td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none", color: V.ink2 }}>{c.receivedAt}</td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none" }}>
                            <span style={mono({ fontSize: 9.5, letterSpacing: ".06em", border: `1px solid ${V.line2}`, padding: "2px 7px", display: "inline-block", color: V.ink2 })}>{c.channel}</span>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none" }}>
                            <span style={mono({ fontSize: 9.5, letterSpacing: ".06em", border: `1px solid ${CAT_COLOR[c.categoryVariant]}`, padding: "2px 7px", display: "inline-block", color: CAT_COLOR[c.categoryVariant] })}>{c.category}</span>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", fontSize: 10.5 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_DOT[c.stageStatus], boxShadow: STATUS_GLOW[c.stageStatus], display: "inline-block", flexShrink: 0 }} />
                              {c.stage}
                            </span>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none" }}>
                            <div style={{ height: 5, background: V.bg3, position: "relative", border: `1px solid ${V.line2}`, width: 80 }}>
                              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${c.slaPct}%`, background: SLA_COLOR[c.slaVariant] }} />
                            </div>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none", color: V.ink2 }}>{c.owner}</td>
                          <td style={{ padding: "11px 12px", borderBottom: i < cases.length - 1 ? `1px solid ${V.line}` : "none", whiteSpace: "nowrap" as const }}>
                            <button
                              type="button"
                              title="Edit case"
                              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                              style={{ background: "transparent", border: `1px solid ${V.line2}`, color: V.ink2, padding: "3px 7px", fontSize: 11, cursor: "pointer", borderRadius: 1, marginRight: 5 }}
                            >✏</button>
                            <button
                              type="button"
                              title="Delete case"
                              onClick={() => setCases((prev) => prev.filter((r) => r.id !== c.id))}
                              style={{ background: "transparent", border: `1px solid ${V.line2}`, color: "oklch(65% 0.22 25)", padding: "3px 7px", fontSize: 11, cursor: "pointer", borderRadius: 1 }}
                            >×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>{/* /left column */}

              {/* ── RIGHT: INTAKE FORM ── */}
              <aside ref={formRef}>
                <div className="gw-field" style={{ border: `1px solid ${V.line}`, background: V.panel, position: "sticky", top: 82 }}>

                  {/* Form header */}
                  <div style={{ padding: "14px 18px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(180deg,var(--gw-ember-soft),transparent)" }}>
                    <div className="gw-serif" style={{ fontSize: 18, color: V.ink, fontWeight: 500 }}>
                      File a <em style={{ fontStyle: "italic", color: V.ember }}>disclosure</em>
                    </div>
                    <div style={mono({ fontSize: 9.5, color: V.ember, letterSpacing: ".14em", textAlign: "right" })}>
                      FG-WB-001
                      <span style={mono({ color: V.ink2, fontSize: 9, display: "block", marginTop: 2 })}>v1.1 · MAY 2026</span>
                    </div>
                  </div>

                  {/* Anonymous / Named segmented control */}
                  <div className="gw-mode-tabs" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${V.line}` }}>
                    {(["anonymous", "named"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        style={mono({ background: "transparent", border: "none", color: mode === m ? V.ember : V.muted, padding: "11px 8px", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", cursor: "pointer", borderRight: m === "anonymous" ? `1px solid ${V.line}` : "none", position: "relative", outline: "none" })}
                      >
                        {m === "anonymous" ? "Anonymous" : "Confidential (named)"}
                        {mode === m && <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: "oklch(74% 0.18 350)" }} />}
                      </button>
                    ))}
                  </div>

                  {/* Form body */}
                  <div style={{ padding: "16px 18px" }}>

                    {/* Type of concern */}
                    <div style={{ marginBottom: 14 }}>
                      <FieldLabel required>Type of concern</FieldLabel>
                      <select
                        value={concern}
                        onChange={(e) => setConcern(e.target.value)}
                        style={{ width: "100%", background: V.bg, border: `1px solid ${V.line}`, color: concern ? V.ink : V.muted, padding: "8px 10px", fontFamily: "'Inter',sans-serif", fontSize: 12, borderRadius: 1, colorScheme: "dark" }}
                      >
                        <option value="">— Select category —</option>
                        {CONCERN_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>

                    {/* Date + Location */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                      <div>
                        <FieldLabel>Date observed</FieldLabel>
                        <input
                          type="text"
                          value={dateObs}
                          onChange={(e) => setDateObs(e.target.value)}
                          placeholder="DD/MM/YYYY"
                          maxLength={10}
                          style={{ width: "100%", background: V.bg, border: `1px solid ${V.line}`, color: V.ink, padding: "8px 10px", fontFamily: "'Inter',sans-serif", fontSize: 12, borderRadius: 1 }}
                        />
                      </div>
                      <div>
                        <FieldLabel>Location</FieldLabel>
                        <input type="text" placeholder="Branch / dept" value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: "100%", background: V.bg, border: `1px solid ${V.line}`, color: V.ink, padding: "8px 10px", fontFamily: "'Inter',sans-serif", fontSize: 12, borderRadius: 1 }} />
                      </div>
                    </div>

                    {/* Reporter name — named mode only */}
                    {mode === "named" && (
                      <div style={{ marginBottom: 14 }}>
                        <FieldLabel required>Reporter name</FieldLabel>
                        <input type="text" placeholder="Full legal name" value={reporterName} onChange={(e) => setName(e.target.value)} style={{ width: "100%", background: V.bg, border: `1px solid ${V.line}`, color: V.ink, padding: "8px 10px", fontFamily: "'Inter',sans-serif", fontSize: 12, borderRadius: 1 }} />
                        <div style={mono({ fontSize: 9, color: V.muted, marginTop: 4, letterSpacing: ".04em", lineHeight: 1.5 })}>Identity protected. Released only where UAE law compels disclosure to competent authorities.</div>
                      </div>
                    )}

                    {/* Preferred language */}
                    <div style={{ marginBottom: 14 }}>
                      <FieldLabel>Preferred language</FieldLabel>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <Opt label="English"  selected={language === "en"} onClick={() => setLanguage("en")} />
                        <Opt label="العربية"   selected={language === "ar"} onClick={() => setLanguage("ar")} />
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ marginBottom: 14 }}>
                      <FieldLabel required>Describe the concern</FieldLabel>
                      <textarea
                        value={description}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="What happened, who was involved, when and where. Avoid speculation — facts only. Attach evidence in next step."
                        style={{ width: "100%", background: V.bg, border: `1px solid ${V.line}`, color: V.ink, padding: "8px 10px", fontFamily: "'Inter',sans-serif", fontSize: 12, borderRadius: 1, resize: "vertical", minHeight: 70, lineHeight: 1.5 }}
                      />

                    </div>

                    {/* Severity */}
                    <div>
                      <FieldLabel>Severity (your view)</FieldLabel>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                        {(["Low", "Medium", "High"] as const).map((s) => (
                          <Opt key={s} label={s} selected={severity === s} onClick={() => setSeverity(s)} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Submit row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: `1px solid ${V.line}`, background: V.bg2 }}>
                    <div style={mono({ fontSize: 9, color: V.muted, letterSpacing: ".04em", lineHeight: 1.5, maxWidth: 170 })}>
                      Submission is encrypted at rest. <strong style={{ color: V.ember }}>Anonymous</strong> reports are accepted &amp; protected.
                    </div>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting || !concern}
                      style={{ border: `1px solid oklch(74% 0.18 350)`, background: "oklch(74% 0.18 350)", color: "#1a0613", padding: "10px 18px", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".02em", cursor: submitting || !concern ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 1, opacity: submitting || !concern ? 0.6 : 1 }}
                    >
                      {submitting ? "Submitting…" : "Submit · sealed"}
                    </button>
                  </div>

                  {/* Tipping-off warning */}
                  <div style={{ margin: "0 18px 16px", border: `1px solid oklch(66% 0.20 20)`, background: "linear-gradient(90deg,var(--gw-rose-soft),transparent)", padding: "11px 13px", marginTop: 14 }}>
                    <div style={mono({ fontSize: 9, letterSpacing: ".18em", color: V.rose, fontWeight: 700, textTransform: "uppercase" })}>Tipping-off warning</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: V.ink2, lineHeight: 1.5 }}>Where the matter may relate to ML/TF, do <strong>not</strong> disclose, confirm or discuss the existence of any report, investigation or internal review with any third party.</div>
                  </div>

                </div>
              </aside>

            </div>{/* /two-col */}

            {/* ── PENALTY RAIL ── */}
            <div className="gw-penalty-outer" style={{ marginTop: 32, border: `1px solid ${V.line}`, background: V.panel, display: "grid", gridTemplateColumns: "auto 1fr" }}>
              <div className="gw-penalty-label" style={{ padding: "22px 24px", borderRight: `1px solid ${V.line}`, background: V.bg2, display: "flex", flexDirection: "column" as const, justifyContent: "center", minWidth: 230 }}>
                <div className="gw-serif" style={{ fontSize: 22, color: V.ink, lineHeight: 1.1 }}>
                  Penalties for <em style={{ fontStyle: "italic", color: V.rose }}>non-reporting</em>
                </div>
                <div style={mono({ fontSize: 9.5, color: V.muted, letterSpacing: ".12em", marginTop: 8 })}>CR No.24/2022 · administrative violations</div>
              </div>
              <div className="gw-penalty-items" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)" }}>
                {PENALTIES.map((p, i) => (
                  <div key={p.lab} style={{ padding: "18px 16px", borderRight: i < PENALTIES.length - 1 ? `1px solid ${V.line}` : "none" }}>
                    <div style={mono({ fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: V.muted })}>{p.lab}</div>
                    <div className="gw-serif" style={{ fontSize: 20, color: V.ink, marginTop: 6, lineHeight: 1 }}>
                      {p.prefix} <em style={{ color: V.rose, fontStyle: "normal" }}>{p.em}</em>
                    </div>
                    <div style={{ fontSize: 11, color: V.ink2, marginTop: 6, lineHeight: 1.5 }}>{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>

          </main>
        </div>

        {/* ── PAGE FOOTER ── */}
        <footer className="gw-footer" style={{ borderTop: `1px solid ${V.line}`, padding: "0 22px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 30, position: "relative", zIndex: 2 }}>
          <div style={mono({ fontSize: 9.5, color: V.muted, letterSpacing: ".06em" })}>FG/GVW/004 · v004 · Effective 28 NOV 2025 · Next review JUN 2026</div>
          <div style={{ display: "flex", gap: 18 }}>
            {["Retention 10y", "MOE Production ≤48h", "Audit-trail · HMAC chain"].map((t) => (
              <span key={t} style={mono({ fontSize: 9.5, color: V.muted, letterSpacing: ".06em" })}>{t}</span>
            ))}
            <span style={mono({ fontSize: 9.5, color: V.rose, letterSpacing: ".18em", fontWeight: 600 })}>CONFIDENTIAL</span>
          </div>
        </footer>

      </div>{/* /gw-root */}
    </>
  );
}
