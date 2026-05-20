// Hawkeye Sterling — default-apply unit tests.
// Covers all five category branches and the catch-all.

import { describe, it, expect } from 'vitest';
import { defaultApply } from './default-apply.js';
import type { BrainContext, Finding } from '../types.js';

function makeCtx(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    subject: { name: 'Test Subject' },
    evidence: {},
    priorFindings: [],
    ...overrides,
  } as BrainContext;
}

function makeFinding(partial: Partial<Finding> = {}): Finding {
  return {
    modeId: 'test-mode',
    category: 'logic',
    faculties: [],
    score: 0.5,
    confidence: 0.6,
    verdict: 'flag',
    rationale: 'some rationale',
    evidence: [],
    producedAt: Date.now(),
    ...partial,
  };
}

const FACULTIES = ['data_analysis'] as const;

describe('defaultApply — jurisdiction categories', () => {
  const apply = defaultApply('mode-x', 'compliance_framework', [...FACULTIES], 'Compliance check');

  it('returns inconclusive when no jurisdiction in chain', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.rationale).toContain('no jurisdiction');
  });

  it('escalates on FATF-called-out jurisdiction (IR)', async () => {
    const r = await apply(makeCtx({ subject: { name: 'Test', jurisdiction: 'IR' } }));
    expect(r.verdict).toBe('escalate');
    expect(r.score).toBe(0.85);
    expect(r.rationale).toContain('CFA');
  });

  it('flags on grey-list jurisdiction (TR)', async () => {
    const r = await apply(makeCtx({ subject: { name: 'Test', jurisdiction: 'TR' } }));
    expect(r.verdict).toBe('flag');
    expect(r.score).toBe(0.45);
  });

  it('clears for low-risk jurisdiction (AE)', async () => {
    const r = await apply(makeCtx({ subject: { name: 'Test', jurisdiction: 'AE' } }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0.1);
  });

  it('collects jurisdiction from nationality', async () => {
    const r = await apply(makeCtx({ subject: { name: 'Test', nationality: 'KP' } }));
    expect(r.verdict).toBe('escalate');
  });

  it('collects jurisdiction from UBO chain', async () => {
    const ctx = makeCtx({
      evidence: {
        uboChain: [{ jurisdiction: 'IR' }, { country: 'AE' }],
      },
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('escalate');
    expect(r.evidence).toContain('cfa=IR');
  });

  it('covers geopolitical_risk category', async () => {
    const geoApply = defaultApply('geo-mode', 'geopolitical_risk', [...FACULTIES], 'Geo risk');
    const r = await geoApply(makeCtx({ subject: { name: 'Test', jurisdiction: 'VE' } }));
    expect(r.verdict).toBe('flag'); // VE is grey
  });

  it('covers predicate_crime category', async () => {
    const preApply = defaultApply('pred-mode', 'predicate_crime', [...FACULTIES], 'Predicate');
    const r = await preApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });
});

describe('defaultApply — transaction categories', () => {
  const apply = defaultApply('txn-mode', 'forensic', [...FACULTIES], 'Forensic check');

  it('returns inconclusive when no transactions available', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.rationale).toContain('no transactions');
  });

  it('flags when single transaction dominates (concentration > 0.5)', async () => {
    const ctx = makeCtx({
      evidence: { transactions: [{ amount: 100_000 }, { amount: 5_000 }] },
    });
    const r = await apply(ctx);
    // concentration = 100000/105000 ≈ 0.952 > 0.5 → flag
    expect(r.verdict).toBe('flag');
    expect(r.score).toBe(0.55);
  });

  it('clears when transactions are balanced (concentration <= 0.25)', async () => {
    const ctx = makeCtx({
      evidence: { transactions: [{ amount: 5000 }, { amount: 5000 }, { amount: 5000 }, { amount: 5000 }] },
    });
    const r = await apply(ctx);
    // concentration = 0.25 → clear
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0.15);
  });

  it('returns 0.3 score for intermediate concentration (0.25 < conc <= 0.5)', async () => {
    const ctx = makeCtx({
      evidence: { transactions: [{ amount: 40 }, { amount: 60 }, { amount: 30 }] },
    });
    // max=60, sum=130, conc=60/130≈0.46 → between 0.25 and 0.5
    const r = await apply(ctx);
    expect(r.score).toBe(0.3);
    expect(r.verdict).toBe('clear');
  });

  it('parses string amounts with commas', async () => {
    const ctx = makeCtx({
      evidence: { transactions: [{ amount: '1,000,000' }] },
    });
    const r = await apply(ctx);
    expect(r.score).toBe(0.55); // single tx = 100% concentration > 0.5 → flag
  });

  it('ignores zero or invalid amounts', async () => {
    const ctx = makeCtx({
      evidence: { transactions: [{ amount: 0 }, { amount: 'not-a-number' }, { amount: 5000 }] },
    });
    const r = await apply(ctx);
    // Only 5000 is valid; single tx → concentration = 1 > 0.5 → flag
    expect(r.verdict).toBe('flag');
  });

  it('covers forensic_accounting category', async () => {
    const faApply = defaultApply('fa-mode', 'forensic_accounting', [...FACULTIES], 'FA');
    const r = await faApply(makeCtx({ evidence: { transactions: [{ amount: 1000 }] } }));
    expect(r.verdict).toBe('flag'); // single tx = 100% concentration
  });

  it('covers cryptoasset_forensics category', async () => {
    const cryptoApply = defaultApply('crypto-mode', 'cryptoasset_forensics', [...FACULTIES], 'Crypto');
    const r = await cryptoApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });
});

describe('defaultApply — network categories', () => {
  const apply = defaultApply('net-mode', 'graph_analysis', [...FACULTIES], 'Graph analysis');

  it('returns inconclusive when no UBO chain', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.rationale).toContain('no UBO chain');
  });

  it('flags for deep UBO chain (depth >= 5)', async () => {
    const ctx = makeCtx({
      evidence: { uboChain: [{}, {}, {}, {}, {}] }, // depth = 5
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('flag');
    expect(r.score).toBe(0.6);
  });

  it('clears for shallow UBO chain (depth < 3)', async () => {
    const ctx = makeCtx({ evidence: { uboChain: [{}] } });
    const r = await apply(ctx);
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0.15);
  });

  it('returns 0.35 score for medium chain (3 <= depth < 5)', async () => {
    const ctx = makeCtx({ evidence: { uboChain: [{}, {}, {}] } });
    const r = await apply(ctx);
    expect(r.score).toBe(0.35);
    expect(r.verdict).toBe('clear');
  });

  it('covers sectoral_typology category', async () => {
    const sectApply = defaultApply('sect-mode', 'sectoral_typology', [...FACULTIES], 'Sectoral');
    const r = await sectApply(makeCtx({ evidence: { uboChain: Array.from({ length: 5 }, () => ({})) } }));
    expect(r.verdict).toBe('flag');
  });
});

describe('defaultApply — text categories', () => {
  const apply = defaultApply('text-mode', 'osint', [...FACULTIES], 'OSINT analysis');

  it('returns inconclusive when narrative is too thin', async () => {
    const r = await apply(makeCtx({ evidence: { freeText: 'short' } }));
    expect(r.verdict).toBe('inconclusive');
    expect(r.rationale).toContain('narrative too thin');
  });

  it('returns inconclusive when no text at all', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags when >= 3 concern keywords found', async () => {
    const text = 'The subject is suspected of money laundering and bribery to evade sanctions. Fraud and corruption.';
    const r = await apply(makeCtx({ evidence: { freeText: text } }));
    expect(r.verdict).toBe('flag');
    expect(r.score).toBeGreaterThan(0);
  });

  it('clears when fewer than 3 concern keywords', async () => {
    const text = 'The company is involved in a legitimate dispute about trade agreements and regulatory filings.';
    const r = await apply(makeCtx({ evidence: { freeText: text } }));
    expect(r.verdict).toBe('clear');
  });

  it('includes concern keywords in evidence', async () => {
    const text = 'Evidence of fraud, corruption, and money laundering was uncovered in the sanction evasion scheme illicit conceal suspicious';
    const r = await apply(makeCtx({ evidence: { freeText: text } }));
    expect(r.evidence.some((e) => e.startsWith('kw='))).toBe(true);
  });

  it('incorporates prior findings rationale into text analysis', async () => {
    const ctx = makeCtx({
      evidence: { freeText: 'A routine annual compliance review was performed.' },
      priorFindings: [makeFinding({ rationale: 'Subject suspected of fraud and money laundering sanctions bribery' })],
    });
    const r = await apply(ctx);
    // Combined text will have enough concern words
    expect(r.verdict).toBe('flag');
  });

  it('covers cognitive_science category', async () => {
    const cogApply = defaultApply('cog-mode', 'cognitive_science', [...FACULTIES], 'Cognitive');
    const r = await cogApply(makeCtx({ evidence: { freeText: 'x'.repeat(40) } }));
    expect(r.verdict).toBe('clear'); // no concern keywords
  });

  it('caps score at 0.7 regardless of keyword count', async () => {
    const text = 'fraud launder sanction terror bribe corrupt evasion conceal suspicious illicit '.repeat(3);
    const r = await apply(makeCtx({ evidence: { freeText: text } }));
    expect(r.score).toBeLessThanOrEqual(0.7);
  });
});

describe('defaultApply — meta categories', () => {
  const apply = defaultApply('meta-mode', 'logic', [...FACULTIES], 'Logic check');

  it('returns inconclusive when fewer than 2 confident priors', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.rationale).toContain('need ≥2 confident priors');
  });

  it('returns inconclusive when priors are stubs or low-confidence', async () => {
    const ctx = makeCtx({
      priorFindings: [
        makeFinding({ rationale: '[stub] placeholder', confidence: 0.5 }),
        makeFinding({ rationale: 'real finding', confidence: 0.1 }), // low confidence
      ],
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('inconclusive');
  });

  it('escalates when mean prior score >= 0.6', async () => {
    const ctx = makeCtx({
      priorFindings: [
        makeFinding({ score: 0.8, confidence: 0.8, rationale: 'finding 1' }),
        makeFinding({ score: 0.9, confidence: 0.9, rationale: 'finding 2' }),
      ],
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('escalate');
    expect(r.score).toBeCloseTo(0.85);
    expect(r.evidence).toContain('prior_count=2');
  });

  it('flags when mean prior score is between 0.3 and 0.6', async () => {
    const ctx = makeCtx({
      priorFindings: [
        makeFinding({ score: 0.4, confidence: 0.7, rationale: 'finding 1' }),
        makeFinding({ score: 0.5, confidence: 0.7, rationale: 'finding 2' }),
      ],
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('flag');
  });

  it('clears when mean prior score < 0.3', async () => {
    const ctx = makeCtx({
      priorFindings: [
        makeFinding({ score: 0.1, confidence: 0.7, rationale: 'finding 1' }),
        makeFinding({ score: 0.2, confidence: 0.7, rationale: 'finding 2' }),
      ],
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('clear');
  });

  it('applies meta tag to output finding', async () => {
    const ctx = makeCtx({
      priorFindings: [
        makeFinding({ score: 0.7, confidence: 0.8, rationale: 'r1' }),
        makeFinding({ score: 0.8, confidence: 0.8, rationale: 'r2' }),
      ],
    });
    const r = await apply(ctx);
    expect(r.tags).toContain('meta');
  });

  it('covers intelligence_fusion category', async () => {
    const ifApply = defaultApply('if-mode', 'intelligence_fusion', [...FACULTIES], 'Fusion');
    const ctx = makeCtx({
      priorFindings: [
        makeFinding({ score: 0.8, confidence: 0.9, rationale: 'r1' }),
        makeFinding({ score: 0.7, confidence: 0.9, rationale: 'r2' }),
      ],
    });
    const r = await ifApply(ctx);
    expect(r.verdict).toBe('escalate');
  });
});

describe('defaultApply — catch-all (unrecognised category)', () => {
  it('returns inconclusive with populated channels listed', async () => {
    // Use a category not in any of the known sets — or rather just a non-existent one
    // We'll use 'sectoral_typology' which IS a NETWORK category, so let's pick
    // something that is genuinely not in any set.
    // Actually 'data_quality' IS a META category. Let's use a different approach:
    // Since all declared categories are covered, we'll test the catch-all
    // by casting a made-up category.
    const apply = defaultApply('catch-all-mode', 'other' as never, [...FACULTIES], 'Catch-all check');
    const ctx = makeCtx({
      evidence: {
        sanctionsHits: [{ score: 0.9 }],
        pepHits: [{ id: 'pep-1' }],
        adverseMedia: [{ headline: 'Article 1' }],
        uboChain: [{ id: 'ubo-1' }, { id: 'ubo-2' }],
        transactions: [{ amount: 1000 }],
        documents: [{ type: 'passport' }],
      },
    });
    const r = await apply(ctx);
    expect(r.verdict).toBe('inconclusive');
    expect(r.rationale).toContain('no category-specific apply registered');
    expect(r.evidence.some((e) => e.includes('sanctions=1'))).toBe(true);
    expect(r.evidence.some((e) => e.includes('pep=1'))).toBe(true);
  });

  it('catch-all with no populated channels', async () => {
    const apply = defaultApply('catch-mode', 'other' as never, [...FACULTIES], 'Catch');
    const r = await apply(makeCtx());
    expect(r.rationale).toContain('none');
    expect(r.evidence).toHaveLength(0);
  });
});
