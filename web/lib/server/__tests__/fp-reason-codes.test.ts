import { describe, it, expect } from 'vitest';
import {
  FP_REASON_CODES,
  FP_REASON_LABEL,
  isFpReasonCode,
  validateFpDisposition,
} from '../fp-reason-codes';

describe('FP_REASON_CODES catalogue', () => {
  it('contains the six G-05 codes plus the three FP-60 triage codes', () => {
    expect(FP_REASON_CODES).toEqual([
      'FP_01', 'FP_02', 'FP_03', 'FP_04', 'FP_05', 'FP_06',
      'FP_07', 'FP_08', 'FP_09',
    ]);
  });

  it('has a human-readable label for every code', () => {
    for (const code of FP_REASON_CODES) {
      expect(FP_REASON_LABEL[code]).toBeTruthy();
      expect(typeof FP_REASON_LABEL[code]).toBe('string');
    }
  });
});

describe('isFpReasonCode', () => {
  it('returns true for every valid code', () => {
    for (const code of FP_REASON_CODES) {
      expect(isFpReasonCode(code)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isFpReasonCode('FP_10')).toBe(false);
    expect(isFpReasonCode('fp_01')).toBe(false); // case-sensitive
    expect(isFpReasonCode('')).toBe(false);
    expect(isFpReasonCode('other')).toBe(false);
  });

  it('returns false for non-string types', () => {
    expect(isFpReasonCode(undefined)).toBe(false);
    expect(isFpReasonCode(null)).toBe(false);
    expect(isFpReasonCode(1)).toBe(false);
    expect(isFpReasonCode({})).toBe(false);
    expect(isFpReasonCode([])).toBe(false);
  });
});

describe('validateFpDisposition', () => {
  it('accepts every code with no reason text (FP_01..FP_05)', () => {
    for (const code of ['FP_01', 'FP_02', 'FP_03', 'FP_04', 'FP_05'] as const) {
      const r = validateFpDisposition({ reasonCode: code });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.reasonCode).toBe(code);
        expect(r.value.reason).toBeNull();
      }
    }
  });

  it('accepts FP_01..FP_05 with an optional explanatory reason', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_01', reason: 'Customer DOB 1985-04-22; sanctioned entry DOB 1962-11-03.' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reason).toBe('Customer DOB 1985-04-22; sanctioned entry DOB 1962-11-03.');
    }
  });

  it('rejects a missing reasonCode', () => {
    const r = validateFpDisposition({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/reasonCode is required/i);
      expect(r.error).toContain('FP_01');
    }
  });

  it('rejects an invalid reasonCode', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_99' });
    expect(r.ok).toBe(false);
  });

  it('rejects FP_06 without a free-text reason', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_06' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/reason text is required.*FP_06/i);
    }
  });

  it('rejects FP_06 with whitespace-only reason', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_06', reason: '   \t  \n  ' });
    expect(r.ok).toBe(false);
  });

  it('accepts FP_06 with substantive reason text', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_06', reason: 'Subject is a UAE national, hit is a Russian oligarch — different person despite name collision.' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reason).toBe('Subject is a UAE national, hit is a Russian oligarch — different person despite name collision.');
    }
  });

  it('trims surrounding whitespace from the reason text', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_06', reason: '   actual reason   \n' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reason).toBe('actual reason');
    }
  });

  it('treats non-string reason as null', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_01', reason: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reason).toBeNull();
    }
  });

  it('rejects an oversize reason (>2048 chars)', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_01', reason: 'a'.repeat(2049) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/2048-character limit/);
    }
  });

  it('accepts a reason exactly at the 2048-character limit', () => {
    const r = validateFpDisposition({ reasonCode: 'FP_01', reason: 'a'.repeat(2048) });
    expect(r.ok).toBe(true);
  });
});
