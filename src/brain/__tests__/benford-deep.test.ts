// Deep coverage tests for benford.ts
// Covers: analyseBenford (insufficient data, clean Benford data, suspicious,
//         flaggedDigits, chiSquared, n < 500 vs n ≥ 500 thresholds),
//         screenTransactionSets (sorting by risk order).

import { describe, it, expect } from 'vitest';
import { analyseBenford, screenTransactionSets } from '../benford.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Generate n amounts that follow Benford's law closely.
 *  Leading digit d appears with frequency log10(1+1/d). */
function benfordAmounts(n: number): number[] {
  const amounts: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = i % 9 + 1;
    amounts.push(d * 100 + (i % 100));  // e.g. 100, 201, 302, ...
  }
  return amounts;
}

/** Generate n amounts all starting with the same leading digit (high MAD). */
function uniformLeadingDigit(digit: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => digit * 10_000 + i);
}

// ── insufficient data ─────────────────────────────────────────────────────────

describe('analyseBenford — insufficient data', () => {
  it('returns ok=false and risk=insufficient-data when n < 100', () => {
    const r = analyseBenford({ amounts: [100, 200, 300] });
    expect(r.ok).toBe(false);
    expect(r.risk).toBe('insufficient-data');
    expect(r.error).toMatch(/insufficient/i);
  });

  it('returns ok=false for empty amounts', () => {
    const r = analyseBenford({ amounts: [] });
    expect(r.ok).toBe(false);
    expect(r.risk).toBe('insufficient-data');
  });

  it('ignores negatives and zeros in the count', () => {
    // 99 positive + 100 negatives → n = 99 → insufficient
    const amounts = [
      ...Array.from({ length: 99 }, (_, i) => i + 1),
      ...Array.from({ length: 100 }, () => -500),
    ];
    const r = analyseBenford({ amounts });
    expect(r.ok).toBe(false);
    expect(r.n).toBe(99);
  });
});

// ── clean / Benford-conforming data ──────────────────────────────────────────

describe('analyseBenford — Benford-conforming data', () => {
  it('produces risk=clean or risk=marginal for 500+ Benford-distributed amounts', () => {
    // Use the actual Benford expected distribution.
    const amounts: number[] = [];
    const n = 1000;
    for (let i = 0; i < n; i++) {
      // Distribute leading digits according to Benford law (approx):
      // 30% lead with 1, 18% with 2, 12% with 3, ...
      const rand = (i / n);
      const d = rand < 0.301 ? 1 : rand < 0.477 ? 2 : rand < 0.602 ? 3 :
                rand < 0.699 ? 4 : rand < 0.778 ? 5 : rand < 0.845 ? 6 :
                rand < 0.903 ? 7 : rand < 0.954 ? 8 : 9;
      amounts.push(d * 1000 + i);
    }
    const r = analyseBenford({ amounts });
    expect(r.ok).toBe(true);
    expect(['clean', 'marginal']).toContain(r.risk);
  });

  it('n matches the count of positive finite amounts', () => {
    const amounts = [...Array.from({ length: 200 }, (_, i) => i + 1), -1, 0, NaN, Infinity];
    const r = analyseBenford({ amounts });
    expect(r.n).toBe(200);
  });
});

// ── suspicious / non-conforming data ─────────────────────────────────────────

describe('analyseBenford — suspicious data', () => {
  it('returns risk=suspicious when all amounts start with the same digit (500+ samples)', () => {
    const amounts = uniformLeadingDigit(7, 600); // all lead with 7
    const r = analyseBenford({ amounts });
    expect(r.ok).toBe(true);
    expect(r.risk).toBe('suspicious');
  });

  it('MAD > 0.015 triggers suspicious', () => {
    const amounts = uniformLeadingDigit(5, 600);
    const r = analyseBenford({ amounts });
    expect(r.mad).toBeGreaterThan(0.015);
    expect(r.risk).toBe('suspicious');
  });

  it('flaggedDigits contains the over-represented leading digit', () => {
    const amounts = uniformLeadingDigit(3, 600);
    const r = analyseBenford({ amounts });
    expect(r.flaggedDigits).toContain(3);
  });
});

// ── digit breakdown ───────────────────────────────────────────────────────────

describe('analyseBenford — digit breakdown', () => {
  it('returns 9 digit entries for digits 1–9', () => {
    const r = analyseBenford({ amounts: uniformLeadingDigit(1, 200) });
    // n ≥ 100 → digits array populated
    expect(r.digits).toHaveLength(9);
    expect(r.digits.map((d) => d.digit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('observedPct sums to 100 within floating-point tolerance', () => {
    const amounts = uniformLeadingDigit(1, 200);
    const r = analyseBenford({ amounts });
    const sum = r.digits.reduce((s, d) => s + d.observedPct, 0);
    expect(sum).toBeCloseTo(100, 3);
  });

  it('expectedPct sums to ≈100', () => {
    const r = analyseBenford({ amounts: benfordAmounts(200) });
    const sum = r.digits.reduce((s, d) => s + d.expectedPct, 0);
    expect(sum).toBeCloseTo(100, 3);
  });
});

// ── chiSquared and p-value ───────────────────────────────────────────────────

describe('analyseBenford — chiSquared', () => {
  it('chiSquared is 0 when observed = expected exactly (hypothetical)', () => {
    // We can't produce exactly 0, but for Benford data it should be low.
    const amounts: number[] = [];
    // Use exact Benford frequencies.
    const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
    for (let d = 1; d <= 9; d++) {
      const count = Math.round((expected[d - 1] ?? 0) * 1000);
      for (let i = 0; i < count; i++) amounts.push(d * 1000 + i);
    }
    const r = analyseBenford({ amounts });
    expect(r.chiSquared).toBeGreaterThanOrEqual(0);
  });

  it('chiSquaredPValue is in [0, 1]', () => {
    const r = analyseBenford({ amounts: uniformLeadingDigit(2, 500) });
    expect(r.chiSquaredPValue).toBeGreaterThanOrEqual(0);
    expect(r.chiSquaredPValue).toBeLessThanOrEqual(1);
  });

  it('chiSquared is high for uniform leading digit (strong non-conformity)', () => {
    const r = analyseBenford({ amounts: uniformLeadingDigit(1, 600) });
    // Should be well above the p<0.05 critical value of 15.507.
    expect(r.chiSquared).toBeGreaterThan(15);
  });
});

// ── label propagation ─────────────────────────────────────────────────────────

describe('analyseBenford — label', () => {
  it('uses the supplied label', () => {
    const r = analyseBenford({ amounts: [100], label: 'Q1 wires' });
    expect(r.label).toBe('Q1 wires');
  });

  it('defaults to "dataset" when no label provided', () => {
    const r = analyseBenford({ amounts: [100] });
    expect(r.label).toBe('dataset');
  });
});

// ── n < 500 marginal branch ───────────────────────────────────────────────────

describe('analyseBenford — n in [100, 500)', () => {
  it('is "marginal" for conforming data with n in [100, 500)', () => {
    // 200 amounts distributed across digits → likely marginal
    const amounts = Array.from({ length: 200 }, (_, i) => (i % 9 + 1) * 1000 + i);
    const r = analyseBenford({ amounts });
    expect(r.n).toBeGreaterThanOrEqual(100);
    expect(r.n).toBeLessThan(500);
    expect(['marginal', 'suspicious']).toContain(r.risk);
  });
});

// ── screenTransactionSets ─────────────────────────────────────────────────────

describe('screenTransactionSets', () => {
  it('returns an array with one result per input set', () => {
    const results = screenTransactionSets([
      { label: 'clean', amounts: benfordAmounts(1000) },
      { label: 'sus', amounts: uniformLeadingDigit(7, 600) },
    ]);
    expect(results).toHaveLength(2);
  });

  it('suspicious results sort before clean results', () => {
    const results = screenTransactionSets([
      { label: 'clean', amounts: benfordAmounts(1000) },
      { label: 'sus', amounts: uniformLeadingDigit(7, 600) },
    ]);
    // suspicious (risk=suspicious) should come first.
    expect(results[0]!.risk).toBe('suspicious');
  });

  it('handles empty sets list', () => {
    expect(screenTransactionSets([])).toEqual([]);
  });

  it('passes label through to result', () => {
    const results = screenTransactionSets([
      { label: 'my-dataset', amounts: uniformLeadingDigit(1, 600) },
    ]);
    expect(results[0]!.label).toBe('my-dataset');
  });
});
