import { describe, it, expect } from 'vitest';
import { assessPEP } from './pep.js';

describe('assessPEP', () => {
  it('detects head-of-state tier 1', () => {
    const r = assessPEP('President of the republic and foreign dignitary.', 'X');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.highestTier).toBe('tier_1_head_of_state_or_gov');
  });
  it('detects ambassador tier 2', () => {
    const r = assessPEP('The subject is an ambassador to France.', 'X');
    expect(r.isLikelyPEP).toBe(true);
    expect(r.highestTier).toBe('tier_2_senior_political_judicial_military');
  });
  it('detects family tier', () => {
    const r = assessPEP('He is the son of a minister of defence.', 'X');
    expect(r.isLikelyPEP).toBe(true);
  });
  it('non-PEP is clear', () => {
    const r = assessPEP('Local restaurateur, no political exposure.', 'X');
    expect(r.isLikelyPEP).toBe(false);
    expect(r.riskScore).toBe(0);
  });
});
