"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { AIIncidentRecord, IncidentType, IncidentSeverity, IncidentStatus } from "@/app/api/ai-incident-playbook/route";

// UAE AI Incident Response — FDL 10/2025 Art.24 + CBUAE AI Governance Guidelines 2025
// Covers: hallucination, bias spike, data poisoning, model unavailability, prompt injection,
//         data leakage, shadow AI, drift, other

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  hallucination: "Hallucination / Fabrication",
  bias_spike: "Bias Spike",
  data_poisoning: "Data Poisoning",
  model_unavailability: "Model Unavailability",
  prompt_injection: "Prompt Injection",
  data_leakage: "Data Leakage",
  shadow_ai: "Shadow AI Usage",
  drift: "Model / Concept Drift",
  other: "Other",
};

const SEVERITY_COLOURS: Record<IncidentSeverity, string> = {
  critical: "bg-red-950/30 text-red-300 border border-red-500/40",
  high: "bg-orange-950/30 text-orange-300 border border-orange-500/40",
  medium: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  low: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

const STATUS_COLOURS: Record<IncidentStatus, string> = {
  open: "bg-red-950/20 text-red-300",
  investigating: "bg-sky-950/20 text-sky-300",
  mitigated: "bg-amber-950/20 text-amber-300",
  closed: "bg-zinc-800/40 text-ink-2",
};

// PLAYBOOK: step-by-step response per incident type (UAE best practice)
const RESPONSE_PLAYBOOKS: Partial<Record<IncidentType, { phase: string; actions: string[] }[]>> = {
  hallucination: [
    { phase: "1. Detect & Contain (0–1h)", actions: ["Confirm fabrication via secondary source verification", "Quarantine affected output — do not share with client", "Identify the model + prompt version involved"] },
    { phase: "2. Assess (1–4h)", actions: ["Determine if customer-impacting (adverse decision made?)", "Check if regulatory report was generated from the output", "Quantify affected records"] },
    { phase: "3. Remediate", actions: ["Roll back / invalidate affected outputs in system", "Re-run screening with human-in-the-loop verification", "Update system prompt with hallucination guard"] },
    { phase: "4. Report", actions: ["Log in AI Incident Register", "If CBUAE/FSRA impact: notify within 72h (FDL 10/2025 Art.24)", "Document root cause + lessons learned"] },
  ],
  bias_spike: [
    { phase: "1. Detect & Contain", actions: ["Capture bias report snapshot with timestamp", "Halt automated adverse decisions for affected demographic", "Enable manual review queue"] },
    { phase: "2. Investigate", actions: ["Compare current vs 30-day baseline bias ratio", "Identify if training data drift or new input distribution", "Check if scoring thresholds changed"] },
    { phase: "3. Remediate", actions: ["Re-calibrate or retrain model on balanced dataset", "Review all decisions made during spike window", "Conduct equal-treatment audit per CBUAE guidance"] },
    { phase: "4. Report", actions: ["Document affected population and impact extent", "If systemic: notify Board and MLRO within 24h", "Regulatory notification if customer harm identified"] },
  ],
  prompt_injection: [
    { phase: "1. Immediate (0–30min)", actions: ["Block the input vector that carried the injection", "Review all AI outputs in last 2h for anomalies", "Rotate any API keys the injection may have accessed"] },
    { phase: "2. Forensics", actions: ["Preserve raw input and AI output logs as evidence", "Determine if exfiltration occurred (data leakage)", "Classify as security incident if PII/financial data accessed"] },
    { phase: "3. Harden", actions: ["Add input sanitization / output filtering rules", "Test system against OWASP Top 10 LLM risks", "Update adversarial probe test catalogue"] },
    { phase: "4. Close", actions: ["CISO sign-off on remediation", "Update threat model documentation", "Staff awareness communication"] },
  ],
  data_leakage: [
    { phase: "1. Isolate (0–1h)", actions: ["Identify what data was sent to AI model", "Determine if data left intended boundary (API call logs)", "Disable the leaking integration immediately"] },
    { phase: "2. Notify", actions: ["DPO notification within 1h of discovery", "Assess ADGM/DIFC/GDPR breach threshold (72h clock)", "Notify affected individuals if required"] },
    { phase: "3. Remediate", actions: ["Implement data minimisation on AI prompts", "Enforce PII masking before model calls", "Review vendor DPA to confirm data handling obligations"] },
    { phase: "4. Document", actions: ["Record breach in data breach register", "Regulatory notification if required", "Update Privacy Impact Assessment (PIA)"] },
  ],
  model_unavailability: [
    { phase: "1. Detect", actions: ["Confirm outage via vendor status page", "Switch to manual-review queue for all pending AI decisions", "Notify operations team + MLRO if > 2h outage"] },
    { phase: "2. Escalate", actions: ["Activate business continuity plan for AI-dependent processes", "Identify highest-risk manual backlog items (PEP, sanctions)", "Communicate SLA breach to vendor"] },
    { phase: "3. Recover", actions: ["Gradual ramp-back with monitoring on first 100 post-outage outputs", "Verify output quality vs pre-outage baseline", "Clear manual queue backlog"] },
    { phase: "4. Review", actions: ["Update RTO/RPO in business continuity plan", "Evaluate fallback model options", "Log in vendor performance record"] },
  ],
};

const DEFAULT_PLAYBOOK = [
  { phase: "1. Detect & Triage", actions: ["Confirm incident type and scope", "Preserve evidence (logs, outputs, timestamps)", "Assign incident owner"] },
  { phase: "2. Contain", actions: ["Disable affected AI component if risk warrants", "Enable manual process fallback", "Notify MLRO and CISO within 2h"] },
  { phase: "3. Investigate", actions: ["Root cause analysis", "Impact assessment on customers / decisions / data", "Document findings"] },
  { phase: "4. Remediate & Close", actions: ["Apply fix and validate", "Regulatory notification if required (FDL 10/2025 Art.24)", "Lessons-learned session and register update"] },
];

interface FormState {
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  affectedModel: string;
  regulatoryNotificationRequired: boolean;
}

export default function AIIncidentPlaybookPage() {
  const [incidents, setIncidents] = useState<AIIncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<AIIncidentRecord | null>(null);
  const [form, setForm] = useState<FormState>({
    type: "hallucination",
    severity: "high",
    title: "",
    description: "",
    affectedModel: "claude-sonnet-4-6",
    regulatoryNotificationRequired: false,
  });

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-incident-playbook");
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "AI incident"));
      const data = await res.json() as { ok: boolean; incidents?: AIIncidentRecord[]; error?: string };
      if (data.ok) setIncidents(data.incidents ?? []);
      else setError(data.error ?? "Failed to load incidents");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error loading incidents"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-incident-playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "AI incident"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ type: "hallucination", severity: "high", title: "", description: "", affectedModel: "claude-sonnet-4-6", regulatoryNotificationRequired: false });
        void fetchIncidents();
      } else {
        setError(data.error ?? "Failed to log incident");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error logging incident"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusUpdate(id: string, status: IncidentStatus) {
    try {
      const res = await fetch("/api/ai-incident-playbook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "AI incident"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) void fetchIncidents();
      else setError(data.error ?? "Update failed");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error updating incident"));
    }
  }

  const playbook = selected ? (RESPONSE_PLAYBOOKS[selected.type] ?? DEFAULT_PLAYBOOK) : null;

  return (
    <ModuleLayout
      sidebarActions={
        <ActionButton variant="add" type="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Log AI Incident"}
        </ActionButton>
      }
    >
      <ModuleHero
        eyebrow=""
        title="AI Incident Response"
        titleEm="playbook."
        intro="Step-by-step AI failure response · Hallucination · Bias · Prompt injection · Data leakage · CBUAE reporting"
      />

      <div className="w-full px-4 pb-16 space-y-6">

        {/* Stat tiles removed; Log AI Incident button lives in sidebar Actions */}

        {/* Regulatory notice */}
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-300">
          <strong>UAE Regulatory Obligation:</strong> Critical and High AI incidents affecting customer data or adverse decisions must be reported to CBUAE/FSRA within 72 hours under FDL 10/2025 Art.24. Document all containment steps and root cause analysis.
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {/* Log incident form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">Log New AI Incident</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Incident Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as IncidentType })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
                  required
                >
                  {Object.entries(INCIDENT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value as IncidentSeverity })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
                  required
                >
                  {(["critical", "high", "medium", "low"] as IncidentSeverity[]).map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Incident Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                placeholder="e.g. Hallucination in SAR narrative — customer name fabricated"
                maxLength={200}
                required
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={3}
                maxLength={2000}
                required
                placeholder="Describe what happened, when it was detected, and initial impact assessment..."
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Affected AI Model</label>
              <input
                type="text"
                value={form.affectedModel}
                onChange={(e) => setForm({ ...form, affectedModel: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                placeholder="e.g. claude-sonnet-4-6, GPT-4o, Sentence-BERT"
                maxLength={100}
                required
              />
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input
                  type="checkbox"
                  checked={form.regulatoryNotificationRequired}
                  onChange={(e) => setForm({ ...form, regulatoryNotificationRequired: e.target.checked })}
                  className="rounded"
                />
                Regulatory notification required (CBUAE/FSRA — 72h clock starts now)
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                {submitting ? "Logging..." : "Log Incident"}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Incident list */}
          <div>
            <h2 className="text-sm font-semibold text-ink-1 mb-3">Incident Register</h2>
            {loading ? (
              <div className="text-center text-ink-2 py-12">Loading...</div>
            ) : incidents.length === 0 ? (
              <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg text-sm">
                No incidents logged. Click &ldquo;Log AI Incident&rdquo; to record the first entry.
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => setSelected(selected?.id === inc.id ? null : inc)}
                    className={`w-full text-left bg-bg-panel border rounded-lg p-4 hover:border-brand/50 transition-colors ${selected?.id === inc.id ? "border-brand/60 ring-1 ring-brand/20" : "border-hair-2"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-10 text-ink-2">{inc.id}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLOURS[inc.severity]}`}>
                            {inc.severity}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOURS[inc.status]}`}>
                            {inc.status.replace("_", " ")}
                          </span>
                          {inc.regulatoryNotificationRequired && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-600 text-white font-bold">72h NOTIF</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-ink-0 mt-1 truncate">{inc.title}</p>
                        <p className="text-xs text-ink-2 mt-0.5">{INCIDENT_TYPE_LABELS[inc.type]} · {inc.affectedModel}</p>
                      </div>
                      <div className="text-xs text-ink-2 shrink-0 text-right">
                        {new Date(inc.detectedAt).toLocaleDateString()}
                      </div>
                    </div>
                    {inc.status !== "closed" && (
                      <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {inc.status === "open" && (
                          <button onClick={() => void handleStatusUpdate(inc.id, "investigating")} className="text-xs px-2 py-1 bg-sky-950/20 text-sky-300 rounded border border-sky-500/30 hover:bg-sky-950/40">
                            → Investigating
                          </button>
                        )}
                        {inc.status === "investigating" && (
                          <button onClick={() => void handleStatusUpdate(inc.id, "mitigated")} className="text-xs px-2 py-1 bg-amber-950/20 text-amber-300 rounded border border-amber-500/30 hover:bg-amber-950/40">
                            → Mitigated
                          </button>
                        )}
                        {inc.status === "mitigated" && (
                          <button onClick={() => void handleStatusUpdate(inc.id, "closed")} className="text-xs px-2 py-1 bg-emerald-950/20 text-emerald-300 rounded border border-emerald-500/30 hover:bg-emerald-950/40">
                            → Close
                          </button>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Playbook panel */}
          <div>
            <h2 className="text-sm font-semibold text-ink-1 mb-3">
              {selected ? `Response Playbook — ${INCIDENT_TYPE_LABELS[selected.type]}` : "Response Playbooks"}
            </h2>
            {!selected ? (
              <div className="bg-bg-base border border-dashed border-hair-2 rounded-lg p-6 text-center text-sm text-ink-2">
                Select an incident to see its step-by-step response playbook
              </div>
            ) : (
              <div className="space-y-3">
                {(playbook ?? []).map((step) => (
                  <div key={step.phase} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-ink-0 mb-2">{step.phase}</h3>
                    <ul className="space-y-1.5">
                      {step.actions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-ink-1">
                          <span className="mt-1 w-4 h-4 rounded-full border-2 border-hair-2 shrink-0 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-ink-2" />
                          </span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {selected.regulatoryNotificationRequired && !selected.regulatoryNotificationSent && (
                  <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                    <strong>72h Regulatory Notification Outstanding</strong> — Contact CBUAE/FSRA Supervision Unit via official portal. Document notification reference number in this record.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
