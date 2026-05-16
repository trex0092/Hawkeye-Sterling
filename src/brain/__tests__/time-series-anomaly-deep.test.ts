// Deep tests for time-series-anomaly.ts — detectAnomalies, CUSUM, MAD, z-score
import { describe, it, expect } from 'vitest';
import { detectAnomalies, type TimePoint } from '../time-series-anomaly.js';

function pts(values: number[]): TimePoint[] {
  return values.map((v, i) => ({ t: i * 1000, v }));
}

// ─── edge cases ─────────────────────────────────────────────────────────────

describe('detectAnomalies: edge cases', () => {
  it('empty series → empty output', () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  it('single point → no anomaly (insufficient window)', () => {
    const out = detectAnomalies([{ t: 0, v: 100 }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.anomaly).toBe(false);
    expect(out[0]!.z).toBe(0);
    expect(out[0]!.mad).toBe(0);
  });

  it('preserves t and v on each output point', () => {
    const series = pts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const out = detectAnomalies(series);
    for (let i = 0; i < series.length; i++) {
      expect(out[i]!.t).toBe(series[i]!.t);
      expect(out[i]!.v).toBe(series[i]!.v);
    }
  });

  it('all identical values → z=0, mad=0, no anomalies', () => {
    // Need enough points to satisfy window requirement (window/2 = 7)
    const series = pts(new Array(20).fill(50));
    const out = detectAnomalies(series);
    for (const pt of out) {
      expect(pt.z).toBe(0);
      expect(pt.mad).toBe(0);
      expect(pt.anomaly).toBe(false);
    }
  });

  it('output length equals input length', () => {
    const series = pts([1, 5, 3, 7, 2, 8, 4, 6, 9, 11, 13, 15, 17, 19, 20]);
    const out = detectAnomalies(series);
    expect(out.length).toBe(series.length);
  });
});

// ─── warmup / window behaviour ───────────────────────────────────────────────

describe('detectAnomalies: warmup period', () => {
  it('first few points have z=0, anomaly=false (insufficient history)', () => {
    // With window=14, needs Math.max(3, 7)=7 past points before activating
    // A 5-element series: points 0..4 all have < 7 past elements → warmup
    const series = pts([100, 200, 300, 400, 500]);
    const out = detectAnomalies(series, { window: 14 });
    // All points have < 7 past points → warmup for all
    for (let i = 0; i < out.length; i++) {
      expect(out[i]!.z).toBe(0);
      expect(out[i]!.anomaly).toBe(false);
    }
  });

  it('custom smaller window activates faster with varied history', () => {
    // window=4 needs Math.max(3, 2)=3 past points. With varied history, spike detectable.
    // Points 0-3: varied values to get std>0; point 6: big spike
    const series = pts([10, 15, 8, 12, 11, 14, 1000]);
    const out = detectAnomalies(series, { window: 4, zThreshold: 2.0, madThreshold: 2.0 });
    // After warmup, spike at end should be detected
    const hasAnomaly = out.some((p) => p.anomaly);
    expect(hasAnomaly).toBe(true);
  });
});

// ─── z-score threshold ───────────────────────────────────────────────────────

describe('detectAnomalies: z-score detection', () => {
  it('detects a clear spike with varied history above zThreshold', () => {
    // Use varied history so std > 0 (required for z-score to work)
    // History: 50 varied values, then big spike
    const history = Array.from({ length: 14 }, (_, i) => 100 + (i % 3 === 0 ? 5 : -3));
    const series = pts([...history, 1000]);
    const out = detectAnomalies(series, { window: 14, zThreshold: 3.0, madThreshold: 100 });
    expect(out[14]!.anomaly).toBe(true);
    expect(Math.abs(out[14]!.z)).toBeGreaterThan(3);
  });

  it('does not flag normal fluctuation below zThreshold', () => {
    const series = pts([100, 102, 98, 101, 99, 100, 103, 97, 100, 101, 100, 99, 101, 100, 102]);
    const out = detectAnomalies(series, { window: 14, zThreshold: 3.0, madThreshold: 4.5 });
    for (const pt of out) {
      expect(pt.anomaly).toBe(false);
    }
  });

  it('higher zThreshold leaves mild spikes unflagged when z is below threshold', () => {
    // Alternating history gives MAD=3 and std≈3, so pt.v=110 yields z≈3.4, madScore≈2.3 —
    // both well below the absurdly-high threshold of 100.
    const history = Array.from({ length: 14 }, (_, i) => i % 2 === 0 ? 103 : 97);
    const series = pts([...history, 110]); // mild increase
    const outStrict = detectAnomalies(series, { window: 14, zThreshold: 100.0, madThreshold: 100.0 });
    const pt = outStrict[14]!;
    expect(pt.v).toBe(110);
    expect(pt.anomaly).toBe(false);
  });

  it('lower zThreshold flags smaller deviations', () => {
    const history = Array.from({ length: 14 }, (_, i) => 100 + (i % 3 === 0 ? 5 : -3));
    const series = pts([...history, 130]); // moderate spike
    const out = detectAnomalies(series, { window: 14, zThreshold: 1.5, madThreshold: 100 });
    expect(out[14]!.anomaly).toBe(true);
  });
});

// ─── MAD score detection ─────────────────────────────────────────────────────

describe('detectAnomalies: MAD detection', () => {
  it('MAD-based detection catches extreme spike with varied history', () => {
    // Need history with some variance for MAD to be non-zero
    // Build history with slight variation so std>0 and MAD>0
    const history = Array.from({ length: 14 }, (_, i) => 100 + (i % 2 === 0 ? 3 : -3));
    const series = pts([...history, 5000]);
    const out = detectAnomalies(series, { window: 14, zThreshold: 100, madThreshold: 4.5 });
    // mad-based should catch it (extreme spike vs consistent small variation)
    expect(out[14]!.anomaly).toBe(true);
    expect(out[14]!.mad).toBeGreaterThan(4.5);
  });

  it('anomaly=false when both z and mad are below threshold', () => {
    const series = pts([10, 11, 10, 12, 10, 11, 10, 11, 10, 12, 10, 11, 10, 11, 10]);
    const out = detectAnomalies(series, { window: 14, zThreshold: 3.0, madThreshold: 4.5 });
    // All normal — the last point is within range
    expect(out[14]!.anomaly).toBe(false);
  });
});

// ─── defaults ────────────────────────────────────────────────────────────────

describe('detectAnomalies: default options', () => {
  it('uses window=14, zThreshold=3.0, madThreshold=4.5 by default', () => {
    // Use varied history so z-score works; then spike
    const history = Array.from({ length: 14 }, (_, i) => 50 + (i % 3 === 0 ? 3 : -2));
    const series = pts([...history, 5000]);
    const out = detectAnomalies(series);
    expect(out[14]!.anomaly).toBe(true);
  });

  it('partial opts override only specified fields', () => {
    const history = Array.from({ length: 14 }, (_, i) => 50 + (i % 3 === 0 ? 3 : -2));
    const series = pts([...history, 5000]);
    // Only override zThreshold; madThreshold stays at 4.5
    const out = detectAnomalies(series, { zThreshold: 1.0 });
    expect(out[14]!.anomaly).toBe(true);
  });
});

// ─── monotone / trend series ─────────────────────────────────────────────────

describe('detectAnomalies: trend series', () => {
  it('linear trend is not flagged as anomaly', () => {
    // Slow linear increase — z-score vs recent window should be low
    const series = pts(Array.from({ length: 20 }, (_, i) => i * 5));
    const out = detectAnomalies(series, { window: 6, zThreshold: 3.0, madThreshold: 4.5 });
    // None should be anomalous because the slope is consistent
    const anomalies = out.filter((p) => p.anomaly);
    expect(anomalies.length).toBe(0);
  });

  it('sudden break in trend is flagged', () => {
    // Use varied history so std > 0, then big jump
    const history = Array.from({ length: 14 }, (_, i) => i % 2 === 0 ? 2 : -1);
    const series = pts([...history, 1000]);
    const out = detectAnomalies(series, { window: 14, zThreshold: 3.0, madThreshold: 4.5 });
    expect(out[14]!.anomaly).toBe(true);
  });
});
