// Hawkeye Sterling — sanctions-delta tracker (Layer #20).
//
// Diff the current screening against the most recent prior screening for
// the same subject. Surfaces newly-added hits, removed hits, and score
// drift so the MLRO sees what changed since the last review.

export interface ScreeningSnapshot {
  at: string;
  hits: Array<{ listId: string; listRef: string; score: number; programs?: string[] }>;
  topScore: number;
  severity: string;
}

export interface SanctionsDelta {
  hasChanges: boolean;
  newHits: Array<{ listId: string; listRef: string; score: number; programs?: string[] }>;
  removedHits: Array<{ listId: string; listRef: string }>;
  scoreDrift: number;       // current - previous
  severityChange: { from: string; to: string } | null;
  newProgramsAcrossAllHits: string[];
  rationale: string;
}

export function diffScreenings(current: ScreeningSnapshot, previous: ScreeningSnapshot | null): SanctionsDelta {
  if (!previous) {
    return {
      hasChanges: current.hits.length > 0,
      newHits: current.hits,
      removedHits: [],
      scoreDrift: current.topScore,
      severityChange: null,
      newProgramsAcrossAllHits: Array.from(new Set(current.hits.flatMap((h) => h.programs ?? []))),
      rationale: "First screening — no prior baseline to diff against.",
    };
  }
  const key = (h: { listId: string; listRef: string }): string => `${h.listId}:${h.listRef}`;
  const prevSet = new Set(previous.hits.map(key));
  const curSet = new Set(current.hits.map(key));
  const newHits = current.hits.filter((h) => !prevSet.has(key(h)));
  const removedHits = previous.hits.filter((h) => !curSet.has(key(h))).map((h) => ({ listId: h.listId, listRef: h.listRef }));
  const newPrograms = Array.from(new Set(newHits.flatMap((h) => h.programs ?? [])));
  const drift = current.topScore - previous.topScore;
  const sevChange = current.severity !== previous.severity ? { from: previous.severity, to: current.severity } : null;
  const has = newHits.length > 0 || removedHits.length > 0 || sevChange !== null || Math.abs(drift) >= 5;
  return {
    hasChanges: has,
    newHits,
    removedHits,
    scoreDrift: drift,
    severityChange: sevChange,
    newProgramsAcrossAllHits: newPrograms,
    rationale: has
      ? `${newHits.length} new hit(s), ${removedHits.length} removed; score drift ${drift >= 0 ? "+" : ""}${drift}; ${sevChange ? `severity ${sevChange.from} → ${sevChange.to}` : "severity unchanged"}.`
      : "No material change since last screening.",
  };
}
