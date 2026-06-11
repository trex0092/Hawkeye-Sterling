"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";

import { PLAYBOOKS, type Playbook } from "./_data";


const FAMILY_COLORS: Record<string, string> = {
  ML: "bg-red-dim text-red",
  PEP: "bg-violet-dim text-violet",
  banking: "bg-blue-dim text-blue",
  DPMS: "bg-amber-dim text-amber",
  PF: "bg-red-dim text-red",
  EOCN: "bg-green-dim text-green",
  VASP: "bg-blue-dim text-blue",
  UBO: "bg-violet-dim text-violet",
  REML: "bg-amber-dim text-amber",
  TF: "bg-amber-dim text-amber",
  Payments: "bg-blue-dim text-blue",
  MSB: "bg-green-dim text-green",
  ABC: "bg-violet-dim text-violet",
  "TF/ML": "bg-red-dim text-red",
  Fraud: "bg-red-dim text-red",
  CFT: "bg-red-dim text-red",
  Sanctions: "bg-red-dim text-red",
  CDD: "bg-blue-dim text-blue",
  Risk: "bg-amber-dim text-amber",
  MoE: "bg-green-dim text-green",
  FIU: "bg-violet-dim text-violet",
  OECD: "bg-green-dim text-green",
  "VASP/Fraud": "bg-red-dim text-red",
};

function getFamilyColor(family: string) {
  return FAMILY_COLORS[family] ?? "bg-bg-2 text-ink-2";
}

interface ScenarioSimulateResult {
  chapters: string[];
  redFlags: string[];
  actions: string[];
  regulatoryRefs: string[];
  recommendation: "File STR" | "Enhanced Due Diligence" | "Close Case" | "Escalate to MLRO";
  urgency: "immediate" | "24h" | "7d";
}

const URGENCY_TONE: Record<ScenarioSimulateResult["urgency"], { badge: string; label: string }> = {
  immediate: { badge: "bg-red text-white", label: "Immediate action required" },
  "24h": { badge: "bg-amber-dim text-amber border border-amber/40", label: "Action within 24 hours" },
  "7d": { badge: "bg-green-dim text-green border border-green/40", label: "Action within 7 days" },
};

const REC_TONE: Record<ScenarioSimulateResult["recommendation"], string> = {
  "File STR": "text-red",
  "Enhanced Due Diligence": "text-amber",
  "Close Case": "text-green",
  "Escalate to MLRO": "text-brand",
};

export default function PlaybookPage() {
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState<{ answer: string; citations: string[]; confidence: number; relatedPlaybooks: string[] } | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  // Scenario Simulator state. The former Client Type / Jurisdiction / Risk
  // Level selects are fixed at their old defaults — the panel is free-text.
  const SIM_DEFAULTS = { clientType: "Individual", jurisdiction: "UAE", riskLevel: "Medium" };
  const [simScenario, setSimScenario] = useState("");
  const [simResult, setSimResult] = useState<ScenarioSimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const runSimulator = async () => {
    if (!simScenario.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    setSimError(null);
    try {
      const res = await fetch("/api/playbook/scenario-simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: simScenario,
          clientType: SIM_DEFAULTS.clientType,
          jurisdiction: SIM_DEFAULTS.jurisdiction,
          riskLevel: SIM_DEFAULTS.riskLevel,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Simulation failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as ScenarioSimulateResult;
      if (!mountedRef.current) return;
      setSimResult(data);
    } catch (err) {
      if (mountedRef.current) setSimError(caughtErrorMessage(err, "Simulation failed — please retry"));
    } finally { if (mountedRef.current) setSimLoading(false); }
  };

  const pb = PLAYBOOKS.find((p) => p.id === drawerOpen) ?? null;

  const totalChecks = pb ? pb.steps.reduce((a, s) => a + s.checks.length, 0) : 0;
  const doneChecks = pb
    ? Object.entries(checked).filter(([k, v]) => v && k.startsWith(`${pb.id}:`)).length
    : 0;
  const pct = Math.round((doneChecks / Math.max(totalChecks, 1)) * 100);

  const toggle = (pbId: string, stepIdx: number, checkIdx: number) => {
    const k = `${pbId}:${stepIdx}:${checkIdx}`;
    setChecked((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const families = Array.from(new Set(PLAYBOOKS.map((p) => p.family))).sort();

  const filtered = PLAYBOOKS.filter((p) => {
    const matchSearch = !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()) || p.family.toLowerCase().includes(search.toLowerCase()) || (p.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFamily = familyFilter === "all" || p.family === familyFilter;
    return matchSearch && matchFamily;
  });

  const getProgress = (pbId: string, steps: Playbook["steps"]) => {
    const total = steps.reduce((a, s) => a + s.checks.length, 0);
    const done = Object.entries(checked).filter(([k, v]) => v && k.startsWith(`${pbId}:`)).length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const askPlaybook = async () => {
    if (!qaQuestion.trim()) return;
    setQaLoading(true);
    setQaError(null);
    try {
      const res = await fetch("/api/playbook-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: qaQuestion }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Playbook QA failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json().catch(() => ({})) as { ok: boolean; answer: string; citations: string[]; confidence: number; relatedPlaybooks: string[] };
      if (!mountedRef.current) return;
      if (data.ok) setQaAnswer(data);
    } catch (err) {
      if (mountedRef.current) setQaError(caughtErrorMessage(err, "Playbook QA failed — please retry"));
    } finally { if (mountedRef.current) setQaLoading(false); }
  };

  // Auto-routes the free-text panel: question-shaped input goes to the
  // playbook QA engine, anything else runs the scenario simulator.
  const looksLikeQuestion = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    return t.endsWith("?") || /^(what|how|when|where|who|why|which|do|does|can|could|should|would|is|are|am|must)\b/.test(t);
  };

  const submitPanel = () => {
    if (!simScenario.trim()) return;
    if (looksLikeQuestion(simScenario)) void askPlaybook();
    else void runSimulator();
  };

  return (
    <ModuleLayout asanaModule="playbook" asanaLabel="Playbook" onRun={submitPanel}>
      <ModuleHero

        eyebrow=""
        title="Playbook"
        titleEm="engine."
        intro={
          <>
            <strong>One walk-through per typology.</strong> Pick a playbook,
            work through the mandated checks in order. The brain cites the
            specific FATF / LBMA / FDL articles behind each step so nothing
            gets skipped. Each required step generates an audit-chain entry.
          </>
        }
        kpis={[
          { value: String(PLAYBOOKS.length), label: "playbooks" },
          { value: String(PLAYBOOKS.reduce((a, p) => a + p.steps.reduce((b, s) => b + s.checks.length, 0), 0)), label: "total checks" },
          { value: String(Object.values(checked).filter(Boolean).length), label: "checks completed" },
          { value: String(families.length), label: "typology families" },
        ]}
      />

      {/* ── Scenario Simulator + Ask the Playbook (merged) ── */}
      <div className="mt-6 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center gap-3">
          <span className="text-14">🎯</span>
          <span className="text-13 font-semibold text-ink-0">Scenario Simulator</span>
          {(simLoading || qaLoading) && (
            <span className="text-11 text-ink-3 ml-auto">{qaLoading ? "Asking…" : "Analysing…"}</span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={simScenario}
            onChange={(e) => { setSimScenario(e.target.value); setQaQuestion(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitPanel(); } }}
            placeholder="Describe a scenario or ask a compliance question, then press Enter (Shift+Enter for a new line)… e.g. 'A new corporate client from the UAE requests to wire USD 500,000 to a free-trade zone counterparty. The UBO is a government official from West Africa.' — or — 'What do I do if a customer is a Tier-1 PEP from a sanctioned country?'"
            rows={4}
            className="w-full text-12 px-3 py-2.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none leading-relaxed"
          />
          {(simResult || qaAnswer || simError || qaError) && (
            <button type="button" onClick={() => { setSimResult(null); setQaAnswer(null); setSimError(null); setQaError(null); }} className="text-11 text-blue-400 hover:text-blue-300 px-2 py-1">✕ Clear result</button>
          )}

          {(simError || qaError) && (
            <div className="mt-3 rounded border border-red/30 bg-red-dim px-3 py-2 text-12 text-red">
              ⚠ {simError ?? qaError}
            </div>
          )}

          {simResult && (
            <div className="mt-4 space-y-4 border-t border-hair-2 pt-4">
              {/* Urgency + Recommendation */}
              <div className="flex items-start gap-3 flex-wrap">
                <span className={`font-mono text-10 font-semibold px-2.5 py-1 rounded uppercase ${URGENCY_TONE[simResult.urgency].badge}`}>
                  {URGENCY_TONE[simResult.urgency].label}
                </span>
                <span className={`text-20 font-bold leading-tight ${REC_TONE[simResult.recommendation]}`}>
                  {simResult.recommendation}
                </span>
              </div>

              {/* Chapters — clickable pills scrolling to playbook */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Relevant Playbook Chapters</div>
                <div className="flex flex-wrap gap-1.5">
                  {simResult.chapters.map((ch) => {
                    const match = PLAYBOOKS.find((p) => p.title === ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => { if (match) { setDrawerOpen(match.id); } }}
                        className={`text-11 font-semibold px-2.5 py-1 rounded-full border transition-colors ${match ? "bg-brand-dim text-brand border-brand/30 hover:bg-brand hover:text-white hover:border-brand" : "bg-bg-2 text-ink-2 border-hair-2"}`}
                        title={match ? `Open ${ch} playbook` : ch}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Red Flags */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Red Flags Identified</div>
                <ul className="space-y-1">
                  {simResult.redFlags.map((rf, i) => (
                    <li key={i} className="flex items-start gap-2 text-12 text-red">
                      <span className="shrink-0 mt-0.5 text-red font-bold">•</span>
                      {rf}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Step-by-Step Actions</div>
                <ol className="space-y-1.5">
                  {simResult.actions.map((action, i) => (
                    <li key={i} className="text-12 text-ink-0 leading-relaxed pl-1">
                      {action}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Regulatory References */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">Regulatory References</div>
                <div className="flex flex-wrap gap-1.5">
                  {simResult.regulatoryRefs.map((ref) => (
                    <span key={ref} className="font-mono text-10 px-2 py-0.5 rounded border border-hair-2 bg-bg-panel text-ink-1">
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 mt-6 mb-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 text-[14px] pointer-events-none">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playbooks…"
            className="w-full pl-8 pr-3 py-2 border border-hair-2 rounded text-12 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setFamilyFilter("all")}
            className={`px-2.5 py-1 rounded-full text-10 font-semibold border transition-colors ${familyFilter === "all" ? "bg-ink-0 text-bg-0 border-ink-0" : "bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-3"}`}
          >All</button>
          {families.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFamilyFilter(f === familyFilter ? "all" : f)}
              className={`px-2.5 py-1 rounded-full text-10 font-semibold border transition-colors ${familyFilter === f ? "bg-brand text-white border-brand" : "bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-3 hover:text-ink-0"}`}
            >{f}</button>
          ))}
        </div>
      </div>

      <div className="text-11 text-ink-3 mb-3">{filtered.length} playbooks · click any to open</div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
        {filtered.map((p) => {
          const prog = getProgress(p.id, p.steps);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setDrawerOpen(p.id)}
              className="text-left px-2.5 py-1.5 rounded border border-hair-2 bg-bg-panel hover:border-brand hover:bg-brand-dim transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded-sm ${getFamilyColor(p.family)}`}>
                  {p.family}
                </span>
                {prog > 0 && (
                  <span className="font-mono text-10 text-brand">{prog}%</span>
                )}
              </div>
              <span className="block text-11 text-ink-0 group-hover:text-brand leading-snug">{p.title}</span>
              <div className="flex items-center gap-1 mt-1.5">
                <div className="flex-1 h-0.5 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${prog}%` }} />
                </div>
                <span className="text-10 text-ink-3 font-mono">{p.steps.length} steps</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Slide-in drawer */}
      {drawerOpen && pb && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(null)}
          />

          {/* Drawer panel */}
          <div className="fixed top-0 right-0 h-full w-[640px] bg-bg-0 border-l border-hair-2 z-50 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-hair-2 bg-bg-panel shrink-0">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded-sm ${getFamilyColor(pb.family)}`}>
                    {pb.family}
                  </span>
                  <span className="font-mono text-10 text-ink-3">{pb.typology}</span>
                </div>
                <h2 className="text-18 font-bold text-ink-0 leading-tight m-0">{pb.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(null)}
                className="text-ink-3 hover:text-ink-0 text-20 leading-none mt-0.5 px-1"
                aria-label="Close"
              >✕</button>
            </div>

            {/* Progress bar */}
            <div className="px-6 py-3 border-b border-hair-2 shrink-0 bg-bg-panel">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-11 text-ink-2 font-medium">Completion</span>
                <span className="font-mono text-11 text-brand font-semibold">{doneChecks} / {totalChecks} · {pct}%</span>
              </div>
              <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              {pct === 100 && (
                <div className="mt-2 text-11 text-green font-semibold">✓ All checks complete — playbook ready for sign-off</div>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Description */}
              {pb.description && (
                <div className="bg-brand-dim border border-brand/20 rounded-lg px-4 py-3">
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-brand mb-1.5">About this playbook</div>
                  <p className="text-12 text-ink-1 leading-relaxed m-0">{pb.description}</p>
                </div>
              )}

              {/* Regulatory citations */}
              {pb.citations && pb.citations.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Regulatory basis</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pb.citations.map((c) => (
                      <span key={c} className="text-10 font-mono px-2 py-0.5 rounded border border-hair-2 bg-bg-panel text-ink-1">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps */}
              <div className="space-y-5">
                {pb.steps.map((step, si) => {
                  const stepDone = step.checks.filter((_, ci) => checked[`${pb.id}:${si}:${ci}`]).length;
                  const stepTotal = step.checks.length;
                  return (
                    <div key={si} className="border border-hair-2 rounded-lg overflow-hidden">
                      <div className={`px-4 py-2.5 flex items-center justify-between border-b border-hair-2 ${stepDone === stepTotal ? "bg-green-dim" : "bg-bg-panel"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-12 font-semibold text-ink-0">{step.title}</span>
                          {step.required && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold bg-red-dim text-red">
                              required
                            </span>
                          )}
                          {stepDone === stepTotal && stepTotal > 0 && (
                            <span className="font-mono text-10 text-green font-semibold">✓ done</span>
                          )}
                        </div>
                        <span className="font-mono text-10 text-ink-3">{stepDone}/{stepTotal}</span>
                      </div>
                      <ul className="list-none p-0 m-0 divide-y divide-hair">
                        {step.checks.map((c, ci) => {
                          const k = `${pb.id}:${si}:${ci}`;
                          const done = Boolean(checked[k]);
                          return (
                            <li key={ci}>
                              <label className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-bg-1 transition-colors ${done ? "bg-green-dim/30" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={done}
                                  onChange={() => toggle(pb.id, si, ci)}
                                  className="mt-0.5 accent-brand shrink-0"
                                />
                                <span className={`text-12 leading-relaxed ${done ? "text-ink-3 line-through" : "text-ink-1"}`}>
                                  {c}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {step.citation && (
                        <div className="px-4 py-1.5 bg-bg-1 border-t border-hair text-10 text-ink-3 font-mono">
                          {step.citation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-hair-2 bg-bg-panel shrink-0 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const keys = pb.steps.flatMap((s, si) => s.checks.map((_, ci) => `${pb.id}:${si}:${ci}`));
                  const allDone = keys.every((k) => checked[k]);
                  setChecked((prev) => {
                    const next = { ...prev };
                    keys.forEach((k) => { next[k] = !allDone; });
                    return next;
                  });
                }}
                className="text-11 font-semibold px-2.5 py-1 rounded border border-hair-2 text-ink-1 hover:bg-bg-2 transition-colors"
              >
                {pb.steps.flatMap((s, si) => s.checks.map((_, ci) => `${pb.id}:${si}:${ci}`)).every((k) => checked[k]) ? "Uncheck all" : "Check all"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const keys = pb.steps.flatMap((s, si) => s.checks.map((_, ci) => `${pb.id}:${si}:${ci}`));
                    setChecked((prev) => { const next = { ...prev }; keys.forEach((k) => { delete next[k]; }); return next; });
                  }}
                  className="text-11 font-medium px-2.5 py-1 rounded border border-hair-2 text-ink-3 hover:border-red hover:text-red transition-colors"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(null)}
                  className="text-11 font-semibold px-3 py-1 rounded bg-brand text-white hover:bg-brand/90 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </ModuleLayout>
  );
}
