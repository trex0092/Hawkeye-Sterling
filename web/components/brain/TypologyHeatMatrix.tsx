"use client";

export type TypologySeverity = "low" | "medium" | "high" | "critical";

export interface TypologyHeatEntry {
  typology: string;
  count: number;
  severity: TypologySeverity;
  lastSeen: string;
}

export interface TypologyHeatMatrixProps {
  data?: TypologyHeatEntry[];
  isLoading?: boolean;
  className?: string;
}

const SEVERITY_ORDER: Record<TypologySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_CELL: Record<TypologySeverity, string> = {
  critical: "bg-red-700 text-red-100",
  high:     "bg-orange-500 text-orange-100",
  medium:   "bg-yellow-400 text-yellow-900",
  low:      "bg-green-400 text-green-900",
};

const SEVERITY_BADGE: Record<TypologySeverity, string> = {
  critical: "bg-red-900 text-red-300 border-red-700",
  high:     "bg-orange-900 text-orange-300 border-orange-700",
  medium:   "bg-yellow-900 text-yellow-300 border-yellow-700",
  low:      "bg-emerald-900 text-emerald-300 border-emerald-700",
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function TypologyHeatMatrix({ data, isLoading = false, className = "" }: TypologyHeatMatrixProps) {
  if (isLoading) {
    return (
      <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 animate-pulse ${className}`}>
        <div className="h-5 w-48 bg-slate-700 rounded mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3 mb-3">
            <div className="h-8 flex-1 bg-slate-700 rounded" />
            <div className="h-8 w-12 bg-slate-700 rounded" />
            <div className="h-8 w-20 bg-slate-700 rounded" />
            <div className="h-8 w-28 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
        <h3 className="text-sm font-semibold text-slate-100 mb-4">Typology Heat Matrix</h3>
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <span className="text-2xl mb-2">✅</span>
          <p className="text-sm">No typologies detected</p>
        </div>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.count - a.count;
  });

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-100 mb-4">Typology Heat Matrix</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="text-left pb-2 pr-3 font-medium">Typology</th>
              <th className="text-center pb-2 px-3 font-medium">Count</th>
              <th className="text-center pb-2 px-3 font-medium">Severity</th>
              <th className="text-right pb-2 pl-3 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sorted.map((entry) => (
              <tr key={entry.typology} className="group hover:bg-slate-800/50 transition-colors">
                <td className="py-2 pr-3 text-slate-200 font-medium max-w-xs truncate" title={entry.typology}>
                  {entry.typology}
                </td>
                <td className="py-2 px-3 text-center">
                  <span
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 font-mono font-medium ${SEVERITY_BADGE[entry.severity]}`}
                  >
                    {entry.count}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  <span
                    className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${SEVERITY_CELL[entry.severity]}`}
                  >
                    {entry.severity}
                  </span>
                </td>
                <td className="py-2 pl-3 text-right text-slate-400 tabular-nums">
                  {formatDate(entry.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">{sorted.length} typolog{sorted.length === 1 ? "y" : "ies"} detected</p>
    </div>
  );
}

export default TypologyHeatMatrix;
