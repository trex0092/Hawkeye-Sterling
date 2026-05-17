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
  // Disambiguation discriminators — when present these adjust the matching
  // score up (confirmation) or down (conflict). Required for reliable
  // common-name discrimination in high-volume AML/CFT workflows.
  dateOfBirth?: string;   // ISO 8601, partial ("YYYY"), or DD/MM/YYYY
  nationality?: string;   // ISO 3166-1 alpha-2 or country name
}

export interface QuickScreenCandidate {
  listId: string;
  listRef: string;
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  programs?: string[];
  // Discriminator fields from source list — used to confirm or suppress matches.
  dateOfBirth?: string;
  nationality?: string;
}

export type QuickScreenSeverity = 'clear' | 'low' | 'medium' | 'high' | 'critical';

// How well the subject's DOB aligns with the candidate's DOB.
// 'exact'    — full year+month+day agreement → strong confirmation
// 'year'     — year matches (partial info) → mild confirmation
// 'conflict' — year is defined on both sides and disagrees → strong negative signal
// 'none'     — DOB unavailable on one or both sides → no adjustment
export type DobMatch = 'exact' | 'year' | 'conflict' | 'none';

export interface QuickScreenHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;              // 0..1 after discriminator adjustments
  baseScore: number;          // 0..1 raw name-matching score before adjustments
  method: MatchingMethod;
  phoneticAgreement: boolean;
  programs?: string[];
  reason: string;
  // Discriminator results (present only when applicable)
  dobMatch?: DobMatch;
  nationalityMatch?: boolean;
  // Per-algorithm score breakdown (present when opts.includeScoreBreakdown = true)
  scores?: Partial<Record<MatchingMethod, number>>;
  // Disambiguation confidence 0..100 and resulting recommendation.
  // Derived from discriminator signals (DOB, nationality, phonetics).
  disambiguationConfidence?: number;
  recommendation?: 'match' | 'review' | 'dismiss';
}

export interface QuickScreenOptions {
  scoreThreshold?: number;          // default 0.82
  maxHits?: number;                 // default 25
  includeScoreBreakdown?: boolean;  // attach per-algorithm scores to each hit
  clock?: () => number;
  now?: () => string;
}

export interface QuickScreenResult {
  subject: QuickScreenSubject;
  hits: QuickScreenHit[];
  topScore: number;                 // 0..100 (scaled from hits[0].score)
  severity: QuickScreenSeverity;
  listsChecked: number;
  candidatesChecked: number;
  durationMs: number;
  generatedAt: string;
  // Weighted risk scoring across hits — accounts for regulatory importance of
  // each sanctions list (OFAC SDN, EOCN > bilateral > informational).
  totalWeightedScore?: number;       // 0..100 weighted composite across all hit lists
  confidenceScore?: number;          // 0..100 aggregate discriminator confidence
  listBreakdown?: Record<string, {   // per-list summary (only lists with hits)
    hits: number;
    topScore: number;                // 0..100
    weight: number;                  // list regulatory weight
  }>;
}

const DEFAULT_THRESHOLD = 0.82;
const DEFAULT_MAX_HITS = 25;

// Regulatory weight per sanctions list.  Higher = more consequential for
// the UAE AML/CFT framework.  Unknown lists default to 10.
const LIST_WEIGHTS: Record<string, number> = {
  un_consolidated: 40, un_1267: 40,
  ofac_sdn: 38, ofac_cons: 30,
  uae_eocn: 40, uae_ltl: 35,
  eu_fsf: 25, uk_ofsi: 22,
  ca_osfi: 20, ch_seco: 20, au_dfat: 20,
  jp_mof: 15,
};
const DEFAULT_LIST_WEIGHT = 10;

function listWeight(listId: string): number {
  return LIST_WEIGHTS[listId] ?? DEFAULT_LIST_WEIGHT;
}

function disambiguationConfidenceFor(
  dobMatch: DobMatch,
  nationalityMatch: boolean | undefined,
  phonetic: boolean,
): number {
  let conf = 50; // neutral baseline
  if (dobMatch === 'exact')    conf += 40;
  else if (dobMatch === 'year') conf += 20;
  else if (dobMatch === 'conflict') conf -= 40;
  if (nationalityMatch === true)  conf += 20;
  if (phonetic) conf += 10;
  return Math.min(100, Math.max(0, conf));
}

function recommendationFor(disambConf: number): 'match' | 'review' | 'dismiss' {
  if (disambConf >= 75) return 'match';
  if (disambConf >= 40) return 'review';
  return 'dismiss';
}

// ── DOB matching ──────────────────────────────────────────────────────────────

interface DobParts { y: number; m?: number; d?: number }

function parseDobParts(raw: string): DobParts | null {
  const s = raw.trim();
  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const isoM = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoM) return { y: +(isoM[1] ?? '0'), m: +(isoM[2] ?? '0'), d: +(isoM[3] ?? '0') };
  // European: DD/MM/YYYY or DD.MM.YYYY
  const dmyM = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyM) return { y: +(dmyM[3] ?? '0'), m: +(dmyM[2] ?? '0'), d: +(dmyM[1] ?? '0') };
  // Year only
  const yM = s.match(/^(\d{4})$/);
  if (yM) return { y: +(yM[1] ?? '0') };
  return null;
}

function matchDOB(subjectDob: string, candidateDob: string): { match: DobMatch; boost: number } {
  const sp = parseDobParts(subjectDob);
  const cp = parseDobParts(candidateDob);
  if (!sp || !cp) return { match: 'none', boost: 0 };
  if (sp.y !== cp.y) return { match: 'conflict', boost: -0.20 };
  // Years agree — check month+day for stronger confirmation
  if (sp.m !== undefined && cp.m !== undefined && sp.m === cp.m &&
      sp.d !== undefined && cp.d !== undefined && sp.d === cp.d) {
    return { match: 'exact', boost: 0.12 };
  }
  // Year (and optionally month) agree but full date not confirmed
  return { match: 'year', boost: 0.06 };
}

// ── Severity ──────────────────────────────────────────────────────────────────

export function severityFromScore(topScore: number, hitCount: number): QuickScreenSeverity {
  if (hitCount === 0) return 'clear';
  if (topScore >= 95) return 'critical';
  if (topScore >= 85) return 'high';
  if (topScore >= 70) return 'medium';
  return 'low';
}

// ── Main screening function ───────────────────────────────────────────────────

export function quickScreen(
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
  opts: QuickScreenOptions = {},
): QuickScreenResult {
  const threshold = opts.scoreThreshold ?? DEFAULT_THRESHOLD;
  const maxHits = opts.maxHits ?? DEFAULT_MAX_HITS;
  const clock = opts.clock ?? (() => Date.now());
  const now = opts.now ?? (() => new Date().toISOString());
  const breakdown = opts.includeScoreBreakdown ?? false;

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
    let bestEns: ReturnType<typeof matchEnsemble> | undefined;

    for (const sn of subjectNames) {
      for (const cn of candNames) {
        const ens = matchEnsemble(sn, cn);
        if (ens.best.score > bestScore) {
          bestScore = ens.best.score;
          bestMethod = ens.best.method;
          bestAlias = cn === cand.name ? undefined : cn;
          phonetic = ens.phoneticAgreement;
          bestEns = ens;
        } else if (ens.best.score === bestScore && ens.phoneticAgreement) {
          phonetic = true;
        }
      }
    }

    // ── Discriminator adjustments ─────────────────────────────────────────────
    // Applied to the base name-matching score. Each signal is independent.
    // The adjusted score is used for threshold filtering and hit ranking.
    // Operators see both baseScore and score so the adjustment is transparent.

    let adjScore = bestScore;
    let dobMatchResult: DobMatch = 'none';
    let nationalityMatch: boolean | undefined;

    // DOB discriminator — most important for common-name disambiguation
    if (subject.dateOfBirth && cand.dateOfBirth) {
      const { match, boost } = matchDOB(subject.dateOfBirth, cand.dateOfBirth);
      dobMatchResult = match;
      adjScore = Math.min(1, Math.max(0, adjScore + boost));
    }

    // Nationality discriminator
    if (subject.nationality && cand.nationality) {
      const sNat = subject.nationality.trim().toLowerCase();
      const cNat = cand.nationality.trim().toLowerCase();
      if (sNat === cNat && sNat.length > 0) {
        nationalityMatch = true;
        adjScore = Math.min(1, adjScore + 0.04);
      } else {
        nationalityMatch = false;
      }
    }

    // Jurisdiction boost (corroborative signal, not a conflict indicator)
    if (subject.jurisdiction && cand.jurisdiction) {
      const sj = subject.jurisdiction.trim().toUpperCase();
      const cj = cand.jurisdiction.trim().toUpperCase();
      if (sj === cj && sj.length > 0) adjScore = Math.min(1, adjScore + 0.03);
    }

    if (adjScore >= threshold) {
      const disambConf = disambiguationConfidenceFor(dobMatchResult, nationalityMatch, phonetic);
      const hit: QuickScreenHit = {
        listId: cand.listId,
        listRef: cand.listRef,
        candidateName: cand.name,
        score: adjScore,
        baseScore: bestScore,
        method: bestMethod,
        phoneticAgreement: phonetic,
        reason: reasonFor(bestMethod, phonetic, subject, cand, dobMatchResult),
        disambiguationConfidence: disambConf,
        recommendation: recommendationFor(disambConf),
      };
      if (bestAlias !== undefined) hit.matchedAlias = bestAlias;
      if (cand.programs !== undefined) hit.programs = cand.programs;
      if (dobMatchResult !== 'none') hit.dobMatch = dobMatchResult;
      if (nationalityMatch !== undefined) hit.nationalityMatch = nationalityMatch;
      if (breakdown && bestEns) {
        const seen = new Set<string>();
        const scoreMap: Partial<Record<MatchingMethod, number>> = {};
        for (const s of bestEns.scores) {
          // Keep the highest score per method (raw + normalised passes can both appear)
          if (!seen.has(s.method) || (scoreMap[s.method] ?? 0) < s.score) {
            scoreMap[s.method] = s.score;
            seen.add(s.method);
          }
        }
        hit.scores = scoreMap;
      }
      hits.push(hit);
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const clipped = hits.slice(0, maxHits);

  const topRaw = clipped[0]?.score ?? 0;
  const topScore = Math.round(topRaw * 100);
  const severity = severityFromScore(topScore, clipped.length);

  // ── Weighted scoring across all hits ──────────────────────────────────────
  // Build per-list summary; use the highest-scoring hit per list.
  const listBreakdown: Record<string, { hits: number; topScore: number; weight: number }> = {};
  for (const h of clipped) {
    const rec = listBreakdown[h.listId];
    const hs100 = Math.round(h.score * 100);
    if (!rec) {
      listBreakdown[h.listId] = { hits: 1, topScore: hs100, weight: listWeight(h.listId) };
    } else {
      rec.hits++;
      if (hs100 > rec.topScore) rec.topScore = hs100;
    }
  }

  let totalWeightedScore: number | undefined;
  if (clipped.length > 0) {
    let wSum = 0; let wTotal = 0;
    for (const rec of Object.values(listBreakdown)) {
      wSum += rec.topScore * rec.weight;
      wTotal += rec.weight;
    }
    totalWeightedScore = wTotal > 0 ? Math.round(wSum / wTotal) : topScore;
  }

  // Aggregate confidence: mean of per-hit disambiguation confidences.
  let confidenceScore: number | undefined;
  if (clipped.length > 0) {
    const sum = clipped.reduce((acc, h) => acc + (h.disambiguationConfidence ?? 50), 0);
    confidenceScore = Math.round(sum / clipped.length);
  }

  return {
    subject,
    hits: clipped,
    topScore,
    severity,
    listsChecked: listsSeen.size,
    candidatesChecked: candidates.length,
    durationMs: Math.max(0, clock() - start),
    generatedAt: now(),
    ...(totalWeightedScore !== undefined ? { totalWeightedScore } : {}),
    ...(confidenceScore !== undefined ? { confidenceScore } : {}),
    ...(clipped.length > 0 ? { listBreakdown } : {}),
  };
}

function reasonFor(
  method: MatchingMethod,
  phonetic: boolean,
  subject: QuickScreenSubject,
  cand: QuickScreenCandidate,
  dobMatch: DobMatch = 'none',
): string {
  const parts: string[] = [`${method} match`];
  if (phonetic) parts.push('phonetic agreement');
  if (dobMatch === 'exact') parts.push('DOB confirmed');
  else if (dobMatch === 'year') parts.push('birth year match');
  else if (dobMatch === 'conflict') parts.push('DOB conflict');
  if (subject.jurisdiction && cand.jurisdiction && subject.jurisdiction === cand.jurisdiction) {
    parts.push(`jurisdiction ${subject.jurisdiction}`);
  }
  if (subject.entityType && cand.entityType && subject.entityType === cand.entityType) {
    parts.push(`entity type ${subject.entityType}`);
  }
  return parts.join(' · ');
}
