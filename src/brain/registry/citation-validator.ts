// Hawkeye Sterling — citation validator (Layer 2).
//
// "No citation, no claim." Built directly on top of Layer 1: parses
// every citation in a generated answer and matches each one against
// the chunks retrieved for the question. An answer is REJECTED if:
//
//   1. Any cited reference does not match a chunk in the retrieval set
//      (catch: invented FDL article numbers, hallucinated FATF Recs).
//   2. Any cited reference uses a non-UAE-convention suffix
//      (catch: "Art.18a", "Art.18-bis" — UAE federal drafting uses
//      bare integers + Cl.X + Para.X, never letter suffixes).
//   3. Any citation conflates Decree-Law and Executive Regulation
//      article numbers (catch: "FDL 10/2025 Art.16" when the article
//      with that number only exists in CD-134-2025).
//   4. Any normative numeric timing claim ("X business days",
//      "every X days") appears alongside a cite to an article whose
//      canonical timing rule is qualitative ("without delay") — heuristic
//      flag for human review.
//
// The validator does NOT auto-correct. It produces a structured
// rejection report; the caller decides whether to re-prompt, fail
// closed, or escalate to a human MLRO. The audit log persists the
// full report so a reviewer can see exactly why an answer was rejected.

import type { CitationClass, RegistryChunk } from './types.js';

/** A citation extracted from the generated text. */
export interface ParsedCitation {
  /** Verbatim text of the cite as it appears in the answer. */
  raw: string;
  /** Citation class implied by the parse. */
  class: CitationClass;
  /** Stable source id, e.g. 'FDL-10-2025', 'CD-134-2025', 'FATF-R10'. */
  sourceId: string;
  /** Article reference in canonical short form, e.g. 'Art.22',
   *  'Art.18 Cl.2', 'R.10', 'Step 4'. */
  articleRef: string;
  /** Article number iff parseable. */
  articleNumber?: number;
  /** Clause number iff parseable. */
  clauseNumber?: number;
  /** Character span in the source text (start inclusive, end exclusive). */
  span: { start: number; end: number };
}

/** A defect in a parsed citation. The validator emits one defect per
 *  failure mode per citation (a single bad cite can produce multiple
 *  defects, e.g. "Art.18a" both has a forbidden suffix AND no
 *  matching chunk). */
export interface CitationDefect {
  citation: ParsedCitation;
  failure:
    | 'no_matching_chunk'        // not in the retrieval set
    | 'forbidden_article_suffix' // letter / -bis / (a) on UAE federal cites
    | 'class_conflation'         // FDL Art.X actually exists in CD-134, not FDL
    | 'invented_timing_claim'    // numeric timing on an article whose canonical timing is qualitative
    | 'unknown_source';          // sourceId not in any retrieved chunk's catalogue
  detail: string;
}

/** A normative claim flagged because it isn't anchored to a citation
 *  within a small character window (the "no citation, no claim" rule). */
export interface UngroundedClaim {
  /** The sentence containing the claim. */
  sentence: string;
  /** Character offset in the source text. */
  offset: number;
  /** The trigger phrase that marked the sentence as a claim
   *  ("must", "shall", "within X days", "every X days", numeric
   *  threshold "AED X", etc.). */
  trigger: string;
}

export interface ValidationReport {
  /** Every citation parsed from the answer. */
  citations: ParsedCitation[];
  /** Per-citation defects. */
  defects: CitationDefect[];
  /** Sentences that asserted a normative claim without a nearby cite. */
  ungroundedClaims: UngroundedClaim[];
  /** Convenience flag — true iff defects.length === 0 AND
   *  ungroundedClaims.length === 0. */
  passed: boolean;
  /** Per-failure-mode counts for the audit-log breadcrumb. */
  summary: {
    citationCount: number;
    matchedCount: number;
    defectCount: number;
    ungroundedClaimCount: number;
  };
}

// ── Patterns ───────────────────────────────────────────────────────────────
//
// One per recognised citation shape. Each matcher produces a
// ParsedCitation; downstream the validator decides whether to accept,
// reject, or flag.

interface CitationMatcher {
  /** Stable id for failure-mode breadcrumbs. */
  id: string;
  rx: RegExp;
  parse: (m: RegExpExecArray) => ParsedCitation | null;
}

const MATCHERS: CitationMatcher[] = [
  // FDL 10/2025 Art.X (Cl.Y) — primary law. Permissive on whitespace
  // and on the law identifier ("Federal Decree-Law (10) of 2025",
  // "FDL 10/2025") so we still recognise the cite even when the model
  // gets the verbose form. Crucially: ALSO matches forbidden letter
  // suffixes so the validator can flag them ("Art.18a" / "Art.18-bis"
  // / "Art.18(a)").
  {
    id: 'fdl-10-2025',
    rx: /\b(?:FDL|Federal\s+Decree[- ]Law)\s*(?:No\.?\s*)?\(?\s*10\s*\)?\s*(?:\/|\s+of\s+)\s*2025\s*(?:Art\.?\s*([0-9]+)([a-z]|-bis|\([a-z]\))?(?:\s*Cl\.?\s*([0-9]+))?)?/gi,
    parse: (m) => {
      const articleNumber = m[1] ? Number(m[1]) : undefined;
      const suffix = m[2] ?? '';
      const clauseNumber = m[3] ? Number(m[3]) : undefined;
      const articleRef = articleNumber === null || articleNumber === undefined
        ? '(no article)'
        : `Art.${articleNumber}${suffix}${clauseNumber !== null && clauseNumber !== undefined ? ` Cl.${clauseNumber}` : ''}`;
      return {
        raw: m[0],
        class: 'A',
        sourceId: 'FDL-10-2025',
        articleRef,
        ...(articleNumber !== null && articleNumber !== undefined ? { articleNumber } : {}),
        ...(clauseNumber !== null && clauseNumber !== undefined ? { clauseNumber } : {}),
        span: { start: m.index, end: m.index + m[0].length },
      };
    },
  },
  // Cabinet Decision 134/2025 Art.X.
  {
    id: 'cd-134-2025',
    rx: /\bCabinet\s+(?:Decision|Resolution)\s+(?:No\.?\s*)?\(?\s*134\s*\)?\s*(?:of|\/)\s*2025\s*(?:Art\.?\s*([0-9]+)([a-z]|-bis|\([a-z]\))?)?/gi,
    parse: (m) => {
      const articleNumber = m[1] ? Number(m[1]) : undefined;
      const suffix = m[2] ?? '';
      const articleRef = articleNumber === null || articleNumber === undefined ? '(no article)' : `Art.${articleNumber}${suffix}`;
      return {
        raw: m[0],
        class: 'B',
        sourceId: 'CD-134-2025',
        articleRef,
        ...(articleNumber !== null && articleNumber !== undefined ? { articleNumber } : {}),
        span: { start: m.index, end: m.index + m[0].length },
      };
    },
  },
  // FATF Recommendations.
  {
    id: 'fatf-rec',
    rx: /\bFATF\s+(?:Recommendation\s+|Rec\.?\s*|R\.?\s*)([0-9]+)\b/gi,
    parse: (m) => {
      const num = Number(m[1]);
      return {
        raw: m[0],
        class: 'D',
        sourceId: `FATF-R${num}`,
        articleRef: `R.${num}`,
        articleNumber: num,
        span: { start: m.index, end: m.index + m[0].length },
      };
    },
  },
  // LBMA RGG vX Step N / Annex X.
  {
    id: 'lbma-rgg',
    rx: /\bLBMA\s+(?:Responsible\s+Gold\s+Guidance|RGG)\s*(?:v?(\d+))?\s*(?:Step\s+(\d+)|Annex\s+([A-Z]))?/gi,
    parse: (m) => {
      const version = m[1] ? `v${m[1]}` : 'v9';
      const step = m[2] ? Number(m[2]) : null;
      const annex = m[3] ?? null;
      const articleRef = step !== null && step !== undefined
        ? `Step ${step}`
        : annex !== null && annex !== undefined
          ? `Annex ${annex}`
          : '(LBMA RGG)';
      return {
        raw: m[0],
        class: 'D',
        sourceId: `LBMA-RGG-${version}`,
        articleRef,
        ...(step !== null && step !== undefined ? { articleNumber: step } : {}),
        span: { start: m.index, end: m.index + m[0].length },
      };
    },
  },
  // UNSCR 1267 / 1373 / 2231 etc.
  {
    id: 'unscr',
    rx: /\bUNSCR?\s*(?:Resolution\s+)?([0-9]{3,4})\b/gi,
    parse: (m) => {
      const num = m[1] ?? '';
      return {
        raw: m[0],
        class: 'D',
        sourceId: `UNSC-${num}`,
        articleRef: 'Operative paragraphs',
        span: { start: m.index, end: m.index + m[0].length },
      };
    },
  },
];

/** Articles whose canonical timing rule is qualitative ("without
 *  delay" / "as soon as possible"). The validator flags any answer
 *  that pairs a cite to one of these articles with a numeric timing
 *  claim ("X business days", "within X days"). This is a heuristic;
 *  the audit log records the flag for human review rather than auto-
 *  rejecting (the model may be quoting an internal policy SLA, not
 *  the law). */
const QUALITATIVE_TIMING_ARTICLES = new Set<string>([
  'FDL-10-2025/Art.22', // STR obligation
  'FDL-10-2025/Art.23', // STR timing — without delay
  'CD-134-2025/Art.11', // STR submission via goAML
]);

const NUMERIC_TIMING_RX = /\b(?:within|in)\s+(\d+)\s+(?:business\s+|working\s+|calendar\s+)?days?\b|\bevery\s+(\d+)\s+days?\b|\b(\d+)\s+(?:business|working)\s+days?\b/gi;

/** Trigger words / patterns that mark a sentence as a normative
 *  claim. The "no citation, no claim" enforcer requires every such
 *  sentence to carry a citation within ±200 characters. */
const NORMATIVE_TRIGGERS: Array<{ rx: RegExp; label: string }> = [
  { rx: /\b(?:must|shall|are required to|is required to|obliged to|obligation)\b/i, label: 'imperative verb' },
  { rx: /\bwithin\s+\d+\s+(?:business|working|calendar)?\s*days?\b/i, label: 'numeric timing' },
  { rx: /\bevery\s+\d+\s+days?\b/i, label: 'numeric cadence' },
  { rx: /\bAED\s+[\d,]+/i, label: 'AED threshold' },
  { rx: /\bUSD\s+[\d,]+/i, label: 'USD threshold' },
  { rx: /\bfine\s+(?:of|up\s+to)\s+/i, label: 'penalty amount' },
];

// ── Public API ─────────────────────────────────────────────────────────────

/** Parse every recognised citation from `text`. Pure. */
export function parseCitations(text: string): ParsedCitation[] {
  const out: ParsedCitation[] = [];
  for (const matcher of MATCHERS) {
    matcher.rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = matcher.rx.exec(text)) !== null) {
      const parsed = matcher.parse(m);
      if (parsed) out.push(parsed);
    }
  }
  // Stable sort by start offset so downstream consumers can scan
  // the answer in narrative order.
  return out.sort((a, b) => a.span.start - b.span.start);
}

interface ChunkIndex {
  /** sourceId → set of articleRefs known in the retrieval set. */
  byArticle: Map<string, Set<string>>;
  /** sourceId → set of articleNumbers (for class-conflation checks). */
  byNumber: Map<string, Set<number>>;
  /** All sourceIds in the retrieval set. */
  sourceIds: Set<string>;
}

function indexRetrievedChunks(retrieved: RegistryChunk[]): ChunkIndex {
  const byArticle = new Map<string, Set<string>>();
  const byNumber = new Map<string, Set<number>>();
  const sourceIds = new Set<string>();
  for (const ch of retrieved) {
    sourceIds.add(ch.metadata.sourceId);
    if (!byArticle.has(ch.metadata.sourceId)) byArticle.set(ch.metadata.sourceId, new Set());
    byArticle.get(ch.metadata.sourceId)!.add(ch.metadata.articleRef);
    if (ch.metadata.articleNumber !== null && ch.metadata.articleNumber !== undefined) {
      if (!byNumber.has(ch.metadata.sourceId)) byNumber.set(ch.metadata.sourceId, new Set());
      byNumber.get(ch.metadata.sourceId)!.add(ch.metadata.articleNumber);
    }
  }
  return { byArticle, byNumber, sourceIds };
}

/** Detect un-grounded normative claims — sentences that assert a
 *  rule but don't carry a citation within ±200 characters. */
function findUngroundedClaims(text: string, citations: ParsedCitation[]): UngroundedClaim[] {
  const claims: UngroundedClaim[] = [];
  // Split on sentence-ish boundaries; cheap and good enough.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let cursor = 0;
  for (const sentence of sentences) {
    const offset = cursor;
    cursor += sentence.length + 1; // +1 for the boundary whitespace
    let trigger: string | null = null;
    for (const t of NORMATIVE_TRIGGERS) {
      if (t.rx.test(sentence)) { trigger = t.label; break; }
    }
    if (!trigger) continue;
    // Is there a citation within ±200 chars of this sentence?
    const grounded = citations.some((c) => Math.abs(c.span.start - offset) <= sentence.length + 200);
    if (!grounded) {
      claims.push({ sentence: sentence.trim(), offset, trigger });
    }
  }
  return claims;
}

/** Validate the answer against the retrieval set. */
export function validateCitations(
  answerText: string,
  retrieved: RegistryChunk[],
): ValidationReport {
  const citations = parseCitations(answerText);
  const index = indexRetrievedChunks(retrieved);
  const defects: CitationDefect[] = [];

  for (const c of citations) {
    // Failure 2: forbidden article suffix.
    if (/[a-z]$|-bis$|\([a-z]\)$/i.test(c.articleRef.split(' ')[0] ?? '')) {
      defects.push({
        citation: c,
        failure: 'forbidden_article_suffix',
        detail:
          `"${c.raw}" uses a non-UAE-convention article suffix. UAE federal ` +
          'drafting uses bare integers with Cl./Para. for sub-divisions; ' +
          'letter suffixes (a, -bis, (a)) do not appear in FDL or Cabinet ' +
          'Decision article numbering.',
      });
    }

    // Failure 3: class conflation — Art.N cited under FDL but only
    // exists in CD-134, or vice versa.
    if (c.sourceId === 'FDL-10-2025' && c.articleNumber !== null && c.articleNumber !== undefined) {
      const fdlArts = index.byNumber.get('FDL-10-2025') ?? new Set();
      const cdArts = index.byNumber.get('CD-134-2025') ?? new Set();
      if (!fdlArts.has(c.articleNumber) && cdArts.has(c.articleNumber)) {
        defects.push({
          citation: c,
          failure: 'class_conflation',
          detail:
            `Art.${c.articleNumber} cited under "FDL 10/2025" but no chunk for ` +
            'that article exists in the FDL retrieval set; the same article ' +
            'number IS present in Cabinet Decision 134/2025. Likely the model ' +
            'conflated Decree-Law and Executive Regulation numbering.',
        });
      }
    }

    // Failure 1: no matching chunk.
    if (!index.sourceIds.has(c.sourceId)) {
      defects.push({
        citation: c,
        failure: 'unknown_source',
        detail:
          `Source "${c.sourceId}" is not in the retrieval set. Either the ` +
          'classifier failed to surface a relevant chunk, or the model ' +
          'invented this source.',
      });
      continue;
    }
    const knownRefs = index.byArticle.get(c.sourceId) ?? new Set<string>();
    // Soft match: the parsed articleRef may have richer suffixing
    // (Cl.) than the registered chunk. Strip Cl. and re-test.
    const baseRef = c.articleRef.replace(/\s+Cl\.\d+/i, '');
    const matched = knownRefs.has(c.articleRef) || knownRefs.has(baseRef);
    if (!matched) {
      defects.push({
        citation: c,
        failure: 'no_matching_chunk',
        detail:
          `${c.sourceId} ${c.articleRef} not in the retrieval set. Either ` +
          'the article does not exist (invented citation) or it exists but ' +
          'was not retrieved (classifier miss). Re-running with broader ' +
          'class filter is the next step.',
      });
    }
  }

  // Failure 4: invented timing claim near a qualitative-timing article.
  NUMERIC_TIMING_RX.lastIndex = 0;
  let timingMatch: RegExpExecArray | null;
  while ((timingMatch = NUMERIC_TIMING_RX.exec(answerText)) !== null) {
    const tStart = timingMatch.index;
    // Find the nearest cite to the left within 240 chars.
    const nearby = citations.find((c) => c.span.start <= tStart && tStart - c.span.start <= 240);
    if (!nearby) continue;
    const key = `${nearby.sourceId}/${nearby.articleRef.replace(/\s+Cl\.\d+/i, '')}`;
    if (QUALITATIVE_TIMING_ARTICLES.has(key)) {
      defects.push({
        citation: nearby,
        failure: 'invented_timing_claim',
        detail:
          `Numeric timing claim "${timingMatch[0]}" appears alongside a cite to ` +
          `${nearby.sourceId} ${nearby.articleRef}, whose canonical timing rule ` +
          'is qualitative ("without delay"). Likely the model invented a numeric ' +
          'deadline. Replace with the qualitative rule or attribute the timing ' +
          'to an internal SLA / policy doc.',
      });
    }
  }

  const ungroundedClaims = findUngroundedClaims(answerText, citations);

  const matchedCount = citations.length - defects.filter((d) =>
    d.failure === 'no_matching_chunk' || d.failure === 'unknown_source'
  ).length;

  return {
    citations,
    defects,
    ungroundedClaims,
    passed: defects.length === 0 && ungroundedClaims.length === 0,
    summary: {
      citationCount: citations.length,
      matchedCount,
      defectCount: defects.length,
      ungroundedClaimCount: ungroundedClaims.length,
    },
  };
}
