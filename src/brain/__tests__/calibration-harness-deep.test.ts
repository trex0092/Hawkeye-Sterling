// Deep tests for calibration-harness.ts
import { describe, it, expect } from 'vitest';
import { evaluateCalibration, regressReport, type GoldItem } from '../calibration-harness.js';
import type { BrainVerdict, Verdict } from '../types.js';

function gold(id: string, expected: Verdict): GoldItem {
  return {
    id,
    subject: { name: `Subject-${id}`, type: 'individual' },
    evidence: {},
    expectedVerdict: expected,
  };
}

function verdict(outcome: Verdict, score: number, conf: number): BrainVerdict {
  return {
    runId: 'run-1',
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

// ─── evaluateCalibration ──────────────────────────────────────────────────────

describe('evaluateCalibration: empty corpus', () => {
  it('returns all zeros for empty corpus', async () => {
    const r = await evaluateCalibration([], async () => verdict('clear', 0, 0));
    expect(r.total).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.macroF1).toBe(0);
    expect(r.rocAuc).toBe(0);
    expect(r.calibrationGap).toBe(0);
    expect(r.calibrationBuckets).toEqual([]);
  });

  it('confusion matrix has all-zero cells for empty corpus', async () => {
    const r = await evaluateCalibration([], async () => verdict('clear', 0, 0));
    for (const row of Object.values(r.confusion)) {
      for (const cell of Object.values(row as Record<string, number>)) {
        expect(cell).toBe(0);
      }
    }
  });
});

describe('evaluateCalibration: perfect predictor', () => {
  it('accuracy = 1 for perfect predictor', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag'), gold('c', 'escalate')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.9);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.accuracy).toBe(1);
  });

  it('macroF1 = 1 for perfect predictor', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag'), gold('c', 'block')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.9);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.macroF1).toBe(1);
  });

  it('perClass recall=1 precision=1 f1=1 for all classes in corpus', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.9);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.perClass['clear']!.precision).toBe(1);
    expect(r.perClass['clear']!.recall).toBe(1);
    expect(r.perClass['clear']!.f1).toBe(1);
    expect(r.perClass['flag']!.f1).toBe(1);
  });

  it('diagonal of confusion matrix has all the counts', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.9);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.confusion['clear']!['clear']!).toBe(1);
    expect(r.confusion['flag']!['flag']!).toBe(1);
  });
});

describe('evaluateCalibration: all wrong predictor', () => {
  it('accuracy = 0 for all-wrong predictor', async () => {
    const corpus = [gold('a', 'flag'), gold('b', 'flag')];
    const predict = async () => verdict('clear', 0.1, 0.5);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.accuracy).toBe(0);
  });

  it('off-diagonal elements in confusion matrix', async () => {
    const corpus = [gold('a', 'flag'), gold('b', 'flag')];
    const predict = async () => verdict('clear', 0.1, 0.5);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.confusion['flag']!['clear']!).toBe(2);
  });
});

describe('evaluateCalibration: ROC AUC', () => {
  it('AUC ≥ 0.99 for perfect score separator', async () => {
    const corpus = [
      gold('a', 'clear'), gold('b', 'clear'),
      gold('c', 'flag'), gold('d', 'escalate'),
    ];
    const predict = async (g: GoldItem) => {
      const hostile = g.expectedVerdict !== 'clear';
      return verdict(hostile ? 'flag' : 'clear', hostile ? 0.9 : 0.1, 0.8);
    };
    const r = await evaluateCalibration(corpus, predict);
    expect(r.rocAuc).toBeGreaterThanOrEqual(0.99);
  });

  it('AUC=0 when only positives or only negatives', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'clear')];
    const predict = async () => verdict('clear', 0.5, 0.8);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.rocAuc).toBe(0);
  });

  it('AUC is in [0, 1]', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag'), gold('c', 'escalate'), gold('d', 'block')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, Math.random(), 0.7);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.rocAuc).toBeGreaterThanOrEqual(0);
    expect(r.rocAuc).toBeLessThanOrEqual(1);
  });
});

describe('evaluateCalibration: calibration gap', () => {
  it('calibrationGap is in [0, 1]', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag'), gold('c', 'escalate')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.5);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.calibrationGap).toBeGreaterThanOrEqual(0);
    expect(r.calibrationGap).toBeLessThanOrEqual(1);
  });

  it('calibrationBuckets is non-empty when items exist', async () => {
    const corpus = [gold('a', 'clear'), gold('b', 'flag')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.7);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.calibrationBuckets.length).toBeGreaterThan(0);
  });

  it('total equals corpus size', async () => {
    const corpus = [gold('1', 'clear'), gold('2', 'flag'), gold('3', 'block')];
    const predict = async (g: GoldItem) => verdict(g.expectedVerdict, 0.5, 0.6);
    const r = await evaluateCalibration(corpus, predict);
    expect(r.total).toBe(3);
  });
});

describe('evaluateCalibration: all verdicts represented', () => {
  it('confusion matrix has all 5 verdict keys', async () => {
    const corpus = [gold('a', 'clear')];
    const predict = async () => verdict('clear', 0.1, 0.9);
    const r = await evaluateCalibration(corpus, predict);
    for (const v of ['clear', 'flag', 'escalate', 'inconclusive', 'block']) {
      expect(r.confusion[v as Verdict]).toBeDefined();
    }
  });

  it('perClass has all 5 verdict keys', async () => {
    const corpus = [gold('a', 'flag')];
    const predict = async () => verdict('flag', 0.8, 0.8);
    const r = await evaluateCalibration(corpus, predict);
    for (const v of ['clear', 'flag', 'escalate', 'inconclusive', 'block']) {
      expect(r.perClass[v as Verdict]).toBeDefined();
    }
  });
});

// ─── regressReport ────────────────────────────────────────────────────────────

describe('regressReport', () => {
  const skeleton = {
    total: 100,
    confusion: {} as Parameters<typeof regressReport>[0]['confusion'],
    perClass: {} as Parameters<typeof regressReport>[0]['perClass'],
    calibrationBuckets: [],
  };

  it('no regression when metrics stay same', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
    );
    expect(r.regressed).toBe(false);
  });

  it('flags regression on accuracy drop > 0.01', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.85, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
    );
    expect(r.regressed).toBe(true);
    expect(r.accuracyDelta).toBeCloseTo(-0.05, 4);
  });

  it('flags regression on macroF1 drop > 0.01', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.9, macroF1: 0.85, rocAuc: 0.95, calibrationGap: 0.05 },
    );
    expect(r.regressed).toBe(true);
  });

  it('flags regression on AUC drop > 0.01', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.93, calibrationGap: 0.05 },
    );
    expect(r.regressed).toBe(true);
  });

  it('flags regression on calibrationGap increase > 0.02', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.08 },
    );
    expect(r.regressed).toBe(true);
  });

  it('no regression for small metric improvement', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.85, macroF1: 0.84, rocAuc: 0.90, calibrationGap: 0.10 },
      { ...skeleton, accuracy: 0.90, macroF1: 0.89, rocAuc: 0.95, calibrationGap: 0.05 },
    );
    expect(r.regressed).toBe(false);
  });

  it('summary contains accuracy percentages', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
    );
    expect(r.summary).toContain('acc:');
    expect(r.summary).toContain('AUC:');
  });

  it('summary contains REGRESSION when regressed=true', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.9, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
      { ...skeleton, accuracy: 0.8, macroF1: 0.88, rocAuc: 0.95, calibrationGap: 0.05 },
    );
    expect(r.summary).toContain('REGRESSION');
  });

  it('deltas are computed correctly', () => {
    const r = regressReport(
      { ...skeleton, accuracy: 0.80, macroF1: 0.75, rocAuc: 0.85, calibrationGap: 0.10 },
      { ...skeleton, accuracy: 0.85, macroF1: 0.80, rocAuc: 0.90, calibrationGap: 0.08 },
    );
    expect(r.accuracyDelta).toBeCloseTo(0.05, 5);
    expect(r.macroF1Delta).toBeCloseTo(0.05, 5);
    expect(r.aucDelta).toBeCloseTo(0.05, 5);
    expect(r.calibrationGapDelta).toBeCloseTo(-0.02, 5);
  });
});
