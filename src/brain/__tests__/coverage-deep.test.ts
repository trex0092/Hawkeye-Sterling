// Deep coverage tests for brain/coverage.ts
// Covers: computeCoverage(), categoryCoverage, PlaybookSatisfaction,
//         anchor activation, satisfied/partial/unmet thresholds, definedAnchorIds().

import { describe, it, expect } from 'vitest';
import {
  computeCoverage,
  definedAnchorIds,
  type ModeLike,
  type ComputeCoverageInput,
} from '../coverage.js';
import { REGULATORY_PLAYBOOKS } from '../regulatory-playbooks.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMode(id: string, taxonomyIds: string[]): ModeLike {
  return { id, taxonomyIds };
}

/** Build a custom minimal playbook that this test controls fully. */
const TEST_PLAYBOOK = {
  id: 'test-playbook',
  name: 'Test Playbook',
  summary: 'A minimal test playbook.',
  triggers: ['test trigger'],
  requiredSkills: ['skills-test-skill-one', 'skills-test-skill-two'],
  requiredReasoning: ['reasoning-test-reasoning-one'],
  requiredAnalysis: ['analysis-test-analysis-one'],
  requiredAnchors: ['anchor-test-anchor-one'],
  charterArticles: ['P1'],
  slaHours: 24,
} as const;

function baseInput(overrides: Partial<ComputeCoverageInput> = {}): ComputeCoverageInput {
  return {
    modes: [],
    totals: { skills: 10, reasoning: 10, analysis: 10 },
    playbooks: [TEST_PLAYBOOK],
    ...overrides,
  };
}

// ── computeCoverage: basic shape ──────────────────────────────────────────────

describe('computeCoverage: report shape', () => {
  it('returns a CoverageReport with all required fields', () => {
    const r = computeCoverage(baseInput());
    expect(r).toHaveProperty('modeIds');
    expect(r).toHaveProperty('taxonomyIdsActivated');
    expect(r).toHaveProperty('anchorIdsActivated');
    expect(r).toHaveProperty('bySkills');
    expect(r).toHaveProperty('byReasoning');
    expect(r).toHaveProperty('byAnalysis');
    expect(r).toHaveProperty('playbooks');
    expect(r).toHaveProperty('playbooksSatisfied');
    expect(r).toHaveProperty('playbooksPartial');
    expect(r).toHaveProperty('playbooksUnmet');
    expect(r).toHaveProperty('overallScore');
    expect(r).toHaveProperty('generatedAt');
  });

  it('modeIds reflects input modes', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('mode-a', []), makeMode('mode-b', [])],
    }));
    expect(r.modeIds).toEqual(['mode-a', 'mode-b']);
  });

  it('generatedAt is populated (ISO string)', () => {
    const r = computeCoverage(baseInput());
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('custom now() is respected', () => {
    const r = computeCoverage(baseInput({ now: () => '2026-05-16T00:00:00Z' }));
    expect(r.generatedAt).toBe('2026-05-16T00:00:00Z');
  });
});

// ── computeCoverage: taxonomy activation ─────────────────────────────────────

describe('computeCoverage: taxonomy activation', () => {
  it('taxonomyIdsActivated is empty when modes have no taxonomy ids', () => {
    const r = computeCoverage(baseInput({ modes: [makeMode('m1', [])] }));
    expect(r.taxonomyIdsActivated).toHaveLength(0);
  });

  it('activates taxonomy ids from all modes', () => {
    const r = computeCoverage(baseInput({
      modes: [
        makeMode('m1', ['skills-kyc', 'reasoning-risk']),
        makeMode('m2', ['analysis-transaction']),
      ],
    }));
    expect(r.taxonomyIdsActivated).toContain('skills-kyc');
    expect(r.taxonomyIdsActivated).toContain('reasoning-risk');
    expect(r.taxonomyIdsActivated).toContain('analysis-transaction');
  });

  it('deduplicates taxonomy ids activated by multiple modes', () => {
    const r = computeCoverage(baseInput({
      modes: [
        makeMode('m1', ['skills-kyc']),
        makeMode('m2', ['skills-kyc']), // duplicate
      ],
    }));
    const kycCount = r.taxonomyIdsActivated.filter((id) => id === 'skills-kyc').length;
    expect(kycCount).toBe(1);
  });

  it('taxonomyIdsActivated is sorted', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['skills-z', 'skills-a', 'skills-m'])],
    }));
    expect(r.taxonomyIdsActivated).toEqual([...r.taxonomyIdsActivated].sort());
  });
});

// ── computeCoverage: category coverage ───────────────────────────────────────

describe('computeCoverage: category coverage', () => {
  it('bySkills.percent is 100 when total is 0', () => {
    const r = computeCoverage(baseInput({ totals: { skills: 0, reasoning: 10, analysis: 10 } }));
    expect(r.bySkills.percent).toBe(100);
    expect(r.bySkills.totalCount).toBe(0);
  });

  it('bySkills.percent = 0 when no matching taxonomy ids activated', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['reasoning-risk'])],
      totals: { skills: 5, reasoning: 5, analysis: 5 },
    }));
    expect(r.bySkills.percent).toBe(0);
    expect(r.bySkills.coveredCount).toBe(0);
  });

  it('bySkills.percent increases with matching skills- prefix ids', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['skills-kyc', 'skills-ubo'])],
      totals: { skills: 4, reasoning: 10, analysis: 10 },
    }));
    // 2 covered / 4 total = 50%
    expect(r.bySkills.coveredCount).toBe(2);
    expect(r.bySkills.percent).toBe(50);
  });

  it('byReasoning only counts reasoning- prefix ids', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['skills-kyc', 'reasoning-risk', 'reasoning-geo'])],
      totals: { skills: 5, reasoning: 4, analysis: 5 },
    }));
    expect(r.byReasoning.coveredCount).toBe(2);
    expect(r.bySkills.coveredCount).toBe(1);
  });

  it('byAnalysis.covered lists sorted analysis- ids', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['analysis-z', 'analysis-a'])],
      totals: { skills: 5, reasoning: 5, analysis: 5 },
    }));
    expect(r.byAnalysis.covered).toEqual(['analysis-a', 'analysis-z']);
  });
});

// ── computeCoverage: playbook satisfaction ────────────────────────────────────

describe('computeCoverage: playbook satisfaction', () => {
  it('marks playbook as unmet when no modes activated', () => {
    const r = computeCoverage(baseInput({ modes: [] }));
    const pb = r.playbooks[0]!;
    expect(pb.status).toBe('unmet');
    expect(pb.satisfactionPercent).toBe(0);
  });

  it('marks playbook as satisfied when all requirements covered', () => {
    const modes = [
      makeMode('m1', [
        'skills-test-skill-one',
        'skills-test-skill-two',
        'reasoning-test-reasoning-one',
        'analysis-test-analysis-one',
      ]),
    ];
    const r = computeCoverage(baseInput({ modes }));
    const pb = r.playbooks[0]!;
    expect(pb.status).toBe('satisfied');
    expect(pb.satisfactionPercent).toBe(100);
    // When skills/reasoning/analysis fully covered, anchor is activated
    expect(r.anchorIdsActivated).toContain('anchor-test-anchor-one');
  });

  it('marks playbook as partial when some but not enough requirements covered (40-94%)', () => {
    // Cover skills only: 2 required skills covered, but reasoning and analysis missing
    // totalRequired = 2 + 1 + 1 + 1 = 5; covered = 2 → 40% → partial
    const modes = [
      makeMode('m1', ['skills-test-skill-one', 'skills-test-skill-two']),
    ];
    const r = computeCoverage(baseInput({ modes }));
    const pb = r.playbooks[0]!;
    expect(pb.status).toBe('partial');
    expect(pb.satisfactionPercent).toBeGreaterThanOrEqual(40);
    expect(pb.satisfactionPercent).toBeLessThan(95);
  });

  it('missingSkills lists skills not covered', () => {
    const modes = [makeMode('m1', ['skills-test-skill-one'])]; // one skill missing
    const r = computeCoverage(baseInput({ modes }));
    expect(r.playbooks[0]!.missingSkills).toContain('skills-test-skill-two');
    expect(r.playbooks[0]!.missingSkills).not.toContain('skills-test-skill-one');
  });

  it('missingReasoning lists reasoning not covered', () => {
    const modes = [makeMode('m1', ['skills-test-skill-one', 'skills-test-skill-two'])];
    const r = computeCoverage(baseInput({ modes }));
    expect(r.playbooks[0]!.missingReasoning).toContain('reasoning-test-reasoning-one');
  });

  it('slaHours is present when defined in playbook', () => {
    const r = computeCoverage(baseInput());
    const pb = r.playbooks[0]!;
    expect(pb.slaHours).toBe(24);
  });

  it('requiredSkills count matches playbook definition', () => {
    const r = computeCoverage(baseInput());
    expect(r.playbooks[0]!.requiredSkills).toBe(2);
  });
});

// ── computeCoverage: aggregate counts ────────────────────────────────────────

describe('computeCoverage: aggregate counts', () => {
  it('playbooksSatisfied + playbooksPartial + playbooksUnmet = playbooks.length', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['skills-test-skill-one', 'skills-test-skill-two', 'reasoning-test-reasoning-one', 'analysis-test-analysis-one'])],
    }));
    expect(r.playbooksSatisfied + r.playbooksPartial + r.playbooksUnmet).toBe(r.playbooks.length);
  });

  it('overallScore is 0 when no modes and playbook is unmet', () => {
    const r = computeCoverage(baseInput({ modes: [] }));
    expect(r.overallScore).toBe(0);
  });

  it('overallScore is 100 when playbook is fully satisfied', () => {
    const modes = [makeMode('m1', [
      'skills-test-skill-one',
      'skills-test-skill-two',
      'reasoning-test-reasoning-one',
      'analysis-test-analysis-one',
    ])];
    const r = computeCoverage(baseInput({ modes }));
    expect(r.overallScore).toBe(100);
  });

  it('overallScore is average satisfaction across all playbooks', () => {
    // Two completely independent playbooks:
    //   pb-1: fully covered by mode m1 → 100%
    //   pb-2: entirely different required IDs, none covered → 0%
    // average = (100 + 0) / 2 = 50%
    const pb2 = {
      id: 'pb-2',
      name: 'Unmet Playbook',
      summary: 'Not covered.',
      triggers: [],
      requiredSkills: ['skills-unique-pb2-skill'],
      requiredReasoning: ['reasoning-unique-pb2'],
      requiredAnalysis: ['analysis-unique-pb2'],
      requiredAnchors: ['anchor-unique-pb2'],
      charterArticles: [],
    };
    const r = computeCoverage({
      modes: [makeMode('m1', [
        'skills-test-skill-one',
        'skills-test-skill-two',
        'reasoning-test-reasoning-one',
        'analysis-test-analysis-one',
      ])],
      totals: { skills: 5, reasoning: 5, analysis: 5 },
      playbooks: [TEST_PLAYBOOK, pb2],
    });
    // pb-1 satisfied (100%); pb-2 unmet (0%) → average = 50
    expect(r.overallScore).toBe(50);
  });

  it('overallScore is 0 when no playbooks', () => {
    const r = computeCoverage(baseInput({ playbooks: [] }));
    expect(r.overallScore).toBe(0);
  });
});

// ── computeCoverage: anchor activation ───────────────────────────────────────

describe('computeCoverage: anchor activation', () => {
  it('anchor is activated when all playbook requirements are covered', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', [
        'skills-test-skill-one',
        'skills-test-skill-two',
        'reasoning-test-reasoning-one',
        'analysis-test-analysis-one',
      ])],
    }));
    expect(r.anchorIdsActivated).toContain('anchor-test-anchor-one');
  });

  it('anchor is NOT activated when requirements are only partially met', () => {
    const r = computeCoverage(baseInput({
      modes: [makeMode('m1', ['skills-test-skill-one'])], // partial only
    }));
    expect(r.anchorIdsActivated).not.toContain('anchor-test-anchor-one');
  });

  it('explicit anchorIds are always activated', () => {
    const r = computeCoverage(baseInput({
      anchorIds: ['anchor-explicit-test'],
    }));
    expect(r.anchorIdsActivated).toContain('anchor-explicit-test');
  });

  it('anchorIdsActivated is deduplicated and sorted', () => {
    const r = computeCoverage(baseInput({
      anchorIds: ['anchor-z', 'anchor-a', 'anchor-z'], // duplicates
    }));
    const anchorACount = r.anchorIdsActivated.filter((id) => id === 'anchor-a').length;
    const anchorZCount = r.anchorIdsActivated.filter((id) => id === 'anchor-z').length;
    expect(anchorACount).toBe(1);
    expect(anchorZCount).toBe(1);
    expect(r.anchorIdsActivated).toEqual([...r.anchorIdsActivated].sort());
  });
});

// ── computeCoverage: with real REGULATORY_PLAYBOOKS ──────────────────────────

describe('computeCoverage: real playbooks', () => {
  it('returns a report for the real REGULATORY_PLAYBOOKS with no modes', () => {
    const r = computeCoverage({
      modes: [],
      totals: { skills: 100, reasoning: 100, analysis: 100 },
      playbooks: REGULATORY_PLAYBOOKS,
    });
    expect(r.playbooks.length).toBe(REGULATORY_PLAYBOOKS.length);
    expect(r.playbooksUnmet).toBe(REGULATORY_PLAYBOOKS.length); // nothing covered
    expect(r.overallScore).toBe(0);
  });

  it('playbook count matches REGULATORY_PLAYBOOKS size', () => {
    const r = computeCoverage({
      modes: [],
      totals: { skills: 100, reasoning: 100, analysis: 100 },
      playbooks: REGULATORY_PLAYBOOKS,
    });
    expect(r.playbooks.length).toBe(REGULATORY_PLAYBOOKS.length);
  });

  it('each playbook result has playbookId, status, satisfactionPercent', () => {
    const r = computeCoverage({
      modes: [],
      totals: { skills: 100, reasoning: 100, analysis: 100 },
      playbooks: REGULATORY_PLAYBOOKS,
    });
    for (const pb of r.playbooks) {
      expect(pb.playbookId).toBeTruthy();
      expect(['satisfied', 'partial', 'unmet']).toContain(pb.status);
      expect(pb.satisfactionPercent).toBeGreaterThanOrEqual(0);
      expect(pb.satisfactionPercent).toBeLessThanOrEqual(100);
    }
  });
});

// ── definedAnchorIds ──────────────────────────────────────────────────────────

describe('definedAnchorIds', () => {
  it('returns an array of strings', () => {
    const ids = definedAnchorIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('all returned IDs are non-empty strings', () => {
    const ids = definedAnchorIds();
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('returns stable results on repeated calls', () => {
    const first = definedAnchorIds();
    const second = definedAnchorIds();
    expect(first).toEqual(second);
  });
});
