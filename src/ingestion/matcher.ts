// Hawkeye Sterling — fuzzy matcher (Phase 3).
// Given a query subject and a loaded entity universe from Blobs, return ranked
// CandidateMatch[] with per-strategy sub-scores. Consumed by /api/screen to
// pre-populate evidence.sanctionsHits before the brain run.

import type { NormalisedEntity } from './types.js';
import { matchScore } from '../brain/lib/name-matching.js';

export interface SanctionsHit {
  id: string;
  name: string;
  aliases: string[];
  type: NormalisedEntity['type'];
  source: string;
  programs: string[];
  score: number;
  confidence: number;
  matchedOn: 'name' | 'alias';
  jurisdictions: string[];
  reference?: string;
  fetchedAt: number;
  strategy: string;
  subScores: {
    jaroWinkler: number;
    tokenSet: number;
    jaccard3: number;
    levenshteinRatio: number;
    phoneticMatch: boolean;
  };
}

export interface MatchOptions {
  threshold?: number;
  topK?: number;
  includeAliases?: boolean;
  includeJurisdiction?: string;
}

export function matchAgainstUniverse(
  query: string,
  aliases: ReadonlyArray<string>,
  universe: ReadonlyArray<NormalisedEntity>,
  opts: MatchOptions = {},
): SanctionsHit[] {
  const threshold = opts.threshold ?? 0.7;
  const topK = opts.topK ?? 20;
  const includeAliases = opts.includeAliases ?? true;

  const hits: SanctionsHit[] = [];
  for (const e of universe) {
    // Score primary name first.
    let best = matchScore(query, e.name);
    let matchedOn: 'name' | 'alias' = 'name';
    // Subject aliases × candidate name.
    for (const al of aliases) {
      const m = matchScore(al, e.name);
      if (m.score > best.score) { best = m; matchedOn = 'name'; }
    }
    if (includeAliases) {
      for (const eal of e.aliases) {
        const m = matchScore(query, eal);
        if (m.score > best.score) { best = m; matchedOn = 'alias'; }
        for (const al of aliases) {
          const m2 = matchScore(al, eal);
          if (m2.score > best.score) { best = m2; matchedOn = 'alias'; }
        }
      }
    }
    if (best.score < threshold) continue;
    hits.push({
      id: e.id,
      name: e.name,
      aliases: e.aliases.slice(0, 10),
      type: e.type,
      source: e.source,
      programs: e.listings.map((l) => l.program ?? '').filter(Boolean),
      score: best.score,
      confidence: best.confidence,
      matchedOn,
      jurisdictions: e.jurisdictions,
      ...(e.listings[0]?.reference ? { reference: e.listings[0].reference } : {}),
      fetchedAt: e.fetchedAt,
      strategy: best.scriptStrategy,
      subScores: {
        jaroWinkler: best.jaroWinkler,
        tokenSet: best.tokenSet,
        jaccard3: best.jaccard3,
        levenshteinRatio: best.levenshteinRatio,
        phoneticMatch: best.phoneticMatch,
      },
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}
