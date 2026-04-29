import { describe, expect, it } from 'vitest';
import { TAXONOMY, SKILLS, REASONING, ANALYSIS } from '../taxonomy.js';

// Coverage regression guard.
// Asserts the taxonomy invariants that PR #220 / #221 established. If we
// later expand the taxonomy in one mirror but forget the other (or break the
// dedup pipeline), this test fails.

describe('taxonomy — invariants', () => {
  it('skills/reasoning/analysis sum to TAXONOMY length', () => {
    expect(TAXONOMY.length).toBe(SKILLS.length + REASONING.length + ANALYSIS.length);
  });

  it('every taxonomy entry has a unique id', () => {
    const seen = new Set<string>();
    for (const t of TAXONOMY) {
      expect(seen.has(t.id), `duplicate id: ${t.id}`).toBe(false);
      seen.add(t.id);
    }
  });

  it('every id has the correct category prefix', () => {
    for (const t of SKILLS) expect(t.id.startsWith('skills-')).toBe(true);
    for (const t of REASONING) expect(t.id.startsWith('reasoning-')).toBe(true);
    for (const t of ANALYSIS) expect(t.id.startsWith('analysis-')).toBe(true);
  });

  it('catalogue is at least as large as the established floor', () => {
    // After PR #221, src/brain matches web at 266/244/341.
    // These floors guard against accidental shrinkage.
    expect(SKILLS.length).toBeGreaterThanOrEqual(266);
    expect(REASONING.length).toBeGreaterThanOrEqual(244);
    expect(ANALYSIS.length).toBeGreaterThanOrEqual(341);
  });
});
