import { describe, expect, it } from 'vitest';
import { evaluateCalibration, regressReport, type GoldItem } from '../calibration-harness.js';
import type { BrainVerdict, Verdict } from '../types.js';

function gold(id: string, expected: Verdict): GoldItem {
  return {
    id,
    subject: { name: `Subject ${id}`, type: 'individual' },
    evidence: {},
    expectedVerdict: expected,
  };
}

function verdict(outcome: Verdict, score: number, conf: number): BrainVerdict {
  return {
    runId: 'r1',
    subject: { name: 'X', type: 'individual' },
    outcome,
    aggregateScore: score,
    aggregateConfidence: conf,
    findings: [],
    chain: [],
    recommendedActions: [],
    generatedAt: Date.now(),
  };
}

describe('calibration-harness', () => {
  it('returns empty result on empty corpus', async () => {
    const r = await evaluateCalibration([], async () => verdict('clear', 0, 0));
    expect(r.total).toBe(0);
    expect(r.accuracy).toBe(0);
  });

  it('computes perfect accuracy when predictor is perfect', async () => {
    const corpus: GoldItem[] = [
      gold('a', 'clear'), gold('b', 'flag'), gold('c', 'escalate'),
    ];
    const predict = async (g: GoldItem): Promise<BrainVerdict> =>
      verdict(g.expectedVerdict, g.expectedVerdict === 'clear' ? 0.1 : 0.7, 0.85);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.accuracy).toBe(1);
    expect(r.macroF1).toBe(1);
  });

  it('AUC=1 for perfect hostile-vs-clear discriminator', async () => {
    const corpus: GoldItem[] = [
      gold('a', 'clear'), gold('b', 'clear'),
      gold('c', 'flag'),  gold('d', 'escalate'),
    ];
    const predict = async (g: GoldItem): Promise<BrainVerdict> => {
      const hostile = g.expectedVerdict !== 'clear';
      return verdict(hostile ? 'flag' : 'clear', hostile ? 0.8 : 0.2, 0.8);
    };
    const r = await evaluateCalibration(corpus, predict);
    expect(r.rocAuc).toBeGreaterThanOrEqual(0.99);
  });

  it('regressReport flags a drop in accuracy', () => {
    const skeleton = {
      total: 0,
      confusion: {} as Parameters<typeof regressReport>[0]['confusion'],
      perClass: {} as Parameters<typeof regressReport>[0]['perClass'],
      calibrationBuckets: [],
    };
    const before: Parameters<typeof regressReport>[0] = { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 };
    const after: Parameters<typeof regressReport>[1] = { ...skeleton, accuracy: 0.82, macroF1: 0.85, rocAuc: 0.94, calibrationGap: 0.06 };
    const rep = regressReport(before, after);
    expect(rep.regressed).toBe(true);
  });
});
