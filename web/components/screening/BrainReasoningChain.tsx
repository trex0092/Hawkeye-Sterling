"use client";

import { useMemo } from "react";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// Decision-flow visualiser. Shows the brain's inference path as a
// vertical chain of gates — each module either passes (clear) or
// fires (flag), and the composite score accumulates along the
// chain. Makes the brain's reasoning explicit so the regulator can
// see exactly how the verdict was reached.

interface Step {
  label: string;
  pass: boolean;
  weight: number;      // contribution to composite (points, signed)
  note: string;
  severity: "clear" | "low" | "medium" | "high" | "critical";
}

function stepsFromResult(r: SuperBrainResult): Step[] {
  const composite = r.composite.score;
  const breakdown = r.composite.breakdown;
  const steps: Step[] = [];

  // 1. Sanctions screen
  const sanctionsHits = r.screen.hits.length;
  const topHit = sanctionsHits > 0 ? Math.round((r.screen.hits[0]?.score ?? 0) * 100) : 0;
  steps.push({
    label: "Sanctions screen",
    pass: sanctionsHits === 0,
    weight: breakdown.quickScreen ?? 0,
    note:
      sanctionsHits === 0
        ? `Clean across ${r.screen.listsChecked} lists · ${r.screen.candidatesChecked.toLocaleString()} candidates in ${r.screen.durationMs}ms`
        : `${sanctionsHits} hit${sanctionsHits === 1 ? "" : "s"} — top ${topHit}% confidence`,
    severity: sanctionsHits > 0 && topHit >= 92 ? "critical" : sanctionsHits > 0 ? "high" : "clear",
  });

  // 2. PEP classification
  const pepTier = r.pep?.salience && r.pep.salience > 0 ? r.pep.tier : null;
  const pepAssess = r.pepAssessment?.isLikelyPEP ? r.pepAssessment.highestTier : null;
  const pepFired = Boolean(pepTier || pepAssess);
  steps.push({
    label: "PEP classification",
    pass: !pepFired,
    weight: breakdown.pepPenalty ?? 0,
    note: pepFired
      ? `Tier ${pepTier ?? pepAssess}${r.pep ? ` · ${Math.round(r.pep.salience * 100)}% salience` : ""}`
      : "No PEP signals fired",
    severity: pepFired && /tier_1|tier 1/i.test(String(pepTier ?? pepAssess)) ? "high" : pepFired ? "medium" : "clear",
  });

  // 3. Adverse media
  const amCount = r.adverseMedia.length + (r.adverseKeywordGroups?.length ?? 0);
  steps.push({
    label: "Adverse-media overlay",
    pass: amCount === 0,
    weight: (breakdown.adverseMediaPenalty ?? 0) + (breakdown.adverseKeywordPenalty ?? 0),
    note: amCount === 0 ? "No adverse-media signals" : `${amCount} categories/groups fired`,
    severity: amCount >= 4 ? "high" : amCount > 0 ? "medium" : "clear",
  });

  // 4. Jurisdiction
  const cahra = Boolean(r.jurisdiction?.cahra);
  const regimeCount = r.jurisdiction?.regimes.length ?? 0;
  steps.push({
    label: "Jurisdiction risk",
    pass: !cahra && regimeCount <= 2,
    weight: (breakdown.jurisdictionPenalty ?? 0) + (breakdown.regimesPenalty ?? 0),
    note: r.jurisdiction
      ? `${r.jurisdiction.name} (${r.jurisdiction.iso2})${cahra ? " · CAHRA-listed" : ""} · ${regimeCount} regime${regimeCount === 1 ? "" : "s"}`
      : "No jurisdiction bound",
    severity: cahra ? "critical" : regimeCount > 3 ? "high" : regimeCount > 0 ? "low" : "clear",
  });

  // 5. Redlines
  const redlineCount = r.redlines.fired.length;
  steps.push({
    label: "Charter redlines",
    pass: redlineCount === 0,
    weight: breakdown.redlinesPenalty ?? 0,
    note: redlineCount === 0 ? "No redlines fired" : `${redlineCount} redline${redlineCount === 1 ? "" : "s"} fired — ${r.redlines.action ?? "review required"}`,
    severity: redlineCount >= 2 ? "critical" : redlineCount > 0 ? "high" : "clear",
  });

  // 6. Typologies
  const typCount = r.typologies?.hits.length ?? 0;
  steps.push({
    label: "Typology matcher",
    pass: typCount === 0,
    weight: 0,
    note: typCount === 0 ? "No typology hits" : `${typCount} typology/typologies matched`,
    severity: typCount >= 3 ? "high" : typCount > 0 ? "medium" : "clear",
  });

  // Terminal: composite verdict
  const sev =
    composite >= 85 ? "critical" : composite >= 60 ? "high" : composite >= 35 ? "medium" : composite > 0 ? "low" : "clear";
  steps.push({
    label: "Composite verdict",
    pass: composite < 35,
    weight: composite,
    note: `${composite}/100 · ${sev.toUpperCase()}`,
    severity: sev,
  });

  return steps;
}

const TONE: Record<Step["severity"], { dot: string; tag: string; line: string }> = {
  clear: { dot: "bg-green", tag: "bg-green-dim text-green", line: "border-green/30" },
  low: { dot: "bg-blue", tag: "bg-blue-dim text-blue", line: "border-blue/30" },
  medium: { dot: "bg-amber", tag: "bg-amber-dim text-amber", line: "border-amber/30" },
  high: { dot: "bg-orange", tag: "bg-orange-dim text-orange", line: "border-orange/30" },
  critical: { dot: "bg-red", tag: "bg-red text-white", line: "border-red/40" },
};

export function BrainReasoningChain({ result }: { result: SuperBrainResult }) {
  const steps = useMemo(() => stepsFromResult(result), [result]);

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
          Reasoning chain
        </span>
        <span className="font-mono text-10 text-ink-3">
          {steps.filter((s) => !s.pass).length}/{steps.length - 1} modules fired
        </span>
      </div>
      <ol className="relative list-none p-0 m-0 space-y-2">
        {steps.map((step, i) => {
          const tone = TONE[step.severity];
          const terminal = i === steps.length - 1;
          return (
            <li
              key={i}
              className={`relative pl-7 ${terminal ? "pt-2 mt-2 border-t border-hair" : ""}`}
            >
              <span
                className={`absolute left-[6px] top-[6px] w-3 h-3 rounded-full ${tone.dot} ring-4 ring-white`}
              />
              {i < steps.length - 1 && (
                <span className={`absolute left-[11px] top-4 bottom-[-14px] border-l-2 border-dashed ${tone.line}`} />
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-12 ${terminal ? "font-bold" : "font-semibold"} text-ink-0`}>
                  {step.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {step.weight !== 0 && (
                    <span className="font-mono text-10 text-ink-3">
                      {step.weight > 0 ? "+" : ""}
                      {step.weight}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${tone.tag}`}
                  >
                    {step.severity}
                  </span>
                </span>
              </div>
              <div className="text-11 text-ink-2 mt-0.5">{step.note}</div>
            </li>
          );
        })}
      </ol>
      <p className="text-10 text-ink-3 mt-3 leading-relaxed">
        Each gate fires independently; the composite is the weighted sum
        (jurisdiction + regimes + redlines + adverse-media + adverse-keyword +
        PEP + quickScreen base). This chain is deterministic — the same
        brain result always produces the same reasoning chain, so it's
        audit-safe and regulator-replay-ready.
      </p>
    </div>
  );
}
