// Hawkeye Sterling — simple time-series anomaly detector.
// Rolling z-score + robust MAD. Returns per-point anomaly flag + score.
// No external deps; good enough for TM velocity spike detection until
// Phase 7 ships model-backed detectors.

export interface TimePoint {
  t: number;   // epoch ms
  v: number;   // metric value
}

export interface AnomalyPoint extends TimePoint {
  z: number;
  mad: number;
  anomaly: boolean;
}

export interface AnomalyOptions {
  window: number;   // rolling window size
  zThreshold: number; // 3.0 default
  madThreshold: number; // 4.5 default (robust MAD → σ ≈ 1.4826)
}

const DEFAULTS: AnomalyOptions = { window: 14, zThreshold: 3.0, madThreshold: 4.5 };

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, xs.length - 1));
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) >> 1]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

export function detectAnomalies(series: TimePoint[], opts: Partial<AnomalyOptions> = {}): AnomalyPoint[] {
  const cfg = { ...DEFAULTS, ...opts };
  const out: AnomalyPoint[] = [];
  for (let i = 0; i < series.length; i++) {
    const pt = series[i]!;
    const start = Math.max(0, i - cfg.window);
    const past = series.slice(start, i).map((p) => p.v);
    if (past.length < Math.max(3, cfg.window / 2)) {
      out.push({ ...pt, z: 0, mad: 0, anomaly: false });
      continue;
    }
    const m = mean(past);
    const s = std(past);
    const z = s < 1e-9 ? 0 : (pt.v - m) / s;
    const med = median(past);
    const dev = past.map((v) => Math.abs(v - med));
    const mad = median(dev);
    const madScore = mad < 1e-9 ? 0 : Math.abs(pt.v - med) / (mad * 1.4826);
    const anomaly = Math.abs(z) > cfg.zThreshold || madScore > cfg.madThreshold;
    out.push({ ...pt, z, mad: madScore, anomaly });
  }
  return out;
}
