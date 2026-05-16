// Deep coverage tests for subject-trajectory.ts
// Covers: empty input, single-screen, score trend (rising/falling/stable),
// all inflection types, streak logic, flagBlockRatio, ordering by date,
// boundary values for slope thresholds and flap/spike/escalation detection.

import { describe, it, expect } from 'vitest';
import { analyseTrajectory, type SubjectScreen } from '../subject-trajectory.js';

function makeScreen(
  at: string,
  outcome: SubjectScreen['outcome'],
  score: number,
  runId?: string,
): SubjectScreen {
  return { runId: runId ?? `run-${at}`, at, outcome, aggregateScore: score };
}

// ── empty / zero screens ─────────────────────────────────────────────────────

describe('analyseTrajectory — empty input', () => {
  it('returns zero-valued report when screens is empty', () => {
    const r = analyseTrajectory('sub-1', []);
    expect(r.totalScreens).toBe(0);
    expect(r.spanDays).toBe(0);
    expect(r.scoreTrend).toBe('stable');
    expect(r.inflections).toHaveLength(0);
    expect(r.flagBlockRatio).toBe(0);
    expect(r.outcomeStreak.outcome).toBe('inconclusive');
    expect(r.outcomeStreak.count).toBe(0);
  });
});

// ── single screen ─────────────────────────────────────────────────────────────

describe('analyseTrajectory — single screen', () => {
  it('spanDays is 0, streak count is 1', () => {
    const r = analyseTrajectory('sub-2', [makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1)]);
    expect(r.totalScreens).toBe(1);
    expect(r.spanDays).toBe(0);
    expect(r.outcomeStreak.count).toBe(1);
    expect(r.scoreTrend).toBe('stable');
  });
});

// ── spanDays calculation ─────────────────────────────────────────────────────

describe('analyseTrajectory — spanDays', () => {
  it('calculates span in days correctly', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-11T00:00:00Z', 'clear', 0.1),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.spanDays).toBe(10);
  });

  it('handles unordered input by sorting by date', () => {
    const screens = [
      makeScreen('2026-03-01T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-02-01T00:00:00Z', 'clear', 0.2),
    ];
    const r = analyseTrajectory('sub', screens);
    // Span should be Jan 1 – Mar 1 = 59 days
    expect(r.spanDays).toBe(59);
  });
});

// ── score trend ───────────────────────────────────────────────────────────────

describe('analyseTrajectory — scoreTrend', () => {
  it('is "rising" when scores increase steeply', () => {
    const screens = [0.1, 0.3, 0.5, 0.7, 0.9].map((s, i) =>
      makeScreen(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'flag', s),
    );
    const r = analyseTrajectory('sub', screens);
    expect(r.scoreTrend).toBe('rising');
  });

  it('is "falling" when scores decrease steeply', () => {
    const screens = [0.9, 0.7, 0.5, 0.3, 0.1].map((s, i) =>
      makeScreen(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'clear', s),
    );
    const r = analyseTrajectory('sub', screens);
    expect(r.scoreTrend).toBe('falling');
  });

  it('is "stable" when scores are flat', () => {
    const screens = [0.3, 0.3, 0.3, 0.3].map((s, i) =>
      makeScreen(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'flag', s),
    );
    const r = analyseTrajectory('sub', screens);
    expect(r.scoreTrend).toBe('stable');
  });
});

// ── streak ───────────────────────────────────────────────────────────────────

describe('analyseTrajectory — outcomeStreak', () => {
  it('streak is 1 when last outcome differs from prior', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-03T00:00:00Z', 'clear', 0.1),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.outcomeStreak.outcome).toBe('clear');
    expect(r.outcomeStreak.count).toBe(1);
  });

  it('streak is 3 when last three all match', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-02T00:00:00Z', 'escalate', 0.8),
      makeScreen('2026-01-03T00:00:00Z', 'escalate', 0.8),
      makeScreen('2026-01-04T00:00:00Z', 'escalate', 0.9),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.outcomeStreak.outcome).toBe('escalate');
    expect(r.outcomeStreak.count).toBe(3);
  });
});

// ── flagBlockRatio ────────────────────────────────────────────────────────────

describe('analyseTrajectory — flagBlockRatio', () => {
  it('is 0 when all outcomes are clear/inconclusive', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'inconclusive', 0.2),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.flagBlockRatio).toBe(0);
  });

  it('is 1 when all outcomes are escalate', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'escalate', 0.9),
      makeScreen('2026-01-02T00:00:00Z', 'escalate', 0.9),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.flagBlockRatio).toBe(1);
  });

  it('is 0.5 for half flag half clear', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.5),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.flagBlockRatio).toBe(0.5);
  });

  it('counts block outcomes in the ratio', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'block', 1.0),
      makeScreen('2026-01-02T00:00:00Z', 'clear', 0.0),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.flagBlockRatio).toBe(0.5);
  });
});

// ── inflection: first_escalation ─────────────────────────────────────────────

describe('analyseTrajectory — first_escalation inflection', () => {
  it('fires when subject crosses to escalate after a clear run', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'clear', 0.2),
      makeScreen('2026-01-03T00:00:00Z', 'escalate', 0.9),
    ];
    const r = analyseTrajectory('sub', screens);
    const fe = r.inflections.find((i) => i.kind === 'first_escalation');
    expect(fe).toBeDefined();
    expect(fe!.toIndex).toBe(2);
  });

  it('does NOT fire when first screen is already escalate (idx=0)', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'escalate', 0.9),
      makeScreen('2026-01-02T00:00:00Z', 'escalate', 0.9),
    ];
    const r = analyseTrajectory('sub', screens);
    const fe = r.inflections.find((i) => i.kind === 'first_escalation');
    expect(fe).toBeUndefined();
  });

  it('fires for block outcome (rank 4 ≥ 3)', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'block', 1.0),
    ];
    const r = analyseTrajectory('sub', screens);
    const fe = r.inflections.find((i) => i.kind === 'first_escalation');
    expect(fe).toBeDefined();
  });
});

// ── inflection: score_spike ──────────────────────────────────────────────────

describe('analyseTrajectory — score_spike inflection', () => {
  it('fires when single jump ≥ 0.3', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.45),  // jump = 0.35 ≥ 0.3
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'score_spike')).toBeDefined();
  });

  it('does NOT fire when jump < 0.3', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.38), // jump = 0.28 < 0.3
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'score_spike')).toBeUndefined();
  });

  it('fires multiple times for multiple spikes', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.0),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.5),   // +0.5 spike
      makeScreen('2026-01-03T00:00:00Z', 'clear', 0.0),
      makeScreen('2026-01-04T00:00:00Z', 'escalate', 0.9), // +0.9 spike
    ];
    const r = analyseTrajectory('sub', screens);
    const spikes = r.inflections.filter((i) => i.kind === 'score_spike');
    expect(spikes.length).toBeGreaterThanOrEqual(2);
  });
});

// ── inflection: regression_to_clear ──────────────────────────────────────────

describe('analyseTrajectory — regression_to_clear inflection', () => {
  it('fires when last outcome is clear but mid-history was escalate', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'escalate', 0.9),  // mid
      makeScreen('2026-01-03T00:00:00Z', 'escalate', 0.85), // mid (n=5, floor(5/2)=2)
      makeScreen('2026-01-04T00:00:00Z', 'flag', 0.4),
      makeScreen('2026-01-05T00:00:00Z', 'clear', 0.05),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'regression_to_clear')).toBeDefined();
  });

  it('does NOT fire when last outcome is not clear', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'escalate', 0.9),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-03T00:00:00Z', 'flag', 0.6),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'regression_to_clear')).toBeUndefined();
  });
});

// ── inflection: flap_pattern ─────────────────────────────────────────────────

describe('analyseTrajectory — flap_pattern inflection', () => {
  it('fires when outcomes flip ≥ 3 times across ≥ 4 screens', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-03T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-04T00:00:00Z', 'flag', 0.6),
    ]; // 3 flips, 4 screens
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'flap_pattern')).toBeDefined();
  });

  it('does NOT fire with < 3 flips', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
      makeScreen('2026-01-02T00:00:00Z', 'flag', 0.5),
      makeScreen('2026-01-03T00:00:00Z', 'clear', 0.1),
    ]; // 2 flips, 3 screens
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'flap_pattern')).toBeUndefined();
  });
});

// ── inflection: sustained_drift ───────────────────────────────────────────────

describe('analyseTrajectory — sustained_drift inflection', () => {
  it('fires when |slope| ≥ 0.04 over ≥ 4 screens (rising)', () => {
    // Steep monotone rise: slope >> 0.04
    const screens = [0.1, 0.4, 0.7, 1.0].map((s, i) =>
      makeScreen(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'flag', s),
    );
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'sustained_drift')).toBeDefined();
  });

  it('does NOT fire with fewer than 4 screens even if slope is large', () => {
    const screens = [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.0),
      makeScreen('2026-01-02T00:00:00Z', 'escalate', 1.0),
      makeScreen('2026-01-03T00:00:00Z', 'escalate', 0.9),
    ];
    const r = analyseTrajectory('sub', screens);
    expect(r.inflections.find((i) => i.kind === 'sustained_drift')).toBeUndefined();
  });
});

// ── subjectId propagation ─────────────────────────────────────────────────────

describe('analyseTrajectory — subjectId', () => {
  it('propagates the subjectId into the report', () => {
    const r = analyseTrajectory('CUST-12345', [
      makeScreen('2026-01-01T00:00:00Z', 'clear', 0.1),
    ]);
    expect(r.subjectId).toBe('CUST-12345');
  });
});
