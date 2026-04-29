// Layer 2 acceptance tests — citation validator ("no citation, no claim").
//
// Each failure mode the build-spec called out has a dedicated test
// case so regressions are visible immediately.

import { describe, expect, it } from 'vitest';
import { buildSeedRegistry, retrieve } from '../registry/index.js';
import {
  parseCitations,
  validateCitations,
} from '../registry/citation-validator.js';

describe('citation validator: parsing', () => {
  it('parses FDL 10/2025 cites in multiple verbose forms', () => {
    const cites = parseCitations(
      'See FDL 10/2025 Art.22, Federal Decree-Law (10) of 2025 Art.23 Cl.1, and FDL No. 10/2025 Art.24.',
    );
    expect(cites.map((c) => c.articleNumber)).toEqual([22, 23, 24]);
    expect(cites.every((c) => c.sourceId === 'FDL-10-2025')).toBe(true);
    expect(cites[1]!.clauseNumber).toBe(1);
  });

  it('parses Cabinet Decision 134/2025, FATF Recs, LBMA RGG, and UNSCR cites', () => {
    const cites = parseCitations(
      'Cabinet Decision 134/2025 Art.11; FATF R.10; FATF Recommendation 20; LBMA RGG v9 Step 4; UNSCR 1267.',
    );
    const byClass = new Map<string, number>();
    for (const c of cites) byClass.set(c.class, (byClass.get(c.class) ?? 0) + 1);
    expect(cites.length).toBeGreaterThanOrEqual(5);
    expect(byClass.get('B')).toBeGreaterThanOrEqual(1); // CD
    expect(byClass.get('D')).toBeGreaterThanOrEqual(3); // FATF + LBMA + UNSCR
  });
});

describe('citation validator: failure modes', () => {
  const store = buildSeedRegistry();
  const retrieved = retrieve(store, {
    text: 'STR filing obligation under FDL 10/2025 — timing and audit-trail requirements',
    topK: 30,
  }).chunks;

  it('failure 1: rejects an invented FDL article number not in the retrieval set', () => {
    const r = validateCitations('Per FDL 10/2025 Art.99, all reports must be filed.', retrieved);
    expect(r.passed).toBe(false);
    expect(r.defects.some((d) => d.failure === 'no_matching_chunk' && d.citation.articleNumber === 99)).toBe(true);
  });

  it('failure 2: rejects forbidden letter suffixes ("Art.18a")', () => {
    const r = validateCitations('FDL 10/2025 Art.18a sets the EDD trigger.', retrieved);
    expect(r.defects.some((d) => d.failure === 'forbidden_article_suffix')).toBe(true);
  });

  it('failure 2b: rejects -bis suffixes', () => {
    const r = validateCitations('FDL 10/2025 Art.22-bis governs.', retrieved);
    expect(r.defects.some((d) => d.failure === 'forbidden_article_suffix')).toBe(true);
  });

  it('failure 3: flags Decree-Law / Executive-Regulation conflation', () => {
    // CD-134-2025 has Art.11 (STR via goAML) but FDL-10-2025 does not.
    // Citing "FDL 10/2025 Art.11" is therefore class-conflated.
    const r = validateCitations(
      'FDL 10/2025 Art.11 requires STR submission via goAML.',
      retrieved,
    );
    expect(r.defects.some((d) => d.failure === 'class_conflation')).toBe(true);
  });

  it('failure 4: flags invented numeric timing on a "without-delay" article', () => {
    // Art.23 = STR timing = qualitative ("without delay"). A
    // sentence that cites Art.23 AND asserts "within 5 business days"
    // is the canonical hallucination — flag it.
    const r = validateCitations(
      'Per FDL 10/2025 Art.23, reporting entities must file the STR within 5 business days.',
      retrieved,
    );
    expect(r.defects.some((d) => d.failure === 'invented_timing_claim')).toBe(true);
  });

  it('passes a clean answer with grounded cites', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.22 and Cabinet Decision 134/2025 Art.11, reporting entities must file an STR via goAML without delay; FATF R.20 sets the international anchor.',
      retrieved,
    );
    expect(r.summary.citationCount).toBeGreaterThanOrEqual(3);
    expect(r.defects).toEqual([]);
  });
});

describe('citation validator: "no citation, no claim" enforcement', () => {
  const store = buildSeedRegistry();
  const retrieved = retrieve(store, {
    text: 'STR filing obligation under FDL 10/2025',
    topK: 20,
  }).chunks;

  it('flags a normative claim with no cite within 200 chars', () => {
    const r = validateCitations(
      'Reporting entities must file the STR. Long unrelated text follows ' + 'x'.repeat(400) +
      ' Per FDL 10/2025 Art.22, the obligation is anchored in primary law.',
      retrieved,
    );
    expect(r.ungroundedClaims.length).toBeGreaterThan(0);
    expect(r.ungroundedClaims[0]!.trigger).toBe('imperative verb');
  });

  it('passes a normative claim grounded by a nearby cite', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.22, reporting entities must file the STR.',
      retrieved,
    );
    expect(r.ungroundedClaims).toEqual([]);
  });

  it('flags a numeric threshold without cite', () => {
    const r = validateCitations(
      'Cash transactions of AED 55,000 trigger reporting. ' + 'x'.repeat(400),
      retrieved,
    );
    expect(r.ungroundedClaims.some((c) => c.trigger === 'AED threshold' || c.trigger === 'numeric timing' || c.trigger === 'imperative verb')).toBe(true);
  });
});

describe('citation validator: report shape', () => {
  const store = buildSeedRegistry();
  const retrieved = retrieve(store, { text: 'CDD onboarding', topK: 20 }).chunks;

  it('summary counts are consistent', () => {
    const r = validateCitations(
      'Per FDL 10/2025 Art.16 and FATF R.10, identification at onboarding is required.',
      retrieved,
    );
    expect(r.summary.citationCount).toBe(r.citations.length);
    expect(r.summary.defectCount).toBe(r.defects.length);
    expect(r.summary.matchedCount + r.defects.filter((d) => d.failure === 'no_matching_chunk' || d.failure === 'unknown_source').length).toBe(r.citations.length);
  });

  it('passed flag is true iff defects + ungrounded claims both empty', () => {
    const clean = validateCitations(
      'Per FDL 10/2025 Art.16, CDD must be performed at onboarding.',
      retrieved,
    );
    expect(clean.passed).toBe(clean.defects.length === 0 && clean.ungroundedClaims.length === 0);
  });
});
