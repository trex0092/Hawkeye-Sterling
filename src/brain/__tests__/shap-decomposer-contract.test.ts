// Contract test for decomposeScore() — guards the exact output shape that
// the web XAI panel (web/components/brain/BrainXAIPanel.tsx) consumes via
// /api/score-explain. A regression here (e.g. renaming `contributions` back
// to `shapValues`, or dropping `shapValue`/`direction`) is what previously
// crashed the Brain Intel → XAI tab with "shapValues is not iterable".

import { describe, expect, it } from 'vitest';
import { decomposeScore } from '../shap-decomposer.js';

describe('decomposeScore contract', () => {
  it('returns the decomposition shape the XAI panel depends on', () => {
    const result = decomposeScore(72, {
      jurisdictionPenalty: 30,
      adverseMediaPenalty: 25,
      pepPenalty: 17,
    });

    // Field name the panel reads must be `contributions` (NOT `shapValues`).
    expect(Array.isArray(result.contributions)).toBe(true);
    expect(result.contributions.length).toBeGreaterThan(0);
    expect(typeof result.totalScore).toBe('number');
    expect(typeof result.baseline).toBe('number');

    for (const c of result.contributions) {
      expect(typeof c.feature).toBe('string');
      expect(typeof c.displayName).toBe('string');
      expect(typeof c.shapValue).toBe('number');
      expect(typeof c.shapPercent).toBe('number');
      expect(['increases_risk', 'neutral']).toContain(c.direction);
    }
  });

  it('degrades to an empty contribution list (never undefined) for an empty breakdown', () => {
    const result = decomposeScore(0, {});
    expect(Array.isArray(result.contributions)).toBe(true);
    expect(result.contributions).toHaveLength(0);
  });
});
