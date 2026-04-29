"use client";

import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// Composite-score decomposition — stacked horizontal bar showing which
// module contributed what points to the final composite. Click-free
// but the exact numbers are printed so operators can trace the math.

const COLORS: Record<string, string> = {
  quickScreen: "#111827",
  jurisdictionPenalty: "#8b5cf6",
  regimesPenalty: "#a855f7",
  redlinesPenalty: "#dc2626",
  adverseMediaPenalty: "#f59e0b",
  adverseKeywordPenalty: "#f97316",
  pepPenalty: "#ec4899",
};

const LABELS: Record<string, string> = {
  quickScreen: "Sanctions score",
  jurisdictionPenalty: "CAHRA penalty",
  regimesPenalty: "Regimes",
  redlinesPenalty: "Redlines",
  adverseMediaPenalty: "Adverse-media",
  adverseKeywordPenalty: "Adverse-keyword",
  pepPenalty: "PEP tier",
};

export function BrainDecomposition({ result }: { result: SuperBrainResult }) {
  const b = result.composite.breakdown;
  const entries = Object.entries(b).filter(([, v]) => (v ?? 0) > 0);
  const total = entries.reduce((a, [, v]) => a + (v ?? 0), 0);
  const composite = result.composite.score;

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
          Composite decomposition
        </span>
        <span className="font-mono text-11 text-ink-0">
          {composite} / 100{" "}
          <span className="text-ink-3">({entries.length} drivers)</span>
        </span>
      </div>
      {total === 0 ? (
        <div className="text-11 text-ink-2">
          No score drivers fired — composite is 0.
        </div>
      ) : (
        <>
          <div className="flex h-3 rounded-sm overflow-hidden bg-bg-2">
            {entries.map(([k, v]) => {
              const pct = (v / Math.max(total, composite, 1)) * 100;
              return (
                <div
                  key={k}
                  style={{ width: `${pct}%`, backgroundColor: COLORS[k] ?? "#6b7280" }}
                  title={`${LABELS[k] ?? k}: ${v}`}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-11 font-mono">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: COLORS[k] ?? "#6b7280" }}
                />
                <span className="text-ink-2 flex-1">{LABELS[k] ?? k}</span>
                <span className="text-ink-0">{v}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
