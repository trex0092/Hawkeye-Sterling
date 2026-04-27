// Hawkeye Sterling — Benford's Law forensic accounting analyser.
// Implements the dual-test methodology (chi-squared + MAD) from
// Ausloos et al. (2025) as seen in chirindaopensource/search_benford_law_compatibility.
//
// Benford's Law states that in naturally occurring financial data, the leading
// digit d occurs with probability log10(1 + 1/d). Significant deviation is a
// red flag for fabrication, rounding, or structuring.
//
// Two conformity tests:
//   · Chi-squared (χ²): formal statistical test; p < 0.05 = significant deviation
//   · Mean Absolute Deviation (MAD): Nigrini (2012) thresholds:
//       0.000–0.006 = close conformity
//       0.006–0.012 = acceptable conformity
//       0.012–0.015 = marginally acceptable
//       > 0.015     = non-conformity (suspicious)
//
// Minimum sample: n ≥ 500 for reliable results (Nigrini recommendation).

export interface BenfordInput {
  /** Numeric amounts — negatives and zeros are ignored. */
  amounts: number[];
  /** Optional label for the dataset (e.g. "Q1 wire transfers"). */
  label?: string;
}

export type BenfordRisk = 'clean' | 'marginal' | 'suspicious' | 'insufficient-data';

export interface BenfordResult {
  ok: boolean;
  label: string;
  n: number;                        // sample size after filtering
  mad: number;                      // Mean Absolute Deviation (0–1)
  chiSquared: number;               // χ² statistic
  chiSquaredPValue: number;         // approximate p-value (8 df)
  risk: BenfordRisk;
  riskDetail: string;
  /** Observed vs expected frequency per leading digit 1–9 */
  digits: Array<{
    digit: number;
    observed: number;               // count
    observedPct: number;            // %
    expectedPct: number;            // Benford expected %
    deviation: number;              // observed% - expected%
  }>;
  /** Digits with largest positive deviation (over-represented — structuring signal) */
  flaggedDigits: number[];
  error?: string;
}

// Benford expected probabilities for digits 1–9
const BENFORD_EXPECTED: Record<number, number> = {
  1: Math.log10(1 + 1 / 1),
  2: Math.log10(1 + 1 / 2),
  3: Math.log10(1 + 1 / 3),
  4: Math.log10(1 + 1 / 4),
  5: Math.log10(1 + 1 / 5),
  6: Math.log10(1 + 1 / 6),
  7: Math.log10(1 + 1 / 7),
  8: Math.log10(1 + 1 / 8),
  9: Math.log10(1 + 1 / 9),
};

// Chi-squared critical values for df=8 (9 digits minus 1 constraint)
// p=0.05 → 15.507, p=0.01 → 20.090, p=0.001 → 26.125
const CHI2_CRIT_05 = 15.507;
const CHI2_CRIT_01 = 20.090;

// Approximate p-value for chi-squared with 8 df using Wilson-Hilferty approximation
function chiSquaredPValue(x: number, df = 8): number {
  if (x <= 0) return 1;
  // Wilson-Hilferty normal approximation
  const k = df;
  const z = Math.pow(x / k, 1 / 3) - (1 - 2 / (9 * k));
  const sigma = Math.sqrt(2 / (9 * k));
  const zScore = z / sigma;
  // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
  return 1 - normalCdf(zScore);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - phi * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

function leadingDigit(n: number): number | null {
  if (!isFinite(n) || n <= 0) return null;
  const s = n.toFixed(10).replace('.', '').replace(/^0+/, '');
  const d = parseInt(s[0] ?? '0', 10);
  return d >= 1 && d <= 9 ? d : null;
}

export function analyseBenford(input: BenfordInput): BenfordResult {
  const label = input.label ?? 'dataset';

  // Extract leading digits
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  let n = 0;
  for (const amt of input.amounts) {
    const d = leadingDigit(amt);
    if (d !== null) {
      counts[d] = (counts[d] ?? 0) + 1;
      n++;
    }
  }

  if (n < 100) {
    return {
      ok: false, label, n, mad: 0, chiSquared: 0, chiSquaredPValue: 1,
      risk: 'insufficient-data', riskDetail: `Only ${n} valid amounts (minimum 100 required)`,
      digits: [], flaggedDigits: [],
      error: `Insufficient data: ${n} samples (need ≥ 100)`,
    };
  }

  // Build digit breakdown
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
    const observed = counts[d] ?? 0;
    const observedPct = (observed / n) * 100;
    const expectedPct = (BENFORD_EXPECTED[d] ?? 0) * 100;
    return { digit: d, observed, observedPct, expectedPct, deviation: observedPct - expectedPct };
  });

  // MAD = mean absolute deviation of observed% from expected%
  const mad = digits.reduce((sum, d) => sum + Math.abs(d.observedPct - d.expectedPct), 0) / 9 / 100;

  // Chi-squared statistic
  const chiSquared = digits.reduce((sum, d) => {
    const expected = (BENFORD_EXPECTED[d.digit] ?? 0) * n;
    const diff = d.observed - expected;
    return sum + (diff * diff) / expected;
  }, 0);

  const chiSquaredP = chiSquaredPValue(chiSquared);

  // Nigrini MAD thresholds
  let risk: BenfordRisk;
  let riskDetail: string;

  if (n < 500) {
    // Below recommended minimum — results are indicative only
    if (mad > 0.015) {
      risk = 'suspicious';
      riskDetail = `MAD ${(mad * 100).toFixed(3)}% exceeds non-conformity threshold (note: sample < 500)`;
    } else {
      risk = 'marginal';
      riskDetail = `Sample size ${n} is below recommended minimum of 500 — results indicative only`;
    }
  } else if (mad <= 0.006) {
    risk = 'clean';
    riskDetail = `MAD ${(mad * 100).toFixed(3)}% — close conformity with Benford's Law`;
  } else if (mad <= 0.012) {
    risk = 'marginal';
    riskDetail = `MAD ${(mad * 100).toFixed(3)}% — acceptable conformity, minor deviation`;
  } else if (mad <= 0.015) {
    risk = 'marginal';
    riskDetail = `MAD ${(mad * 100).toFixed(3)}% — marginally acceptable; χ²=${chiSquared.toFixed(1)}`;
  } else {
    risk = 'suspicious';
    riskDetail = `MAD ${(mad * 100).toFixed(3)}% exceeds Nigrini non-conformity threshold of 1.5%; χ²=${chiSquared.toFixed(1)} (${chiSquared > CHI2_CRIT_01 ? 'p<0.01' : chiSquared > CHI2_CRIT_05 ? 'p<0.05' : 'p≥0.05'})`;
  }

  // Flag digits with positive deviation > 2% (over-represented — possible structuring)
  const flaggedDigits = digits
    .filter((d) => d.deviation > 2)
    .sort((a, b) => b.deviation - a.deviation)
    .map((d) => d.digit);

  return {
    ok: true, label, n, mad, chiSquared, chiSquaredPValue: chiSquaredP, risk, riskDetail,
    digits, flaggedDigits,
  };
}

// Convenience: analyse a labelled set of transaction amount arrays and
// return results sorted by risk (suspicious first).
export function screenTransactionSets(
  sets: Array<{ label: string; amounts: number[] }>,
): BenfordResult[] {
  const results = sets.map((s) => analyseBenford(s));
  const riskOrder: Record<BenfordRisk, number> = {
    suspicious: 0, marginal: 1, 'insufficient-data': 2, clean: 3,
  };
  return results.sort((a, b) => (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3));
}
