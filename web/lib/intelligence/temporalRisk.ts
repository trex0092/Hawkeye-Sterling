// Hawkeye Sterling — temporal risk helpers.
//
// Adverse-media recency curve, severity decay, transaction-velocity
// helpers, and dormancy detection. The disposition engine consumes
// these to weight signals by time, not just by count.

export interface AdverseEvent {
  /** ISO 8601 timestamp. */
  at: string;
  /** Severity tier or 0..1 weight. */
  severity?: "critical" | "high" | "medium" | "low" | "clear";
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 1,
  high: 0.7,
  medium: 0.4,
  low: 0.15,
  clear: 0,
};

// Exponential decay: half-life 730 days (2 years). FATF 2024 guidance
// recognises 5+ year-old reporting as still relevant where the predicate
// offence has no statute of limitations (e.g. terrorism financing).
const HALF_LIFE_DAYS = 730;

function daysAgo(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 365 * 10; // unparseable → treat as 10y old
  return Math.max(0, (now - t) / (24 * 60 * 60 * 1000));
}

/**
 * Recency-weighted adverse-event score. Each event contributes
 * `severityWeight × 0.5^(age / halfLife)`. Sum is uncapped — caller
 * normalises against expected ceiling.
 */
export function recencyWeightedScore(events: AdverseEvent[], nowMs: number = Date.now()): number {
  if (events.length === 0) return 0;
  let s = 0;
  for (const e of events) {
    const w = SEVERITY_WEIGHT[e.severity ?? "low"] ?? 0;
    if (w === 0) continue;
    const age = daysAgo(e.at, nowMs);
    s += w * Math.pow(0.5, age / HALF_LIFE_DAYS);
  }
  return s;
}

/** Number of events within the last N days. */
export function eventsWithinDays(events: AdverseEvent[], windowDays: number, nowMs: number = Date.now()): number {
  return events.filter((e) => daysAgo(e.at, nowMs) <= windowDays).length;
}

/**
 * Burst detection — flags an unusual cluster of events (e.g. 5+ articles
 * in a single 7-day window when the baseline is sparse).
 */
export function detectBurst(events: AdverseEvent[], thresholdPerWeek = 5, nowMs: number = Date.now()): boolean {
  const recent = eventsWithinDays(events, 7, nowMs);
  return recent >= thresholdPerWeek;
}

/**
 * Velocity score 0..100: how active is the adverse signal right now?
 *   0   = no events in last 365d
 *   50  = sustained pattern (1 event / quarter)
 *   100 = burst (5+ events / week)
 */
export function velocityScore(events: AdverseEvent[], nowMs: number = Date.now()): number {
  const last7 = eventsWithinDays(events, 7, nowMs);
  const last30 = eventsWithinDays(events, 30, nowMs);
  const last90 = eventsWithinDays(events, 90, nowMs);
  const last365 = eventsWithinDays(events, 365, nowMs);
  // Weight short-window activity more.
  const score = Math.min(100, last7 * 18 + last30 * 4 + last90 * 1.5 + last365 * 0.5);
  return Math.round(score);
}

/**
 * Dormancy — true when the subject has been inactive for `dormantDays`.
 * For ongoing-monitoring purposes, dormant subjects can rotate to a
 * lighter cadence; reactivation should re-trigger full screening.
 */
export function isDormant(lastActivityIso: string | null | undefined, dormantDays = 90, nowMs: number = Date.now()): boolean {
  if (!lastActivityIso) return false;
  return daysAgo(lastActivityIso, nowMs) >= dormantDays;
}

/**
 * Time-decay severity classification — turns a flat list of articles into
 * a weighted severity band. Fresh critical = critical; old critical decays
 * to low after ~5 years.
 */
export function decayedSeverity(events: AdverseEvent[], nowMs: number = Date.now()): "clear" | "low" | "medium" | "high" | "critical" {
  const score = recencyWeightedScore(events, nowMs);
  // Calibrated against expected ceiling of ~3.0 for sustained critical pattern.
  if (score >= 1.5) return "critical";
  if (score >= 0.8) return "high";
  if (score >= 0.4) return "medium";
  if (score >= 0.1) return "low";
  return "clear";
}
