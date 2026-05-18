// Hawkeye-Sterling - cross-list sanctions deduplication.
//
// The same person regularly appears on multiple lists - UN-1267, OFAC
// SDN, EU CFSP, UK OFSI - because the regimes mirror each other.
// Without dedup, screening returns N separate hits for the same
// person which:
//   1. Inflates the visible hit count and confuses the MLRO.
//   2. Triggers cross-list amplification logic that double-counts
//      the same designation as if it were independent evidence.
//   3. Makes provenance harder to attest (which list does the
//      authoritative record live on?).
//
// This module collapses identical entities across lists into a
// single record that carries `sources: [{listId, listRef}]` so the
// MLRO can see WHERE the designation came from without seeing it
// N times.
//
// Identity = normalised name + entityType match. Aliases are merged.
// jurisdiction collisions (different countries on different lists)
// are preserved as `jurisdictions: string[]` rather than collapsing
// silently - the discrepancy is forensic evidence.

import type { QuickScreenCandidate, EntityType } from '@/lib/api/quickScreen.types';

export interface DedupedSource {
  listId: string;
  listRef: string;
  programs?: string[];
}

export interface DedupedCandidate {
  /** Primary name from the first source. */
  name: string;
  /** Union of all aliases across the merged sources. */
  aliases: string[];
  /** Matched entityType - undefined if mixed across sources. */
  entityType?: EntityType;
  /** Union of all jurisdictions across the merged sources. */
  jurisdictions: string[];
  /** Authoritative source list per regime. */
  sources: DedupedSource[];
  /** Most-specific DOB found across sources, if any. */
  dateOfBirth?: string;
  /** Most-specific nationality found across sources, if any. */
  nationality?: string;
}

/**
 * Strip diacritics, normalise whitespace, lowercase. The same string
 * after this transform is the identity key for dedup.
 *
 * Intentionally conservative - we do NOT collapse "John Smith" with
 * "J. Smith" because that's a matching-engine concern, not dedup.
 * Dedup is for entries that are syntactically identical post-normalisation.
 */
export function normaliseName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface MergeKey {
  name: string;
  entityType: string; // 'undefined' literal when missing
}

function keyFor(c: QuickScreenCandidate): string {
  return JSON.stringify({
    name: normaliseName(c.name),
    entityType: c.entityType ?? 'undefined',
  } satisfies MergeKey);
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((x) => x && x.length > 0)));
}

/**
 * Collapse syntactically-identical candidates across lists. Preserves
 * `sources` so the MLRO can attest which list produced each leg of
 * the match. Stable ordering: dedup output preserves first-seen
 * order so callers can reproduce results.
 */
export function dedupCandidates(input: readonly QuickScreenCandidate[]): DedupedCandidate[] {
  const byKey = new Map<string, DedupedCandidate>();
  const order: string[] = [];

  for (const c of input) {
    const k = keyFor(c);
    const existing = byKey.get(k);
    if (!existing) {
      const merged: DedupedCandidate = {
        name: c.name,
        aliases: c.aliases ? uniq([...c.aliases]) : [],
        ...(c.entityType ? { entityType: c.entityType } : {}),
        jurisdictions: c.jurisdiction ? [c.jurisdiction] : [],
        sources: [{ listId: c.listId, listRef: c.listRef, ...(c.programs ? { programs: c.programs } : {}) }],
        ...(c.dateOfBirth ? { dateOfBirth: c.dateOfBirth } : {}),
        ...(c.nationality ? { nationality: c.nationality } : {}),
      };
      byKey.set(k, merged);
      order.push(k);
      continue;
    }
    // Merge into existing record.
    if (c.aliases?.length) existing.aliases = uniq([...existing.aliases, ...c.aliases]);
    if (c.jurisdiction && !existing.jurisdictions.includes(c.jurisdiction)) {
      existing.jurisdictions.push(c.jurisdiction);
    }
    existing.sources.push({
      listId: c.listId,
      listRef: c.listRef,
      ...(c.programs ? { programs: c.programs } : {}),
    });
    // Prefer the most specific dob / nationality (first non-empty wins).
    if (!existing.dateOfBirth && c.dateOfBirth) existing.dateOfBirth = c.dateOfBirth;
    if (!existing.nationality && c.nationality) existing.nationality = c.nationality;
  }

  return order.map((k) => byKey.get(k)!);
}

/**
 * Returns the count of original candidates and the count after dedup.
 * Convenient for observability - report the collapse ratio so the
 * MLRO can see how much amplification noise was removed.
 */
export function dedupStats(input: readonly QuickScreenCandidate[]): {
  inputCount: number;
  dedupedCount: number;
  collapsed: number;
} {
  const deduped = dedupCandidates(input);
  return {
    inputCount: input.length,
    dedupedCount: deduped.length,
    collapsed: input.length - deduped.length,
  };
}
