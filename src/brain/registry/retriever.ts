// Hawkeye Sterling — registry retriever.
//
// Returns chunks that could plausibly anchor a claim against the
// query, with class metadata intact. Two-stage filter:
//
//   1. Candidate selection — class filter + sourceId filter + lexical
//      signal match on the chunk's source title, article ref, and
//      subject tags. Lexical match is intentionally lossy; the
//      Advisor's prompt-time classifier does the semantic ranking.
//   2. Taxonomic guard — the gold-vs-Kimberley exclusion rules from
//      taxonomic-guard.ts. Suppressed chunks are returned in
//      `excluded` so the audit log can record what was filtered.
//
// The retriever NEVER returns a chunk without its class label. If a
// chunk arrived without one (e.g. a malformed snapshot), it's
// suppressed and a guard-trace entry is emitted.

import { applyTaxonomicGuard, shouldSuppress } from './taxonomic-guard.js';
import type { RegistryStore } from './store.js';
import type { CitationClass, RegistryChunk, RetrievalQuery, RetrievalResult, SubjectTag } from './types.js';

/** Cheap lexical scorer — counts how many of these signals match the
 *  chunk's metadata: source title, article ref, and subject tags.
 *  Higher score ≈ more plausibly relevant. The Advisor reranks
 *  semantically; this is a filter, not a ranker. */
function lexicalScore(chunk: RegistryChunk, queryLower: string): number {
  let score = 0;
  if (chunk.metadata.sourceTitle && queryLower.includes(chunk.metadata.sourceId.toLowerCase())) score += 5;
  if (chunk.metadata.articleRef && queryLower.includes(chunk.metadata.articleRef.toLowerCase())) score += 4;
  for (const tag of chunk.metadata.subjectTags) {
    if (queryLower.includes(tag.replace(/_/g, ' '))) score += 2;
    if (queryLower.includes(tag)) score += 1;
  }
  // Light topic-keyword bonuses — keep this list tight; semantic
  // ranking lives elsewhere.
  const TOPIC_BONUS: Array<{ rx: RegExp; tag: SubjectTag; weight: number }> = [
    { rx: /\b(?:str|sar)\b|suspicious (?:transaction|activity)/i, tag: 'str_sar', weight: 3 },
    { rx: /\bcdd\b|customer due diligence|onboard/i, tag: 'cdd', weight: 3 },
    { rx: /\bedd\b|enhanced due diligence/i, tag: 'edd', weight: 3 },
    { rx: /tipping[- ]?off|tip[- ]?off/i, tag: 'tipping_off', weight: 3 },
    { rx: /record[- ]?keep|retention/i, tag: 'recordkeeping', weight: 3 },
    { rx: /\bpep\b|politically exposed/i, tag: 'pep', weight: 3 },
    { rx: /sanctions?|ofac|unscr|tfs/i, tag: 'sanctions', weight: 3 },
    { rx: /mlro\s+(?:appointment|nomination)/i, tag: 'mlro_appointment', weight: 3 },
    { rx: /goaml|fiu\s+filing|fiu\s+report/i, tag: 'fiu_filing', weight: 3 },
    { rx: /wire\s+transfer|payment\s+message|mt103/i, tag: 'wire_transfer', weight: 3 },
    { rx: /\bcahra\b|conflict[- ]affected/i, tag: 'cahra', weight: 3 },
    { rx: /gold|bullion|dor[eé]|kilo[- ]?bar|jewell?er/i, tag: 'gold', weight: 3 },
    { rx: /diamond|kimberley/i, tag: 'diamond', weight: 3 },
  ];
  for (const { rx, tag, weight } of TOPIC_BONUS) {
    if (!rx.test(queryLower)) continue;
    if (chunk.metadata.subjectTags.includes(tag)) score += weight;
  }
  return score;
}

/** Main retrieval entry point. Pure function over the store — no
 *  hidden state, no external I/O. */
export function retrieve(store: RegistryStore, query: RetrievalQuery): RetrievalResult {
  const queryLower = query.text.toLowerCase();
  const guard = applyTaxonomicGuard(query.text);

  const classFilter: ReadonlySet<CitationClass> | null =
    query.classes && query.classes.length ? new Set(query.classes) : null;
  const sourceFilter: ReadonlySet<string> | null =
    query.sourceIds && query.sourceIds.length ? new Set(query.sourceIds) : null;

  const trace: string[] = [...guard.trace.map((t) => `[${t.ruleId}] ${t.reason}`)];
  const excluded: Array<{ chunk: RegistryChunk; reason: string }> = [];

  // Pass 1 — candidate selection.
  const candidates: Array<{ chunk: RegistryChunk; score: number }> = [];
  for (const chunk of store.list()) {
    // Defensive: a chunk without a class label is structurally
    // invalid. Suppress and trace.
    if (!chunk.metadata.class || !chunk.metadata.classLabel) {
      excluded.push({ chunk, reason: 'malformed: missing class label' });
      trace.push(`[malformed] suppressed chunk ${chunk.id}: missing class label`);
      continue;
    }
    if (classFilter && !classFilter.has(chunk.metadata.class)) continue;
    if (sourceFilter && !sourceFilter.has(chunk.metadata.sourceId)) continue;
    const score = lexicalScore(chunk, queryLower);
    if (score === 0) continue;
    candidates.push({ chunk, score });
  }

  // Pass 2 — taxonomic guard.
  const survivors: Array<{ chunk: RegistryChunk; score: number }> = [];
  for (const c of candidates) {
    const verdict = shouldSuppress(c.chunk, guard.excludedTags);
    if (verdict.suppress) {
      const reason = `taxonomic-guard excluded subject tag "${verdict.matchedTag}" — ` +
        guard.reasons.join(' ; ');
      excluded.push({ chunk: c.chunk, reason });
      trace.push(`[guard] suppressed ${c.chunk.id} (tag: ${verdict.matchedTag})`);
      continue;
    }
    survivors.push(c);
  }

  // Rank + truncate.
  survivors.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  const topK = Math.max(1, query.topK ?? 12);
  const chunks = survivors.slice(0, topK).map((s) => s.chunk);
  const hasPendingChunks = chunks.some((c) => c.metadata.pending);

  return { chunks, excluded, taxonomicGuardActions: trace, hasPendingChunks };
}
