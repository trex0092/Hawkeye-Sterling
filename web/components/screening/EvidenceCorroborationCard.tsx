"use client";

// Hawkeye Sterling — EvidenceCorroborationCard (audit follow-up #28).
//
// Renders the cross-evidence corroboration summary (BrainVerdict.
// evidenceCorroboration) shipped in PR #243 commit 7711f02. The field
// previously had no UI — this component surfaces it so MLROs can see at
// a glance whether a high posterior was built on a diverse, fresh,
// authoritative evidence stack or a monolithic / stale / weak one.
//
// Design: compact card; colour-codes the score band; shows kinds + age
// + penalties; expandable reasons[] list for full audit transparency
// (Charter P9).

import { useState } from "react";

interface EvidenceCorroborationSummary {
  score: number;
  items: number;
  independentSources: number;
  kinds: string[];
  medianAgeDays: number;
  stalePenalty: number;
  trainingDataPenalty: number;
  credibilityAverage: number;
  reasons: string[];
}

interface Props {
  data?: EvidenceCorroborationSummary | null;
}

function band(score: number): { label: string; cls: string } {
  if (score >= 0.8) return { label: "Strong", cls: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  if (score >= 0.55) return { label: "Adequate", cls: "text-amber-600 bg-amber-50 border-amber-200" };
  if (score >= 0.3) return { label: "Weak", cls: "text-orange-600 bg-orange-50 border-orange-200" };
  return { label: "Insufficient", cls: "text-red-600 bg-red-50 border-red-200" };
}

export function EvidenceCorroborationCard({ data }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  const b = band(data.score);
  const ageStr = data.medianAgeDays >= 0 ? `${data.medianAgeDays}d` : "n/a";

  return (
    <div className={`rounded-md border px-3 py-2 ${b.cls}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <div className="text-xs uppercase tracking-wide opacity-70">Evidence corroboration</div>
          <div className="text-lg font-semibold tabular-nums">
            {(data.score * 100).toFixed(0)}
            <span className="text-xs opacity-60">/100</span>
            <span className="ml-2 text-xs font-medium">{b.label}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-xs underline opacity-70 hover:opacity-100"
        >
          {expanded ? "less" : "details"}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div><span className="opacity-60">items </span><span className="font-medium tabular-nums">{data.items}</span></div>
        <div><span className="opacity-60">sources </span><span className="font-medium tabular-nums">{data.independentSources}</span></div>
        <div><span className="opacity-60">kinds </span><span className="font-medium tabular-nums">{data.kinds.length}</span></div>
        <div><span className="opacity-60">median age </span><span className="font-medium tabular-nums">{ageStr}</span></div>
      </div>

      {(data.stalePenalty > 0 || data.trainingDataPenalty > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {data.stalePenalty > 0 && (
            <span className="rounded border border-orange-300 bg-orange-100 px-1.5 py-0.5 text-orange-700">
              {Math.round(data.stalePenalty * 100)}% stale
            </span>
          )}
          {data.trainingDataPenalty > 0 && (
            <span className="rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-red-700">
              ⚠ training-data evidence (Charter P8)
            </span>
          )}
        </div>
      )}

      {expanded && (
        <ul className="mt-2 list-disc pl-4 text-xs opacity-90">
          {data.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EvidenceCorroborationCard;
