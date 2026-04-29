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
    // After PR #221, the RAW arrays hold 266/244/341 names but the build()
    // pipeline dedupes slug collisions, leaving 265/243/340 unique entries.
    // These floors are the deduped counts — they guard against accidental
    // shrinkage of the catalogue, not against new entries that happen to
    // collide on slug.
    expect(SKILLS.length).toBeGreaterThanOrEqual(265);
    expect(REASONING.length).toBeGreaterThanOrEqual(243);
    expect(ANALYSIS.length).toBeGreaterThanOrEqual(340);
  });
});
