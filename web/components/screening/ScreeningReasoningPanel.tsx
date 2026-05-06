"use client";

// Hawkeye Sterling — Screening Reasoning Panel.
//
// Renders the multi-source consensus + contradiction + coverage gap +
// audit rationale that the /api/quick-screen route attaches to its
// response under the `reasoning` key. Server-side calculation, this
// component is purely presentational.

import { useState } from "react";

export interface ScreeningReasoning {
  consensus: {
    unified: number;
    confidence: { low: number; high: number };
    agreementLevel: "strong" | "moderate" | "split" | "weak";
    sourcesFor: number;
    sourcesAgainst: number;
    sourcesUncertain: number;
    weightedFor: number;
    weightedAgainst: number;
  };
  contradictions: Array<{
    topic: string;
    affirming: Array<{ source: string; detail: string }>;
    denying: Array<{ source: string; detail: string }>;
    severity: "critical" | "warn" | "informational";
  }>;
  coverage: {
    totalConfigured: number;
    totalAvailable: number;
    byCategory: Array<{ category: string; configured: number; unconfigured: number }>;
    warnings: string[];
  };
  rationale: string;
  evidenceTrail: Array<{ source: string; weight: number; outcome: string; detail?: string }>;
  art19NegativeFinding?: string;
  temporalVelocity?: {
    totalArticles: number;
    recentVolume: number;
    baselineVolume: number;
    escalationRatio: number;
    escalationLevel: "none" | "emerging" | "elevated" | "spiking";
    sustainedDays: number;
    signal: string;
  };
  counterfactual?: {
    baselineBucket: "clear" | "possible" | "positive";
    decisiveSources: Array<{ source: string; counterfactualBucket: string; deltaScore: number; flipsRating: boolean }>;
    robustSources: number;
    fragility: "robust" | "moderate" | "fragile";
    signal: string;
  };
  coOccurrence?: {
    associates: Array<{ name: string; mentions: number }>;
    sanctionedAssociates: Array<{ name: string; mentions: number; matchedListId?: string }>;
    geographicRisk: Array<{ country: string; mentions: number }>;
    signal: string;
  };
  transliteration?: { script: string; transliterated: string; variants: string[] };
  phoneticTier?: Array<{ candidateName: string; result: { doubleMetaphone: boolean; nysiis: boolean; matchRating: boolean; compositeScore: number } }>;
}

interface Props {
  reasoning: ScreeningReasoning;
}

const AGREEMENT_STYLE: Record<ScreeningReasoning["consensus"]["agreementLevel"], string> = {
  strong: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  moderate: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  split: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  weak: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
};

const SEVERITY_STYLE: Record<ScreeningReasoning["contradictions"][number]["severity"], string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/40",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  informational: "bg-sky-500/10 text-sky-300 border-sky-500/30",
};

export function ScreeningReasoningPanel({ reasoning }: Props): React.ReactElement {
  const [showEvidence, setShowEvidence] = useState(false);
  const c = reasoning.consensus;

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-bg-2 p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
          Reasoning · multi-source consensus
        </h3>
        <span className={`text-10 font-bold uppercase px-2 py-0.5 rounded border ${AGREEMENT_STYLE[c.agreementLevel]}`}>
          {c.sourcesFor === 0 && c.sourcesAgainst === 0
            ? "no positive evidence"
            : c.sourcesFor > 0
              ? `${c.agreementLevel} positive`
              : `${c.agreementLevel} clear`}
        </span>
      </header>

      {/* Consensus score */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Unified score</div>
          <div className="text-2xl font-bold text-ink-1">{c.unified}<span className="text-ink-3 text-sm">/100</span></div>
          <div className="text-11 text-ink-3 mt-1">95% CI [{c.confidence.low}, {c.confidence.high}]</div>
        </div>
        <div className="rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Evidence</div>
          <div className="text-sm text-ink-1">
            <span className="text-amber-300 font-semibold">{c.sourcesFor}</span> affirming ·{" "}
            <span className="text-emerald-300 font-semibold">{c.sourcesAgainst}</span> denying ·{" "}
            <span className="text-zinc-400">{c.sourcesUncertain}</span> no data
          </div>
          <div className="text-11 text-ink-3 mt-1">
            Affirming weight: {c.weightedFor.toFixed(2)}
          </div>
        </div>
        <div className="rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Coverage</div>
          <div className="text-sm text-ink-1">
            <span className="font-semibold">{reasoning.coverage.totalConfigured}</span> /{" "}
            <span className="text-ink-3">{reasoning.coverage.totalAvailable}</span> sources active
          </div>
          {reasoning.coverage.warnings.length > 0 && (
            <div className="text-11 text-amber-300 mt-1">{reasoning.coverage.warnings.length} coverage gap(s)</div>
          )}
        </div>
      </div>

      {/* Contradictions */}
      {reasoning.contradictions.length > 0 && (
        <div className="mb-3">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1.5">Contradictions detected</div>
          <ul className="space-y-1.5">
            {reasoning.contradictions.map((c, i) => (
              <li key={i} className={`text-12 px-2.5 py-1.5 rounded border ${SEVERITY_STYLE[c.severity]}`}>
                <div className="font-semibold uppercase text-10 tracking-wide mb-0.5">{c.severity}: {c.topic}</div>
                <div>
                  Affirming ({c.affirming.length}): <span className="text-ink-2">{c.affirming.map((a) => a.source).join(", ")}</span>
                </div>
                <div>
                  Denying ({c.denying.length}): <span className="text-ink-2">{c.denying.map((a) => a.source).join(", ")}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coverage warnings */}
      {reasoning.coverage.warnings.length > 0 && (
        <div className="mb-3">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1.5">Coverage warnings</div>
          <ul className="space-y-1">
            {reasoning.coverage.warnings.map((w, i) => (
              <li key={i} className="text-11 text-amber-300/90 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/20">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit rationale */}
      <div className="rounded-md bg-bg-1/60 p-3 border border-white/5 mb-2">
        <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Audit rationale</div>
        <p className="text-12 text-ink-2 leading-relaxed">{reasoning.rationale}</p>
      </div>

      {reasoning.art19NegativeFinding && (
        <div className="text-11 px-2.5 py-1.5 rounded bg-emerald-500/5 border border-emerald-500/20 text-emerald-200/90 mb-2">
          {reasoning.art19NegativeFinding}
        </div>
      )}

      {/* Temporal velocity */}
      {reasoning.temporalVelocity && (
        <div className="mb-2 rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-10 uppercase tracking-wide text-ink-3">Temporal velocity</div>
            <span className={`text-10 font-bold uppercase px-2 py-0.5 rounded border ${
              reasoning.temporalVelocity.escalationLevel === "spiking" ? "bg-red-500/15 text-red-300 border-red-500/40" :
              reasoning.temporalVelocity.escalationLevel === "elevated" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" :
              reasoning.temporalVelocity.escalationLevel === "emerging" ? "bg-orange-500/10 text-orange-300 border-orange-500/30" :
              "bg-zinc-500/10 text-zinc-300 border-zinc-500/30"
            }`}>{reasoning.temporalVelocity.escalationLevel}</span>
          </div>
          <p className="text-12 text-ink-2 leading-relaxed">{reasoning.temporalVelocity.signal}</p>
          <div className="text-11 text-ink-3 mt-1">
            {reasoning.temporalVelocity.totalArticles} article(s) · {reasoning.temporalVelocity.sustainedDays}d sustained ·
            {" "}recent {reasoning.temporalVelocity.recentVolume} vs baseline {reasoning.temporalVelocity.baselineVolume}/wk
          </div>
        </div>
      )}

      {/* Counterfactual */}
      {reasoning.counterfactual && (
        <div className="mb-2 rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-10 uppercase tracking-wide text-ink-3">Counterfactual (leave-one-out)</div>
            <span className={`text-10 font-bold uppercase px-2 py-0.5 rounded border ${
              reasoning.counterfactual.fragility === "fragile" ? "bg-red-500/15 text-red-300 border-red-500/40" :
              reasoning.counterfactual.fragility === "moderate" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" :
              "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
            }`}>{reasoning.counterfactual.fragility}</span>
          </div>
          <p className="text-12 text-ink-2 leading-relaxed">{reasoning.counterfactual.signal}</p>
          {reasoning.counterfactual.decisiveSources.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {reasoning.counterfactual.decisiveSources.slice(0, 5).map((d, i) => (
                <li key={i} className="text-11 flex items-center gap-2">
                  <span className="font-mono text-ink-2">{d.source}</span>
                  <span className={d.flipsRating ? "text-red-300 font-semibold" : "text-amber-300"}>
                    Δ {d.deltaScore > 0 ? "+" : ""}{d.deltaScore} → {d.counterfactualBucket}
                  </span>
                  {d.flipsRating && <span className="text-10 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">FLIPS RATING</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Co-occurrence */}
      {reasoning.coOccurrence && (reasoning.coOccurrence.associates.length > 0 || reasoning.coOccurrence.sanctionedAssociates.length > 0 || reasoning.coOccurrence.geographicRisk.length > 0) && (
        <div className="mb-2 rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Co-occurrence in adverse media</div>
          <p className="text-12 text-ink-2 leading-relaxed mb-1.5">{reasoning.coOccurrence.signal}</p>
          {reasoning.coOccurrence.sanctionedAssociates.length > 0 && (
            <div className="mb-1">
              <div className="text-11 text-red-300 font-semibold mb-0.5">Sanctioned associates:</div>
              <ul className="text-11 text-ink-2 space-y-0.5">
                {reasoning.coOccurrence.sanctionedAssociates.map((s, i) => (
                  <li key={i}>{s.name} ({s.mentions} mention{s.mentions === 1 ? "" : "s"}) · matched {s.matchedListId ?? "list"}</li>
                ))}
              </ul>
            </div>
          )}
          {reasoning.coOccurrence.geographicRisk.length > 0 && (
            <div className="mb-1">
              <div className="text-11 text-amber-300 font-semibold mb-0.5">High-risk geographies:</div>
              <ul className="text-11 text-ink-2 space-y-0.5">
                {reasoning.coOccurrence.geographicRisk.map((g, i) => (
                  <li key={i}>{g.country} ({g.mentions} mention{g.mentions === 1 ? "" : "s"})</li>
                ))}
              </ul>
            </div>
          )}
          {reasoning.coOccurrence.associates.length > 0 && (
            <div>
              <div className="text-11 text-ink-3 font-semibold mb-0.5">Likely associates:</div>
              <ul className="text-11 text-ink-2 space-y-0.5">
                {reasoning.coOccurrence.associates.slice(0, 5).map((a, i) => (
                  <li key={i}>{a.name} ({a.mentions})</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Transliteration + Phonetic tier */}
      {(reasoning.transliteration || reasoning.phoneticTier) && (
        <div className="mb-2 rounded-md bg-bg-1/60 p-3 border border-white/5">
          <div className="text-10 uppercase tracking-wide text-ink-3 mb-1">Cross-language + phonetic tier</div>
          {reasoning.transliteration && (
            <div className="text-12 text-ink-2 mb-1">
              Detected script: <span className="font-mono">{reasoning.transliteration.script}</span> ·
              transliterated: <span className="font-mono">{reasoning.transliteration.transliterated}</span> ·
              {reasoning.transliteration.variants.length} spelling variant(s) checked
            </div>
          )}
          {reasoning.phoneticTier && reasoning.phoneticTier.length > 0 && (
            <ul className="text-11 space-y-0.5">
              {reasoning.phoneticTier.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-mono text-ink-2">{p.candidateName}</span>
                  <span className="text-ink-3">composite {(p.result.compositeScore * 100).toFixed(0)}%</span>
                  {p.result.doubleMetaphone && <span className="text-10 px-1 rounded bg-sky-500/20 text-sky-300">DM</span>}
                  {p.result.nysiis && <span className="text-10 px-1 rounded bg-sky-500/20 text-sky-300">NYSIIS</span>}
                  {p.result.matchRating && <span className="text-10 px-1 rounded bg-sky-500/20 text-sky-300">MRA</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Evidence trail (collapsible) */}
      <button
        type="button"
        onClick={() => setShowEvidence((s) => !s)}
        className="text-11 text-ink-3 hover:text-ink-1 underline-offset-2 hover:underline"
      >
        {showEvidence ? "Hide" : "Show"} evidence trail ({reasoning.evidenceTrail.length})
      </button>
      {showEvidence && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-white/5 bg-bg-1/40">
          <table className="w-full text-11">
            <thead className="text-ink-3 uppercase text-10 sticky top-0 bg-bg-1/80 backdrop-blur">
              <tr>
                <th className="text-left px-2 py-1">Source</th>
                <th className="text-left px-2 py-1">Outcome</th>
                <th className="text-right px-2 py-1">Weight</th>
                <th className="text-left px-2 py-1">Detail</th>
              </tr>
            </thead>
            <tbody>
              {reasoning.evidenceTrail.map((e, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-2 py-1 font-mono text-ink-2">{e.source}</td>
                  <td className="px-2 py-1">
                    <span className={
                      e.outcome === "match" ? "text-emerald-300" :
                      e.outcome === "no_match" || e.outcome === "delisted" ? "text-red-300" :
                      "text-zinc-400"
                    }>
                      {e.outcome}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right text-ink-3">{e.weight.toFixed(2)}</td>
                  <td className="px-2 py-1 text-ink-3">{e.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
