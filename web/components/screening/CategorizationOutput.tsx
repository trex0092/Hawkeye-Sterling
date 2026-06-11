"use client";

interface CategorizationProps {
  riskCategory: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDiligence: "CDD" | "SDD" | "EDD";
  nextReviewDate: string;
  slaDeadline?: string;
  provisionalScreening?: boolean;
  overrideReasons?: string[];
}

const CATEGORY_TONE: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  CRITICAL: { border: "border-red/30",    bg: "bg-red-dim",   text: "text-red",    dot: "bg-red"    },
  HIGH:     { border: "border-amber/50",  bg: "bg-amber-dim", text: "text-orange", dot: "bg-orange" },
  MEDIUM:   { border: "border-amber/30",  bg: "bg-amber-dim", text: "text-amber",  dot: "bg-amber"  },
  LOW:      { border: "border-green/30",  bg: "bg-green-dim", text: "text-green",  dot: "bg-green"  },
};

const DD_LABEL: Record<string, string> = {
  EDD: "Enhanced Due Diligence",
  SDD: "Simplified Due Diligence",
  CDD: "Customer Due Diligence",
};

export function CategorizationOutput({
  riskCategory,
  dueDiligence,
  nextReviewDate,
  slaDeadline,
  provisionalScreening,
  overrideReasons,
}: CategorizationProps) {
  const tone = CATEGORY_TONE[riskCategory] ?? CATEGORY_TONE["LOW"]!;

  const reviewIn = nextReviewDate
    ? Math.max(0, Math.floor((new Date(nextReviewDate).getTime() - Date.now()) / 86_400_000))
    : null;

  const slaIn = slaDeadline
    ? Math.max(0, Math.floor((new Date(slaDeadline).getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <div className={`border ${tone.border} ${tone.bg} rounded-lg p-3 mt-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
        <span className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
          Categorization Output
        </span>
        {provisionalScreening && (
          <span className="ml-auto text-10 font-semibold bg-amber-dim border border-amber/30 text-amber rounded px-1.5 py-0.5 uppercase tracking-wide-2">
            PROVISIONAL
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <span role="status" aria-live="polite" aria-atomic="true">
          <CategStat
            label="Risk Category"
            value={riskCategory}
            valueClass={tone.text}
          />
        </span>
        <CategStat
          label="Due Diligence"
          value={DD_LABEL[dueDiligence] ?? dueDiligence}
        />
        <CategStat
          label="Next Review"
          value={reviewIn !== null ? `${reviewIn}d` : "—"}
          valueClass={reviewIn !== null && reviewIn <= 7 ? "text-red" : "text-ink-0"}
          sub={nextReviewDate ? new Date(nextReviewDate).toLocaleDateString("en-GB") : undefined}
        />
        {slaIn !== null && (
          <CategStat
            label="SLA Deadline"
            value={slaIn < 24 ? `${slaIn}h` : `${Math.floor(slaIn / 24)}d`}
            valueClass={slaIn < 24 ? "text-red" : slaIn < 48 ? "text-orange" : "text-ink-0"}
          />
        )}
      </div>

      {overrideReasons && overrideReasons.length > 0 && (
        <div className="mt-2 pt-2 border-t border-hair-2">
          <div className="text-10 text-ink-3 uppercase tracking-wide-2 mb-1">Override reasons</div>
          <ul className="space-y-0.5">
            {overrideReasons.map((r, i) => (
              <li key={i} className="text-10.5 text-ink-2 font-mono">· {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategStat({ label, value, valueClass, sub }: {
  label: string; value: string; valueClass?: string; sub?: string;
}) {
  return (
    <div>
      <div className="text-9.5 uppercase tracking-wide-3 text-ink-3 font-medium mb-0.5">{label}</div>
      <div className={`font-mono text-13 font-semibold ${valueClass ?? "text-ink-0"}`}>{value}</div>
      {sub && <div className="text-10 text-ink-3">{sub}</div>}
    </div>
  );
}
