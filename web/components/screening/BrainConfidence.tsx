"use client";

import { useMemo } from "react";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// Confidence ring — SVG gauge that visualises not the score itself
// (that's the Risk Score section above) but how many independent
// brain signals converged on the verdict. More signals firing = higher
// confidence. A 100/100 score with only 1 signal firing tells a
// different story than 100/100 with 6 signals firing.

interface BrainConfidenceProps {
  result: SuperBrainResult;
}

function countSignals(r: SuperBrainResult): {
  fired: number;
  total: number;
  breakdown: Array<{ label: string; on: boolean }>;
} {
  const breakdown = [
    { label: "Sanctions hit", on: r.screen.hits.length > 0 },
    { label: "PEP classified", on: Boolean(r.pep && r.pep.salience > 0) },
    {
      label: "Adverse-media category",
      on: r.adverseMedia.length > 0 || r.adverseKeywordGroups.length > 0,
    },
    { label: "ESG overlay", on: (r.esg?.length ?? 0) > 0 },
    { label: "Jurisdiction risk", on: Boolean(r.jurisdiction?.cahra) },
    { label: "Redline fired", on: r.redlines.fired.length > 0 },
    { label: "Typology matched", on: (r.typologies?.hits.length ?? 0) > 0 },
    {
      label: "Stylometry flagged",
      on: Boolean(
        r.stylometry &&
          typeof r.stylometry.gaslightingScore === "number" &&
          r.stylometry.gaslightingScore > 0,
      ),
    },
  ];
  return {
    fired: breakdown.filter((b) => b.on).length,
    total: breakdown.length,
    breakdown,
  };
}

export function BrainConfidence({ result }: BrainConfidenceProps) {
  const { fired, total, breakdown } = useMemo(() => countSignals(result), [result]);
  const pct = Math.round((fired / total) * 100);
  const size = 64;
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fired / total);
  const tone = pct >= 60 ? "#dc2626" : pct >= 30 ? "#f59e0b" : "#10b981";

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 mb-3 flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-mono"
          style={{ fontSize: 14, fontWeight: 600, fill: "#111" }}
        >
          {fired}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 12}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 7, fill: "#6b7280" }}
        >
          /{total}
        </text>
      </svg>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
            Signal confidence
          </span>
          <span className="font-mono text-10 text-ink-3">{pct}% coverage</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {breakdown.map((s) => (
            <span
              key={s.label}
              className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 ${
                s.on
                  ? "bg-brand-dim text-brand-deep"
                  : "bg-bg-2 text-ink-3 line-through opacity-60"
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
