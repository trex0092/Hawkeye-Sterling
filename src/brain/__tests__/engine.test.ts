import { describe, expect, it } from 'vitest';
import { introspect } from '../introspection.js';
import type { CognitiveFirepower, Finding, FindingConflict } from '../types.js';

// Minimal firepower stub for use across tests.
function stubFirepower(overrides: Partial<CognitiveFirepower> = {}): CognitiveFirepower {
  return {
    activations: [],
    modesFired: 1,
    facultiesEngaged: 3,
    categoriesSpanned: 3,
    independentEvidenceCount: 3,
    firepowerScore: 0.7,
    ...overrides,
  };
}

function stubFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    modeId: 'test_mode',
    category: 'logic',
    faculties: ['reasoning'],
    score: 0.5,
    confidence: 0.6,
    verdict: 'flag',
    rationale: 'test rationale',
    evidence: [],
    producedAt: Date.now(),
    ...overrides,
  };
}

const noConflicts: FindingConflict[] = [];

describe('engine introspection — MC-1: cross-category contradiction', () => {
  it('warns when the same category has both clear and flag verdicts', () => {
    const findings: Finding[] = [
      stubFinding({ category: 'logic', verdict: 'clear', score: 0 }),
      stubFinding({ category: 'logic', verdict: 'flag', score: 0.7 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc1 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-1:'));
    expect(mc1).toBe(true);
  });

  it('does not warn when all findings in a category agree', () => {
    const findings: Finding[] = [
      stubFinding({ category: 'logic', verdict: 'flag', score: 0.5 }),
      stubFinding({ category: 'logic', verdict: 'flag', score: 0.6 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc1 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-1:'));
    expect(mc1).toBeFalsy();
  });
});

describe('engine introspection — MC-2: under-triangulation', () => {
  it('warns when fewer than 3 distinct faculties are engaged on substantive evidence', () => {
    const findings: Finding[] = [
      stubFinding({ faculties: ['reasoning'], score: 0.5 }),
      stubFinding({ faculties: ['reasoning'], score: 0.3 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc2 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-2:'));
    expect(mc2).toBe(true);
  });

  it('does not warn when 3 or more distinct faculties are engaged', () => {
    const findings: Finding[] = [
      stubFinding({ faculties: ['reasoning'], score: 0.5 }),
      stubFinding({ faculties: ['data_analysis'], score: 0.4 }),
      stubFinding({ faculties: ['inference'], score: 0.3 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc2 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-2:'));
    expect(mc2).toBeFalsy();
  });
});

describe('engine introspection — MC-3: over-confidence on zero score', () => {
  it('warns when aggregate score is 0 and aggregate confidence exceeds 0.8', () => {
    const report = introspect([], {
      conflicts: noConflicts,
      firepower: stubFirepower(),
      aggregateScore: 0,
      aggregateConfidence: 0.9,
    });
    const mc3 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-3:'));
    expect(mc3).toBe(true);
  });

  it('does not warn when aggregate score is above 0', () => {
    const report = introspect([], {
      conflicts: noConflicts,
      firepower: stubFirepower(),
      aggregateScore: 0.1,
      aggregateConfidence: 0.95,
    });
    const mc3 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-3:'));
    expect(mc3).toBeFalsy();
  });

  it('does not warn when confidence is at or below 0.8', () => {
    const report = introspect([], {
      conflicts: noConflicts,
      firepower: stubFirepower(),
      aggregateScore: 0,
      aggregateConfidence: 0.8,
    });
    const mc3 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-3:'));
    expect(mc3).toBeFalsy();
  });
});

describe('engine introspection — MC-4: calibration collapse', () => {
  it('warns when σ of finding confidences is below 0.05', () => {
    // All findings have identical confidence → σ = 0.
    const findings: Finding[] = [
      stubFinding({ confidence: 0.7 }),
      stubFinding({ confidence: 0.7 }),
      stubFinding({ confidence: 0.7 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc4 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-4:'));
    expect(mc4).toBe(true);
  });

  it('does not warn when σ of finding confidences is at or above 0.05', () => {
    const findings: Finding[] = [
      stubFinding({ confidence: 0.3 }),
      stubFinding({ confidence: 0.7 }),
      stubFinding({ confidence: 0.9 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc4 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-4:'));
    expect(mc4).toBeFalsy();
  });

  it('skips calibration collapse check when fewer than 2 contributor findings', () => {
    const findings: Finding[] = [stubFinding({ confidence: 0.7 })];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc4 = report.metaCheckWarnings?.some((w) => w.startsWith('MC-4:'));
    expect(mc4).toBeFalsy();
  });
});

describe('engine introspection — metaCheckWarnings field', () => {
  it('always returns a metaCheckWarnings array on the report', () => {
    const report = introspect([], { conflicts: noConflicts, firepower: stubFirepower() });
    expect(Array.isArray(report.metaCheckWarnings)).toBe(true);
  });

  it('warnings are also reflected in notes', () => {
    const findings: Finding[] = [
      stubFinding({ confidence: 0.7 }),
      stubFinding({ confidence: 0.7 }),
      stubFinding({ confidence: 0.7 }),
    ];
    const report = introspect(findings, { conflicts: noConflicts, firepower: stubFirepower() });
    const mc4InNotes = report.notes.some((n) => n.startsWith('MC-4:'));
    expect(mc4InNotes).toBe(true);
  });
});
