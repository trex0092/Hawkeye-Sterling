// Hawkeye Sterling — PepClassificationsList (audit follow-up #28).
//
// Renders the per-role PepClassification[] surfaced on
// BuiltContext.signals.pepClassifications (PR #243 commit 92431fc).
// Replaces the previous binary hasPep flag display with a richer view
// of every PEP role detected (tier + type + salience + RCA flagging).

"use client";

interface PepClassification {
  role: string;
  tier: "national" | "supra_national" | "sub_national" | "regional_org" | "international_org" | null;
  type: string;
  salience: number;
  matchedRule?: string;
  rationale: string;
}

interface Props {
  data?: readonly PepClassification[];
}

const TIER_LABEL: Record<NonNullable<PepClassification["tier"]>, string> = {
  national: "National",
  supra_national: "Supra-national",
  sub_national: "Sub-national",
  regional_org: "Regional org",
  international_org: "International org",
};

function salienceBand(s: number): string {
  if (s >= 0.85) return "bg-red-100 text-red-800 border-red-300";
  if (s >= 0.6) return "bg-orange-100 text-orange-800 border-orange-300";
  if (s >= 0.3) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-zinc-100 text-zinc-700 border-zinc-300";
}

function isRca(type: string): boolean {
  return type === "rca_family" || type === "rca_associate";
}

export function PepClassificationsList({ data }: Props): JSX.Element | null {
  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-zinc-500">PEP classifications</div>
      <ul className="mt-2 space-y-1.5">
        {data.map((p, i) => (
          <li
            key={`${p.role}-${i}`}
            className={`flex flex-wrap items-center gap-1.5 rounded border px-2 py-1 text-xs ${salienceBand(p.salience)}`}
          >
            <span className="font-medium">{p.role}</span>
            <span className="opacity-60">·</span>
            <span className="font-mono text-[11px] uppercase">{p.type.replace(/_/g, " ")}</span>
            {p.tier && (
              <>
                <span className="opacity-60">·</span>
                <span>{TIER_LABEL[p.tier]}</span>
              </>
            )}
            <span className="ml-auto tabular-nums">salience {(p.salience * 100).toFixed(0)}%</span>
            {isRca(p.type) && (
              <span className="rounded bg-zinc-900/10 px-1 py-0.5 text-[10px] uppercase tracking-wider">
                RCA
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PepClassificationsList;
