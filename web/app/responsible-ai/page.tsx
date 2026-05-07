"use client";

import { useState, useEffect } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { EthicsAssessmentResult } from "@/app/api/ai-ethics-assessment/route";
import { loadAuditEntries, type AuditEntry } from "@/lib/audit";

// Responsible AI Governance — Module 27
// UNESCO Recommendation on the Ethics of AI (2021), EU AI Act, UAE AI Strategy 2031.
// Human oversight mandatory for all adverse dispositions.
// All AI decisions logged with 10-year retention (FDL 10/2025 Art.24).

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "principles" | "models" | "incidents" | "bias" | "audit-trail";
type RiskTier = "High" | "Medium" | "Low";
type IncidentSeverity = "Critical" | "High" | "Medium" | "Low";
type PrincipleStatus = "compliant" | "partial" | "gap";

interface AIModel {
  id: string;
  name: string;
  version: string;
  riskTier: RiskTier;
  purpose: string;
  biasAuditStatus: string;
  lastReview: string;
  status: "Active" | "Deprecated";
}

interface AIIncident {
  id: string;
  date: string;
  severity: IncidentSeverity;
  title: string;
  model: string;
  open: boolean;
  notes: string;
}

interface ModelsOverlay {
  deletedIds: string[];
  customModels: AIModel[];
}

interface IncidentsOverlay {
  deletedIds: string[];
  customIncidents: AIIncident[];
  statusPatches: Record<string, boolean>; // id -> open
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_MODELS: AIModel[] = [
  {
    id: "m1",
    name: "claude-sonnet-4-6",
    version: "sonnet-4-6",
    riskTier: "High",
    purpose: "Narrative generation, analysis",
    biasAuditStatus: "Passed Q1-2025",
    lastReview: "01/04/2025",
    status: "Active",
  },
  {
    id: "m2",
    name: "claude-haiku-4-5",
    version: "haiku-4-5",
    riskTier: "High",
    purpose: "Fast classification, triage",
    biasAuditStatus: "Model card overdue",
    lastReview: "15/01/2025",
    status: "Active",
  },
  {
    id: "m3",
    name: "GPT-4o-mini",
    version: "2024-07",
    riskTier: "Medium",
    purpose: "Supplementary screening",
    biasAuditStatus: "Model card overdue",
    lastReview: "01/11/2024",
    status: "Active",
  },
  {
    id: "m4",
    name: "Sentence-BERT",
    version: "v2.1",
    riskTier: "Low",
    purpose: "Entity name matching (fuzzy)",
    biasAuditStatus: "Passed Q4-2024",
    lastReview: "01/12/2024",
    status: "Active",
  },
];

const SEED_INCIDENTS: AIIncident[] = [
  {
    id: "INC-AI-001",
    date: "2025-04-10",
    severity: "Medium",
    title: "False-positive rate spike (individual entities +12%)",
    model: "claude-haiku-4-5",
    open: true,
    notes: "Bias re-calibration in progress",
  },
  {
    id: "INC-AI-002",
    date: "2025-03-22",
    severity: "High",
    title: "LLM hallucination in STR narrative — jurisdiction cited incorrectly",
    model: "claude-sonnet-4-6",
    open: true,
    notes: "Human review mandatory gate added",
  },
];

const AUDIT_TRAIL = [
  {
    ts: "2025-04-24 09:32",
    model: "claude-sonnet-4-6",
    decisionType: "STR narrative generation",
    inputHash: "a3f8...d91c",
    outputHash: "b7c2...f44e",
    reviewer: "L. Fernanda",
    outcome: "Approved",
  },
  {
    ts: "2025-04-23 14:15",
    model: "claude-haiku-4-5",
    decisionType: "Adverse media classification",
    inputHash: "9b1d...aa3f",
    outputHash: "2e7c...c81b",
    reviewer: "—",
    outcome: "Overridden",
  },
  {
    ts: "2025-04-22 11:00",
    model: "GPT-4o-mini",
    decisionType: "Entity screening",
    inputHash: "f2a1...7d4c",
    outputHash: "4b9e...12a7",
    reviewer: "—",
    outcome: "Approved",
  },
  {
    ts: "2025-04-21 16:45",
    model: "claude-sonnet-4-6",
    decisionType: "EDD questionnaire generation",
    inputHash: "c5f3...8b2d",
    outputHash: "9a4c...f33e",
    reviewer: "—",
    outcome: "Approved",
  },
  {
    ts: "2025-04-20 10:20",
    model: "Sentence-BERT",
    decisionType: "Name matching",
    inputHash: "7d8a...2c1f",
    outputHash: "1e5b...9d3c",
    reviewer: "—",
    outcome: "Approved",
  },
];

const BIAS_SEGMENTS = [
  { segment: "Individual entities", fprPct: 8.2, target: 10, note: "Within target" },
  { segment: "Organisational entities", fprPct: 14.7, target: 10, note: "Exceeds target — amber" },
  { segment: "PEP entities", fprPct: 31.4, target: 40, note: "Elevated, expected for high-risk segment" },
  { segment: "Sanctioned individuals", fprPct: 98.3, target: 100, note: "Correct — sanctions hits should alert" },
  { segment: "DPMS customers (gold)", fprPct: 6.1, target: 10, note: "Within target" },
  { segment: "Crypto VASP counterparties", fprPct: 19.2, target: 10, note: "Exceeds target — amber" },
];

interface UNESCOPrinciple {
  num: number;
  title: string;
  description: string;
  status: PrincipleStatus;
  gap?: string;
}

const UNESCO_PRINCIPLES: UNESCOPrinciple[] = [
  {
    num: 1,
    title: "Proportionality & Do No Harm",
    description:
      "AI systems should only be used for legitimate purposes, with risks proportionate to benefits. AI must avoid harm to individuals and society.",
    status: "compliant",
  },
  {
    num: 2,
    title: "Safety & Security",
    description:
      "AI systems must be technically secure and safe, including against adversarial attacks. Risks should be assessed throughout the lifecycle.",
    status: "compliant",
  },
  {
    num: 3,
    title: "Fairness & Non-discrimination",
    description:
      "AI systems must not discriminate on prohibited grounds. Bias testing and monitoring must be ongoing.",
    status: "partial",
    gap: "Disparity ratio 1.8× for individual vs. organisational entities — approaching 2× alert threshold. Monthly monitoring cadence not yet in place.",
  },
  {
    num: 4,
    title: "Sustainability",
    description:
      "AI systems should be assessed for environmental impact and contribute to sustainable development goals.",
    status: "compliant",
  },
  {
    num: 5,
    title: "Right to Privacy & Data Protection",
    description:
      "AI must respect privacy rights. Personal data used in AI must be handled in compliance with data protection law.",
    status: "compliant",
  },
  {
    num: 6,
    title: "Human Oversight & Determination",
    description:
      "Humans must retain meaningful oversight and the ability to override AI decisions, especially for high-stakes outcomes.",
    status: "compliant",
  },
  {
    num: 7,
    title: "Transparency & Explainability",
    description:
      "AI decision-making must be explainable to those affected. System capabilities and limitations must be clearly communicated.",
    status: "compliant",
  },
  {
    num: 8,
    title: "Responsibility & Accountability",
    description:
      "Clear accountability chains for AI outcomes must exist. Incident response processes must be defined and enforced.",
    status: "partial",
    gap: "AI incident response SLA tiers not yet formally defined. 2 open incidents lack documented resolution timelines.",
  },
  {
    num: 9,
    title: "Awareness & Literacy",
    description:
      "Stakeholders must be educated on AI capabilities and limitations. Staff training programmes required.",
    status: "compliant",
  },
  {
    num: 10,
    title: "Multi-stakeholder & Adaptive Governance",
    description:
      "AI governance should involve diverse stakeholders including external experts, civil society, and regulators.",
    status: "partial",
    gap: "No external AI ethics review panel established. Governance decisions currently confined to internal stakeholders.",
  },
  {
    num: 11,
    title: "International Cooperation",
    description:
      "AI governance frameworks should align with international standards and promote cross-border cooperation.",
    status: "compliant",
  },
];

// ─── localStorage helpers ────────────────────────────────────────────────────

const MODELS_KEY = "hawkeye.ai.models.v1";
const INCIDENTS_KEY = "hawkeye.ai.incidents.v1";

function loadModelsOverlay(): ModelsOverlay {
  try {
    const raw = localStorage.getItem(MODELS_KEY);
    if (raw) return { deletedIds: [], customModels: [], ...(JSON.parse(raw) as Partial<ModelsOverlay>) };
  } catch (err) {
    console.warn("[hawkeye] responsible-ai models overlay parse failed:", err);
  }
  return { deletedIds: [], customModels: [] };
}

function saveModelsOverlay(o: ModelsOverlay): void {
  try { localStorage.setItem(MODELS_KEY, JSON.stringify(o)); }
  catch (err) {
    console.error("[hawkeye] responsible-ai models overlay persist failed — model edits will be lost:", err);
  }
}

function loadIncidentsOverlay(): IncidentsOverlay {
  try {
    const raw = localStorage.getItem(INCIDENTS_KEY);
    if (raw) return { deletedIds: [], customIncidents: [], statusPatches: {}, ...(JSON.parse(raw) as Partial<IncidentsOverlay>) };
  } catch (err) {
    console.warn("[hawkeye] responsible-ai incidents overlay parse failed:", err);
  }
  return { deletedIds: [], customIncidents: [], statusPatches: {} };
}

function saveIncidentsOverlay(o: IncidentsOverlay): void {
  try { localStorage.setItem(INCIDENTS_KEY, JSON.stringify(o)); }
  catch (err) {
    console.error("[hawkeye] responsible-ai incidents overlay persist failed — incident edits will be lost:", err);
  }
}

function nowDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Shared input class ───────────────────────────────────────────────────────

const iCls =
  "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

// ─── Status badges ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PrincipleStatus }) {
  const map: Record<PrincipleStatus, { cls: string; label: string }> = {
    compliant: { cls: "bg-green-dim text-green", label: "Compliant" },
    partial: { cls: "bg-amber-dim text-amber", label: "Partial" },
    gap: { cls: "bg-red-dim text-red", label: "Gap" },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${cls}`}>
      {label}
    </span>
  );
}

function RiskTierBadge({ tier }: { tier: RiskTier }) {
  const map: Record<RiskTier, string> = {
    High: "bg-red-dim text-red",
    Medium: "bg-amber-dim text-amber",
    Low: "bg-green-dim text-green",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${map[tier]}`}>
      {tier}
    </span>
  );
}

function SeverityBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    Critical: "bg-red-dim text-red",
    High: "bg-red-dim text-red",
    Medium: "bg-amber-dim text-amber",
    Low: "bg-green-dim text-green",
    info: "bg-blue-dim text-blue",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${map[sev] ?? "bg-bg-2 text-ink-2"}`}>
      {sev}
    </span>
  );
}

function OpenBadge({ open }: { open: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${open ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>
      {open ? "Open" : "Closed"}
    </span>
  );
}

// ─── Tab: UNESCO Principles ──────────────────────────────────────────────────

function PrinciplesTab() {
  const compliantCount = UNESCO_PRINCIPLES.filter((p) => p.status === "compliant").length;
  const partialCount = UNESCO_PRINCIPLES.filter((p) => p.status === "partial").length;
  const gapCount = UNESCO_PRINCIPLES.filter((p) => p.status === "gap").length;

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Compliant</span>
          <span className="text-20 font-semibold font-mono text-green">{compliantCount}</span>
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Partial</span>
          <span className="text-20 font-semibold font-mono text-amber">{partialCount}</span>
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Gap</span>
          <span className="text-20 font-semibold font-mono text-red">{gapCount}</span>
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Total principles</span>
          <span className="text-20 font-semibold font-mono text-ink-0">{UNESCO_PRINCIPLES.length}</span>
        </div>
      </div>

      <div className="space-y-3">
        {UNESCO_PRINCIPLES.map((p) => (
          <div key={p.num} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center">
                <span className="text-10 font-mono font-semibold text-brand">{p.num}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-14 font-semibold text-ink-0">
                    P{p.num} — {p.title}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-12 text-ink-2 leading-relaxed mb-0">{p.description}</p>
                {p.gap && (
                  <div className="mt-2 flex items-start gap-1.5 bg-amber-dim/40 border border-amber/20 rounded px-3 py-2">
                    <span className="text-amber text-11 font-mono flex-shrink-0 mt-0.5">!</span>
                    <p className="text-11 text-amber leading-snug mb-0">{p.gap}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Model Registry ──────────────────────────────────────────────────────

function AddModelForm({ onAdd, onCancel }: { onAdd: (m: AIModel) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [riskTier, setRiskTier] = useState<RiskTier>("Medium");
  const [purpose, setPurpose] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!name.trim() || !purpose.trim()) {
      setErr("Name and Purpose are required.");
      return;
    }
    const today = nowDateStr().split("-").reverse().join("/");
    onAdd({
      id: `m-custom-${Date.now()}`,
      name: name.trim(),
      version: version.trim() || "—",
      riskTier,
      purpose: purpose.trim(),
      biasAuditStatus: "Pending",
      lastReview: today,
      status: "Active",
    });
  };

  return (
    <div className="mt-4 bg-bg-panel border border-brand/20 rounded-xl p-5">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-3">Register new model</div>
      {err && <p className="text-11 text-red mb-2">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Model name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. claude-opus-4"
            className={iCls}
          />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Version</label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. 2024-09"
            className={iCls}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Risk tier</label>
          <select
            value={riskTier}
            onChange={(e) => setRiskTier(e.target.value as RiskTier)}
            className={iCls}
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Purpose *</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Risk scoring"
            className={iCls}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90"
        >
          Register
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ModelsTab() {
  const [overlay, setOverlay] = useState<ModelsOverlay>({ deletedIds: [], customModels: [] });
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setOverlay(loadModelsOverlay());
    setMounted(true);
  }, []);

  const models = [
    ...SEED_MODELS.filter((m) => !overlay.deletedIds.includes(m.id)),
    ...overlay.customModels,
  ];

  const patch = (next: ModelsOverlay) => {
    setOverlay(next);
    saveModelsOverlay(next);
  };

  const handleAdd = (m: AIModel) => {
    patch({ ...overlay, customModels: [...overlay.customModels, m] });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (SEED_MODELS.some((m) => m.id === id)) {
      patch({ ...overlay, deletedIds: [...overlay.deletedIds, id] });
    } else {
      patch({ ...overlay, customModels: overlay.customModels.filter((m) => m.id !== id) });
    }
  };

  if (!mounted) return null;

  return (
    <div>
      <div className="flex justify-between items-start mb-4 gap-4">
        <p className="text-12 text-ink-2 max-w-[60ch]">
          All AI models used in Hawkeye Sterling DPMS must be registered. High-risk models require
          annual bias audit and model card review per EU AI Act Annex IV.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex-shrink-0 text-11 font-semibold px-3 py-1.5 rounded border border-brand text-brand hover:bg-brand-dim"
        >
          + Register model
        </button>
      </div>

      {showForm && <AddModelForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />}

      <div className="mt-4 bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full text-12">
          <thead>
            <tr className="border-b border-hair-2 bg-bg-1">
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Model</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Version</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Risk Tier</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Purpose</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Bias Audit</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Last Review</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Status</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair-2">
            {models.map((m) => (
              <tr key={m.id} className="hover:bg-bg-1/50 transition-colors">
                <td className="px-4 py-3 font-mono text-12 text-ink-0 font-semibold">{m.name}</td>
                <td className="px-3 py-3 font-mono text-11 text-ink-2">{m.version}</td>
                <td className="px-3 py-3">
                  <RiskTierBadge tier={m.riskTier} />
                </td>
                <td className="px-3 py-3 text-12 text-ink-1 max-w-[200px]">{m.purpose}</td>
                <td className="px-3 py-3 text-12">
                  <span className={m.biasAuditStatus.toLowerCase().includes("overdue") ? "text-amber" : "text-green"}>
                    {m.biasAuditStatus}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-11 text-ink-2">{m.lastReview}</td>
                <td className="px-3 py-3">
                  <span className="bg-green-dim text-green inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3">
                    {m.status}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="text-10 text-ink-3 hover:text-red transition-colors px-2 py-1 rounded hover:bg-red-dim"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {models.length === 0 && (
          <div className="px-4 py-8 text-center text-12 text-ink-3">
            No models registered. Use the button above to register your first model.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Incident Log ───────────────────────────────────────────────────────

function AddIncidentForm({
  onAdd,
  onCancel,
}: {
  onAdd: (i: AIIncident) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("Medium");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!title.trim() || !model.trim()) {
      setErr("Title and model are required.");
      return;
    }
    onAdd({
      id: `INC-AI-${String(Date.now()).slice(-4)}`,
      date: nowDateStr(),
      severity,
      title: title.trim(),
      model: model.trim(),
      open: true,
      notes: description.trim(),
    });
  };

  return (
    <div className="mt-4 bg-bg-panel border border-brand/20 rounded-xl p-5">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-3">Log new incident</div>
      {err && <p className="text-11 text-red mb-2">{err}</p>}
      <div className="mb-3">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Incident title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief description of the incident"
          className={iCls}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            className={iCls}
          >
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Model *</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. claude-haiku-4-5"
            className={iCls}
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
          Notes / remediation actions
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90"
        >
          Log incident
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function IncidentsTab() {
  const [overlay, setOverlay] = useState<IncidentsOverlay>({
    deletedIds: [],
    customIncidents: [],
    statusPatches: {},
  });
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setOverlay(loadIncidentsOverlay());
    setMounted(true);
  }, []);

  const incidents = [
    ...SEED_INCIDENTS.filter((i) => !overlay.deletedIds.includes(i.id)).map((i) => ({
      ...i,
      open: i.id in overlay.statusPatches ? (overlay.statusPatches[i.id] ?? i.open) : i.open,
    })),
    ...overlay.customIncidents.map((i) => ({
      ...i,
      open: i.id in overlay.statusPatches ? (overlay.statusPatches[i.id] ?? i.open) : i.open,
    })),
  ];

  const patch = (next: IncidentsOverlay) => {
    setOverlay(next);
    saveIncidentsOverlay(next);
  };

  const handleAdd = (inc: AIIncident) => {
    patch({ ...overlay, customIncidents: [...overlay.customIncidents, inc] });
    setShowForm(false);
  };

  const handleToggle = (id: string) => {
    const current = incidents.find((i) => i.id === id)?.open ?? true;
    patch({ ...overlay, statusPatches: { ...overlay.statusPatches, [id]: !current } });
  };

  const handleDelete = (id: string) => {
    if (SEED_INCIDENTS.some((i) => i.id === id)) {
      patch({ ...overlay, deletedIds: [...overlay.deletedIds, id] });
    } else {
      patch({ ...overlay, customIncidents: overlay.customIncidents.filter((i) => i.id !== id) });
    }
  };

  if (!mounted) return null;

  const openCount = incidents.filter((i) => i.open).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4">
          <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex flex-col gap-0.5">
            <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Open incidents</span>
            <span className={`text-18 font-semibold font-mono ${openCount > 0 ? "text-amber" : "text-green"}`}>
              {openCount}
            </span>
          </div>
          <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex flex-col gap-0.5">
            <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Total logged</span>
            <span className="text-18 font-semibold font-mono text-ink-0">{incidents.length}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="text-11 font-semibold px-3 py-1.5 rounded border border-brand text-brand hover:bg-brand-dim"
        >
          + Log incident
        </button>
      </div>

      {showForm && <AddIncidentForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />}

      <div className="mt-4 bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full text-12">
          <thead>
            <tr className="border-b border-hair-2 bg-bg-1">
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">ID</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Date</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Severity</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Title</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Model</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Status</th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">Notes</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair-2">
            {incidents.map((inc) => (
              <tr key={inc.id} className="hover:bg-bg-1/50 transition-colors">
                <td className="px-4 py-3 font-mono text-11 text-brand font-semibold">{inc.id}</td>
                <td className="px-3 py-3 font-mono text-11 text-ink-2">{inc.date}</td>
                <td className="px-3 py-3">
                  <SeverityBadge sev={inc.severity} />
                </td>
                <td className="px-3 py-3 text-12 text-ink-0 max-w-[220px]">{inc.title}</td>
                <td className="px-3 py-3 font-mono text-11 text-ink-2">{inc.model}</td>
                <td className="px-3 py-3">
                  <OpenBadge open={inc.open} />
                </td>
                <td className="px-3 py-3 text-11 text-ink-2 max-w-[200px]">{inc.notes}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(inc.id)}
                      className="text-10 text-ink-3 hover:text-brand transition-colors px-2 py-1 rounded hover:bg-brand-dim"
                    >
                      {inc.open ? "Close" : "Reopen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(inc.id)}
                      className="text-10 text-ink-3 hover:text-red transition-colors px-2 py-1 rounded hover:bg-red-dim"
                    >
                      Del
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {incidents.length === 0 && (
          <div className="px-4 py-8 text-center text-12 text-ink-3">No incidents logged.</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Bias Monitoring ─────────────────────────────────────────────────────

function FprBar({ fprPct, target }: { fprPct: number; target: number }) {
  const clampedPct = Math.min(fprPct, 100);
  const isSanctionLike = target >= 90;
  const color = isSanctionLike
    ? "bg-blue"
    : fprPct <= 10
      ? "bg-green"
      : fprPct <= 20
        ? "bg-amber"
        : "bg-red";

  const targetLinePos = isSanctionLike ? null : target;

  return (
    <div className="mt-2">
      <div className="relative w-full h-2.5 bg-bg-2 rounded-full overflow-visible">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${clampedPct}%` }}
        />
        {targetLinePos !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-ink-2/50"
            style={{ left: `${targetLinePos}%` }}
          />
        )}
      </div>
    </div>
  );
}

function BiasTab() {
  // Disparity ratio: max/min among non-PEP, non-sanctioned segments
  // Standard segments: Individual 8.2, Org 14.7, DPMS 6.1, Crypto 19.2
  // Per spec: 14.7 / 6.1 = 2.41
  const disparityRatio = (14.7 / 6.1).toFixed(2);
  const disparityExceeds = parseFloat(disparityRatio) > 2.0;

  return (
    <div>
      <p className="text-12 text-ink-2 leading-relaxed max-w-prose mb-5">
        False-positive rate (FPR) monitoring by entity segment. Target ≤10% for standard segments.
        PEP and sanctioned segments are expected to have elevated FPR due to enhanced screening.
        Disparity ratio (max FPR ÷ min FPR, excluding PEP and sanctioned segments) must remain below
        2.0×.
      </p>

      {disparityExceeds && (
        <div className="mb-5 flex items-start gap-2 bg-red-dim border border-red/30 rounded-lg px-4 py-3">
          <span className="text-red font-mono text-14 flex-shrink-0 mt-0.5">▲</span>
          <div>
            <p className="text-12 font-semibold text-red mb-0.5">
              Disparity ratio {disparityRatio}× — EXCEEDS 2× ALERT THRESHOLD
            </p>
            <p className="text-11 text-red/80 mb-0">
              Max non-PEP FPR (Organisational entities: 14.7%) ÷ Min non-PEP FPR (DPMS customers:
              6.1%) = {disparityRatio}×. Bias re-calibration required. Escalate to MLRO.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BIAS_SEGMENTS.map((seg) => {
          const isSanctionLike = seg.target >= 90;
          const isOver = !isSanctionLike && seg.fprPct > seg.target;
          const fprColor = isSanctionLike
            ? "text-blue"
            : seg.fprPct <= 10
              ? "text-green"
              : seg.fprPct <= 20
                ? "text-amber"
                : "text-red";

          return (
            <div
              key={seg.segment}
              className={`bg-bg-panel border rounded-lg p-4 ${isOver ? "border-amber/40" : "border-hair-2"}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-13 font-semibold text-ink-0 pr-2">{seg.segment}</span>
                <span className={`text-18 font-mono font-semibold flex-shrink-0 ${fprColor}`}>
                  {seg.fprPct}%
                </span>
              </div>
              <FprBar fprPct={seg.fprPct} target={seg.target} />
              <div className="flex justify-between items-center mt-2">
                <span className="text-10 text-ink-3 font-mono">
                  {seg.target < 50 ? `Target ≤${seg.target}%` : `Expected ≥${seg.target - 20}%`}
                </span>
                <span className={`text-10 font-medium ${isOver ? "text-amber" : "text-ink-3"}`}>
                  {seg.note}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 bg-bg-panel border border-hair-2 rounded-lg px-4 py-3">
        <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-2">Legend</div>
        <div className="flex flex-wrap gap-4 text-11 text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-green inline-block" /> ≤10% — Within target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-amber inline-block" /> 10–20% — Exceeds target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-red inline-block" /> &gt;20% — Elevated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-blue inline-block" /> ≥90% — Expected (sanctions)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-px h-3 bg-ink-2/50 inline-block" /> Target line
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Audit Trail ─────────────────────────────────────────────────────────

function AuditTrailTab() {
  const humanReviewed = AUDIT_TRAIL.filter((r) => r.reviewer !== "Auto").length;
  const autoApproved = AUDIT_TRAIL.filter((r) => r.reviewer === "Auto").length;

  return (
    <div>
      <div className="flex gap-4 mb-5">
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Total logged</span>
          <span className="text-18 font-semibold font-mono text-ink-0">{AUDIT_TRAIL.length}</span>
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Human reviewed</span>
          <span className="text-18 font-semibold font-mono text-brand">{humanReviewed}</span>
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Auto-approved</span>
          <span className="text-18 font-semibold font-mono text-ink-2">{autoApproved}</span>
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Retention policy</span>
          <span className="text-18 font-semibold font-mono text-green">10 yr</span>
        </div>
      </div>

      <p className="text-11 text-ink-3 mb-3 font-mono">
        Read-only immutable log. FDL 10/2025 Art.24 — all AI decisions retained 10 years. Showing{" "}
        {AUDIT_TRAIL.length} most recent events.
      </p>

      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full text-12">
          <thead>
            <tr className="border-b border-hair-2 bg-bg-1">
              <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Timestamp
              </th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Model
              </th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Decision type
              </th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Input hash
              </th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Output hash
              </th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Human reviewer
              </th>
              <th className="text-left px-3 py-2.5 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                Outcome
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair-2">
            {AUDIT_TRAIL.map((row, i) => (
              <tr key={i} className="hover:bg-bg-1/50 transition-colors">
                <td className="px-4 py-3 font-mono text-11 text-ink-2">{row.ts}</td>
                <td className="px-3 py-3 font-mono text-11 text-brand">{row.model}</td>
                <td className="px-3 py-3 text-12 text-ink-1">{row.decisionType}</td>
                <td className="px-3 py-3 font-mono text-11 text-ink-3">{row.inputHash}</td>
                <td className="px-3 py-3 font-mono text-11 text-ink-3">{row.outputHash}</td>
                <td className="px-3 py-3 text-12 text-ink-1">{row.reviewer}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${
                      row.outcome === "Approved"
                        ? "bg-green-dim text-green"
                        : row.outcome === "Overridden"
                          ? "bg-amber-dim text-amber"
                          : "bg-bg-2 text-ink-2"
                    }`}
                  >
                    {row.outcome}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── UNESCO principle status data (main branch) ───────────────────────────────

type PrincipleStatusSimple = "Implemented" | "Partial" | "In Progress";

interface Principle {
  num: number;
  name: string;
  status: PrincipleStatusSimple;
  detail: string;
}

const PRINCIPLES: Principle[] = [
  { num: 1, name: "Proportionality & Do No Harm", status: "Implemented", detail: "All AI is advisory only; human makes final decision" },
  { num: 2, name: "Safety & Security", status: "Implemented", detail: "AI graceful degradation; no AI in life/death decisions" },
  { num: 3, name: "Fairness & Non-Discrimination", status: "Partial", detail: "Smart Disambiguator reduces false positives; bias monitoring active" },
  { num: 4, name: "Sustainability", status: "In Progress", detail: "Haiku model used (lowest energy); monitoring planned" },
  { num: 5, name: "Privacy & Data Protection", status: "Implemented", detail: "Minimum necessary data sent to AI; audit trail immutable" },
  { num: 6, name: "Human Oversight & Determination", status: "Implemented", detail: "Every AI output requires human review; override logging active" },
  { num: 7, name: "Transparency & Explainability", status: "Implemented", detail: "Every AI decision shows reasoning; model disclosed below" },
  { num: 8, name: "Responsibility & Accountability", status: "Implemented", detail: "All AI decisions audit-logged with operator identity" },
  { num: 9, name: "Awareness & Literacy", status: "Partial", detail: "Playbook + training module active; AI ethics training in development" },
  { num: 10, name: "Multi-stakeholder Governance", status: "In Progress", detail: "MLRO + Board oversight of AI; regulator access via Inspection Room" },
];

// ── AI System Registry ────────────────────────────────────────────────────────

interface AiSystem {
  component: string;
  model: string;
  purpose: string;
  dataProcessed: string;
  limitations: string;
}

const AI_REGISTRY: AiSystem[] = [
  { component: "MLRO Advisor", model: "claude-haiku-4-5-20251001", purpose: "Compliance Q&A, escalation decisions", dataProcessed: "Case facts, regulatory context", limitations: "May not reflect latest UAE regulatory updates" },
  { component: "Screening Brief", model: "claude-haiku-4-5-20251001", purpose: "Risk narrative generation", dataProcessed: "Subject name, nationality, risk score", limitations: "Cannot access live sanctions databases" },
  { component: "Smart Disambiguator", model: "claude-haiku-4-5-20251001", purpose: "Hit resolution for common names", dataProcessed: "Client profile, screening hit details", limitations: "Relies on provided data quality" },
  { component: "Typology Matcher", model: "claude-haiku-4-5-20251001", purpose: "FATF typology identification", dataProcessed: "Transaction facts, red flags", limitations: "Pattern matching only; not legal advice" },
  { component: "False Positive Assessor", model: "claude-haiku-4-5-20251001", purpose: "Hit disambiguation", dataProcessed: "Client vs. hit metadata", limitations: "Cannot verify external database records" },
  { component: "PEP Network Intelligence", model: "claude-haiku-4-5-20251001", purpose: "PEP relationship mapping", dataProcessed: "PEP name, role, country", limitations: "Knowledge cutoff applies" },
  { component: "Sanctions Nexus", model: "claude-haiku-4-5-2025101", purpose: "Indirect sanctions exposure", dataProcessed: "Transaction details", limitations: "Does not access live OFAC/UN list APIs" },
  { component: "Name Variant Generator", model: "claude-haiku-4-5-20251001", purpose: "Alias/transliteration generation", dataProcessed: "Subject name, nationality", limitations: "Probabilistic — not exhaustive" },
  { component: "EWRA Board Report", model: "claude-haiku-4-5-20251001", purpose: "Risk assessment narrative", dataProcessed: "Risk dimension scores", limitations: "Annual review required" },
  { component: "Adverse Media Assessment", model: "claude-haiku-4-5-20251001", purpose: "Threat profile synthesis", dataProcessed: "Media findings, categories", limitations: "Based on provided media data only" },
];

function statusClass(status: PrincipleStatusSimple): string {
  switch (status) {
    case "Implemented": return "bg-green-dim text-green";
    case "Partial":     return "bg-amber-dim text-amber";
    case "In Progress": return "bg-blue-500/10 text-blue-500";
  }
}

const RAO_STORAGE = "hawkeye.rao.name";
const RAO_DEFAULT = "MLRO - Luisa Fernanda";

// ─── Ethics Assessment Panel ──────────────────────────────────────────────────

function EthicsAssessmentPanel({
  result,
  onClose,
}: {
  result: EthicsAssessmentResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const scoreColor =
    result.overallScore >= 85
      ? "text-green"
      : result.overallScore >= 70
        ? "text-brand"
        : result.overallScore >= 50
          ? "text-amber"
          : "text-red";

  const ratingBadge: Record<string, string> = {
    exemplary: "bg-green-dim text-green",
    good: "bg-blue-dim text-blue",
    adequate: "bg-amber-dim text-amber",
    "needs-improvement": "bg-red-dim text-red",
    critical: "bg-red-dim text-red",
  };

  const sevBadge: Record<string, string> = {
    critical: "bg-red-dim text-red",
    high: "bg-red-dim text-red",
    medium: "bg-amber-dim text-amber",
    low: "bg-green-dim text-green",
    info: "bg-blue-dim text-blue",
  };

  const copyToClipboard = () => {
    const text = [
      "AI Ethics Assessment — Hawkeye Sterling DPMS",
      `Overall Score: ${result.overallScore}/100`,
      `Rating: ${result.rating}`,
      `UNESCO Compliance: ${result.unescoCompliancePct}%`,
      "",
      "Summary:",
      result.summary,
      "",
      "Findings:",
      ...result.findings.map(
        (f) => `[${f.severity.toUpperCase()}] ${f.area}: ${f.observation} → ${f.recommendation}`,
      ),
      "",
      "Strengths:",
      ...result.strengths.map((s) => `• ${s}`),
      "",
      "Priorities:",
      ...result.priorities.map((p) => `• ${p}`),
      "",
      `Next review: ${result.nextReviewDate}`,
    ].join("\n");

    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-6 bg-bg-panel border border-brand/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-hair-2 px-5 py-4 flex items-center justify-between bg-bg-1">
        <div className="flex items-center gap-3">
          <span className="text-brand text-14">✦</span>
          <span className="text-13 font-semibold text-ink-0">AI Ethics Assessment Result</span>
        </div>
        <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink-1 text-14 px-2">
          ✕
        </button>
      </div>

      <div className="p-5">
        {/* Score row */}
        <div className="flex items-end gap-8 mb-5 flex-wrap">
          <div>
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Overall score</div>
            <span className={`text-56 font-mono font-semibold leading-none ${scoreColor}`}>
              {result.overallScore}
            </span>
            <span className="text-20 text-ink-3 font-mono">/100</span>
          </div>
          <div className="pb-1">
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Rating</div>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded text-11 font-semibold uppercase tracking-wide-3 ${ratingBadge[result.rating] ?? "bg-bg-2 text-ink-2"}`}
            >
              {result.rating.replace("-", " ")}
            </span>
          </div>
          <div className="pb-1">
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              UNESCO compliance
            </div>
            <span className="text-32 font-mono font-semibold text-brand">
              {result.unescoCompliancePct}%
            </span>
          </div>
          <div className="pb-1">
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Next review</div>
            <span className="text-14 font-mono text-ink-1">{result.nextReviewDate}</span>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-5">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-2">
            Executive summary
          </div>
          <p className="text-12 text-ink-1 leading-relaxed border-l-2 border-brand pl-3 mb-0">
            {result.summary}
          </p>
        </div>

        {/* Findings table */}
        <div className="mb-5">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-2">Findings</div>
          <div className="bg-bg-1 border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-12">
              <thead>
                <tr className="border-b border-hair-2">
                  <th className="text-left px-3 py-2 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                    Area
                  </th>
                  <th className="text-left px-3 py-2 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                    Observation
                  </th>
                  <th className="text-left px-3 py-2 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                    Severity
                  </th>
                  <th className="text-left px-3 py-2 text-10 font-mono uppercase tracking-wide-3 text-ink-3">
                    Recommendation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {result.findings.map((f, i) => (
                  <tr key={i} className="hover:bg-bg-2/40">
                    <td className="px-3 py-2.5 text-12 font-semibold text-ink-0 align-top">{f.area}</td>
                    <td className="px-3 py-2.5 text-11 text-ink-2 align-top max-w-[200px]">
                      {f.observation}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${sevBadge[f.severity] ?? "bg-bg-2 text-ink-2"}`}
                      >
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-11 text-ink-2 align-top max-w-[200px]">
                      {f.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Strengths & Priorities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div>
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-2">Strengths</div>
            <ul className="space-y-1.5">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                  <span className="text-green flex-shrink-0 mt-0.5">●</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-2">Priorities</div>
            <ul className="space-y-1.5">
              {result.priorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                  <span className="text-amber flex-shrink-0 mt-0.5">●</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-hair-2 pt-3 flex justify-end">
          <button
            type="button"
            onClick={copyToClipboard}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2"
          >
            {copied ? "✓ Copied!" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResponsibleAIPage() {
  const [tab, setTab] = useState<Tab>("principles");
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<EthicsAssessmentResult | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // RAO state (from main branch)
  const [raoName, setRaoName] = useState<string>(RAO_DEFAULT);
  const [draftRao, setDraftRao] = useState<string>(RAO_DEFAULT);
  const [aiAuditEvents, setAiAuditEvents] = useState<AuditEntry[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RAO_STORAGE);
      if (stored) { setRaoName(stored); setDraftRao(stored); }
    } catch { /* localStorage unavailable */ }
    const entries = loadAuditEntries();
    setAiAuditEvents(entries.filter((e) => e.action.startsWith("ai.")).slice(-5).reverse());
  }, []);

  const saveRao = () => {
    const name = draftRao.trim() || RAO_DEFAULT;
    setRaoName(name);
    try { window.localStorage.setItem(RAO_STORAGE, name); } catch { /* ignore */ }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "principles", label: "🧭 Principles" },
    { key: "models", label: "🤖 Model Registry" },
    { key: "incidents", label: "🚨 Incident Log" },
    { key: "bias", label: "⚖️ Bias Monitoring" },
    { key: "audit-trail", label: "🔒 AI Audit Trail" },
  ];

  const runAssessment = async () => {
    setAssessmentLoading(true);
    setAssessmentError(null);
    try {
      const modelsOverlay = loadModelsOverlay();
      const incidentsOverlay = loadIncidentsOverlay();

      const models = [
        ...SEED_MODELS.filter((m) => !modelsOverlay.deletedIds.includes(m.id)),
        ...modelsOverlay.customModels,
      ].map((m) => ({
        name: m.name,
        riskTier: m.riskTier,
        purpose: m.purpose,
        biasAuditStatus: m.biasAuditStatus,
      }));

      const incidents = [
        ...SEED_INCIDENTS.filter((i) => !incidentsOverlay.deletedIds.includes(i.id)).map((i) => ({
          ...i,
          open:
            i.id in incidentsOverlay.statusPatches
              ? (incidentsOverlay.statusPatches[i.id] ?? i.open)
              : i.open,
        })),
        ...incidentsOverlay.customIncidents,
      ].map((i) => ({ type: i.title, severity: i.severity, model: i.model }));

      const biasData = BIAS_SEGMENTS.map((s) => ({
        segment: s.segment,
        fprPct: s.fprPct,
      }));

      const res = await fetch("/api/ai-ethics-assessment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ models, incidents, biasData }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EthicsAssessmentResult & { ok?: boolean };
      setAssessmentResult(data);
    } catch (e) {
      setAssessmentError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAssessmentLoading(false);
    }
  };

  return (
    <ModuleLayout engineLabel="AI governance engine" asanaModule="responsible-ai" asanaLabel="Responsible AI">
      <ModuleHero
        eyebrow="Module 27 · AI Governance"
        title="Responsible AI"
        titleEm="governance."
        intro={
          <>
            <strong>Framework:</strong> UNESCO Recommendation on the Ethics of AI (2021) · EU AI Act ·
            UAE AI Strategy 2031. Human oversight mandatory for all adverse customer dispositions. All
            AI decisions logged with 10-year retention (FDL 10/2025 Art.24).
          </>
        }
        kpis={[
          { value: "4", label: "Models registered" },
          { value: "2", label: "Incidents open", tone: "amber" },
          { value: "3", label: "Bias audits completed" },
          { value: "82%", label: "UNESCO compliance" },
        ]}
      />

      {/* Ethics Assessment CTA */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => void runAssessment()}
          disabled={assessmentLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-14">✦</span>
          {assessmentLoading ? "Running ethics assessment…" : "Run AI Ethics Assessment"}
        </button>
        {assessmentError && (
          <p className="mt-2 text-11 text-red">Assessment failed: {assessmentError}</p>
        )}
      </div>

      {/* Assessment result panel */}
      {assessmentResult && (
        <EthicsAssessmentPanel result={assessmentResult} onClose={() => setAssessmentResult(null)} />
      )}

      {/* Tab navigation */}
      <div className="border-b border-hair-2 flex gap-0 mt-6 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-12 font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-brand text-brand bg-brand-dim"
                : "border-transparent text-ink-2 hover:text-ink-1 hover:border-hair-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "principles" && <PrinciplesTab />}
      {tab === "models" && <ModelsTab />}
      {tab === "incidents" && <IncidentsTab />}
      {tab === "bias" && <BiasTab />}
      {tab === "audit-trail" && <AuditTrailTab />}

      {/* ── Section 1: UNESCO Alignment Status ── */}
      <section className="mt-6">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 1 · UNESCO Alignment Status
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PRINCIPLES.map((p) => (
            <div
              key={p.num}
              className="bg-bg-panel border border-hair-2 rounded-lg p-3 flex flex-col gap-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-10 font-mono text-ink-3">P{p.num}</span>
                <span className={`text-9 font-semibold uppercase tracking-wide-2 px-1.5 py-0.5 rounded ${statusClass(p.status)}`}>
                  {p.status}
                </span>
              </div>
              <div className="text-11 font-semibold text-ink-0 leading-snug">{p.name}</div>
              <div className="text-10.5 text-ink-3 leading-relaxed">{p.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 2: AI System Registry ── */}
      <section className="mt-8">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 2 · AI System Registry (Model Disclosure)
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-x-auto">
          <table className="w-full text-12 border-collapse">
            <thead>
              <tr className="border-b border-hair-2 bg-bg-1">
                <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 px-4 py-2.5">Component</th>
                <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 px-4 py-2.5">Model</th>
                <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 px-4 py-2.5">Purpose</th>
                <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 px-4 py-2.5">Data Processed</th>
                <th className="text-left text-10 font-semibold uppercase tracking-wide-3 text-ink-3 px-4 py-2.5">Limitations</th>
              </tr>
            </thead>
            <tbody>
              {AI_REGISTRY.map((sys, i) => (
                <tr
                  key={sys.component}
                  className={`border-b border-hair-2 last:border-b-0 ${i % 2 === 0 ? "" : "bg-bg-1/40"}`}
                >
                  <td className="px-4 py-2.5 font-semibold text-ink-0 whitespace-nowrap">{sys.component}</td>
                  <td className="px-4 py-2.5 font-mono text-10.5 text-ink-2 whitespace-nowrap">{sys.model}</td>
                  <td className="px-4 py-2.5 text-ink-1">{sys.purpose}</td>
                  <td className="px-4 py-2.5 text-ink-2">{sys.dataProcessed}</td>
                  <td className="px-4 py-2.5 text-ink-3 italic">{sys.limitations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-10.5 text-ink-3 mt-2 leading-relaxed">
          Provider: Anthropic PBC. Data is <strong>NOT</strong> used for model training per Anthropic API terms.
        </p>
      </section>

      {/* ── Section 3: Human Override Policy ── */}
      <section className="mt-8">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 3 · Human Override Policy
        </div>
        <div className="bg-bg-panel border border-brand/30 rounded-xl p-5 space-y-2">
          <div className="text-13 font-semibold text-ink-0">AI is advisory only — humans decide</div>
          <ul className="text-12 text-ink-1 space-y-1.5 list-none p-0 m-0">
            <li className="flex gap-2 items-start">
              <span className="text-brand mt-0.5 shrink-0">▸</span>
              Every AI recommendation in this platform is advisory only.
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-brand mt-0.5 shrink-0">▸</span>
              The MLRO or designated analyst makes all final compliance decisions.
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-brand mt-0.5 shrink-0">▸</span>
              Overrides must be documented with reason (logged automatically via the AI Override API).
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-brand mt-0.5 shrink-0">▸</span>
              All AI-assisted decisions are recorded in the Audit Trail with the operator&apos;s identity.
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-red mt-0.5 shrink-0">▸</span>
              <span className="text-red font-medium">
                No AI decision can substitute for human judgment on STR filing, relationship exit, or sanctions freezes.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Section 4: Subject Rights ── */}
      <section className="mt-8">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 4 · Subject Rights Under AI-Assisted Screening
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
          <div className="text-12 text-ink-1 mb-3">
            Individuals subject to AI-assisted screening may request:
          </div>
          <ul className="text-12 text-ink-1 space-y-1.5 list-disc list-inside">
            <li>The fact that they were subject to AI-assisted screening</li>
            <li>The categories of data used in the AI assessment</li>
            <li>A human review of any AI-generated risk assessment</li>
            <li>Correction of inaccurate input data</li>
          </ul>
        </div>
      </section>

      {/* ── Section 5: Responsible AI Officer ── */}
      <section className="mt-8">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 5 · Responsible AI Officer
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-5 max-w-xl">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-12 font-semibold uppercase tracking-wide-2 text-ink-3 mb-0.5">Role</div>
              <div className="text-13 font-semibold text-ink-0">Chief Compliance Officer / MLRO</div>
              <div className="text-12 text-ink-2 mt-0.5">{raoName}</div>
            </div>
          </div>
          <div className="mb-4 space-y-1.5">
            <div className="text-11 font-semibold text-ink-2 uppercase tracking-wide-2">Responsibilities</div>
            <ul className="text-12 text-ink-1 space-y-1 list-disc list-inside">
              <li>AI governance oversight</li>
              <li>Bias monitoring</li>
              <li>Model review and re-certification</li>
              <li>Incident escalation and response</li>
            </ul>
          </div>
          {/* Editable RAO name */}
          <div className="border-t border-hair-2 pt-4">
            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">Update RAO name</div>
            <div className="flex gap-2">
              <input
                value={draftRao}
                onChange={(e) => setDraftRao(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveRao(); }}
                placeholder={RAO_DEFAULT}
                className="flex-1 text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={saveRao}
                className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: AI Incident Log ── */}
      <section className="mt-8">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 6 · AI Incident Log
        </div>
        <div className="bg-amber-dim border border-amber/30 rounded-lg p-4 mb-4">
          <div className="text-12 text-ink-1 leading-relaxed">
            AI incidents (errors, unexpected outputs, potential harms) should be reported via the{" "}
            <a href="/audit-trail" className="text-brand underline font-medium">Audit Trail</a>{" "}
            using action <code className="font-mono text-10.5 bg-bg-1 px-1 py-0.5 rounded">ai.incident</code>.
            They will be reviewed by the Responsible AI Officer within <strong>24 hours</strong>.
          </div>
        </div>
        {aiAuditEvents.length === 0 ? (
          <div className="text-12 text-ink-3 bg-bg-panel border border-hair-2 rounded-lg px-4 py-3">
            No AI audit events recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-11 text-ink-3 mb-1">Last 5 AI audit events:</div>
            {aiAuditEvents.map((e) => (
              <div
                key={e.id}
                className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap"
              >
                <span className="font-mono text-10 text-ink-3 shrink-0">
                  {new Date(e.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}
                </span>
                <span className="text-11 font-semibold text-brand-deep bg-brand-dim px-2 py-0.5 rounded">
                  {e.action}
                </span>
                <span className="text-12 text-ink-1">{e.target}</span>
                <span className="ml-auto text-10 text-ink-3 font-mono">{e.actor}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 7: Data Minimisation Statement ── */}
      <section className="mt-8 mb-6">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 7 · Data Minimisation Statement
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-dim border border-green/30 rounded-lg p-4">
            <div className="text-11 font-semibold uppercase tracking-wide-2 text-green mb-2">Sent to AI</div>
            <ul className="text-12 text-ink-1 space-y-1 list-disc list-inside">
              <li>Subject names</li>
              <li>Risk scores</li>
              <li>Nationalities</li>
              <li>Transaction descriptions</li>
              <li>Regulatory context</li>
            </ul>
          </div>
          <div className="bg-red-dim border border-red/30 rounded-lg p-4">
            <div className="text-11 font-semibold uppercase tracking-wide-2 text-red mb-2">NOT sent to AI</div>
            <ul className="text-12 text-ink-1 space-y-1 list-disc list-inside">
              <li>Full ID numbers</li>
              <li>Passport numbers</li>
              <li>Emirates IDs</li>
              <li>Biometric data</li>
              <li>Banking credentials</li>
            </ul>
          </div>
        </div>
        <div className="mt-3 bg-bg-panel border border-hair-2 rounded-lg p-4 space-y-1.5 text-12 text-ink-2">
          <div>
            <span className="font-semibold text-ink-1">Retention:</span>{" "}
            AI responses are not stored by Hawkeye; only the decision outcome is logged.
          </div>
          <div>
            <span className="font-semibold text-ink-1">Provider data processing:</span>{" "}
            Anthropic processes prompts transiently; no persistent storage per API terms.
          </div>
        </div>
      </section>
    </ModuleLayout>
  );
}
