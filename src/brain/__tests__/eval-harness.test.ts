// Layer 7 acceptance tests — evaluation harness.

import { describe, expect, it } from 'vitest';
import {
  EvalHarness,
  SEED_SCENARIOS,
  type RegressionScenario,
  type ScenarioRunResult,
} from '../registry/eval-harness.js';
import { AuditLogStore } from '../registry/audit-log.js';
import type { AdvisorResponseV1 } from '../registry/response-schema.js';
import type { ValidationReport } from '../registry/citation-validator.js';

function answer(overrides?: Partial<AdvisorResponseV1>): AdvisorResponseV1 {
  return {
    schemaVersion: 1,
    facts: { bullets: ['Walk-in customer attempting threshold-breaching gold purchase.'] },
    redFlags: { flags: [{ indicator: 'cash threshold', typology: 'sub_threshold_structuring' }] },
    frameworkCitations: { byClass: { A: ['FDL 10/2025 Art.16', 'FDL 10/2025 Art.18'], B: ['Cabinet Decision 134/2025 Art.5'], D: ['FATF R.10'] } },
    decision: { verdict: 'escalate', oneLineRationale: 'EDD trigger fired.' },
    confidence: { score: 4, reason: 'SoF unverified.' },
    counterArgument: {
      inspectorChallenge: 'An inspector would press on whether identification was completed at onboarding before the threshold check fired.',
      rebuttal: 'CDD attempt logged with timestamps; verdict holds.',
    },
    auditTrail: {
      charterVersionHash: 'charter-v1', directivesInvoked: ['P3', 'P5'], doctrinesApplied: ['cdd_doctrine'],
      retrievedSources: [{ class: 'A', classLabel: 'Primary Law', sourceId: 'FDL-10-2025', articleRef: 'Art.16' }],
      timestamp: '2026-04-29T10:00:00Z', userId: 'mlro-01', mode: 'deep',
      modelVersions: { sonnet: 'sonnet-4-6', opus: 'opus-4-7' },
    },
    escalationPath: { responsible: 'Compliance', accountable: 'MLRO', consulted: [], informed: [], nextAction: 'Open case + request SoF docs.' },
    ...(overrides ?? {}),
  };
}

function emptyValidation(): ValidationReport {
  return { citations: [], defects: [], ungroundedClaims: [], passed: true, summary: { citationCount: 0, matchedCount: 0, defectCount: 0, ungroundedClaimCount: 0 } };
}

describe('eval harness: scenario registration', () => {
  it('seeds the dashboard with three worked-example scenarios', () => {
    expect(SEED_SCENARIOS).toHaveLength(3);
    const clusters = new Set(SEED_SCENARIOS.map((s) => s.cluster));
    expect(clusters.has('transactional_risk')).toBe(true);
    expect(clusters.has('supplier_due_diligence')).toBe(true);
    expect(clusters.has('sanctions_edge_cases')).toBe(true);
  });

  it('rejects duplicate scenario ids', () => {
    const h = new EvalHarness();
    h.addScenario(SEED_SCENARIOS[0]!);
    expect(() => h.addScenario(SEED_SCENARIOS[0]!)).toThrow(/already registered/);
  });
});

describe('eval harness: per-scenario grading', () => {
  const h = new EvalHarness();
  const scenario = SEED_SCENARIOS[0]!;

  it('grades a clean answer as fully correct', () => {
    const r = h.grade(scenario, answer(), { elapsedMs: 4500, mode: 'deep', validation: emptyValidation() });
    expect(r.grade.verdictMatch).toBe(true);
    expect(r.grade.confidenceWithinOne).toBe(true);
    expect(r.grade.requiredCitationsPresent).toBe(true);
    expect(r.grade.completionPassed).toBe(true);
    expect(r.grade.hallucinated).toBe(false);
  });

  it('flags verdictMatch false when the model decided wrong', () => {
    const r = h.grade(scenario, answer({ decision: { verdict: 'proceed', oneLineRationale: 'looks fine' }, redFlags: { flags: [] } }), {
      elapsedMs: 4500, mode: 'deep', validation: emptyValidation(),
    });
    expect(r.grade.verdictMatch).toBe(false);
  });

  it('flags requiredCitationsPresent false when a gold cite is missing', () => {
    const r = h.grade(scenario, answer({ frameworkCitations: { byClass: { A: ['FDL 10/2025 Art.16'] } } }), {
      elapsedMs: 4500, mode: 'deep', validation: emptyValidation(),
    });
    expect(r.grade.requiredCitationsPresent).toBe(false);
  });

  it('treats a null answer (completion gate tripped) as a structural failure', () => {
    const r = h.grade(scenario, null, { elapsedMs: 4500, mode: 'deep' });
    expect(r.grade.verdictMatch).toBe(false);
    expect(r.grade.completionPassed).toBe(false);
    expect(r.grade.completionDefects.length).toBeGreaterThan(0);
  });

  it('flags hallucination when validator surfaced an invented citation', () => {
    const v: ValidationReport = {
      citations: [],
      defects: [{ citation: { raw: 'FDL 10/2025 Art.99', class: 'A', sourceId: 'FDL-10-2025', articleRef: 'Art.99', articleNumber: 99, span: { start: 0, end: 20 } }, failure: 'no_matching_chunk', detail: 'invented' }],
      ungroundedClaims: [], passed: false, summary: { citationCount: 1, matchedCount: 0, defectCount: 1, ungroundedClaimCount: 0 },
    };
    const r = h.grade(scenario, answer(), { elapsedMs: 4500, mode: 'deep', validation: v });
    expect(r.grade.hallucinated).toBe(true);
  });
});

describe('eval harness: KPI computation (build-spec dashboard)', () => {
  function makeRuns(): ScenarioRunResult[] {
    const h = new EvalHarness();
    const s = SEED_SCENARIOS[0]!;
    return [
      h.grade(s, answer(), { elapsedMs: 4500, mode: 'deep', validation: { ...emptyValidation(), summary: { citationCount: 4, matchedCount: 4, defectCount: 0, ungroundedClaimCount: 0 } }, counterArgumentGrade: 4 }),
      h.grade(s, answer(), { elapsedMs: 5500, mode: 'deep', validation: { ...emptyValidation(), summary: { citationCount: 4, matchedCount: 4, defectCount: 0, ungroundedClaimCount: 0 } }, counterArgumentGrade: 5 }),
      h.grade(s, answer(), { elapsedMs: 3500, mode: 'balanced', validation: { ...emptyValidation(), summary: { citationCount: 3, matchedCount: 3, defectCount: 0, ungroundedClaimCount: 0 } }, counterArgumentGrade: 3 }),
    ];
  }

  it('renders all six KPIs', () => {
    const h = new EvalHarness();
    const k = h.computeKpis(makeRuns());
    expect(k.totalRuns).toBe(3);
    expect(k.citationAccuracy).toBe(1);
    expect(k.hallucinationRatePer100).toBe(0);
    expect(k.completionRateDeep).toBe(1);
    expect(k.timeToDecisionP50Ms.deep).toBe(5000);
    expect(k.timeToDecisionP50Ms.balanced).toBe(3500);
    expect(k.counterArgumentQualityMean).toBeCloseTo(4, 1);
  });

  it('reports 0 escalation precision + breach when no audit-log feedback exists', () => {
    const h = new EvalHarness();
    const k = h.computeKpis(makeRuns());
    expect(k.escalationPrecision).toBe(0);
    expect(k.breaches.some((b) => b.kpi === 'escalationPrecision')).toBe(true);
  });

  it('computes escalation precision when audit log has feedback', () => {
    const h = new EvalHarness();
    const log = new AuditLogStore();
    log.append({
      userId: 'u', mode: 'deep', questionText: 'q', modelVersions: {}, charterVersionHash: 'c',
      directivesInvoked: [], doctrinesApplied: [], retrievedSources: [], reasoningTrace: [],
      finalAnswer: answer({ decision: { verdict: 'escalate', oneLineRationale: 'r' } }),
    });
    log.setFeedback(1, { verdict: 'thumbs_up', at: '2026-04-29T11:00:00Z' });
    log.append({
      userId: 'u', mode: 'deep', questionText: 'q2', modelVersions: {}, charterVersionHash: 'c',
      directivesInvoked: [], doctrinesApplied: [], retrievedSources: [], reasoningTrace: [],
      finalAnswer: answer({ decision: { verdict: 'escalate', oneLineRationale: 'r' } }),
    });
    log.setFeedback(2, { verdict: 'thumbs_down', correction: 'should have been proceed', at: '2026-04-29T12:00:00Z' });
    const k = h.computeKpis(makeRuns(), log);
    expect(k.escalationPrecision).toBeCloseTo(0.5, 2);
  });

  it('flags breach when citation accuracy drops below 95%', () => {
    const h = new EvalHarness();
    const s = SEED_SCENARIOS[0]!;
    const runs: ScenarioRunResult[] = [
      h.grade(s, answer(), { elapsedMs: 1, mode: 'deep', validation: { ...emptyValidation(), summary: { citationCount: 10, matchedCount: 8, defectCount: 2, ungroundedClaimCount: 0 } } }),
    ];
    const k = h.computeKpis(runs);
    expect(k.citationAccuracy).toBe(0.8);
    expect(k.breaches.some((b) => b.kpi === 'citationAccuracy')).toBe(true);
  });

  it('flags breach when any hallucination occurs', () => {
    const h = new EvalHarness();
    const s = SEED_SCENARIOS[0]!;
    const v: ValidationReport = {
      citations: [],
      defects: [{ citation: { raw: 'FDL 10/2025 Art.99', class: 'A', sourceId: 'FDL-10-2025', articleRef: 'Art.99', span: { start: 0, end: 1 } }, failure: 'no_matching_chunk', detail: 'invented' }],
      ungroundedClaims: [], passed: false, summary: { citationCount: 1, matchedCount: 0, defectCount: 1, ungroundedClaimCount: 0 },
    };
    const r = h.grade(s, answer(), { elapsedMs: 1, mode: 'deep', validation: v });
    const k = h.computeKpis([r]);
    expect(k.hallucinationRatePer100).toBeGreaterThan(0);
    expect(k.breaches.some((b) => b.kpi === 'hallucinationRatePer100')).toBe(true);
  });
});

describe('eval harness: build-spec acceptance — dashboard renders', () => {
  it('end-to-end: register seed scenarios, simulate runs, compute KPIs', () => {
    const h = new EvalHarness();
    for (const s of SEED_SCENARIOS) h.addScenario(s);
    expect(h.size()).toBe(3);
    const runs = h.list().map((s: RegressionScenario) => h.grade(s, answer({ decision: { verdict: s.goldVerdict, oneLineRationale: 'gold' }, confidence: { score: s.goldConfidence, ...(s.goldConfidence < 5 ? { reason: 'aligned' } : {}) }, redFlags: { flags: s.goldVerdict === 'proceed' ? [] : [{ indicator: 'flag', typology: 'cdd_doctrine' }] } } as Partial<AdvisorResponseV1>), { elapsedMs: 4000, mode: 'deep', validation: { ...emptyValidation(), summary: { citationCount: s.goldCitations.length, matchedCount: s.goldCitations.length, defectCount: 0, ungroundedClaimCount: 0 } }, counterArgumentGrade: 4 }));
    const k = h.computeKpis(runs);
    // All scenarios match → all KPIs at acceptance bands except
    // escalation precision (no feedback in this test → expected breach).
    expect(k.totalRuns).toBe(3);
    expect(k.citationAccuracy).toBe(1);
    expect(k.hallucinationRatePer100).toBe(0);
    expect(k.completionRateDeep).toBe(1);
    expect(k.byCluster.transactional_risk).toBe(1);
    expect(k.byCluster.supplier_due_diligence).toBe(1);
    expect(k.byCluster.sanctions_edge_cases).toBe(1);
  });
});
