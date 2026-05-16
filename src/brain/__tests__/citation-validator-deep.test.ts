// Deep coverage tests for registry/citation-validator.ts
// Covers: parseCitations(), validateCitations(), all defect types,
//         matchedCount logic, ungrounded claims, ValidationReport shape.

import { describe, it, expect } from 'vitest';
import {
  parseCitations,
  validateCitations,
  type ParsedCitation,
  type CitationDefect,
} from '../registry/citation-validator.js';
import { buildSeedRegistry, retrieve } from '../registry/index.js';
import type { RegistryChunk } from '../registry/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a minimal RegistryChunk for use in tests. */
function makeChunk(
  sourceId: string,
  articleRef: string,
  articleNumber?: number,
  citationClass: 'A' | 'B' | 'C' | 'D' | 'E' = 'A',
): RegistryChunk {
  return {
    id: `${sourceId}-${articleRef}`,
    text: `Text for ${sourceId} ${articleRef}`,
    metadata: {
      class: citationClass,
      classLabel: 'Primary Law',
      sourceId,
      articleRef,
      ...(articleNumber !== undefined ? { articleNumber } : {}),
      version: '1.0',
      contentHash: 'a'.repeat(64),
      subjectTags: ['cdd'],
    },
  } as RegistryChunk;
}

// Seed registry chunks for FDL and CD articles
const FDL_CHUNKS: RegistryChunk[] = [
  makeChunk('FDL-10-2025', 'Art.16', 16, 'A'),
  makeChunk('FDL-10-2025', 'Art.22', 22, 'A'),
  makeChunk('FDL-10-2025', 'Art.23', 23, 'A'),
  makeChunk('FDL-10-2025', 'Art.24', 24, 'A'),
];
const CD_CHUNKS: RegistryChunk[] = [
  makeChunk('CD-134-2025', 'Art.11', 11, 'B'),
  makeChunk('CD-134-2025', 'Art.19', 19, 'B'),
];
const FATF_CHUNKS: RegistryChunk[] = [
  makeChunk('FATF-R10', 'R.10', 10, 'D'),
  makeChunk('FATF-R20', 'R.20', 20, 'D'),
];
const ALL_CHUNKS = [...FDL_CHUNKS, ...CD_CHUNKS, ...FATF_CHUNKS];

// ── parseCitations ─────────────────────────────────────────────────────────────

describe('parseCitations: FDL 10/2025', () => {
  it('parses basic FDL Art.N form', () => {
    const cites = parseCitations('See FDL 10/2025 Art.22.');
    expect(cites).toHaveLength(1);
    expect(cites[0]!.sourceId).toBe('FDL-10-2025');
    expect(cites[0]!.articleNumber).toBe(22);
    expect(cites[0]!.class).toBe('A');
    expect(cites[0]!.articleRef).toBe('Art.22');
  });

  it('parses verbose "Federal Decree-Law (10) of 2025" form', () => {
    const cites = parseCitations('Federal Decree-Law (10) of 2025 Art.16 applies.');
    expect(cites.some((c) => c.sourceId === 'FDL-10-2025' && c.articleNumber === 16)).toBe(true);
  });

  it('parses FDL with clause number', () => {
    const cites = parseCitations('FDL 10/2025 Art.23 Cl.2 sets timing.');
    expect(cites[0]!.clauseNumber).toBe(2);
    expect(cites[0]!.articleRef).toContain('Cl.2');
  });

  it('parses multiple FDL cites in one text', () => {
    const cites = parseCitations('FDL 10/2025 Art.22 and FDL 10/2025 Art.23 are both relevant.');
    const artNums = cites.filter((c) => c.sourceId === 'FDL-10-2025').map((c) => c.articleNumber);
    expect(artNums).toContain(22);
    expect(artNums).toContain(23);
  });

  it('captures forbidden letter suffix in articleRef', () => {
    const cites = parseCitations('FDL 10/2025 Art.18a applies here.');
    expect(cites.some((c) => c.articleRef.includes('a'))).toBe(true);
  });

  it('captures -bis suffix in articleRef', () => {
    const cites = parseCitations('FDL 10/2025 Art.22-bis governs.');
    expect(cites.some((c) => c.articleRef.includes('-bis'))).toBe(true);
  });

  it('span start/end are correct character positions', () => {
    const text = 'Prefix FDL 10/2025 Art.22 suffix.';
    const cites = parseCitations(text);
    expect(cites.length).toBeGreaterThan(0);
    const c = cites[0]!;
    expect(c.span.start).toBeGreaterThanOrEqual(0);
    expect(c.span.end).toBeGreaterThan(c.span.start);
    expect(text.slice(c.span.start, c.span.end)).toContain('FDL');
  });
});

describe('parseCitations: Cabinet Decision 134/2025', () => {
  it('parses CD Art.N form', () => {
    const cites = parseCitations('Cabinet Decision 134/2025 Art.11 requires goAML submission.');
    expect(cites.some((c) => c.sourceId === 'CD-134-2025' && c.articleNumber === 11)).toBe(true);
    expect(cites[0]!.class).toBe('B');
  });

  it('parses Cabinet Resolution variant', () => {
    const cites = parseCitations('Cabinet Resolution 134/2025 Art.19 sets four-eyes rules.');
    expect(cites.some((c) => c.sourceId === 'CD-134-2025')).toBe(true);
  });
});

describe('parseCitations: FATF Recommendations', () => {
  it('parses FATF R.N short form', () => {
    const cites = parseCitations('FATF R.10 requires CDD at onboarding.');
    expect(cites.some((c) => c.sourceId === 'FATF-R10' && c.articleRef === 'R.10')).toBe(true);
  });

  it('parses FATF Recommendation N long form', () => {
    const cites = parseCitations('FATF Recommendation 20 sets STR rules.');
    expect(cites.some((c) => c.sourceId === 'FATF-R20')).toBe(true);
  });
});

describe('parseCitations: LBMA RGG', () => {
  it('parses LBMA RGG Step N form', () => {
    const cites = parseCitations('LBMA RGG v9 Step 4 applies to gold refiners.');
    expect(cites.some((c) => c.sourceId === 'LBMA-RGG-v9' && c.articleRef === 'Step 4')).toBe(true);
  });

  it('parses LBMA RGG Annex form', () => {
    const cites = parseCitations('LBMA Responsible Gold Guidance Annex A lists requirements.');
    expect(cites.some((c) => c.sourceId.startsWith('LBMA-RGG') && c.articleRef === 'Annex A')).toBe(true);
  });
});

describe('parseCitations: UNSCR', () => {
  it('parses UNSCR 1267', () => {
    const cites = parseCitations('UNSCR 1267 established the Al-Qaida sanctions regime.');
    expect(cites.some((c) => c.sourceId === 'UNSC-1267')).toBe(true);
  });
});

describe('parseCitations: ordering', () => {
  it('returns cites sorted by span.start ascending', () => {
    const text = 'FDL 10/2025 Art.22, FATF R.10, Cabinet Decision 134/2025 Art.11.';
    const cites = parseCitations(text);
    for (let i = 1; i < cites.length; i++) {
      expect(cites[i]!.span.start).toBeGreaterThanOrEqual(cites[i - 1]!.span.start);
    }
  });
});

// ── validateCitations: failure modes ──────────────────────────────────────────

describe('validateCitations: failure 1 — no_matching_chunk', () => {
  it('rejects FDL article not in retrieval set', () => {
    const r = validateCitations('Per FDL 10/2025 Art.99, all entities must comply.', ALL_CHUNKS);
    expect(r.passed).toBe(false);
    expect(r.defects.some((d) => d.failure === 'no_matching_chunk' && d.citation.articleNumber === 99)).toBe(true);
  });

  it('matchedCount decrements for no_matching_chunk defects', () => {
    const r = validateCitations('FDL 10/2025 Art.99 and FDL 10/2025 Art.22.', ALL_CHUNKS);
    // Art.22 is in retrieval set, Art.99 is not
    const misses = r.defects.filter((d) => d.failure === 'no_matching_chunk' || d.failure === 'unknown_source').length;
    expect(r.summary.matchedCount).toBe(r.summary.citationCount - misses);
  });
});

describe('validateCitations: failure 2 — forbidden_article_suffix', () => {
  it('rejects "Art.18a" letter suffix', () => {
    const r = validateCitations('FDL 10/2025 Art.18a sets the EDD trigger.', ALL_CHUNKS);
    expect(r.defects.some((d) => d.failure === 'forbidden_article_suffix')).toBe(true);
  });

  it('rejects "-bis" suffix', () => {
    const r = validateCitations('FDL 10/2025 Art.22-bis governs STR obligations.', ALL_CHUNKS);
    expect(r.defects.some((d) => d.failure === 'forbidden_article_suffix')).toBe(true);
  });

  it('detail message explains UAE drafting convention', () => {
    const r = validateCitations('FDL 10/2025 Art.22a is invoked here.', ALL_CHUNKS);
    const defect = r.defects.find((d) => d.failure === 'forbidden_article_suffix');
    expect(defect?.detail).toMatch(/UAE|federal|letter|suffix/i);
  });
});

describe('validateCitations: failure 3 — class_conflation', () => {
  it('flags Art.11 cited under FDL when it only exists in CD-134-2025', () => {
    const r = validateCitations(
      'FDL 10/2025 Art.11 requires STR submission via goAML.',
      ALL_CHUNKS,
    );
    expect(r.defects.some((d) => d.failure === 'class_conflation')).toBe(true);
  });

  it('detail message mentions Cabinet Decision', () => {
    const r = validateCitations('FDL 10/2025 Art.11 — see obligation.', ALL_CHUNKS);
    const defect = r.defects.find((d) => d.failure === 'class_conflation');
    expect(defect?.detail).toMatch(/Cabinet Decision|CD-134/i);
  });

  it('does not flag class_conflation when art only exists in FDL', () => {
    // Art.22 is only in FDL-10-2025, not CD-134-2025
    const r = validateCitations('FDL 10/2025 Art.22 applies.', ALL_CHUNKS);
    expect(r.defects.filter((d) => d.failure === 'class_conflation')).toHaveLength(0);
  });
});

describe('validateCitations: failure 4 — invented_timing_claim', () => {
  it('flags "within 5 business days" near Art.23 (qualitative-timing article)', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.23, reporting entities must file the STR within 5 business days.',
      ALL_CHUNKS,
    );
    expect(r.defects.some((d) => d.failure === 'invented_timing_claim')).toBe(true);
  });

  it('does not flag numeric timing far from a qualitative-timing article', () => {
    // Numeric timing but no nearby qualitative article cite
    const longText = 'Filing must happen within 5 business days. ' + 'x'.repeat(500) + ' FDL 10/2025 Art.22.';
    const r = validateCitations(longText, ALL_CHUNKS);
    expect(r.defects.filter((d) => d.failure === 'invented_timing_claim')).toHaveLength(0);
  });
});

describe('validateCitations: unknown_source', () => {
  it('reports unknown_source when sourceId not in retrieval set', () => {
    const r = validateCitations(
      'UNSCR 9999 is cited here.',
      ALL_CHUNKS, // UNSC-9999 not in ALL_CHUNKS
    );
    expect(r.defects.some((d) => d.failure === 'unknown_source')).toBe(true);
  });
});

// ── validateCitations: passing cases ─────────────────────────────────────────

describe('validateCitations: clean answers', () => {
  it('passes when FDL Art.22 is in the retrieval set and properly cited', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.22, the obligation applies.',
      ALL_CHUNKS,
    );
    expect(r.defects).toHaveLength(0);
  });

  it('passes multi-source answer with FDL + CD + FATF all in retrieval set', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.22, Cabinet Decision 134/2025 Art.11, and FATF R.10.',
      ALL_CHUNKS,
    );
    expect(r.defects).toHaveLength(0);
  });

  it('passed flag is true only when defects AND ungrounded claims are both empty', () => {
    const cleanR = validateCitations('Per FDL 10/2025 Art.22, reporting entities must file.', ALL_CHUNKS);
    expect(cleanR.passed).toBe(cleanR.defects.length === 0 && cleanR.ungroundedClaims.length === 0);
  });

  it('soft-matches Cl. suffix against base article ref', () => {
    // Chunk only has 'Art.22' but citation includes 'Cl.1' → should still match
    const r = validateCitations('FDL 10/2025 Art.22 Cl.1 sets timing.', ALL_CHUNKS);
    // Should not generate no_matching_chunk because base 'Art.22' is in the set
    expect(r.defects.filter((d) => d.failure === 'no_matching_chunk')).toHaveLength(0);
  });
});

// ── validateCitations: ungrounded claims ─────────────────────────────────────

describe('validateCitations: ungrounded claims', () => {
  it('flags "must" claim with no nearby citation', () => {
    const r = validateCitations(
      'Reporting entities must file the STR. ' + 'x'.repeat(500) + ' FDL 10/2025 Art.22.',
      ALL_CHUNKS,
    );
    expect(r.ungroundedClaims.length).toBeGreaterThan(0);
    expect(r.ungroundedClaims[0]!.trigger).toBe('imperative verb');
  });

  it('clears "must" claim when FDL cite is nearby (within 200 chars)', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.22, reporting entities must file the STR.',
      ALL_CHUNKS,
    );
    expect(r.ungroundedClaims).toHaveLength(0);
  });

  it('flags AED threshold claim without nearby cite', () => {
    const r = validateCitations(
      'Cash transactions of AED 55,000 trigger reporting obligations. ' + 'y'.repeat(400),
      ALL_CHUNKS,
    );
    expect(r.ungroundedClaims.some((c) => c.trigger === 'AED threshold')).toBe(true);
  });
});

// ── validateCitations: summary counts ────────────────────────────────────────

describe('validateCitations: summary shape', () => {
  it('citationCount matches number of parsed cites', () => {
    const r = validateCitations('FDL 10/2025 Art.22 and FATF R.10.', ALL_CHUNKS);
    expect(r.summary.citationCount).toBe(r.citations.length);
  });

  it('defectCount matches number of defects', () => {
    const r = validateCitations('FDL 10/2025 Art.99 is invalid.', ALL_CHUNKS);
    expect(r.summary.defectCount).toBe(r.defects.length);
  });

  it('ungroundedClaimCount matches ungroundedClaims length', () => {
    const r = validateCitations(
      'Entities must file. ' + 'z'.repeat(400),
      ALL_CHUNKS,
    );
    expect(r.summary.ungroundedClaimCount).toBe(r.ungroundedClaims.length);
  });

  it('matchedCount + no_matching_chunk/unknown_source defects = citationCount', () => {
    const r = validateCitations(
      'FDL 10/2025 Art.22 and FDL 10/2025 Art.99 and FATF R.10.',
      ALL_CHUNKS,
    );
    const misses = r.defects.filter(
      (d) => d.failure === 'no_matching_chunk' || d.failure === 'unknown_source',
    ).length;
    expect(r.summary.matchedCount + misses).toBe(r.summary.citationCount);
  });

  it('matchedCount is 0 when no cites are in retrieval set', () => {
    const r = validateCitations('FDL 10/2025 Art.99 is invented.', ALL_CHUNKS);
    expect(r.summary.matchedCount).toBe(0);
  });
});

// ── Integration: seed registry ─────────────────────────────────────────────────

describe('validateCitations: integration with seed registry', () => {
  const store = buildSeedRegistry();
  const retrieved = retrieve(store, { text: 'STR obligation FDL 10/2025', topK: 30 }).chunks;

  it('passes a fully grounded answer using seed-registry chunks', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.22 and Cabinet Decision 134/2025 Art.11, ' +
      'reporting entities must file an STR via goAML without delay; FATF R.20 anchors internationally.',
      retrieved,
    );
    expect(r.defects).toHaveLength(0);
  });

  it('rejects an invented article number against the seed registry', () => {
    const r = validateCitations('Per FDL 10/2025 Art.999, all firms must report.', retrieved);
    expect(r.defects.some((d) => d.failure === 'no_matching_chunk')).toBe(true);
  });
});
