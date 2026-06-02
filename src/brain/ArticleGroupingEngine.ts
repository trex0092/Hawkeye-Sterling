// Hawkeye Sterling — Article Grouping Engine (Taranis grouping_bot.py analog).
// Separates articles about the same entity into discrete event clusters by
// crime category + publication year. Distinct events for the same subject
// ("2019 fraud" vs "2023 sanctions") are separated into distinct groups so
// StoryEngine can track each event's timeline independently.
//
// Input:  OsintItem[] + Map<articleId, NLPExtractionResult>
// Output: ArticleGroup[] sorted by article count descending.
//
// Algorithm: group by (primaryCrimeCategory, year); within each bucket,
// compute intra-cluster Jaccard similarity on crime sets as a confidence
// signal. Articles with no extracted crimes are placed in a "unknown" group.

import type { NLPExtractionResult } from './AdverseMediaNLP.js';
import type { OsintItem } from '../integrations/osint-pipeline.js';

export interface ArticleGroup {
  groupId: string;
  label: string;                    // human-readable, e.g. "money_laundering — 2023"
  primaryCrimeCategory: string;
  year: number | null;
  articleIds: string[];
  confidence: number;               // 0..1 — intra-cluster similarity
}

function yearFrom(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})/);
  if (!m) return null;
  const yr = parseInt(m[1] ?? '0', 10);
  return yr >= 1990 && yr <= 2100 ? yr : null;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const v of a) { if (b.has(v)) shared++; }
  const union = a.size + b.size - shared;
  return union === 0 ? 1 : shared / union;
}

function clusterKey(primaryCrime: string, year: number | null): string {
  return `${primaryCrime}__${year ?? 'unknown'}`;
}

function safeGroupId(key: string): string {
  return `grp_${key.replace(/[^a-z0-9_]/gi, '_').slice(0, 48)}`;
}

/** Group articles into discrete event clusters by crime type + year. */
export function groupArticles(
  items: OsintItem[],
  nlpResults: Map<string, NLPExtractionResult>,
): ArticleGroup[] {
  // Annotate each item with its primary crime and year
  const annotated = items.map(item => {
    const nlp = nlpResults.get(item.id);
    const crimes = nlp ? nlp.crimes.map(c => c.category) : [];
    const primary = crimes[0] ?? 'unknown';
    const year = yearFrom(item.publishedAt);
    return { id: item.id, crimes, primary, year };
  });

  // Bucket by (primaryCrime, year)
  const buckets = new Map<string, typeof annotated>();
  for (const art of annotated) {
    const key = clusterKey(art.primary, art.year);
    const bucket = buckets.get(key) ?? [];
    bucket.push(art);
    buckets.set(key, bucket);
  }

  const groups: ArticleGroup[] = [];

  for (const [key, bucket] of buckets) {
    const parts = key.split('__');
    const primaryCrime = parts[0] ?? 'unknown';
    const yearStr = parts[1] ?? 'unknown';
    const year = yearStr === 'unknown' ? null : parseInt(yearStr, 10);

    // Intra-cluster confidence: average pairwise Jaccard on crime sets
    let totalSim = 0;
    let pairs = 0;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const bi = bucket[i];
        const bj = bucket[j];
        if (bi === undefined || bj === undefined) continue;
        totalSim += jaccard(new Set(bi.crimes), new Set(bj.crimes));
        pairs++;
      }
    }
    const confidence = pairs === 0 ? 0.5 : totalSim / pairs;
    const label = year ? `${primaryCrime} — ${year}` : primaryCrime;

    groups.push({
      groupId: safeGroupId(key),
      label,
      primaryCrimeCategory: primaryCrime,
      year,
      articleIds: bucket.map(a => a.id),
      confidence,
    });
  }

  return groups.sort((a, b) => b.articleIds.length - a.articleIds.length);
}
