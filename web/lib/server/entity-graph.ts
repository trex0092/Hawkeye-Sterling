// Hawkeye Sterling — entity resolution graph.
//
// Links historical screenings of the same real-world entity across sessions,
// even when subject names differ (transliterations, aliases, spelling variants).
// Bridges the gap between the per-session entity-resolution engine and the
// persistent screening-history store.
//
// Algorithm:
//   1. Fetch up to MAX_HISTORY_ENTRIES recent screening-history blobs for this tenant
//   2. Run pairwise resolveEntities() against the query subject
//   3. Group results by confidence tier (confirmed/possible/unlikely)
//   4. Return a canonical cluster record: one representative + all linked subjects
//
// This is O(n) pairwise — acceptable for tenant histories up to ~1000 subjects.
// For larger corpora, a graph index (e.g. approximate nearest-neighbour on
// name embeddings) should replace this brute-force pass.

import { getStore } from '@netlify/blobs';
import type { EntityRecord, ResolutionResult } from '../../../src/brain/entity-resolution.js';
import type { MatchConfidenceLevel } from '../../../src/policy/systemPrompt.js';

export interface ScreeningHistoryEntry {
  subjectId: string;
  name: string;
  entityType?: string;
  nationality?: string;
  dateOfBirth?: string;
  identifiers?: string[];
  screenedAt: string;
  verdictScore?: number;
  hitCount?: number;
}

export interface EntityClusterMember {
  subjectId: string;
  name: string;
  confidence: MatchConfidenceLevel;
  score: number;
  screenedAt: string;
  hitCount?: number;
}

export interface EntityCluster {
  querySubjectId: string;
  queryName: string;
  canonical: EntityClusterMember;
  linked: EntityClusterMember[];
  totalLinked: number;
  computedAt: string;
}

const MAX_HISTORY_ENTRIES = 500;

function toEntityRecord(entry: ScreeningHistoryEntry): EntityRecord {
  return {
    id: entry.subjectId,
    name: entry.name,
    entityType: (entry.entityType as EntityRecord['entityType']) ?? 'individual',
    nationality: entry.nationality,
    dateOfBirth: entry.dateOfBirth,
    identifiers: (entry.identifiers ?? []).map((id) => ({
      kind: 'generic',
      number: id,
      issuer: entry.nationality,
    })),
    aliases: [],
  };
}

export async function buildEntityCluster(
  tenantId: string,
  queryEntry: ScreeningHistoryEntry,
  opts: { minScore?: number; maxLinked?: number } = {},
): Promise<EntityCluster> {
  const minScore = opts.minScore ?? 0.6;
  const maxLinked = opts.maxLinked ?? 50;
  const computedAt = new Date().toISOString();

  // Load tenant screening-history index from Blobs.
  // Key pattern: `entity-graph/${tenantId}/index.json` — a compact list of
  // recent subjects (id + name + metadata). Written by the screening/run route.
  let candidates: ScreeningHistoryEntry[] = [];
  try {
    const store = getStore({ name: `hawkeye-entity-graph-${tenantId}` });
    const raw = await store.get('subject-index.json', { type: 'text' });
    if (raw) {
      const parsed = JSON.parse(raw) as ScreeningHistoryEntry[];
      candidates = parsed.slice(0, MAX_HISTORY_ENTRIES);
    }
  } catch { /* store unavailable or empty — return empty cluster */ }

  // Run pairwise resolution
  const queryRecord = toEntityRecord(queryEntry);
  const linked: EntityClusterMember[] = [];

  let resolveEntities: ((_a: EntityRecord, _b: EntityRecord) => ResolutionResult) | null = null;
  try {
    const mod = await import('../../../src/brain/entity-resolution.js');
    resolveEntities = mod.resolveEntities;
  } catch { /* brain module unavailable */ }

  for (const candidate of candidates) {
    if (candidate.subjectId === queryEntry.subjectId) continue;
    let score = 0;
    let confidence: ResolutionResult['confidence'] = 'NO_MATCH';
    if (resolveEntities) {
      try {
        const result = resolveEntities(queryRecord, toEntityRecord(candidate));
        score = result.score;
        confidence = result.confidence;
      } catch { /* skip on error */ }
    } else {
      // Fallback: simple normalised Levenshtein on lowercased name
      score = nameSimilarity(queryEntry.name, candidate.name);
      confidence = score >= 0.9 ? 'EXACT' : score >= 0.75 ? 'POSSIBLE' : 'NO_MATCH';
    }
    if (score >= minScore) {
      linked.push({
        subjectId: candidate.subjectId,
        name: candidate.name,
        confidence,
        score,
        screenedAt: candidate.screenedAt,
        hitCount: candidate.hitCount,
      });
    }
  }

  linked.sort((a, b) => b.score - a.score);
  const topLinked = linked.slice(0, maxLinked);

  // Canonical: the query subject itself (highest authority — it's the anchor)
  const canonical: EntityClusterMember = {
    subjectId: queryEntry.subjectId,
    name: queryEntry.name,
    confidence: 'EXACT' as MatchConfidenceLevel,
    score: 1,
    screenedAt: queryEntry.screenedAt,
    hitCount: queryEntry.hitCount,
  };

  return {
    querySubjectId: queryEntry.subjectId,
    queryName: queryEntry.name,
    canonical,
    linked: topLinked,
    totalLinked: linked.length,
    computedAt,
  };
}

export async function indexSubject(
  tenantId: string,
  entry: ScreeningHistoryEntry,
): Promise<void> {
  try {
    const store = getStore({ name: `hawkeye-entity-graph-${tenantId}` });
    let index: ScreeningHistoryEntry[] = [];
    try {
      const raw = await store.get('subject-index.json', { type: 'text' });
      if (raw) index = JSON.parse(raw) as ScreeningHistoryEntry[];
    } catch { /* first entry */ }
    // Upsert by subjectId
    const existing = index.findIndex((e) => e.subjectId === entry.subjectId);
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.unshift(entry);
    }
    // Cap at MAX_HISTORY_ENTRIES to bound blob size
    if (index.length > MAX_HISTORY_ENTRIES) index = index.slice(0, MAX_HISTORY_ENTRIES);
    await store.set('subject-index.json', JSON.stringify(index));
  } catch {
    // Non-critical — entity graph indexing must not fail screening
  }
}

// Simple normalised Levenshtein distance (O(n*m)) for the no-brain-module fallback.
function nameSimilarity(a: string, b: string): number {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 1;
  const m = s.length, n = t.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = s[i - 1] === t[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return 1 - (dp[m]![n]! / Math.max(m, n));
}
