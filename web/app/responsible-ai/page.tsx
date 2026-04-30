"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadAuditEntries, type AuditEntry } from "@/lib/audit";

// ── UNESCO principle data ────────────────────────────────────────────────────

type PrincipleStatus = "Implemented" | "Partial" | "In Progress";

interface Principle {
  num: number;
  name: string;
  status: PrincipleStatus;
  detail: string;
}

const PRINCIPLES: Principle[] = [
  {
    num: 1,
    name: "Proportionality & Do No Harm",
    status: "Implemented",
    detail: "All AI is advisory only; human makes final decision",
  },
  {
    num: 2,
    name: "Safety & Security",
    status: "Implemented",
    detail: "AI graceful degradation; no AI in life/death decisions",
  },
  {
    num: 3,
    name: "Fairness & Non-Discrimination",
    status: "Partial",
    detail: "Smart Disambiguator reduces false positives; bias monitoring active",
  },
  {
    num: 4,
    name: "Sustainability",
    status: "In Progress",
    detail: "Haiku model used (lowest energy); monitoring planned",
  },
  {
    num: 5,
    name: "Privacy & Data Protection",
    status: "Implemented",
    detail: "Minimum necessary data sent to AI; audit trail immutable",
  },
  {
    num: 6,
    name: "Human Oversight & Determination",
    status: "Implemented",
    detail: "Every AI output requires human review; override logging active",
  },
  {
    num: 7,
    name: "Transparency & Explainability",
    status: "Implemented",
    detail: "Every AI decision shows reasoning; model disclosed below",
  },
  {
    num: 8,
    name: "Responsibility & Accountability",
    status: "Implemented",
    detail: "All AI decisions audit-logged with operator identity",
  },
  {
    num: 9,
    name: "Awareness & Literacy",
    status: "Partial",
    detail: "Playbook + training module active; AI ethics training in development",
  },
  {
    num: 10,
    name: "Multi-stakeholder Governance",
    status: "In Progress",
    detail: "MLRO + Board oversight of AI; regulator access via Inspection Room",
  },
];

// ── AI System Registry ───────────────────────────────────────────────────────

interface AiSystem {
  component: string;
  model: string;
  purpose: string;
  dataProcessed: string;
  limitations: string;
}

const AI_REGISTRY: AiSystem[] = [
  {
    component: "MLRO Advisor",
    model: "claude-haiku-4-5-20251001",
    purpose: "Compliance Q&A, escalation decisions",
    dataProcessed: "Case facts, regulatory context",
    limitations: "May not reflect latest UAE regulatory updates",
  },
  {
    component: "Screening Brief",
    model: "claude-haiku-4-5-20251001",
    purpose: "Risk narrative generation",
    dataProcessed: "Subject name, nationality, risk score",
    limitations: "Cannot access live sanctions databases",
  },
  {
    component: "Smart Disambiguator",
    model: "claude-haiku-4-5-20251001",
    purpose: "Hit resolution for common names",
    dataProcessed: "Client profile, screening hit details",
    limitations: "Relies on provided data quality",
  },
  {
    component: "Typology Matcher",
    model: "claude-haiku-4-5-20251001",
    purpose: "FATF typology identification",
    dataProcessed: "Transaction facts, red flags",
    limitations: "Pattern matching only; not legal advice",
  },
  {
    component: "False Positive Assessor",
    model: "claude-haiku-4-5-20251001",
    purpose: "Hit disambiguation",
    dataProcessed: "Client vs. hit metadata",
    limitations: "Cannot verify external database records",
  },
  {
    component: "PEP Network Intelligence",
    model: "claude-haiku-4-5-20251001",
    purpose: "PEP relationship mapping",
    dataProcessed: "PEP name, role, country",
    limitations: "Knowledge cutoff applies",
  },
  {
    component: "Sanctions Nexus",
    model: "claude-haiku-4-5-2025101",
    purpose: "Indirect sanctions exposure",
    dataProcessed: "Transaction details",
    limitations: "Does not access live OFAC/UN list APIs",
  },
  {
    component: "Name Variant Generator",
    model: "claude-haiku-4-5-20251001",
    purpose: "Alias/transliteration generation",
    dataProcessed: "Subject name, nationality",
    limitations: "Probabilistic — not exhaustive",
  },
  {
    component: "EWRA Board Report",
    model: "claude-haiku-4-5-20251001",
    purpose: "Risk assessment narrative",
    dataProcessed: "Risk dimension scores",
    limitations: "Annual review required",
  },
  {
    component: "Adverse Media Assessment",
    model: "claude-haiku-4-5-20251001",
    purpose: "Threat profile synthesis",
    dataProcessed: "Media findings, categories",
    limitations: "Based on provided media data only",
  },
];

// ── Status styling ────────────────────────────────────────────────────────────

function statusClass(status: PrincipleStatus): string {
  switch (status) {
    case "Implemented": return "bg-green-dim text-green";
    case "Partial":     return "bg-amber-dim text-amber";
    case "In Progress": return "bg-blue-500/10 text-blue-500";
  }
}

const RAO_STORAGE = "hawkeye.rao.name";
const RAO_DEFAULT = "MLRO - Luisa Fernanda";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ResponsibleAiPage() {
  const [raoName, setRaoName] = useState<string>(RAO_DEFAULT);
  const [draftRao, setDraftRao]   = useState<string>(RAO_DEFAULT);
  const [aiAuditEvents, setAiAuditEvents] = useState<AuditEntry[]>([]);

  useEffect(() => {
    // Load RAO name from localStorage
    try {
      const stored = window.localStorage.getItem(RAO_STORAGE);
      if (stored) {
        setRaoName(stored);
        setDraftRao(stored);
      }
    } catch { /* localStorage unavailable */ }

    // Load AI audit events
    const entries = loadAuditEntries();
    const aiEntries = entries
      .filter((e) => e.action.startsWith("ai."))
      .slice(-5)
      .reverse();
    setAiAuditEvents(aiEntries);
  }, []);

  const saveRao = () => {
    const name = draftRao.trim() || RAO_DEFAULT;
    setRaoName(name);
    try {
      window.localStorage.setItem(RAO_STORAGE, name);
    } catch { /* ignore */ }
  };

  return (
    <ModuleLayout asanaModule="responsible-ai" asanaLabel="Responsible AI Governance">
      <ModuleHero
        moduleNumber={27}
        eyebrow="Responsible AI · UNESCO Framework"
        title="Responsible AI"
        titleEm="governance."
        intro={
          <>
            UNESCO Recommendation on the Ethics of Artificial Intelligence (2021) compliance framework.
            All AI in Hawkeye Sterling is advisory only — every recommendation requires human review
            and is logged with operator identity. 194 UN member states committed.
          </>
        }
        kpis={[
          { value: "10",       label: "UNESCO principles implemented" },
          { value: "100%",     label: "AI decisions audit-logged" },
          { value: "Human",    label: "final decision authority" },
          { value: "Advisory", label: "AI role only" },
        ]}
      />

      {/* ── Section 1: UNESCO Alignment Status ── */}
      <section className="mt-6">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Section 1 · UNESCO Alignment Status
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
              <div className="text-12 font-semibold text-ink-0 leading-snug">{p.name}</div>
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
          <div className="mt-4 pt-4 border-t border-hair-2 space-y-1">
            <div className="text-11 text-ink-2">
              <span className="font-semibold text-ink-1">Contact:</span>{" "}
              <a href="mailto:compliance@hawkeyesterling.ae" className="text-brand underline">
                compliance@hawkeyesterling.ae
              </a>
            </div>
            <div className="text-10.5 text-ink-3">
              Legal basis: FDL 10/2025 Art.10 · UAE PDPL Art.20 · UNESCO Ethics of AI Principle 7
            </div>
          </div>
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
          <div className="mb-4">
            <div className="text-11 font-semibold text-ink-2 uppercase tracking-wide-2 mb-1">Contact for AI concerns</div>
            <a href="mailto:compliance@hawkeyesterling.ae" className="text-12 text-brand underline">
              compliance@hawkeyesterling.ae
            </a>
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
