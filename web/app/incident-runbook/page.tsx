"use client";

import { useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

// ── Types ────────────────────────────────────────────────────────────────────

type Severity = "P1" | "P2" | "P3";

interface RunbookStep {
  action: string;
  outcome: string;
  owner: "MLRO" | "CTO" | "DevOps" | "All";
}

interface RunbookEntry {
  severity: Severity;
  title: string;
  trigger: string;
  sla: string;
  escalationContacts: string[];
  steps: RunbookStep[];
  regulatoryObligation?: string;
}

// ── Runbook data ─────────────────────────────────────────────────────────────

const RUNBOOKS: RunbookEntry[] = [
  {
    severity: "P1",
    title: "Critical — Compliance Breach / Audit Chain Failure / Data Exposure",
    trigger: "Audit chain integrity failure · PII exposed in logs · Unauthorized data access · Sanctions evasion detected",
    sla: "Notify MLRO + CTO within 15 minutes. UAE FIU notification within 30 days if customer data affected.",
    escalationContacts: ["MLRO (primary)", "CTO (secondary)", "Legal Counsel", "UAE FIU (if required)"],
    regulatoryObligation: "UAE FDL No.10/2025 — breach notification to FIU within 30 days if customer data is involved.",
    steps: [
      { action: "Immediately notify MLRO and CTO via phone + secure message", outcome: "Both notified within 15 min", owner: "All" },
      { action: "Freeze affected screening queues via /api/system-status", outcome: "No new cases processed on affected pipeline", owner: "DevOps" },
      { action: "Capture audit chain state — read only, DO NOT MODIFY", outcome: "Snapshot saved to incident evidence store", owner: "CTO" },
      { action: "Open incident record in docs/INCIDENTS.md with ISO 8601 timestamp", outcome: "Incident ID assigned (INC-YYYY-MMDD-NNN)", owner: "All" },
      { action: "Engage four-eyes review for any remediation actions", outcome: "Two approvers on record before any change applied", owner: "MLRO" },
      { action: "Assess FIU reporting obligation under FDL No.10/2025", outcome: "Filing decision documented by MLRO", owner: "MLRO" },
      { action: "After containment: root-cause analysis within 72 hours", outcome: "RCA document linked in INCIDENTS.md", owner: "CTO" },
    ],
  },
  {
    severity: "P2",
    title: "High — LLM Degradation / Circuit Breaker Open / Rate Limit Breach",
    trigger: "Circuit breaker open · Claude API timeout > 3 consecutive requests · Rate limit > 90% utilisation · Groq fallback activating",
    sla: "Update incident log within 1 hour. Restore primary LLM path within 4 hours.",
    escalationContacts: ["CTO (primary)", "DevOps (secondary)", "MLRO (if compliance impact)"],
    steps: [
      { action: "Verify circuit breaker state via /api/system-status", outcome: "Confirm which path (Claude/Groq) is active", owner: "DevOps" },
      { action: "Check Claude API status page and Groq API health", outcome: "External vs internal root cause identified", owner: "DevOps" },
      { action: "Verify egress gate is still fail-closed during degradation", outcome: "Confirm held_review returned on LLM failure", owner: "CTO" },
      { action: "Monitor Prometheus metrics: hawkeye_circuit_breaker_state gauge", outcome: "Alert if state doesn't recover within 30 min", owner: "DevOps" },
      { action: "Log P2 in docs/INCIDENTS.md within 1 hour", outcome: "Incident record with start time + initial assessment", owner: "CTO" },
      { action: "If Groq fallback active > 2 hours, notify MLRO", outcome: "MLRO aware that screening quality may differ", owner: "CTO" },
      { action: "After recovery: confirm probe regression test passes", outcome: "node scripts/adversarial-runner.mjs --dry-run exits 0", owner: "DevOps" },
    ],
  },
  {
    severity: "P3",
    title: "Medium — Bias Ratio Drift / Attestation Overdue / Probe Regression",
    trigger: "biasRatio > 1.15 · Model attestation past nextAttestationDue · Adversarial probe regression in CI · Compliance gap opened",
    sla: "Flag in MLRO daily digest. Assign owner and target date within 48 hours.",
    escalationContacts: ["MLRO (bias/attestation)", "CTO (probe/technical)", "DevOps (deployment)"],
    steps: [
      { action: "Identify affected metric: bias ratio / attestation / probe / gap", outcome: "Root issue scoped to specific component", owner: "CTO" },
      { action: "If bias ratio > 1.15: suspend automated screening, require manual review", outcome: "No automated clear verdicts until ratio restored", owner: "MLRO" },
      { action: "If attestation overdue: schedule emergency model review with MLRO", outcome: "MLRO sign-off within 5 business days", owner: "MLRO" },
      { action: "If probe regression: identify failing probe category, do not merge", outcome: "Branch blocked; failing probe ID in PR comment", owner: "DevOps" },
      { action: "Add or update entry in COMPLIANCE_GAPS.md with status OPEN/PARTIAL", outcome: "Gap tracked with ID, owner, target date", owner: "All" },
      { action: "Include in next MLRO weekly digest", outcome: "MLRO aware and aligned on remediation timeline", owner: "MLRO" },
    ],
  },
];

// ── Severity styling ──────────────────────────────────────────────────────────

function severityBorder(s: Severity): string {
  switch (s) {
    case "P1": return "border-red-500/50 bg-red-950/20";
    case "P2": return "border-amber-500/40 bg-amber-950/15";
    case "P3": return "border-sky-500/30 bg-sky-950/15";
  }
}

function severityBadge(s: Severity): string {
  switch (s) {
    case "P1": return "bg-red-500 text-white";
    case "P2": return "bg-amber-500 text-white";
    case "P3": return "bg-sky-500 text-white";
  }
}

function ownerBadge(o: RunbookStep["owner"]): string {
  switch (o) {
    case "MLRO":   return "bg-violet-950/40 text-violet-300 border-violet-500/30";
    case "CTO":    return "bg-sky-950/40 text-sky-300 border-sky-500/30";
    case "DevOps": return "bg-emerald-950/40 text-emerald-300 border-emerald-500/30";
    default:       return "bg-bg-1 text-ink-2 border-hair-2";
  }
}

// ── Runbook Card ──────────────────────────────────────────────────────────────

function RunbookCard({ entry }: { entry: RunbookEntry }) {
  const [expanded, setExpanded] = useState(entry.severity === "P1");

  return (
    <div className={`border rounded-xl overflow-hidden ${severityBorder(entry.severity)}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-5 text-left hover:bg-white/5 transition-colors"
      >
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-13 font-black shrink-0 ${severityBadge(entry.severity)}`}>
          {entry.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-14 font-semibold text-ink-0 leading-snug">{entry.title}</div>
          <div className="text-11 text-ink-3 mt-1 leading-snug">{entry.trigger}</div>
          <div className="text-11 font-semibold text-brand mt-1">SLA: {entry.sla}</div>
        </div>
        <span className="text-ink-3 text-16 shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
          {/* Escalation contacts */}
          <div className="flex flex-wrap gap-2">
            {entry.escalationContacts.map((c, i) => (
              <span key={i} className="text-11 px-2 py-0.5 bg-bg-panel border border-hair-2 rounded text-ink-2">{c}</span>
            ))}
          </div>

          {/* Regulatory obligation */}
          {entry.regulatoryObligation && (
            <div className="flex items-start gap-2 text-11 text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded-lg px-3 py-2">
              <span className="shrink-0">⚖</span>
              <span>{entry.regulatoryObligation}</span>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-2">
            {entry.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-bg-panel border border-hair-2 rounded-lg px-4 py-3">
                <span className="w-5 h-5 rounded-full bg-bg-2 border border-hair-2 flex items-center justify-center text-10 font-bold text-ink-3 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-12 font-medium text-ink-0">{step.action}</div>
                  <div className="text-11 text-ink-3 mt-0.5">→ {step.outcome}</div>
                </div>
                <span className={`text-9 font-semibold uppercase tracking-wide-2 px-1.5 py-0.5 rounded border shrink-0 ${ownerBadge(step.owner)}`}>
                  {step.owner}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IncidentRunbookPage() {
  return (
    <ModuleLayout asanaModule="incident-runbook" asanaLabel="Incident Runbook">
      <div className="mb-6 border-b-2 border-ink-0 pb-4">
        <div className="flex items-center gap-1.5 text-10.5 font-semibold uppercase tracking-wide-4 text-brand mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
          Operations · SOC2 CC7.4
        </div>
        <h1 className="font-display text-36 text-ink-0 m-0 leading-tight">
          Incident <em className="italic text-brand">runbook.</em>
        </h1>
        <p className="text-13 text-ink-2 mt-1 max-w-[70ch]">
          P1 Critical · P2 High · P3 Medium — escalation contacts, step-by-step procedures, and regulatory obligations.
          Sourced from <span className="font-mono text-11">docs/INCIDENT-RECOVERY.md</span>.
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-6 flex-wrap">
        {(["P1", "P2", "P3"] as Severity[]).map((s) => (
          <div key={s} className="flex items-center gap-2 text-11 text-ink-2">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-10 font-black ${severityBadge(s)}`}>{s}</span>
            <span>{s === "P1" ? "Critical — notify < 15 min" : s === "P2" ? "High — log < 1 hour" : "Medium — daily digest"}</span>
          </div>
        ))}
        <div className="ml-auto flex gap-2">
          {(["MLRO", "CTO", "DevOps"] as RunbookStep["owner"][]).map((o) => (
            <span key={o} className={`text-9 font-semibold uppercase tracking-wide-2 px-1.5 py-0.5 rounded border ${ownerBadge(o)}`}>{o}</span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {RUNBOOKS.map((entry) => (
          <RunbookCard key={entry.severity} entry={entry} />
        ))}
      </div>

      <div className="mt-8 p-4 border border-hair-2 rounded-xl bg-bg-panel text-11 text-ink-3 space-y-1">
        <div className="font-semibold text-ink-2">References</div>
        <div>• Full runbook: <span className="font-mono">docs/INCIDENT-RECOVERY.md</span></div>
        <div>• Incident log: <span className="font-mono">docs/INCIDENTS.md</span></div>
        <div>• Compliance gaps: <span className="font-mono">COMPLIANCE_GAPS.md</span></div>
        <div>• SOC2 mapping: <span className="font-mono">docs/SOC2.md</span></div>
        <div>• Regulatory: UAE FDL No.10/2025 · FIU notification SLA: 30 days</div>
      </div>
    </ModuleLayout>
  );
}
