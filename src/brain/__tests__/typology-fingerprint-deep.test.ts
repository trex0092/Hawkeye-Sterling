// Deep tests for typology-fingerprint.ts — band8(), cosineSimilarity(), fingerprint matching
import { describe, it, expect } from 'vitest';
import { typologyFingerprint, cosineSimilarity, nearest } from '../typology-fingerprint.js';
import type { TypologyFingerprint } from '../typology-fingerprint.js';

// ─── minimal helpers ──────────────────────────────────────────────────────────

function emptyVerdict() {
  return {};
}

function emptySuperBrain() {
  return {};
}

// ─── typologyFingerprint: basic structure ─────────────────────────────────────

describe('typologyFingerprint: output structure', () => {
  it('returns a TypologyFingerprint with correct fields', () => {
    const fp = typologyFingerprint(emptyVerdict(), emptySuperBrain(), 'case-1');
    expect(fp.caseId).toBe('case-1');
    expect(Array.isArray(fp.vector)).toBe(true);
    expect(fp.vector.length).toBe(48);
    expect(fp.computedAt).toBeTruthy();
    expect(fp.bands).toBeDefined();
    expect(fp.contributors).toBeDefined();
  });

  it('uses verdict.caseId when caseId arg is omitted', () => {
    const fp = typologyFingerprint({ caseId: 'verdict-case' }, {});
    expect(fp.caseId).toBe('verdict-case');
  });

  it('caseId defaults to empty string if missing', () => {
    const fp = typologyFingerprint({}, {});
    expect(fp.caseId).toBe('');
  });

  it('vector has exactly 48 elements', () => {
    const fp = typologyFingerprint(emptyVerdict(), emptySuperBrain());
    expect(fp.vector).toHaveLength(48);
  });

  it('all vector values are in [0,1]', () => {
    const fp = typologyFingerprint(emptyVerdict(), emptySuperBrain());
    for (const v of fp.vector) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('bands has 8 keys', () => {
    const fp = typologyFingerprint(emptyVerdict(), emptySuperBrain());
    const keys = Object.keys(fp.bands);
    expect(keys).toContain('regime');
    expect(keys).toContain('pep');
    expect(keys).toContain('adverseMedia');
    expect(keys).toContain('ubo');
    expect(keys).toContain('transaction');
    expect(keys).toContain('jurisdiction');
    expect(keys).toContain('redline');
    expect(keys).toContain('typology');
  });

  it('all band values are in [0,1]', () => {
    const fp = typologyFingerprint(emptyVerdict(), emptySuperBrain());
    for (const v of Object.values(fp.bands)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('computedAt is a valid ISO string', () => {
    const fp = typologyFingerprint(emptyVerdict(), emptySuperBrain());
    expect(() => new Date(fp.computedAt)).not.toThrow();
    expect(new Date(fp.computedAt).toISOString()).toBe(fp.computedAt);
  });
});

// ─── typologyFingerprint: PEP bucket ─────────────────────────────────────────

describe('typologyFingerprint: PEP features', () => {
  it('high PEP salience increases pep band', () => {
    const lowPep = typologyFingerprint({}, { pep: { salience: 0.1, tier: '', type: '' } });
    const highPep = typologyFingerprint({}, { pep: { salience: 0.95, tier: 'national', type: 'state_leader' } });
    expect(highPep.bands.pep).toBeGreaterThan(lowPep.bands.pep);
  });

  it('no PEP → pep band is minimal (all zero inputs land in bucket 0)', () => {
    const fp = typologyFingerprint({}, { pep: null });
    // band8 with all-zero inputs → bucket[0] gets all votes → avg = 1/8 = 0.125
    // This is the minimum possible band value
    expect(fp.bands.pep).toBeLessThanOrEqual(0.25);
  });
});

// ─── typologyFingerprint: jurisdiction bucket ─────────────────────────────────

describe('typologyFingerprint: jurisdiction features', () => {
  it('CAHRA jurisdiction → jurisdiction band > 0', () => {
    const fp = typologyFingerprint({}, { jurisdiction: { cahra: true, regimes: ['UNSC'] } });
    expect(fp.bands.jurisdiction).toBeGreaterThan(0);
  });

  it('non-CAHRA jurisdiction → lower jurisdiction band', () => {
    const cahra = typologyFingerprint({}, { jurisdiction: { cahra: true, regimes: ['UNSC'] } });
    const nonCahra = typologyFingerprint({}, { jurisdiction: { cahra: false, regimes: ['UNSC'] } });
    expect(cahra.bands.jurisdiction).toBeGreaterThan(nonCahra.bands.jurisdiction);
  });

  it('empty jurisdiction → jurisdiction band = 0 or minimal', () => {
    const fp = typologyFingerprint({}, { jurisdiction: {} });
    expect(fp.bands.jurisdiction).toBeGreaterThanOrEqual(0);
    expect(fp.bands.jurisdiction).toBeLessThanOrEqual(1);
  });
});

// ─── typologyFingerprint: adverse media bucket ────────────────────────────────

describe('typologyFingerprint: adverse media features', () => {
  it('terrorist_financing category → adverseMedia band > 0', () => {
    const fp = typologyFingerprint(
      {},
      { adverseMediaScored: { categoriesTripped: ['terrorist_financing'], compositeScore: 0.9 } },
    );
    expect(fp.bands.adverseMedia).toBeGreaterThan(0);
  });

  it('no adverse media → adverseMedia band is minimal', () => {
    // band8 with all-zero inputs → bucket[0] filled → avg = 1/8
    const fp = typologyFingerprint({}, { adverseMediaScored: null });
    expect(fp.bands.adverseMedia).toBeLessThanOrEqual(0.25);
  });

  it('multiple categories increase adverseMedia band', () => {
    const single = typologyFingerprint(
      {},
      { adverseMediaScored: { categoriesTripped: ['terrorism'] } },
    );
    const multi = typologyFingerprint(
      {},
      { adverseMediaScored: { categoriesTripped: ['terrorist_financing', 'corruption_organised_crime', 'drug_trafficking'] } },
    );
    expect(multi.bands.adverseMedia).toBeGreaterThanOrEqual(single.bands.adverseMedia);
  });
});

// ─── typologyFingerprint: redline bucket ─────────────────────────────────────

describe('typologyFingerprint: redline features', () => {
  it('critical redlines → redline band > 0', () => {
    const fp = typologyFingerprint(
      {},
      { redlines: { fired: [{ id: 'rl-1', severity: 'critical' }] } },
    );
    expect(fp.bands.redline).toBeGreaterThan(0);
  });

  it('no fired redlines → redline band is minimal (band8 baseline)', () => {
    // With all-zero values, band8 puts all in bucket 0 → avg = 1/8 = 0.125
    const noRedlines = typologyFingerprint({}, { redlines: { fired: [] } });
    expect(noRedlines.bands.redline).toBeLessThanOrEqual(0.25);
  });

  it('many critical redlines → higher redline band than empty', () => {
    const noRedlines = typologyFingerprint({}, { redlines: { fired: [] } });
    const manyRedlines = typologyFingerprint(
      {},
      { redlines: { fired: [
        { severity: 'critical' }, { severity: 'critical' }, { severity: 'critical' },
        { severity: 'high' }, { severity: 'high' },
      ]}},
    );
    expect(manyRedlines.bands.redline).toBeGreaterThan(noRedlines.bands.redline);
  });
});

// ─── typologyFingerprint: contributors ───────────────────────────────────────

describe('typologyFingerprint: contributors', () => {
  it('contributors sorted by score descending', () => {
    const verdict = {
      findings: [
        { modeId: 'mode-low', score: 0.2 },
        { modeId: 'mode-high', score: 0.9 },
        { modeId: 'mode-mid', score: 0.5 },
      ],
    };
    const fp = typologyFingerprint(verdict, {});
    expect(fp.contributors[0]).toBe('mode-high');
    expect(fp.contributors[1]).toBe('mode-mid');
    expect(fp.contributors[2]).toBe('mode-low');
  });

  it('contributors capped at 8', () => {
    const findings = Array.from({ length: 15 }, (_, i) => ({ modeId: `mode-${i}`, score: 1 - i * 0.05 }));
    const fp = typologyFingerprint({ findings }, {});
    expect(fp.contributors.length).toBeLessThanOrEqual(8);
  });

  it('no findings → contributors is empty', () => {
    const fp = typologyFingerprint({}, {});
    expect(fp.contributors).toEqual([]);
  });
});

// ─── cosineSimilarity ────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  function makeFingerprint(vector: number[], caseId = 'c'): TypologyFingerprint {
    return {
      caseId,
      computedAt: new Date().toISOString(),
      vector,
      bands: { regime: 0, pep: 0, adverseMedia: 0, ubo: 0, transaction: 0, jurisdiction: 0, redline: 0, typology: 0 },
      contributors: [],
    };
  }

  it('identical fingerprints → similarity = 1', () => {
    const fp = makeFingerprint(new Array(48).fill(0.5));
    expect(cosineSimilarity(fp, fp)).toBeCloseTo(1, 5);
  });

  it('orthogonal fingerprints → similarity = 0', () => {
    const v1 = new Array(48).fill(0);
    const v2 = new Array(48).fill(0);
    v1[0] = 1;
    v2[1] = 1;
    const fp1 = makeFingerprint(v1);
    const fp2 = makeFingerprint(v2);
    expect(cosineSimilarity(fp1, fp2)).toBeCloseTo(0, 5);
  });

  it('zero vectors → similarity = 0', () => {
    const fp1 = makeFingerprint(new Array(48).fill(0));
    const fp2 = makeFingerprint(new Array(48).fill(0));
    expect(cosineSimilarity(fp1, fp2)).toBe(0);
  });

  it('similarity is in [0, 1]', () => {
    const fp1 = typologyFingerprint({ aggregateScore: 0.7 }, { jurisdiction: { cahra: true } });
    const fp2 = typologyFingerprint({ aggregateScore: 0.3 }, { pep: { salience: 0.9 } });
    const sim = cosineSimilarity(fp1, fp2);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('symmetric: cos(a,b) = cos(b,a)', () => {
    const fp1 = makeFingerprint([1, 0.5, 0, ...new Array(45).fill(0)]);
    const fp2 = makeFingerprint([0.3, 0.7, 1, ...new Array(45).fill(0)]);
    expect(cosineSimilarity(fp1, fp2)).toBeCloseTo(cosineSimilarity(fp2, fp1), 10);
  });

  it('very similar fingerprints have similarity close to 1', () => {
    const v1 = Array.from({ length: 48 }, (_, i) => (i % 3 === 0 ? 0.8 : 0.2));
    const v2 = v1.map((x) => x + 0.01); // tiny perturbation
    const fp1 = makeFingerprint(v1);
    const fp2 = makeFingerprint(v2);
    expect(cosineSimilarity(fp1, fp2)).toBeGreaterThan(0.99);
  });
});

// ─── nearest ─────────────────────────────────────────────────────────────────

describe('nearest', () => {
  function mkFP(caseId: string, val: number): TypologyFingerprint {
    return {
      caseId,
      computedAt: new Date().toISOString(),
      vector: new Array(48).fill(val),
      bands: { regime: val, pep: val, adverseMedia: val, ubo: val, transaction: val, jurisdiction: val, redline: val, typology: val },
      contributors: [],
    };
  }

  it('excludes the query caseId from results', () => {
    const query = mkFP('case-A', 0.5);
    const haystack = [mkFP('case-A', 0.5), mkFP('case-B', 0.6)];
    const results = nearest(query, haystack, 5);
    expect(results.every((r) => r.caseId !== 'case-A')).toBe(true);
  });

  it('returns at most k results', () => {
    const query = mkFP('q', 0.5);
    const haystack = Array.from({ length: 10 }, (_, i) => mkFP(`c${i}`, i * 0.1));
    expect(nearest(query, haystack, 3).length).toBe(3);
  });

  it('results sorted by descending similarity', () => {
    const query = mkFP('q', 0.9);
    const haystack = [mkFP('c1', 0.1), mkFP('c2', 0.9), mkFP('c3', 0.5)];
    const results = nearest(query, haystack, 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.similarity).toBeGreaterThanOrEqual(results[i]!.similarity);
    }
  });

  it('returns empty array for empty haystack', () => {
    const query = mkFP('q', 0.5);
    expect(nearest(query, [], 5)).toEqual([]);
  });

  it('similarity is in [0,1] for each result', () => {
    const query = mkFP('q', 0.5);
    const haystack = [mkFP('c1', 0.3), mkFP('c2', 0.7)];
    const results = nearest(query, haystack, 5);
    for (const r of results) {
      expect(r.similarity).toBeGreaterThanOrEqual(0);
      expect(r.similarity).toBeLessThanOrEqual(1);
    }
  });

  it('includes computedAt in results', () => {
    const query = mkFP('q', 0.5);
    const haystack = [mkFP('c1', 0.6)];
    const results = nearest(query, haystack, 5);
    expect(results[0]!.computedAt).toBeTruthy();
  });
});
