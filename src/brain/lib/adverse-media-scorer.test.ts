import { describe, it, expect } from 'vitest';
import { scoreAdverseMedia } from './adverse-media-scorer.js';

describe('scoreAdverseMedia', () => {
  it('routes ML keywords', () => {
    const r = scoreAdverseMedia('Subject indicted for money laundering and tax fraud.', []);
    expect(r.categoriesTripped).toContain('ml_financial_crime');
    expect(r.compositeScore).toBeGreaterThan(0);
  });
  it('routes TF keywords', () => {
    const r = scoreAdverseMedia('Linked to terrorist financing networks and designated terrorist.', []);
    expect(r.categoriesTripped).toContain('terrorist_financing');
  });
  it('handles structured items', () => {
    const r = scoreAdverseMedia(undefined, [{ title: 'Fraud charges filed' }, 'bribery inquiry']);
    expect(r.total).toBeGreaterThan(0);
  });
  it('returns 0 on clean text', () => {
    const r = scoreAdverseMedia('The subject runs a bakery and donates to the local hospital.', []);
    expect(r.total).toBe(0);
    expect(r.compositeScore).toBe(0);
  });
});
