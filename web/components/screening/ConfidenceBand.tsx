"use client";

interface Props {
  score: number;
  /** Symmetric half-width band in [0, 50]. When undefined the component
   *  falls back to a heuristic derived from the score itself (the brain's
   *  calibration module is what should drive this; the fallback keeps the
   *  UI honest in the meantime). */
  band?: number;
  /** Optional sample-size hint shown alongside; lets the user judge
   *  whether the band is wide because of weak evidence or just the
   *  underlying uncertainty. */
  basis?: string;
}

// Renders score ± band so the analyst sees the calibration uncertainty
// instead of a deceptively precise integer. A 74 ± 12 critical-band
// straddles the EDD threshold and forces a manual review; a 74 ± 2 is
// dispositive.
export function ConfidenceBand({ score, band, basis }: Props) {
  // Heuristic fallback: bands are widest in the middle of the score
  // range (where matchers disagree most) and tightest at the extremes.
  const inferred = (() => {
    if (band !== undefined) return band;
    if (score >= 95 || score <= 10) return 3;
    if (score >= 85) return 5;
    if (score >= 60) return 8;
    if (score >= 35) return 10;
    return 6;
  })();
  const lo = Math.max(0, score - inferred);
  const hi = Math.min(100, score + inferred);
  return (
    <span className="inline-flex items-baseline gap-1 font-mono">
      <span className="text-ink-0">{score}</span>
      <span className="text-ink-3 text-10">± {inferred}</span>
      <span
        className="text-10 text-ink-3"
        title={basis ? `${basis} - 95% interval ≈ [${lo}, ${hi}]` : `95% interval ≈ [${lo}, ${hi}]`}
      >
        ({lo}-{hi})
      </span>
    </span>
  );
}
