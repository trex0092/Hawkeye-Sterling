import { describe, expect, it } from 'vitest';
import { scoreRisk, DPMS_UAE_WEIGHTS } from '../risk-score.js';

describe('risk-score methodology (P9)', () => {
  it('declares methodology + profile + inputs + gaps', () => {
    const r = scoreRisk([
      { kind: 'sanctions_hit', value: 0, source: 'evid:sanc-1', confidence: 1 },
      { kind: 'pep_status', value: 1, source: 'evid:pep-1', confidence: 0.9 },
      { kind: 'jurisdiction_tier', value: 0.75, source: 'evid:jur-1', confidence: 1 },
    ]);
    expect(r.methodology).toMatch(/Weighted mean/);
    expect(r.profile).toBe(DPMS_UAE_WEIGHTS);
    expect(r.inputs.length).toBe(3);
    expect(r.missingInputs.length).toBeGreaterThan(0);
    expect(r.gapsThatWouldChangeScore.length).toBe(r.missingInputs.length);
    expect(r.tier).toMatch(/^(low|medium|high|very_high)$/);
  });

  it('low-confidence inputs are attenuated and warned about', () => {
    const r = scoreRisk([
      { kind: 'sanctions_hit', value: 1, source: 'evid:x', confidence: 0.2 },
      { kind: 'pep_status', value: 1, source: 'evid:y', confidence: 0.3 },
    ]);
    expect(r.caveats.some((c) => /confidence < 0.5/.test(c))).toBe(true);
  });

  it('score is clamped to [0,1]', () => {
    const r = scoreRisk([
      { kind: 'sanctions_hit', value: 99, source: 'x', confidence: 1 },
    ]);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
