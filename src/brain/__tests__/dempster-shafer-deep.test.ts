// Deep coverage tests for dempster-shafer.ts
// Covers: combineDS (empty masses, single mass, two-mass Dempster rule,
// high-conflict Yager fallback, auto-mode, frame validation), pignisticOf,
// belief/plausibility invariants, step trace audit.

import { describe, it, expect } from 'vitest';
import { combineDS, pignisticOf, type BeliefMass } from '../dempster-shafer.js';

const FRAME = ['ml', 'pep', 'sanctions'];

// ── error cases ──────────────────────────────────────────────────────────────

describe('combineDS — error cases', () => {
  it('throws when frame is empty', () => {
    expect(() => combineDS([], [])).toThrow(/frame.*must not be empty/i);
  });
});

// ── vacuous / empty masses ────────────────────────────────────────────────────

describe('combineDS — no masses', () => {
  it('returns the vacuous (all-mass-on-frame) distribution', () => {
    const r = combineDS(FRAME, []);
    // Vacuous: all mass on Θ (the full frame key).
    const thetaKey = [...FRAME].sort().join('|');
    expect(r.combined[thetaKey]).toBeCloseTo(1);
    expect(r.conflict).toBe(0);
    expect(r.steps).toHaveLength(0);
  });

  it('belief and plausibility for each singleton are well-formed (bel ≤ pl)', () => {
    const r = combineDS(FRAME, []);
    for (const h of FRAME) {
      expect(r.belief[h] ?? 0).toBeLessThanOrEqual(r.plausibility[h] ?? 1);
    }
  });
});

// ── single-mass combination ───────────────────────────────────────────────────

describe('combineDS — single mass', () => {
  it('combined output reflects the source mass', () => {
    const mass: BeliefMass = {
      sourceId: 'src-1',
      mass: { ml: 0.7, 'ml|pep': 0.2, 'ml|pep|sanctions': 0.1 },
    };
    const r = combineDS(FRAME, [mass]);
    // ml singleton mass should be positive.
    expect((r.combined['ml'] ?? 0)).toBeGreaterThan(0);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.sourceId).toBe('src-1');
  });

  it('masses sum to ≈1 after combination', () => {
    const mass: BeliefMass = { sourceId: 's', mass: { ml: 0.6, pep: 0.4 } };
    const r = combineDS(FRAME, [mass]);
    const total = Object.values(r.combined).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

// ── two-source Dempster combination ──────────────────────────────────────────

describe('combineDS — two sources, Dempster rule', () => {
  const m1: BeliefMass = { sourceId: 'a', mass: { ml: 0.8, 'ml|pep|sanctions': 0.2 } };
  const m2: BeliefMass = { sourceId: 'b', mass: { ml: 0.6, pep: 0.2, 'ml|pep|sanctions': 0.2 } };

  it('rule is "dempster" when conflict is low', () => {
    const r = combineDS(FRAME, [m1, m2], { rule: 'dempster' });
    expect(r.rule).toBe('dempster');
  });

  it('ml gets the highest combined mass when both sources strongly suggest ml', () => {
    const r = combineDS(FRAME, [m1, m2], { rule: 'dempster' });
    const mlMass = r.combined['ml'] ?? 0;
    const pepMass = r.combined['pep'] ?? 0;
    const sanctMass = r.combined['sanctions'] ?? 0;
    expect(mlMass).toBeGreaterThan(pepMass);
    expect(mlMass).toBeGreaterThan(sanctMass);
  });

  it('produces 2 audit steps', () => {
    const r = combineDS(FRAME, [m1, m2]);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0]!.sourceId).toBe('a');
    expect(r.steps[1]!.sourceId).toBe('b');
  });

  it('pignistic transformation sums to ≈1', () => {
    const r = combineDS(FRAME, [m1, m2]);
    const pTotal = FRAME.reduce((s, h) => s + (r.pignistic[h] ?? 0), 0);
    expect(pTotal).toBeCloseTo(1, 4);
  });
});

// ── Yager fallback on high conflict ──────────────────────────────────────────

describe('combineDS — Yager fallback on high conflict', () => {
  // Two directly contradicting sources: each assigns all mass to disjoint singletons.
  // This produces near-total conflict → auto mode should switch to Yager.
  const m1: BeliefMass = { sourceId: 'x', mass: { ml: 1.0 } };
  const m2: BeliefMass = { sourceId: 'y', mass: { pep: 1.0 } };

  it('auto mode switches to yager under full conflict', () => {
    const r = combineDS(FRAME, [m1, m2], { rule: 'auto' });
    expect(r.rule).toBe('yager');
  });

  it('explicit yager rule works correctly', () => {
    const r = combineDS(FRAME, [m1, m2], { rule: 'yager' });
    expect(r.rule).toBe('yager');
  });

  it('conflict is reported near 1', () => {
    const r = combineDS(FRAME, [m1, m2], { rule: 'yager' });
    expect(r.conflict).toBeGreaterThan(0.9);
  });

  it('result does not throw under total conflict', () => {
    expect(() => combineDS(FRAME, [m1, m2])).not.toThrow();
  });
});

// ── belief / plausibility invariants ────────────────────────────────────────

describe('combineDS — Bel ≤ Pl invariant', () => {
  const masses: BeliefMass[] = [
    { sourceId: 'a', mass: { ml: 0.5, pep: 0.3, 'ml|pep|sanctions': 0.2 } },
    { sourceId: 'b', mass: { sanctions: 0.4, 'ml|pep|sanctions': 0.6 } },
  ];

  it('Bel(h) ≤ Pl(h) for every singleton h', () => {
    const r = combineDS(FRAME, masses);
    for (const h of FRAME) {
      const bel = r.belief[h] ?? 0;
      const pl = r.plausibility[h] ?? 0;
      expect(bel).toBeLessThanOrEqual(pl + 1e-9);
    }
  });
});

// ── frame-normalisation: hypotheses outside frame are dropped ─────────────────

describe('combineDS — frame normalisation', () => {
  it('drops hypotheses outside the declared frame', () => {
    const mass: BeliefMass = {
      sourceId: 'x',
      mass: { ml: 0.5, outside_frame: 0.5 },
    };
    const r = combineDS(['ml'], [mass]);
    // 'outside_frame' should not appear in the combined mass.
    expect(r.combined['outside_frame']).toBeUndefined();
    // Residual goes to Θ (the frame).
    expect(r.combined['ml'] ?? 0).toBeGreaterThan(0);
  });

  it('frame is sorted alphabetically in the result', () => {
    const r = combineDS(['z_hyp', 'a_hyp', 'm_hyp'], []);
    expect(r.frame).toEqual(['a_hyp', 'm_hyp', 'z_hyp']);
  });
});

// ── pignisticOf ──────────────────────────────────────────────────────────────

describe('pignisticOf', () => {
  it('returns pignistic[h] from the result', () => {
    const m: BeliefMass = { sourceId: 's', mass: { ml: 0.9, 'ml|pep|sanctions': 0.1 } };
    const r = combineDS(FRAME, [m]);
    expect(pignisticOf(r, 'ml')).toBe(r.pignistic['ml']);
  });

  it('returns 0 for a hypothesis not in the frame', () => {
    const r = combineDS(FRAME, []);
    expect(pignisticOf(r, 'nonexistent')).toBe(0);
  });
});

// ── residual mass fills Θ when mass sums to < 1 ──────────────────────────────

describe('combineDS — residual to Θ', () => {
  it('adds residual to Θ when supplied mass sums to < 1', () => {
    const mass: BeliefMass = { sourceId: 's', mass: { ml: 0.3 } }; // 0.7 unassigned
    const r = combineDS(FRAME, [mass]);
    // Total combined mass should still ≈ 1.
    const total = Object.values(r.combined).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

// ── three-source combination ───────────────────────────────────────────────

describe('combineDS — three sources', () => {
  it('produces 3 audit steps with correct sourceIds', () => {
    const sources: BeliefMass[] = [
      { sourceId: 'src-a', mass: { ml: 0.7, 'ml|pep|sanctions': 0.3 } },
      { sourceId: 'src-b', mass: { pep: 0.5, 'ml|pep|sanctions': 0.5 } },
      { sourceId: 'src-c', mass: { ml: 0.6, pep: 0.4 } },
    ];
    const r = combineDS(FRAME, sources, { rule: 'auto' });
    expect(r.steps).toHaveLength(3);
    expect(r.steps.map((s) => s.sourceId)).toEqual(['src-a', 'src-b', 'src-c']);
  });
});
