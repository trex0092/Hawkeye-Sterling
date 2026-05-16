// Deep tests for evidence-corroboration.ts — corroborate() score formula
import { describe, it, expect } from 'vitest';
import { corroborate } from '../evidence-corroboration.js';
import type { EvidenceItem } from '../evidence.js';

function makeItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'ev-1',
    kind: 'sanctions_list',
    title: 'Test Evidence',
    observedAt: '2025-12-01T00:00:00Z',
    languageIso: 'en',
    credibility: 'authoritative',
    publisher: 'OFAC',
    ...overrides,
  };
}

const NOW = new Date('2026-01-01T00:00:00Z');

// ─── empty input ──────────────────────────────────────────────────────────────

describe('corroborate: empty input', () => {
  it('score=0 for empty items', () => {
    const r = corroborate([]);
    expect(r.score).toBe(0);
    expect(r.items).toBe(0);
  });

  it('independentSources=0 for empty items', () => {
    expect(corroborate([]).independentSources).toBe(0);
  });

  it('kinds=[] for empty items', () => {
    expect(corroborate([]).kinds).toEqual([]);
  });

  it('reasons includes "no evidence supplied"', () => {
    expect(corroborate([]).reasons[0]).toMatch(/no evidence supplied/i);
  });

  it('trainingDataPenalty=0 for empty items', () => {
    expect(corroborate([]).trainingDataPenalty).toBe(0);
  });
});

// ─── single item ──────────────────────────────────────────────────────────────

describe('corroborate: single item', () => {
  it('authoritative single item → score > 0', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.score).toBeGreaterThan(0);
  });

  it('items count = 1', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.items).toBe(1);
  });

  it('independentSources = 1', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.independentSources).toBe(1);
  });

  it('kinds includes the item kind', () => {
    const r = corroborate([makeItem({ kind: 'court_filing' })], { now: NOW });
    expect(r.kinds).toContain('court_filing');
  });

  it('score ≤ 1 always', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('score ≥ 0 always', () => {
    const r = corroborate([makeItem({ credibility: 'unknown' })], { now: NOW });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── credibility scoring ──────────────────────────────────────────────────────

describe('corroborate: credibility effect', () => {
  it('authoritative > reputable > weak for single same-date item', () => {
    const auth = corroborate([makeItem({ credibility: 'authoritative' })], { now: NOW });
    const rep = corroborate([makeItem({ credibility: 'reputable' })], { now: NOW });
    const weak = corroborate([makeItem({ credibility: 'weak' })], { now: NOW });
    expect(auth.score).toBeGreaterThan(rep.score);
    expect(rep.score).toBeGreaterThan(weak.score);
  });

  it('credibilityAverage for single authoritative item = 1.0', () => {
    const r = corroborate([makeItem({ credibility: 'authoritative' })], { now: NOW });
    expect(r.credibilityAverage).toBe(1.0);
  });

  it('credibilityAverage for "unknown" item ≈ 0.2', () => {
    const r = corroborate([makeItem({ credibility: 'unknown' })], { now: NOW });
    expect(r.credibilityAverage).toBeCloseTo(0.2, 2);
  });
});

// ─── staleness ────────────────────────────────────────────────────────────────

describe('corroborate: staleness', () => {
  it('fresh item has stalePenalty=0', () => {
    const r = corroborate([makeItem({ observedAt: '2025-12-31T00:00:00Z' })], { now: NOW });
    expect(r.stalePenalty).toBe(0);
  });

  it('stale item (> staleMaxDays) has stalePenalty > 0', () => {
    // 400 days before NOW
    const r = corroborate([makeItem({ observedAt: '2024-11-27T00:00:00Z' })], {
      now: NOW,
      staleMaxDays: 365,
    });
    expect(r.stalePenalty).toBeGreaterThan(0);
  });

  it('stalePenalty > 0.5 triggers 0.7× penalty on score', () => {
    // All items stale
    const staleItems = [
      makeItem({ observedAt: '2020-01-01T00:00:00Z', publisher: 'pub-A' }),
      makeItem({ observedAt: '2020-01-02T00:00:00Z', publisher: 'pub-B', id: 'ev-2' }),
    ];
    const r = corroborate(staleItems, { now: NOW, staleMaxDays: 365 });
    expect(r.stalePenalty).toBeGreaterThan(0.5);
    // Score should be reduced
    expect(r.score).toBeLessThan(0.7);
  });

  it('medianAgeDays is computed', () => {
    const r = corroborate([makeItem({ observedAt: '2025-12-31T00:00:00Z' })], { now: NOW });
    // 1 day before NOW
    expect(r.medianAgeDays).toBe(1);
  });

  it('unparseable date → medianAgeDays = -1', () => {
    const r = corroborate([makeItem({ observedAt: 'not-a-date' })], { now: NOW });
    expect(r.medianAgeDays).toBe(-1);
  });
});

// ─── training data penalty ────────────────────────────────────────────────────

describe('corroborate: training data penalty', () => {
  it('trainingDataPenalty=1 when any item is training_data', () => {
    const r = corroborate(
      [makeItem({ kind: 'training_data', credibility: 'authoritative' })],
      { now: NOW },
    );
    expect(r.trainingDataPenalty).toBe(1);
    expect(r.score).toBeLessThanOrEqual(0.3);
  });

  it('score capped at 0.3 when training_data present', () => {
    const r = corroborate(
      [makeItem({ kind: 'training_data', credibility: 'authoritative' })],
      { now: NOW },
    );
    expect(r.score).toBeLessThanOrEqual(0.3);
  });

  it('trainingDataPenalty=0 when no training_data items', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.trainingDataPenalty).toBe(0);
  });
});

// ─── diversity bonus ──────────────────────────────────────────────────────────

describe('corroborate: diversity bonus', () => {
  it('multiple independent publishers increase score', () => {
    const single = corroborate(
      [makeItem({ publisher: 'pub-A' })],
      { now: NOW },
    );
    const multi = corroborate(
      [
        makeItem({ publisher: 'pub-A', id: 'e1' }),
        makeItem({ publisher: 'pub-B', id: 'e2' }),
        makeItem({ publisher: 'pub-C', id: 'e3', kind: 'news_article' }),
      ],
      { now: NOW },
    );
    expect(multi.score).toBeGreaterThan(single.score);
  });

  it('same publisher for multiple items → not truly independent → 0.8× penalty', () => {
    const singlePub = corroborate(
      [
        makeItem({ publisher: 'OFAC', id: 'e1' }),
        makeItem({ publisher: 'OFAC', id: 'e2' }),
      ],
      { now: NOW },
    );
    const multiPub = corroborate(
      [
        makeItem({ publisher: 'OFAC', id: 'e1' }),
        makeItem({ publisher: 'EU-CONS', id: 'e2' }),
      ],
      { now: NOW },
    );
    // Multiple publishers should give higher score
    expect(multiPub.score).toBeGreaterThan(singlePub.score);
    // Single publisher with multiple items should trigger penalty
    expect(singlePub.independentSources).toBe(1);
  });

  it('returns distinct kinds in result', () => {
    const r = corroborate(
      [
        makeItem({ kind: 'sanctions_list', id: 'e1', publisher: 'p1' }),
        makeItem({ kind: 'news_article', id: 'e2', publisher: 'p2' }),
        makeItem({ kind: 'court_filing', id: 'e3', publisher: 'p3' }),
      ],
      { now: NOW },
    );
    expect(r.kinds).toContain('sanctions_list');
    expect(r.kinds).toContain('news_article');
    expect(r.kinds).toContain('court_filing');
    expect(r.kinds.length).toBe(3);
  });
});

// ─── score boundaries ─────────────────────────────────────────────────────────

describe('corroborate: score boundaries', () => {
  it('score is always a valid finite number', () => {
    const cases = [
      [],
      [makeItem()],
      [makeItem({ credibility: 'unknown' })],
      [makeItem({ kind: 'training_data' })],
    ];
    for (const items of cases) {
      const r = corroborate(items, { now: NOW });
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  it('score is rounded to 3 decimal places', () => {
    const r = corroborate([makeItem()], { now: NOW });
    const decimals = (r.score.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(3);
  });

  it('credibilityAverage is rounded to 3 decimal places', () => {
    const r = corroborate([makeItem({ credibility: 'mixed' })], { now: NOW });
    const decimals = (r.credibilityAverage.toString().split('.')[1] ?? '').length;
    expect(decimals).toBeLessThanOrEqual(3);
  });
});

// ─── reasons ─────────────────────────────────────────────────────────────────

describe('corroborate: reasons', () => {
  it('reasons is non-empty for non-empty input', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('mentions publisher count in reasons', () => {
    const r = corroborate([makeItem()], { now: NOW });
    expect(r.reasons[0]).toMatch(/publisher/i);
  });

  it('includes training-data warning when applicable', () => {
    const r = corroborate([makeItem({ kind: 'training_data' })], { now: NOW });
    expect(r.reasons.some((s) => /training.data/i.test(s))).toBe(true);
  });
});
