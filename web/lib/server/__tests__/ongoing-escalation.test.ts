import { describe, expect, it } from 'vitest';
import { ESCALATION_DELTA, shouldEscalate } from '../ongoing-escalation';

// Regression coverage for the ongoing-monitoring escalation policy.
// These tests guard the regulator-defensible behaviour asserted in the
// audit chain: a score increase of >= ESCALATION_DELTA between runs
// auto-escalates to the MLRO; smaller deltas + decreases do not.

describe('ongoing-escalation policy', () => {
  it('pins ESCALATION_DELTA to 15 (drift detector)', () => {
    // If a refactor changes this value, the test fails loudly so the
    // change has to be intentional and reviewed against the audit
    // chain assertions that cite the threshold.
    expect(ESCALATION_DELTA).toBe(15);
  });

  it('does not escalate on a subject first run (prev=null)', () => {
    expect(shouldEscalate(null, 90)).toBe(false);
    expect(shouldEscalate(undefined, 90)).toBe(false);
  });

  it('does not escalate when the score moves below the threshold', () => {
    expect(shouldEscalate(40, 54)).toBe(false); // +14
    expect(shouldEscalate(0, 14)).toBe(false);
    expect(shouldEscalate(50, 50)).toBe(false); // unchanged
  });

  it('escalates exactly at the threshold', () => {
    expect(shouldEscalate(40, 55)).toBe(true); // +15
  });

  it('escalates on a larger jump', () => {
    expect(shouldEscalate(20, 80)).toBe(true); // +60
    expect(shouldEscalate(0, 100)).toBe(true);
  });

  it('does NOT escalate on a score decrease of equivalent magnitude', () => {
    // Disposition workflows close cases on score decay; the escalation
    // is one-sided by design. A symmetric trigger would page the MLRO
    // every time a false-positive was cleared.
    expect(shouldEscalate(80, 20)).toBe(false);
    expect(shouldEscalate(100, 0)).toBe(false);
  });

  it('handles fractional scores by integer comparison', () => {
    // QuickScreen.topScore is integer in practice; this test pins the
    // contract so a floor()/round() change upstream does not break
    // the threshold semantics.
    expect(shouldEscalate(40.4, 55.4)).toBe(true);  // +15.0 exactly
    expect(shouldEscalate(40.5, 55.4)).toBe(false); // +14.9 < 15
  });
});
