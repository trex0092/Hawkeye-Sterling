// Hawkeye Sterling — CrossRegimeConflictCard (audit follow-up #28).
//
// Renders the cross-regime conflict report from
// BrainVerdict.crossRegimeConflict (shipped in PR #243 commit edc000d
// + super-brain wiring in 208e9a4). Surfaces split-regime cases where
// one authoritative list designates a subject and another doesn't —
// the most-restrictive-regime rule mandates escalation, and this UI
// makes that visible to the MLRO before disposition.

"use client";

interface RegimeStatus {
  regimeId: string;
  hit: "designated" | "delisted" | "not_designated" | "unknown" | "partial_match";
  asOf: string;
  sourceRef?: string;
  note?: string;
}

interface ConflictPair {
  regimeA: string;
  regimeB: string;
  detail: string;
  severity: "low" | "medium" | "high";
}

interface CrossRegimeConflictReport {
  anyDesignated: boolean;
  unanimousDesignated: boolean;
  unanimousNotDesignated: boolean;
  split: boolean;
  mostRestrictive: RegimeStatus | null;
  leastRestrictive: RegimeStatus | null;
  conflicts: ConflictPair[];
  partialMatchRegimes: string[];
  unknownRegimes: string[];
  staleRegimes: string[];
  recommendedAction: "block" | "freeze" | "escalate" | "review" | "proceed_with_scope_declaration";
  rationale: string[];
}

interface Props {
  data?: CrossRegimeConflictReport | null;
}

const HIT_STYLES: Record<RegimeStatus["hit"], string> = {
  designated: "bg-red-100 text-red-800 border-red-300",
  partial_match: "bg-amber-100 text-amber-800 border-amber-300",
  unknown: "bg-zinc-100 text-zinc-700 border-zinc-300",
  delisted: "bg-blue-100 text-blue-800 border-blue-300",
  not_designated: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const ACTION_STYLES: Record<CrossRegimeConflictReport["recommendedAction"], string> = {
  freeze: "bg-red-600 text-white",
  block: "bg-red-500 text-white",
  escalate: "bg-orange-500 text-white",
  review: "bg-amber-400 text-zinc-900",
  proceed_with_scope_declaration: "bg-emerald-500 text-white",
};

export function CrossRegimeConflictCard({ data }: Props): JSX.Element | null {
  if (!data) return null;

  const lists: RegimeStatus[] = [];
  if (data.mostRestrictive) lists.push(data.mostRestrictive);
  if (data.leastRestrictive && data.leastRestrictive.regimeId !== data.mostRestrictive?.regimeId) {
    lists.push(data.leastRestrictive);
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Cross-regime conflict</div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
            ACTION_STYLES[data.recommendedAction]
          }`}
        >
          {data.recommendedAction.replace(/_/g, " ")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {data.unanimousDesignated && (
          <span className="rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-red-700">
            ⚠ unanimous designation — freeze within 24h
          </span>
        )}
        {data.split && (
          <span className="rounded border border-orange-300 bg-orange-100 px-1.5 py-0.5 text-orange-700">
            ⚖ regimes split — most-restrictive rule applies
          </span>
        )}
        {data.partialMatchRegimes.length > 0 && (
          <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-amber-700">
            partial: {data.partialMatchRegimes.join(", ")}
          </span>
        )}
        {data.staleRegimes.length > 0 && (
          <span className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
            stale snapshot: {data.staleRegimes.join(", ")}
          </span>
        )}
      </div>

      {lists.length > 0 && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          {lists.map((s) => (
            <div
              key={s.regimeId}
              className={`rounded border px-2 py-1 text-xs ${HIT_STYLES[s.hit]}`}
            >
              <div className="font-mono text-[11px] uppercase">{s.regimeId}</div>
              <div className="font-medium">{s.hit.replace(/_/g, " ")}</div>
              <div className="opacity-70">as of {s.asOf.slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}

      {data.rationale.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-zinc-700">
          {data.rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CrossRegimeConflictCard;
