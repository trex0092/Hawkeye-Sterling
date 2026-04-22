// Hawkeye Sterling — MLRO calibration tracker.
// Records every advisor run with its predicted verdict + eventual ground-
// truth outcome (when the MLRO later confirms or reverses). Computes
// running Brier and log scores so operators can see whether the system
// is well-calibrated and detect drift across time windows / modes.

export type CalibrationVerdict = 'approved' | 'blocked' | 'returned_for_revision' | 'incomplete';
export type GroundTruth = 'confirmed' | 'reversed' | 'pending';

export interface CalibrationSample {
  runId: string;
  at: string;                 // ISO 8601
  modeIds: string[];
  predictedVerdict: CalibrationVerdict;
  predictedProbability: number; // 0..1 — model's own confidence
  groundTruth: GroundTruth;
  mlroReviewedAt?: string;
  notes?: string;
}

export interface CalibrationReport {
  windowSize: number;
  hits: number;
  misses: number;
  pending: number;
  hitRate: number;            // confirmed / (confirmed + reversed)
  brierScore: number;         // lower = better
  logScore: number;           // lower = better
  byMode: Record<string, { n: number; hits: number; brier: number }>;
  drift: {
    recentHitRate: number;     // last 1/3 of window
    olderHitRate: number;      // first 1/3 of window
    delta: number;             // recent - older
    warning: boolean;          // |delta| > 0.15
  };
}

const EPS = 1e-9;

function binary(truth: GroundTruth, predicted: CalibrationVerdict): 0 | 1 | null {
  if (truth === 'pending') return null;
  const predictedOk = predicted === 'approved';
  const actualOk = truth === 'confirmed';
  return predictedOk === actualOk ? 1 : 0;
}

function brier(p: number, y: 0 | 1): number {
  const pp = Math.min(1, Math.max(0, p));
  return (pp - y) * (pp - y);
}

function logLoss(p: number, y: 0 | 1): number {
  const pp = Math.min(1 - EPS, Math.max(EPS, p));
  return y === 1 ? -Math.log(pp) : -Math.log(1 - pp);
}

export class CalibrationLedger {
  private samples: CalibrationSample[] = [];

  append(sample: CalibrationSample): void { this.samples.push(sample); }

  size(): number { return this.samples.length; }

  list(): readonly CalibrationSample[] { return this.samples; }

  update(runId: string, groundTruth: GroundTruth, reviewedAt: string = new Date().toISOString()): boolean {
    const s = this.samples.find((x) => x.runId === runId);
    if (!s) return false;
    s.groundTruth = groundTruth;
    s.mlroReviewedAt = reviewedAt;
    return true;
  }

  report(): CalibrationReport {
    const rows = this.samples;
    let hits = 0, misses = 0, pending = 0;
    let brierSum = 0, logSum = 0, scored = 0;
    const byMode: Record<string, { n: number; hits: number; brier: number }> = {};

    for (const s of rows) {
      const y = binary(s.groundTruth, s.predictedVerdict);
      if (y === null) { pending++; continue; }
      if (y === 1) hits++; else misses++;
      brierSum += brier(s.predictedProbability, y);
      logSum += logLoss(s.predictedProbability, y);
      scored++;
      for (const m of s.modeIds) {
        const b = byMode[m] ?? (byMode[m] = { n: 0, hits: 0, brier: 0 });
        b.n++;
        if (y === 1) b.hits++;
        b.brier += brier(s.predictedProbability, y);
      }
    }
    for (const m of Object.keys(byMode)) {
      byMode[m]!.brier = byMode[m]!.n === 0 ? 0 : byMode[m]!.brier / byMode[m]!.n;
    }

    const total = rows.length;
    const scoredTotal = hits + misses;
    const hitRate = scoredTotal === 0 ? 0 : hits / scoredTotal;
    const brierScore = scored === 0 ? 0 : brierSum / scored;
    const logScore = scored === 0 ? 0 : logSum / scored;

    // Drift: split scored samples into thirds and compare hit-rate between
    // recent third and older third.
    const scoredRows = rows.filter((s) => binary(s.groundTruth, s.predictedVerdict) !== null);
    const thirdSize = Math.max(1, Math.floor(scoredRows.length / 3));
    const older = scoredRows.slice(0, thirdSize);
    const recent = scoredRows.slice(-thirdSize);
    const hrOf = (xs: CalibrationSample[]) => {
      if (xs.length === 0) return 0;
      const h = xs.filter((s) => binary(s.groundTruth, s.predictedVerdict) === 1).length;
      return h / xs.length;
    };
    const olderHitRate = hrOf(older);
    const recentHitRate = hrOf(recent);
    const delta = recentHitRate - olderHitRate;

    return {
      windowSize: total,
      hits,
      misses,
      pending,
      hitRate,
      brierScore,
      logScore,
      byMode,
      drift: { recentHitRate, olderHitRate, delta, warning: Math.abs(delta) > 0.15 },
    };
  }

  static fromSamples(samples: readonly CalibrationSample[]): CalibrationLedger {
    const l = new CalibrationLedger();
    for (const s of samples) l.append({ ...s });
    return l;
  }
}
