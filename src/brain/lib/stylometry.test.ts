import { describe, it, expect } from 'vitest';
import { analyseText, gaslightingScore, freeTextFromEvidence } from './stylometry.js';

describe('analyseText', () => {
  it('detects hedging', () => {
    const r = analyseText('Perhaps the client maybe received funds. It seems the transfer possibly occurred.');
    expect(r.hedgingCount).toBeGreaterThanOrEqual(3);
    expect(r.flags.some((f) => f.includes('hedging'))).toBe(true);
  });
  it('detects passive voice', () => {
    const r = analyseText('Funds were transferred. Documents were sent. The account was opened.');
    expect(r.passiveCount).toBeGreaterThanOrEqual(2);
  });
  it('detects code words', () => {
    const r = analyseText('A facilitation fee was paid for office supplies, consultancy fee invoiced, no paperwork required.');
    expect(r.codeWordsHit.length).toBeGreaterThanOrEqual(2);
  });
  it('produces bounded scores', () => {
    const r = analyseText('Hello world.');
    expect(r.deceptionScore).toBeGreaterThanOrEqual(0);
    expect(r.deceptionScore).toBeLessThanOrEqual(1);
  });
});

describe('gaslightingScore', () => {
  it('returns 0 for benign text', () => {
    expect(gaslightingScore('The meeting is scheduled for Tuesday.').score).toBe(0);
  });
  it('detects reality denial', () => {
    const r = gaslightingScore('You\'re imagining things. That never happened. You\'re being paranoid.');
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('freeTextFromEvidence', () => {
  it('pulls strings from nested arrays', () => {
    const t = freeTextFromEvidence({
      freeText: 'foo',
      documents: [{ title: 'bar', summary: 'baz' }, 'quux'],
    });
    expect(t).toContain('foo');
    expect(t).toContain('bar');
    expect(t).toContain('baz');
    expect(t).toContain('quux');
  });
});
