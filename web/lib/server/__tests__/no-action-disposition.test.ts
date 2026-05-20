import { describe, it, expect } from 'vitest';
import { validateNoActionDisposition } from '../no-action-disposition';

describe('validateNoActionDisposition', () => {
  it('accepts a complete disposition', () => {
    const r = validateNoActionDisposition({
      reason: 'Hit matches a different DOB and different jurisdiction; no further action needed at this time.',
      evidenceReviewed: 'Passport scan, customer DOB declared at onboarding, country-risk report (UAE customer vs IR sanctioned entry).',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reason).toMatch(/^Hit matches/);
      expect(r.value.evidenceReviewed).toMatch(/^Passport/);
    }
  });

  it('trims whitespace from both fields', () => {
    const r = validateNoActionDisposition({
      reason: '   reason here   ',
      evidenceReviewed: '\n  evidence here \t',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reason).toBe('reason here');
      expect(r.value.evidenceReviewed).toBe('evidence here');
    }
  });

  it('rejects missing reason', () => {
    const r = validateNoActionDisposition({ evidenceReviewed: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reason is required/i);
  });

  it('rejects whitespace-only reason', () => {
    const r = validateNoActionDisposition({ reason: '    \n  \t', evidenceReviewed: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects non-string reason', () => {
    expect(validateNoActionDisposition({ reason: 42, evidenceReviewed: 'x' }).ok).toBe(false);
    expect(validateNoActionDisposition({ reason: null, evidenceReviewed: 'x' }).ok).toBe(false);
    expect(validateNoActionDisposition({ reason: {}, evidenceReviewed: 'x' }).ok).toBe(false);
  });

  it('rejects missing evidenceReviewed', () => {
    const r = validateNoActionDisposition({ reason: 'a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/evidenceReviewed is required/i);
  });

  it('rejects whitespace-only evidenceReviewed', () => {
    const r = validateNoActionDisposition({ reason: 'a', evidenceReviewed: '   \t  ' });
    expect(r.ok).toBe(false);
  });

  it('rejects oversize reason (>2048 chars)', () => {
    const r = validateNoActionDisposition({
      reason: 'a'.repeat(2049),
      evidenceReviewed: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/2048-character/);
  });

  it('accepts reason exactly at the 2048-char limit', () => {
    const r = validateNoActionDisposition({
      reason: 'a'.repeat(2048),
      evidenceReviewed: 'x',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects oversize evidenceReviewed (>4096 chars)', () => {
    const r = validateNoActionDisposition({
      reason: 'a',
      evidenceReviewed: 'b'.repeat(4097),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/4096-character/);
  });

  it('accepts evidenceReviewed exactly at the 4096-char limit', () => {
    const r = validateNoActionDisposition({
      reason: 'a',
      evidenceReviewed: 'b'.repeat(4096),
    });
    expect(r.ok).toBe(true);
  });
});
