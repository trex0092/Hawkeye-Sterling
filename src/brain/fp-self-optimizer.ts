// Hawkeye Sterling — False Positive Bayesian Self-Optimizer (Wave 14 Feature 7).
// Tracks MLRO FP confirmation outcomes and proposes Bayesian threshold adjustments.
// All proposals require four-eyes MLRO approval before going live. CG-8 partial closure.

import type { OutcomeRecord } from './outcome-feedback.js';

export interface ModeFpStats {
  modeId: string;
  truePositives: number;
  falsePositives: number;
  total: number;
  fpRate: number;
  windowDays: number;
}

export interface ThresholdProposal {
  proposalId: string;
  modeId: string;
  currentThreshold: number;
  proposedThreshold: number;
  fpRateObserved: number;
  supportingCases: number;
  bayesianEvidence: { alpha: number; beta: number; posteriorMean: number };
  humanReadable: string;
  status: 'pending_mlro_approval' | 'approved' | 'rejected';
  proposedAt: string;
}

const DEFAULT_PRIOR_ALPHA = 1;
const DEFAULT_PRIOR_BETA = 9;
const MIN_CASES_THRESHOLD = 10;
const FP_RATE_TRIGGER = 0.30;
const WINDOW_DAYS = 90;

function msSince(isoDate: string): number {
  return Date.now() - new Date(isoDate).getTime();
}

function newId(): string {
  return `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function computeModeFpStats(
  records: readonly OutcomeRecord[],
  _currentWeights: Record<string, number> = {},
): ModeFpStats[] {
  const windowMs = WINDOW_DAYS * 86_400_000;
  const recentRecords = records.filter((r) => msSince(r.at) < windowMs);
  const stats = new Map<string, { tp: number; fp: number }>();

  for (const r of recentRecords) {
    if (r.groundTruth !== 'confirmed' && r.groundTruth !== 'reversed') continue;
    const isPositive = r.groundTruth === 'confirmed';
    for (const modeId of r.modeIds ?? []) {
      const slot = stats.get(modeId) ?? { tp: 0, fp: 0 };
      if (isPositive) slot.tp++;
      else slot.fp++;
      stats.set(modeId, slot);
    }
  }

  return Array.from(stats.entries()).map(([modeId, s]) => ({
    modeId,
    truePositives: s.tp,
    falsePositives: s.fp,
    total: s.tp + s.fp,
    fpRate: s.tp + s.fp > 0 ? s.fp / (s.tp + s.fp) : 0,
    windowDays: WINDOW_DAYS,
  }));
}

export function computeThresholdProposals(
  records: readonly OutcomeRecord[],
  currentWeights: Record<string, number> = {},
): ThresholdProposal[] {
  const modeFpStats = computeModeFpStats(records, currentWeights);
  const proposals: ThresholdProposal[] = [];
  const now = new Date().toISOString();

  for (const stats of modeFpStats) {
    if (stats.total < MIN_CASES_THRESHOLD) continue;
    if (stats.fpRate <= FP_RATE_TRIGGER) continue;

    const alpha = DEFAULT_PRIOR_ALPHA + stats.truePositives;
    const beta = DEFAULT_PRIOR_BETA + stats.falsePositives;
    const posteriorMean = alpha / (alpha + beta);

    const currentThreshold = currentWeights[stats.modeId] ?? 0.5;

    proposals.push({
      proposalId: newId(),
      modeId: stats.modeId,
      currentThreshold,
      proposedThreshold: posteriorMean,
      fpRateObserved: stats.fpRate,
      supportingCases: stats.total,
      bayesianEvidence: { alpha, beta, posteriorMean },
      humanReadable:
        `Mode "${stats.modeId}" shows a ${(stats.fpRate * 100).toFixed(0)}% false-positive rate ` +
        `over ${stats.total} cases in the last ${WINDOW_DAYS} days. ` +
        `Bayesian Beta(${alpha},${beta}) posterior suggests lowering the screening weight ` +
        `from ${currentThreshold.toFixed(2)} to ${posteriorMean.toFixed(2)}. ` +
        `This would reduce false-positive screening burden while preserving ${stats.truePositives} confirmed STR detections.`,
      status: 'pending_mlro_approval',
      proposedAt: now,
    });
  }

  return proposals.sort((a, b) => b.fpRateObserved - a.fpRateObserved);
}

export function applyApprovedProposal(
  proposal: ThresholdProposal,
  currentWeights: Record<string, number>,
): Record<string, number> {
  return { ...currentWeights, [proposal.modeId]: proposal.proposedThreshold };
}
