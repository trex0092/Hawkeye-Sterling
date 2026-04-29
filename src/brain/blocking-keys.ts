// Hawkeye Sterling — blocking keys for scalable name matching.
// Computes low-cardinality bucketing keys so matchEnsemble() only runs across
// plausibly-similar candidates instead of O(n²). Use at ingestion time and
// store on every list entry.

import { doubleMetaphone, soundex } from './matching.js';
import { normaliseArabicRoman } from './translit.js';

export interface BlockingKeys {
  firstInitial: string;
  soundex: string;
  dmPrimary: string;
  dmAlternate: string;
  tokenSortFirst: string;
  canonical: string;
}

function tokenise(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function blockingKeysFor(name: string): BlockingKeys {
  const tokens = tokenise(name);
  const canonical = normaliseArabicRoman(name);
  const joined = tokens.join(' ');
  const first = tokens[0] ?? '';
  const dm = doubleMetaphone(joined);
  return {
    firstInitial: (first[0] ?? '').toUpperCase(),
    soundex: soundex(joined),
    dmPrimary: dm.primary,
    dmAlternate: dm.alternate,
    tokenSortFirst: [...tokens].sort()[0] ?? '',
    canonical,
  };
}

export function candidatePairs(
  keysA: Map<string, BlockingKeys>,
  keysB: Map<string, BlockingKeys>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  // Index B by each blocking key.
  const idx: Record<string, Set<string>> = { initial: new Set(), soundex: new Set(), dm: new Set(), tok: new Set(), canon: new Set() };
  const byInitial = new Map<string, string[]>();
  const bySoundex = new Map<string, string[]>();
  const byDm = new Map<string, string[]>();
  const byTok = new Map<string, string[]>();
  const byCanon = new Map<string, string[]>();
  for (const [id, k] of keysB) {
    add(byInitial, k.firstInitial, id);
    add(bySoundex, k.soundex, id);
    add(byDm, k.dmPrimary, id);
    add(byDm, k.dmAlternate, id);
    add(byTok, k.tokenSortFirst, id);
    add(byCanon, k.canonical, id);
  }
  const seen = new Set<string>();
  for (const [idA, k] of keysA) {
    const hits = new Set<string>();
    for (const b of byInitial.get(k.firstInitial) ?? []) hits.add(b);
    for (const b of bySoundex.get(k.soundex) ?? []) hits.add(b);
    for (const b of byDm.get(k.dmPrimary) ?? []) hits.add(b);
    for (const b of byDm.get(k.dmAlternate) ?? []) hits.add(b);
    for (const b of byTok.get(k.tokenSortFirst) ?? []) hits.add(b);
    for (const b of byCanon.get(k.canonical) ?? []) hits.add(b);
    for (const idB of hits) {
      const key = `${idA}|${idB}`;
      if (!seen.has(key)) { seen.add(key); pairs.push([idA, idB]); }
    }
  }
  return pairs;
}

function add<T>(m: Map<string, T[]>, key: string, v: T): void {
  if (!key) return;
  if (!m.has(key)) m.set(key, []);
  m.get(key)!.push(v);
}
