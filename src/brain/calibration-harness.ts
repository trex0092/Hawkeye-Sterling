// Hawkeye Sterling — calibration harness.
//
// The claim vs World-Check is that Hawkeye produces defensible verdicts
// that can be evaluated against ground truth. This module provides:
//   - GoldItem format: labelled (subject, evidence, expectedVerdict) triples
//   - evaluateCalibration(): runs the engine over a gold corpus and reports
//     confusion matrix, precision, recall, F1, ROC AUC (trapezoid), and
//     a calibration gap ∈ [0,1] between stated confidence and empirical
//     accuracy in confidence buckets
//   - regressReport(): compares two evaluations so regressions are surfaced
//     when a schema change or mode addition moves the numbers

import type { BrainVerdict, Subject, Evidence, Verdict } from './types.js';

export interface GoldItem {
  id: string;
  subject: Subject;
  evidence: Evidence;
  domains?: string[];
  expectedVerdict: Verdict;           // ground truth (from regulator-confirmed cases)
  label?: string;                     // short human-readable label
}

export interface CalibrationResult {
  total: number;
  confusion: Record<Verdict, Record<Verdict, number>>; // [expected][predicted] = count
  perClass: Record<Verdict, { precision: number; recall: number; f1: number; support: number }>;
  accuracy: number;
  macroF1: number;
  rocAuc: number;                     // binary AUC on hostile(score≥threshold) vs clear
  calibrationGap: number;             // 0..1 — smaller is better
  calibrationBuckets: Array<{ confidenceRange: [number, number]; empiricalAccuracy: number; n: number }>;
}

/** Run a predictor over the corpus and score it. The predictor is injected
 *  so this module stays engine-agnostic and testable. */
export async function evaluateCalibration(
  corpus: readonly GoldItem[],
  predict: (item: GoldItem) => Promise<BrainVerdict>,
): Promise<CalibrationResult> {
  if (corpus.length === 0) {
    return emptyResult();
  }
  const verdicts: Verdict[] = ['clear', 'flag', 'escalate', 'inconclusive', 'block'];
  const confusion: Record<Verdict, Record<Verdict, number>> = Object.fromEntries(
    verdicts.map((v) => [v, Object.fromEntries(verdicts.map((w) => [w, 0])) as Record<Verdict, number>]),
  ) as Record<Verdict, Record<Verdict, number>>;

  type Scored = { expected: Verdict; predicted: Verdict; confidence: number; hostileScore: number; };
  const scored: Scored[] = [];

  for (const item of corpus) {
    const v = await predict(item);
    confusion[item.expectedVerdict][v.outcome]++;
    scored.push({
      expected: item.expectedVerdict,
      predicted: v.outcome,
      confidence: v.aggregateConfidence,
      hostileScore: v.aggregateScore,
    });
  }

  const total = corpus.length;
  const correct = verdicts.reduce((a, v) => a + confusion[v][v], 0);
  const accuracy = correct / total;

  const perClass = {} as CalibrationResult['perClass'];
  let macroF1 = 0;
  let macroClasses = 0;
  for (const v of verdicts) {
    const tp = confusion[v][v];
    const fp = verdicts.reduce((a, e) => a + (e === v ? 0 : confusion[e][v]), 0);
    const fn = verdicts.reduce((a, p) => a + (p === v ? 0 : confusion[v][p]), 0);
    const support = verdicts.reduce((a, p) => a + confusion[v][p], 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    perClass[v] = { precision, recall, f1, support };
    if (support > 0) { macroF1 += f1; macroClasses++; }
  }
  macroF1 = macroClasses > 0 ? macroF1 / macroClasses : 0;

  // Binary ROC: hostile = predicted ∈ {flag, escalate, block} vs clear.
  // Use hostileScore as the discriminator.
  const rocAuc = computeAuc(scored.map((s) => ({
    score: s.hostileScore,
    label: (s.expected === 'flag' || s.expected === 'escalate' || s.expected === 'block') ? 1 : 0,
  })));

  // Calibration gap: bucket by stated confidence, measure empirical accuracy.
  const ranges: Array<[number, number]> = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]];
  const buckets: CalibrationResult['calibrationBuckets'] = [];
  let gapSum = 0;
  let gapN = 0;
  for (const [lo, hi] of ranges) {
    const inBucket = scored.filter((s) => s.confidence >= lo && s.confidence < hi);
    if (inBucket.length === 0) continue;
    const empirical = inBucket.filter((s) => s.expected === s.predicted).length / inBucket.length;
    const midpoint = (lo + hi) / 2;
    gapSum += Math.abs(empirical - midpoint) * inBucket.length;
    gapN += inBucket.length;
    buckets.push({ confidenceRange: [lo, Math.min(hi, 1)], empiricalAccuracy: Number(empirical.toFixed(3)), n: inBucket.length });
  }
  const calibrationGap = gapN > 0 ? gapSum / gapN : 0;

  return {
    total,
    confusion,
    perClass,
    accuracy: Number(accuracy.toFixed(4)),
    macroF1: Number(macroF1.toFixed(4)),
    rocAuc: Number(rocAuc.toFixed(4)),
    calibrationGap: Number(calibrationGap.toFixed(4)),
    calibrationBuckets: buckets,
  };
}

/** Trapezoidal AUC over binary labels. */
function computeAuc(items: readonly { score: number; label: 0 | 1 }[]): number {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const positives = sorted.filter((x) => x.label === 1).length;
  const negatives = sorted.length - positives;
  if (positives === 0 || negatives === 0) return 0;
  let tp = 0;
  let fp = 0;
  let prevTpr = 0;
  let prevFpr = 0;
  let auc = 0;
  for (const s of sorted) {
    if (s.label === 1) tp++; else fp++;
    const tpr = tp / positives;
    const fpr = fp / negatives;
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevTpr = tpr;
    prevFpr = fpr;
  }
  return auc;
}

function emptyResult(): CalibrationResult {
  const verdicts: Verdict[] = ['clear', 'flag', 'escalate', 'inconclusive', 'block'];
  return {
    total: 0,
    confusion: Object.fromEntries(verdicts.map((v) => [v, Object.fromEntries(verdicts.map((w) => [w, 0])) as Record<Verdict, number>])) as Record<Verdict, Record<Verdict, number>>,
    perClass: Object.fromEntries(verdicts.map((v) => [v, { precision: 0, recall: 0, f1: 0, support: 0 }])) as CalibrationResult['perClass'],
    accuracy: 0,
    macroF1: 0,
    rocAuc: 0,
    calibrationGap: 0,
    calibrationBuckets: [],
  };
}

/** Diff two calibration runs to detect regression. */
export function regressReport(before: CalibrationResult, after: CalibrationResult): {
  accuracyDelta: number;
  macroF1Delta: number;
  aucDelta: number;
  calibrationGapDelta: number;
  regressed: boolean;
  summary: string;
} {
  const accuracyDelta = after.accuracy - before.accuracy;
  const macroF1Delta = after.macroF1 - before.macroF1;
  const aucDelta = after.rocAuc - before.rocAuc;
  // Calibration gap is lower-is-better, so positive delta = regression.
  const calibrationGapDelta = after.calibrationGap - before.calibrationGap;
  const regressed = accuracyDelta < -0.01 || macroF1Delta < -0.01 || aucDelta < -0.01 || calibrationGapDelta > 0.02;
  const summary = [
    `acc: ${(before.accuracy * 100).toFixed(1)}% → ${(after.accuracy * 100).toFixed(1)}% (${(accuracyDelta * 100).toFixed(2)}pp)`,
    `F1: ${(before.macroF1 * 100).toFixed(1)}% → ${(after.macroF1 * 100).toFixed(1)}% (${(macroF1Delta * 100).toFixed(2)}pp)`,
    `AUC: ${before.rocAuc.toFixed(3)} → ${after.rocAuc.toFixed(3)} (${aucDelta.toFixed(3)})`,
    `gap: ${before.calibrationGap.toFixed(3)} → ${after.calibrationGap.toFixed(3)} (${calibrationGapDelta.toFixed(3)})`,
    regressed ? 'REGRESSION — gate the release.' : 'No regression.',
  ].join(' · ');
  return { accuracyDelta, macroF1Delta, aucDelta, calibrationGapDelta, regressed, summary };
}
