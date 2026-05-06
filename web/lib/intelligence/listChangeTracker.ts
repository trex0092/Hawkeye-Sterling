// Hawkeye Sterling — sanctions-list change tracker.
//
// Compares the current screening result against a prior snapshot for
// the same subject. Surfaces:
//   - Score-band transitions (CLEAR → POSITIVE = critical event)
//   - New hits added since last screen
//   - Hits dropped since last screen
//   - List-version updates that affected the result
//
// Used by the daily ongoing-monitoring cron (/api/ongoing/run) to
// alert MLRO when a subject's risk profile changes between scans.

export interface ScreeningSnapshot {
  subjectId: string;
  subjectName: string;
  unifiedScore: number;
  band: "clear" | "low" | "medium" | "high" | "critical";
  hitListIds: string[];           // ["ofac-sdn", "qa-namlc", ...]
  generatedAt: string;
}

export interface ChangeTrackerResult {
  hasChange: boolean;
  scoreDelta: number;              // current - prior
  bandTransition: { from: string; to: string } | null;
  newHits: string[];
  droppedHits: string[];
  daysSinceLastScreen: number | null;
  severity: "informational" | "warn" | "critical";
  signal: string;
}

const BAND_RANK: Record<string, number> = {
  clear: 0, low: 1, medium: 2, high: 3, critical: 4,
};

export function trackListChanges(
  current: ScreeningSnapshot,
  prior: ScreeningSnapshot | null,
): ChangeTrackerResult {
  if (!prior) {
    return {
      hasChange: false,
      scoreDelta: 0,
      bandTransition: null,
      newHits: [],
      droppedHits: [],
      daysSinceLastScreen: null,
      severity: "informational",
      signal: "First screening for this subject — no prior snapshot to compare.",
    };
  }

  const scoreDelta = current.unifiedScore - prior.unifiedScore;
  const fromRank = BAND_RANK[prior.band] ?? 0;
  const toRank = BAND_RANK[current.band] ?? 0;
  const bandTransition = fromRank !== toRank ? { from: prior.band, to: current.band } : null;

  const priorSet = new Set(prior.hitListIds);
  const currentSet = new Set(current.hitListIds);
  const newHits = [...currentSet].filter((h) => !priorSet.has(h));
  const droppedHits = [...priorSet].filter((h) => !currentSet.has(h));

  const daysSinceLastScreen = Math.round(
    (new Date(current.generatedAt).getTime() - new Date(prior.generatedAt).getTime()) / 86_400_000,
  );

  let severity: ChangeTrackerResult["severity"];
  if (toRank > fromRank && toRank >= 3) severity = "critical";  // escalation to high/critical
  else if (newHits.length > 0 && current.band !== "clear") severity = "warn";
  else if (Math.abs(scoreDelta) >= 25) severity = "warn";
  else severity = "informational";

  let signal: string;
  if (severity === "critical") {
    signal = `CRITICAL CHANGE: subject moved from ${prior.band.toUpperCase()} → ${current.band.toUpperCase()} since ${daysSinceLastScreen}d ago. ${newHits.length > 0 ? `New hit(s): ${newHits.join(", ")}.` : ""} Immediate MLRO review.`;
  } else if (bandTransition) {
    signal = `Band transition ${prior.band} → ${current.band} (Δ${scoreDelta > 0 ? "+" : ""}${scoreDelta}). Document the change rationale.`;
  } else if (newHits.length > 0 || droppedHits.length > 0) {
    signal = `Hit-set drift: ${newHits.length} new, ${droppedHits.length} dropped. Score delta ${scoreDelta > 0 ? "+" : ""}${scoreDelta}.`;
  } else if (Math.abs(scoreDelta) >= 10) {
    signal = `Score moved ${scoreDelta > 0 ? "+" : ""}${scoreDelta} pts since last screen — adverse-media velocity may have shifted.`;
  } else {
    signal = "Subject is stable since last screen — no list-change events detected.";
  }

  return {
    hasChange: bandTransition !== null || newHits.length > 0 || droppedHits.length > 0 || Math.abs(scoreDelta) >= 10,
    scoreDelta,
    bandTransition,
    newHits,
    droppedHits,
    daysSinceLastScreen,
    severity,
    signal,
  };
}
