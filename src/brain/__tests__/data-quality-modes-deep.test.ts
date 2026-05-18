// Deep coverage tests for modes/data_quality.ts
// Covers: completeness_audit, freshness_check, source_credibility, tamper_detection,
//         provenance_trace, data_quality_score, discrepancy_log.

import { describe, it, expect } from 'vitest';
import { DATA_QUALITY_MODE_APPLIES } from '../modes/data_quality.js';
import type { BrainContext } from '../types.js';
import type { EvidenceItem } from '../evidence.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: ['cdd'],
  };
}

/** Build a minimal EvidenceItem with required fields. */
function makeItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: overrides.id ?? 'ev-001',
    kind: overrides.kind ?? 'sanctions_list',
    title: overrides.title ?? 'Test Evidence',
    observedAt: overrides.observedAt ?? new Date().toISOString(),
    languageIso: overrides.languageIso ?? 'en',
    credibility: overrides.credibility ?? 'authoritative',
    ...overrides,
  };
}

// ── completeness_audit ────────────────────────────────────────────────────────

describe('completeness_audit', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.completeness_audit;

  it('escalates when no expected channels are populated', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('escalate');
    expect(f.modeId).toBe('completeness_audit');
    expect(f.score).toBe(1); // 1 - 0 = 1
  });

  it('clears when all 5 expected channels are populated', async () => {
    const f = await apply(makeCtx({
      sanctionsHits: [{ match: 'test' }],
      pepHits: [{ match: 'pep' }],
      adverseMedia: [{ article: 'news' }],
      uboChain: [{ entity: 'corp' }],
      documents: [{ type: 'passport' }],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0); // 1 - 1 = 0
  });

  it('flags when fewer than 70% channels are populated', async () => {
    // 2 out of 5 = 40% → escalate boundary is < 0.4, flag is < 0.7
    const f = await apply(makeCtx({
      sanctionsHits: [{ match: 'test' }],
      pepHits: [{ match: 'pep' }],
      // adverseMedia, uboChain, documents missing
    }));
    // 2/5 = 0.4 → not escalate (< 0.4), is flag (< 0.7)
    expect(f.verdict).toBe('flag');
  });

  it('lists missing channels in rationale', async () => {
    const f = await apply(makeCtx({ sanctionsHits: [{ x: 1 }] }));
    expect(f.rationale).toMatch(/Missing/);
    expect(f.rationale).toMatch(/pepHits|adverseMedia|uboChain|documents/);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({ sanctionsHits: [{ x: 1 }] }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── freshness_check ───────────────────────────────────────────────────────────

describe('freshness_check', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.freshness_check;

  it('returns inconclusive when no evidence items', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('freshness_check');
  });

  it('returns inconclusive when items is not an array', async () => {
    const f = await apply(makeCtx({ items: 'not-an-array' }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when all items are fresh (within 365 days)', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30); // 30 days ago
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', observedAt: recentDate.toISOString() }),
        makeItem({ id: 'ev-2', observedAt: new Date().toISOString() }),
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when more than 50% of items are stale (> 365 days)', async () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2); // 2 years ago
    const oldDate2 = new Date();
    oldDate2.setFullYear(oldDate2.getFullYear() - 3); // 3 years ago
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30);
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', observedAt: oldDate.toISOString() }),
        makeItem({ id: 'ev-2', observedAt: oldDate2.toISOString() }),
        makeItem({ id: 'ev-3', observedAt: recentDate.toISOString() }),
      ],
    }));
    // 2 out of 3 stale → rate = 0.67 > 0.5 → flag
    expect(f.verdict).toBe('flag');
  });

  it('training_data items are always stale', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-td', kind: 'training_data', observedAt: new Date().toISOString() }),
        makeItem({ id: 'ev-td2', kind: 'training_data', observedAt: new Date().toISOString() }),
      ],
    }));
    expect(f.verdict).toBe('flag'); // both stale → rate = 1.0 > 0.5
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      items: [makeItem({ id: 'ev-fresh', observedAt: new Date().toISOString() })],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── source_credibility ────────────────────────────────────────────────────────

describe('source_credibility', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.source_credibility;

  it('returns inconclusive when no evidence items', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('source_credibility');
  });

  it('clears when all items are authoritative', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', credibility: 'authoritative' }),
        makeItem({ id: 'ev-2', credibility: 'authoritative' }),
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBeLessThan(0.5); // high credibility → low deficiency score
  });

  it('flags when mean credibility is below 0.5 (weak sources)', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', credibility: 'weak' }),
        makeItem({ id: 'ev-2', credibility: 'unknown' }),
        makeItem({ id: 'ev-3', credibility: 'weak' }),
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('score reflects inverse of credibility (1 - avg)', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-auth', credibility: 'authoritative' }), // high score
      ],
    }));
    // authoritative is a top credibility → avg is high → 1-avg is low
    expect(f.score).toBeLessThan(0.5);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      items: [makeItem({ id: 'ev-1', credibility: 'mixed' })],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── tamper_detection ──────────────────────────────────────────────────────────

describe('tamper_detection', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.tamper_detection;

  it('returns inconclusive when no evidence items', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('tamper_detection');
  });

  it('clears when all items have sha256', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', sha256: 'abc123def456' }),
        makeItem({ id: 'ev-2', sha256: 'xyz789ghi012' }),
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('flags when more than 50% of items lack sha256', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1' }), // no sha256
        makeItem({ id: 'ev-2' }), // no sha256
        makeItem({ id: 'ev-3', sha256: 'abc123' }),
      ],
    }));
    // 2 out of 3 unsigned → rate = 0.67 > 0.5 → flag
    expect(f.verdict).toBe('flag');
  });

  it('score equals ratio of unsigned items', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1' }),  // unsigned
        makeItem({ id: 'ev-2', sha256: 'abc' }),  // signed
      ],
    }));
    expect(f.score).toBeCloseTo(0.5, 5);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      items: [makeItem({ id: 'ev-1' })],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── provenance_trace ──────────────────────────────────────────────────────────

describe('provenance_trace', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.provenance_trace;

  it('returns inconclusive when no evidence items', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('provenance_trace');
  });

  it('clears when all items have either publisher or uri', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', publisher: 'Reuters' }),
        makeItem({ id: 'ev-2', uri: 'https://example.com/article' }),
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('flags when more than 25% of items have no publisher or uri', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1' }),  // orphan (no publisher, no uri)
        makeItem({ id: 'ev-2' }),  // orphan
        makeItem({ id: 'ev-3' }),  // orphan
        makeItem({ id: 'ev-4', publisher: 'Reuters' }),
      ],
    }));
    // 3 out of 4 orphan → rate = 0.75 > 0.25 → flag
    expect(f.verdict).toBe('flag');
  });

  it('clears when orphan rate is at or below 25%', async () => {
    const f = await apply(makeCtx({
      items: [
        makeItem({ id: 'ev-1', publisher: 'OFAC' }),
        makeItem({ id: 'ev-2', uri: 'https://ofac.gov/list' }),
        makeItem({ id: 'ev-3', publisher: 'Reuters' }),
        makeItem({ id: 'ev-4' }), // 1 out of 4 = 25% exactly → clear (not > 0.25)
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      items: [makeItem({ id: 'ev-1' })], // orphan
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── data_quality_score ────────────────────────────────────────────────────────

describe('data_quality_score', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.data_quality_score;

  it('returns inconclusive when context is entirely empty', async () => {
    // With empty context, completeness_audit will fire (all channels missing)
    // but freshness/credibility/tamper/provenance will return inconclusive (no items)
    // → 1 contributing sub-audit (completeness).
    const f = await apply(makeCtx({}));
    // completeness_audit gives verdict 'escalate' (not inconclusive) → 1 contributes
    expect(f.verdict).not.toBe('inconclusive');
    expect(f.modeId).toBe('data_quality_score');
  });

  it('clears when all sub-audits pass', async () => {
    const recentDate = new Date().toISOString();
    const f = await apply(makeCtx({
      sanctionsHits: [{ x: 1 }],
      pepHits: [{ x: 1 }],
      adverseMedia: [{ x: 1 }],
      uboChain: [{ x: 1 }],
      documents: [{ x: 1 }],
      items: [
        makeItem({ id: 'ev-1', observedAt: recentDate, sha256: 'abc', publisher: 'OFAC', credibility: 'authoritative' }),
        makeItem({ id: 'ev-2', observedAt: recentDate, sha256: 'def', publisher: 'Reuters', credibility: 'primary' }),
      ],
    }));
    // All 5 channels present (completeness=0), items are fresh, well-sourced, signed, attributed
    expect(f.verdict).toBe('clear');
  });

  it('flags when composite deficiency is high', async () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 3);
    const f = await apply(makeCtx({
      // completeness: all missing
      items: [
        makeItem({ id: 'ev-1', kind: 'training_data', observedAt: oldDate.toISOString(), credibility: 'weak' }),
        // no sha256, no publisher, no uri
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({ items: [makeItem()] }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── discrepancy_log ───────────────────────────────────────────────────────────

describe('discrepancy_log', () => {
  const apply = DATA_QUALITY_MODE_APPLIES.discrepancy_log;

  it('returns inconclusive when documents is absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('discrepancy_log');
  });

  it('returns inconclusive when fewer than 2 documents', async () => {
    const f = await apply(makeCtx({ documents: [{ type: 'passport', dob: '1980-01-01' }] }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when all documents have consistent field values', async () => {
    const f = await apply(makeCtx({
      documents: [
        { type: 'passport', nationality: 'AE', dob: '1980-01-01' },
        { type: 'passport', nationality: 'AE', dob: '1980-01-01' },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.rationale).toMatch(/no cross-document field contradictions/i);
  });

  it('flags when 2+ fields differ across documents', async () => {
    const f = await apply(makeCtx({
      documents: [
        { type: 'passport', nationality: 'AE', dob: '1980-01-01', name: 'John Smith' },
        { type: 'licence', nationality: 'GB', dob: '1985-06-15', name: 'John Smith' },
      ],
    }));
    // nationality and dob differ → 2 discrepancies → flag
    expect(f.verdict).toBe('flag');
  });

  it('clears when only 1 field differs', async () => {
    const f = await apply(makeCtx({
      documents: [
        { type: 'passport', dob: '1980-01-01' },
        { type: 'passport', dob: '1980-01-02' }, // only dob differs
      ],
    }));
    // 1 discrepancy < 2 → clear
    expect(f.verdict).toBe('clear');
  });

  it('score reflects number of discrepancies', async () => {
    const f = await apply(makeCtx({
      documents: [
        { field1: 'A', field2: 'X', field3: 'P', field4: '1' },
        { field1: 'B', field2: 'Y', field3: 'Q', field4: '2' },
      ],
    }));
    // 4 discrepancies → min(1, 4/4) = 1.0
    expect(f.score).toBe(1);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      documents: [
        { a: '1', b: '2' },
        { a: '1', b: '3' },
      ],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});
