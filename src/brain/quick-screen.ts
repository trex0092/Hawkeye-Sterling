// Hawkeye Sterling — `quickScreen`.
// A compact, stateless screening surface that composes the existing matching
// primitives (matchEnsemble) into a single verdict against a supplied candidate
// list. Designed for low-latency UI callers: no I/O, no network, no stubs —
// callers own candidate acquisition (DB, file, API) and pass the rows in.

import { matchEnsemble, type MatchingMethod } from './matching.js';

export type EntityType = 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';

export interface QuickScreenSubject {
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
}

export interface QuickScreenCandidate {
  listId: string;
  listRef: string;
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  programs?: string[];
}

export type QuickScreenSeverity = 'clear' | 'low' | 'medium' | 'high' | 'critical';

export interface QuickScreenHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;            // 0..1
  method: MatchingMethod;
  phoneticAgreement: boolean;
  programs?: string[];
  reason: string;
}

export interface QuickScreenOptions {
  scoreThreshold?: number;  // default 0.82 (levenshtein default)
  maxHits?: number;         // default 25
  clock?: () => number;     // injected for deterministic tests
  now?: () => string;       // injected for deterministic tests
}

export interface QuickScreenResult {
  subject: QuickScreenSubject;
  hits: QuickScreenHit[];
  topScore: number;         // 0..100
  severity: QuickScreenSeverity;
  listsChecked: number;
  candidatesChecked: number;
  durationMs: number;
  generatedAt: string;
}

const DEFAULT_THRESHOLD = 0.82;
const DEFAULT_MAX_HITS = 25;

// Shorter / simpler names are more common so require a higher threshold to
// suppress false positives. Length is measured on the normalised primary name
// (letters only, particles dropped).
function dynamicThreshold(primaryName: string): number {
  const clean = primaryName.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 4) return 0.95;
  if (clean.length <= 7) return 0.88;
  return DEFAULT_THRESHOLD;
}

export function severityFromScore(topScore: number, hitCount: number): QuickScreenSeverity {
  if (hitCount === 0) return 'clear';
  if (topScore >= 95) return 'critical';
  if (topScore >= 85) return 'high';
  if (topScore >= 70) return 'medium';
  return 'low';
}

export function quickScreen(
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
  opts: QuickScreenOptions = {},
): QuickScreenResult {
  const threshold = opts.scoreThreshold ?? dynamicThreshold(subject.name);
  const maxHits = opts.maxHits ?? DEFAULT_MAX_HITS;
  const clock = opts.clock ?? (() => Date.now());
  const now = opts.now ?? (() => new Date().toISOString());

  const start = clock();
  const subjectNames = [subject.name, ...(subject.aliases ?? [])].filter((n) => n && n.trim());

  const hits: QuickScreenHit[] = [];
  const listsSeen = new Set<string>();

  for (const cand of candidates) {
    listsSeen.add(cand.listId);
    const candNames = [cand.name, ...(cand.aliases ?? [])].filter((n) => n && n.trim());

    let bestScore = 0;
    let bestMethod: MatchingMethod = 'exact';
    let bestAlias: string | undefined;
    let phonetic = false;

    for (const sn of subjectNames) {
      for (const cn of candNames) {
        const ens = matchEnsemble(sn, cn);
        if (ens.best.score > bestScore) {
          bestScore = ens.best.score;
          bestMethod = ens.best.method;
          bestAlias = cn === cand.name ? undefined : cn;
          phonetic = ens.phoneticAgreement;
        } else if (ens.best.score === bestScore && ens.phoneticAgreement && !phonetic) {
          phonetic = true;
        }
      }
    }

    // Context-signal boosts: apply small bonuses when corroborating signals
    // agree, capped at 1.0. Only applied when the base score already cleared
    // at least 75% so noise candidates aren't lifted above the threshold.
    let boostedScore = bestScore;
    if (boostedScore >= 0.75) {
      if (phonetic) boostedScore = Math.min(1, boostedScore + 0.015);
      if (subject.jurisdiction && cand.jurisdiction &&
          subject.jurisdiction.toUpperCase() === cand.jurisdiction.toUpperCase()) {
        boostedScore = Math.min(1, boostedScore + 0.015);
      }
      if (subject.entityType && cand.entityType &&
          subject.entityType === cand.entityType) {
        boostedScore = Math.min(1, boostedScore + 0.01);
      }
    }

    if (boostedScore >= threshold) {
      const hit: QuickScreenHit = {
        listId: cand.listId,
        listRef: cand.listRef,
        candidateName: cand.name,
        score: boostedScore,
        method: bestMethod,
        phoneticAgreement: phonetic,
        reason: reasonFor(bestMethod, phonetic, subject, cand),
      };
      if (bestAlias !== undefined) hit.matchedAlias = bestAlias;
      if (cand.programs !== undefined) hit.programs = cand.programs;
      hits.push(hit);
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const clipped = hits.slice(0, maxHits);

  const topRaw = clipped[0]?.score ?? 0;
  const topScore = Math.round(topRaw * 100);
  const severity = severityFromScore(topScore, clipped.length);

  return {
    subject,
    hits: clipped,
    topScore,
    severity,
    listsChecked: listsSeen.size,
    candidatesChecked: candidates.length,
    durationMs: Math.max(0, clock() - start),
    generatedAt: now(),
  };
}

function reasonFor(
  method: MatchingMethod,
  phonetic: boolean,
  subject: QuickScreenSubject,
  cand: QuickScreenCandidate,
): string {
  const parts: string[] = [`${method} match`];
  if (phonetic) parts.push('phonetic agreement');
  if (subject.jurisdiction && cand.jurisdiction && subject.jurisdiction === cand.jurisdiction) {
    parts.push(`jurisdiction ${subject.jurisdiction}`);
  }
  if (subject.entityType && cand.entityType && subject.entityType === cand.entityType) {
    parts.push(`entity type ${subject.entityType}`);
  }
  return parts.join(' · ');
}
