// Hawkeye Sterling — evidence corroboration scorer.
// Given a list of EvidenceItems that all support (or contradict) a claim,
// computes a single corroboration score ∈ [0,1] that penalises:
//   - shared publisher (not independent)
//   - stale observation dates
//   - low source credibility
// and rewards:
//   - diversity of kinds + publishers
//   - recency
//   - primary / authoritative sources
// The function is deliberately conservative — under-scoring is preferable
// to over-claiming under the compliance charter (P2 + P8).

import type { EvidenceItem, SourceCredibility } from './evidence.js';

export interface CorroborationResult {
  score: number;                    // 0..1
  items: number;
  independentSources: number;       // distinct publishers
  kinds: string[];                  // distinct kinds observed
  medianAgeDays: number;
  stalePenalty: number;             // 0..1 fraction that were stale
  trainingDataPenalty: number;      // 1.0 if any item is training-data-only
  credibilityAverage: number;       // 0..1
  reasons: string[];
}

function cScore(c: SourceCredibility): number {
  switch (c) {
    case 'authoritative': return 1;
    case 'primary': return 0.9;
    case 'reputable': return 0.7;
    case 'mixed': return 0.5;
    case 'weak': return 0.3;
    case 'unknown': return 0.2;
  }
}

function ageDays(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? (s[(n - 1) >> 1] ?? 0) : ((s[n / 2 - 1] ?? 0) + (s[n / 2] ?? 0)) / 2;
}

export interface CorroborationOptions {
  /** Items older than this many days count toward the stale-penalty. Default 365. */
  staleMaxDays?: number;
  /** Observation-date reference. Default: now. */
  now?: Date;
}

export function corroborate(items: readonly EvidenceItem[], opts: CorroborationOptions = {}): CorroborationResult {
  const now = opts.now ?? new Date();
  const staleMaxDays = opts.staleMaxDays ?? 365;

  if (items.length === 0) {
    return {
      score: 0,
      items: 0,
      independentSources: 0,
      kinds: [],
      medianAgeDays: 0,
      stalePenalty: 0,
      trainingDataPenalty: 0,
      credibilityAverage: 0,
      reasons: ['no evidence supplied'],
    };
  }

  const publishers = new Set<string>();
  const kinds = new Set<string>();
  const ages: number[] = [];
  const credScores: number[] = [];
  let stale = 0;
  let trainingDataUsed = false;
  let primaryOrAuthoritativeCount = 0;

  for (const ev of items) {
    publishers.add(ev.publisher ?? ev.uri ?? ev.id);
    kinds.add(ev.kind);
    const age = ageDays(ev.observedAt, now);
    ages.push(age);
    if (age > staleMaxDays) stale++;
    if (ev.kind === 'training_data') trainingDataUsed = true;
    credScores.push(cScore(ev.credibility));
    if (ev.credibility === 'authoritative' || ev.credibility === 'primary') primaryOrAuthoritativeCount++;
  }

  const independentSources = publishers.size;
  const medianAge = median(ages);
  const stalePenalty = stale / items.length;
  const trainingDataPenalty = trainingDataUsed ? 1 : 0;
  const credibilityAverage = credScores.reduce((a, b) => a + b, 0) / credScores.length;

  // Diversity bonus: more distinct publishers + kinds → higher score.
  const diversityBonus = Math.min(1, (independentSources - 1) * 0.15 + (kinds.size - 1) * 0.1);
  // Freshness: 1 at 0 days, 0 at staleMaxDays.
  const freshness = Math.max(0, 1 - medianAge / staleMaxDays);
  // Primary source weight.
  const primaryBoost = Math.min(0.3, (primaryOrAuthoritativeCount / items.length) * 0.3);

  let score =
    0.45 * credibilityAverage +
    0.25 * freshness +
    0.20 * diversityBonus +
    0.10 * primaryBoost * (10 / 3); // normalise back to 0..1 contribution
  score = Math.min(1, Math.max(0, score));

  // Penalties cap the final score.
  if (trainingDataPenalty > 0) score = Math.min(score, 0.3);  // charter P8 — training data is not a current source.
  if (stalePenalty > 0.5) score *= 0.7;
  if (independentSources === 1 && items.length > 1) score *= 0.8; // not truly independent.

  const reasons: string[] = [];
  reasons.push(`${items.length} evidence item(s) across ${independentSources} independent publisher(s), ${kinds.size} kind(s).`);
  if (trainingDataPenalty) reasons.push('⚠ training-data evidence present — charter P8 stale-by-definition penalty applied.');
  if (stalePenalty > 0) reasons.push(`${stale} of ${items.length} items older than ${staleMaxDays} days.`);
  if (medianAge === Number.POSITIVE_INFINITY) reasons.push('some observation dates unparseable.');
  reasons.push(`Credibility mean ${(credibilityAverage * 100).toFixed(0)}%, diversity bonus ${(diversityBonus * 100).toFixed(0)}%, freshness ${(freshness * 100).toFixed(0)}%.`);

  return {
    score: Number(score.toFixed(3)),
    items: items.length,
    independentSources,
    kinds: [...kinds],
    medianAgeDays: Number.isFinite(medianAge) ? medianAge : -1,
    stalePenalty,
    trainingDataPenalty,
    credibilityAverage: Number(credibilityAverage.toFixed(3)),
    reasons,
  };
}
