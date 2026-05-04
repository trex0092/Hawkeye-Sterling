// Hawkeye Sterling — calibration-drift alert engine (audit follow-up #23).
//
// Pure-function alert evaluator. Given a window's per-mode Brier scores
// + the prior-window baseline, emits a typed list of alerts the
// notification layer (webhooks #51 / Slack / email) routes to MLRO
// management. Charter P9 — every alert carries a reproducible rationale.

export type DriftSeverity = "info" | "warn" | "critical";

export interface DriftAlert {
  id: string;
  modeId: string;
  severity: DriftSeverity;
  category: "brier_spike" | "agreement_collapse" | "uncalibrated_volume" | "log_score_blowup";
  current: number;
  baseline: number;
  delta: number;
  message: string;
}

export interface ModeWindowMetrics {
  modeId: string;
  total: number;
  resolved: number;
  brierMean: number;
  logScoreMean: number;
  agreementRate: number;
}

export interface DriftEvalOptions {
  /** Brier delta that triggers warn severity (current - baseline). Default 0.05. */
  warnBrierDelta?: number;
  /** Brier delta that triggers critical severity. Default 0.12. */
  criticalBrierDelta?: number;
  /** Agreement-rate drop that triggers warn (baseline - current). Default 0.10. */
  warnAgreementDrop?: number;
  /** Agreement-rate drop that triggers critical. Default 0.25. */
  criticalAgreementDrop?: number;
  /** Min resolved samples for any alert. Default 10. */
  minResolved?: number;
  /** Min total samples for uncalibrated-volume alerts. Default 50. */
  minUncalibratedVolume?: number;
}

const DEFAULTS = {
  warnBrierDelta: 0.05,
  criticalBrierDelta: 0.12,
  warnAgreementDrop: 0.10,
  criticalAgreementDrop: 0.25,
  minResolved: 10,
  minUncalibratedVolume: 50,
};

/** Evaluate calibration drift against a baseline. Pure function. */
export function evaluateDrift(
  current: readonly ModeWindowMetrics[],
  baseline: readonly ModeWindowMetrics[],
  opts: DriftEvalOptions = {},
): DriftAlert[] {
  const warnBrierDelta = opts.warnBrierDelta ?? DEFAULTS.warnBrierDelta;
  const critBrierDelta = opts.criticalBrierDelta ?? DEFAULTS.criticalBrierDelta;
  const warnAgreementDrop = opts.warnAgreementDrop ?? DEFAULTS.warnAgreementDrop;
  const critAgreementDrop = opts.criticalAgreementDrop ?? DEFAULTS.criticalAgreementDrop;
  const minResolved = opts.minResolved ?? DEFAULTS.minResolved;
  const minUncalVol = opts.minUncalibratedVolume ?? DEFAULTS.minUncalibratedVolume;

  const baseByMode = new Map(baseline.map((m) => [m.modeId, m]));
  const alerts: DriftAlert[] = [];

  for (const cur of current) {
    const base = baseByMode.get(cur.modeId);
    if (!base) continue;

    // 1. Brier-score spike.
    if (cur.resolved >= minResolved && base.resolved >= minResolved) {
      const dB = cur.brierMean - base.brierMean;
      if (dB >= critBrierDelta) {
        alerts.push({
          id: `brier_spike_critical:${cur.modeId}`,
          modeId: cur.modeId,
          severity: "critical",
          category: "brier_spike",
          current: cur.brierMean,
          baseline: base.brierMean,
          delta: dB,
          message: `Brier on '${cur.modeId}' spiked ${(dB * 100).toFixed(1)} points (${base.brierMean.toFixed(3)} → ${cur.brierMean.toFixed(3)}). Mode is materially less calibrated than baseline. Pull recent override transcripts.`,
        });
      } else if (dB >= warnBrierDelta) {
        alerts.push({
          id: `brier_spike_warn:${cur.modeId}`,
          modeId: cur.modeId,
          severity: "warn",
          category: "brier_spike",
          current: cur.brierMean,
          baseline: base.brierMean,
          delta: dB,
          message: `Brier on '${cur.modeId}' rose ${(dB * 100).toFixed(1)} points vs baseline; monitor next window.`,
        });
      }
    }

    // 2. Agreement-rate collapse.
    if (cur.total >= minResolved && base.total >= minResolved) {
      const dA = base.agreementRate - cur.agreementRate;
      if (dA >= critAgreementDrop) {
        alerts.push({
          id: `agreement_collapse_critical:${cur.modeId}`,
          modeId: cur.modeId,
          severity: "critical",
          category: "agreement_collapse",
          current: cur.agreementRate,
          baseline: base.agreementRate,
          delta: -dA,
          message: `Agreement rate on '${cur.modeId}' fell ${(dA * 100).toFixed(0)} points (${(base.agreementRate * 100).toFixed(0)}% → ${(cur.agreementRate * 100).toFixed(0)}%). Investigate prefix retune.`,
        });
      } else if (dA >= warnAgreementDrop) {
        alerts.push({
          id: `agreement_collapse_warn:${cur.modeId}`,
          modeId: cur.modeId,
          severity: "warn",
          category: "agreement_collapse",
          current: cur.agreementRate,
          baseline: base.agreementRate,
          delta: -dA,
          message: `Agreement rate on '${cur.modeId}' dropped ${(dA * 100).toFixed(0)} points; monitor.`,
        });
      }
    }

    // 3. Log-score blow-up.
    if (cur.resolved >= minResolved && base.resolved >= minResolved) {
      const dL = cur.logScoreMean - base.logScoreMean;
      if (dL >= 0.4) {
        alerts.push({
          id: `log_score_blowup:${cur.modeId}`,
          modeId: cur.modeId,
          severity: "warn",
          category: "log_score_blowup",
          current: cur.logScoreMean,
          baseline: base.logScoreMean,
          delta: dL,
          message: `Log-score on '${cur.modeId}' rose ${dL.toFixed(2)}; mode confidently wrong on more cases.`,
        });
      }
    }

    // 4. Uncalibrated-volume — many records, none resolved → ground-truth pipeline gap.
    if (cur.total >= minUncalVol && cur.resolved < cur.total * 0.2) {
      alerts.push({
        id: `uncalibrated_volume:${cur.modeId}`,
        modeId: cur.modeId,
        severity: "info",
        category: "uncalibrated_volume",
        current: cur.resolved,
        baseline: cur.total,
        delta: cur.total - cur.resolved,
        message: `Mode '${cur.modeId}' has ${cur.total} runs but only ${cur.resolved} resolved with groundTruth. Improve outcome-capture coverage.`,
      });
    }
  }

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(s: DriftSeverity): number {
  return s === "critical" ? 3 : s === "warn" ? 2 : 1;
}
