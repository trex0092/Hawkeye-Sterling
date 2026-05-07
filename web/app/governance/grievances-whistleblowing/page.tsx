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
  { id: "FG-WB-2026-014", receivedAt: "02 MAY · 09:14", channel: "EMAIL",   category: "AML/CFT",    categoryVariant: "aml",     stage: "Investigation",    stageStatus: "open",      slaPct: 36,  slaVariant: "warn",   owner: "MLRO" },
  { id: "FG-WB-2026-013", receivedAt: "28 APR · 16:02", channel: "DIRECT",  category: "BRIBERY",    categoryVariant: "eth",     stage: "Decision",         stageStatus: "review",    slaPct: 88,  slaVariant: "ok",     owner: "CO"   },
  { id: "FG-WB-2026-012", receivedAt: "22 APR · 11:48", channel: "WRITTEN", category: "HARASSMENT", categoryVariant: "hr",      stage: "Escalated · MD",   stageStatus: "escalated", slaPct: 94,  slaVariant: "danger", owner: "MD"   },
  { id: "FG-WB-2026-011", receivedAt: "18 APR · 08:30", channel: "MEETING", category: "PROCESS",    categoryVariant: "ops",     stage: "Closed · resolved",stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "CO"   },
  { id: "FG-WB-2026-010", receivedAt: "11 APR · 14:21", channel: "EMAIL",   category: "SANCTIONS",  categoryVariant: "aml",     stage: "Closed · STR filed",stageStatus: "closed",   slaPct: 100, slaVariant: "ok",     owner: "MLRO" },
  { id: "FG-WB-2026-009", receivedAt: "04 APR · 10:55", channel: "EMAIL",   category: "CONFLICT",   categoryVariant: "eth",     stage: "Closed · coaching",stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "CO"   },
];

const PIPELINE = [
  { num: "01", phase: "Acknowledge", sla: "≤2",  unit: "business days",  extra: "",                  desc: "Compliance Officer or MD confirms receipt.",                               fill: 100, active: false },
  { num: "02", phase: "Assess",      sla: "≤5",  unit: "business days",  extra: "",                  desc: "Scope confirmed · interim protective steps decided.",                     fill: 100, active: false },
  { num: "03", phase: "Investigate", sla: "≤30", unit: "calendar days",  extra: "(+15 if complex)",  desc: "Information gathered objectively, without bias.",                          fill: 62,  active: true  },
  { num: "04", phase: "Decide",      sla: "≤5",  unit: "business days",  extra: "",                  desc: "Outcome issued in writing (subject to tipping-off rules).",               fill: 0,   active: false },
  { num: "05", phase: "Escalate",    sla: "≤10", unit: "business days",  extra: "",                  desc: "MD reviews if complainant unsatisfied. Final response in 10 BD.",         fill: 0,   active: false },
];

const CATEGORIES = [
  { ico: "¶", title: "AML / CFT & Sanctions",       sub: "FG/GVW · ROUTED TO MLRO",    ytd: 12 },
  { ico: "§", title: "Bribery, gifts & influence",  sub: "FG/ABC · ROUTED TO CO",      ytd: 3  },
  { ico: "⌘", title: "Fraud, theft & falsification",sub: "FG/INV · ROUTED TO CO",      ytd: 5  },
  { ico: "∇", title: "Misconduct & harassment",     sub: "FG/HR · ROUTED TO MD",       ytd: 2  },
  { ico: "⊟", title: "KYC / EDD failures",          sub: "FG/CDD · ROUTED TO MLRO",    ytd: 7  },
  { ico: "⌬", title: "Data & IT security breach",   sub: "FG/CIS · ROUTED TO IT + CO", ytd: 1  },
  { ico: "⊞", title: "Operational / safety",        sub: "FG/OPS · ROUTED TO MGR",     ytd: 4  },
  { ico: "∂", title: "Customer service & grievance",sub: "FG/GVW · ROUTED TO CO",      ytd: 9  },
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

      <Header />

      {/* ── Page root — scoped dark tokens ── */}
      <div
        className="gw-root"
        style={{ ...gwVars, background: V.bg, color: V.ink, minHeight: "calc(100vh - 54px)", fontSize: 13, lineHeight: 1.5, WebkitFontSmoothing: "antialiased", fontFamily: "'Inter',sans-serif", position: "relative" }}
      >
        {/* Grain overlay */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, backgroundImage: "radial-gradient(rgba(255,255,255,.012) 1px,transparent 1px)", backgroundSize: "3px 3px", mixBlendMode: "overlay" }} />

        {/* ── SIDEBAR + MAIN GRID ── */}
        <div style={{ display: "grid", gridTemplateColumns: "268px 1fr", minHeight: "calc(100vh - 54px - 28px - 30px)", position: "relative", zIndex: 2 }}>

          {/* ══ SIDEBAR ══ */}
          <aside style={{ borderRight: `1px solid ${V.line}`, padding: "22px 18px 30px", background: "linear-gradient(180deg,rgba(28,26,21,.35),transparent 220px)" }}>

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
                    owner: "Compliance Officer / MLRO",
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
          <main style={{ padding: "28px 36px 60px", minWidth: 0 }}>

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
                <h1 className="gw-serif" style={{ fontWeight: 400, fontSize: 54, letterSpacing: "-0.02em", lineHeight: 1.0, color: V.ink, margin: "6px 0 0" } as React.CSSProperties}>
                  A protected channel<br />to <em style={{ fontStyle: "italic", color: V.ember }}>speak up.</em>
                </h1>
                <p style={{ color: V.ink2, fontSize: 13.5, maxWidth: 560, marginTop: 14, lineHeight: 1.6, margin: "14px 0 0" }}>
                  A safe, transparent, confidential mechanism for customers, partners, employees and third parties to raise concerns or report misconduct — without fear of retaliation. Operated by the Compliance Officer / MLRO under the Fine Gold Grievances &amp; Whistleblowing Policy{" "}
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
                    onClick={() => window.print()}
                    style={{ border: `1px solid ${V.line2}`, background: "transparent", color: V.ink, padding: "10px 18px", fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".02em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 1 }}
                  >
                    Download policy PDF
                    <span style={mono({ fontSize: 10, border: `1px solid ${V.line2}`, padding: "1px 5px", color: V.ink2, background: "transparent" })}>↓</span>
                  </button>
                </div>
              </div>
            </section>

            {/* ── TWO-COLUMN CONTENT ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 28, marginTop: 32 }}>

              {/* ── LEFT COLUMN ── */}
              <div>

                {/* A · Resolution Pipeline */}
                <SectionHead index="A · Resolution Pipeline" title="How a report" em="moves through the system." meta="SLA-tracked · auto-escalated" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", border: `1px solid ${V.line}`, background: V.panel }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                    {CATEGORIES.map((cat) => (
                      <div key={cat.title} style={{ border: `1px solid ${V.line}`, background: V.panel, padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center" }}>
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
                <div ref={registerRef} style={{ marginTop: 36 }}>
                  <SectionHead index="C · Case Register" title="Master log" em="(MLRO custodian)." meta="retention 10 yr · MOE production ≤48h" />
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${V.line}` }}>
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
            <div style={{ marginTop: 32, border: `1px solid ${V.line}`, background: V.panel, display: "grid", gridTemplateColumns: "auto 1fr" }}>
              <div style={{ padding: "22px 24px", borderRight: `1px solid ${V.line}`, background: V.bg2, display: "flex", flexDirection: "column" as const, justifyContent: "center", minWidth: 230 }}>
                <div className="gw-serif" style={{ fontSize: 22, color: V.ink, lineHeight: 1.1 }}>
                  Penalties for <em style={{ fontStyle: "italic", color: V.rose }}>non-reporting</em>
                </div>
                <div style={mono({ fontSize: 9.5, color: V.muted, letterSpacing: ".12em", marginTop: 8 })}>CR No.24/2022 · administrative violations</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)" }}>
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
        <footer style={{ borderTop: `1px solid ${V.line}`, padding: "0 22px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 30, position: "relative", zIndex: 2 }}>
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
