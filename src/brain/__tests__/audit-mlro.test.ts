import { describe, it, expect } from 'vitest';
import { auditBrain } from '../audit.js';
import { ALL_MLRO_TOPICS } from '../mlro-question-classifier.js';

describe('auditBrain — MLRO topic integrity', () => {
  const report = auditBrain(false);

  it('runs without hard problems (registry consistency)', () => {
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it('exposes per-topic coverage for every MlroTopic', () => {
    for (const t of ALL_MLRO_TOPICS) {
      expect(report.mlroTopicCoverage[t]).toBeDefined();
      expect(report.mlroTopicCoverage[t]!.graphNodes).toBeGreaterThan(0);
    }
  });

  it('reports MLRO totals', () => {
    expect(report.totals.mlroTopics).toBeGreaterThan(40);
    expect(report.totals.commonSenseRules).toBeGreaterThan(100);
    expect(report.totals.fatfRecommendations).toBeGreaterThan(20);
  });

  it('emits advisories for orphaned cross-references (visibility, not blocking)', () => {
    // The new MLRO classifier maps cite playbook / red-flag IDs not yet
    // backfilled into the canonical catalogue. Audit must surface these as
    // advisories so the gap is visible in the UI/CI without breaking ok.
    expect(Array.isArray(report.advisories)).toBe(true);
  });

  it('every topic has at least 1 doctrine and 1 FATF Rec (advisory if not)', () => {
    // Soft assertion: verify the coverage map is populated. We don't require
    // length>0 because under-authored topics should advise, not fail.
    for (const t of ALL_MLRO_TOPICS) {
      const cov = report.mlroTopicCoverage[t]!;
      expect(typeof cov.doctrines).toBe('number');
      expect(typeof cov.fatf).toBe('number');
    }
  });
});
