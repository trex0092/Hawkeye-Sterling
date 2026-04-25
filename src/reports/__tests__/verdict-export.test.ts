import { describe, expect, it } from 'vitest';
import { digest, verdictToHtml, verdictToMarkdown } from '../verdictExport.js';
import type { BrainVerdict } from '../../brain/types.js';

const V: BrainVerdict = {
  runId: 'abc123',
  subject: { name: 'Acme Holdings LLC', type: 'entity', jurisdiction: 'AE' },
  outcome: 'flag',
  aggregateScore: 0.63,
  aggregateConfidence: 0.77,
  findings: [
    {
      modeId: 'bayes_theorem',
      category: 'statistical',
      faculties: ['data_analysis', 'inference'],
      score: 0.7, confidence: 0.8, verdict: 'flag',
      rationale: 'Bayes LRs emitted for sanctions + adverse media signals.',
      evidence: ['sanctions_list:ofac-1'],
      producedAt: Date.now(),
    },
  ],
  chain: [{
    step: 1, modeId: 'bayes_theorem', faculty: 'data_analysis',
    summary: 'bayes_theorem · flag · test', producedAt: Date.now(),
  }],
  recommendedActions: ['Enhanced monitoring'],
  generatedAt: Date.now(),
  prior: 0.1,
  posterior: 0.55,
  primaryHypothesis: 'illicit_risk',
  consensus: 'weak',
  methodology: 'Fusion methodology (charter P9): demo.',
  firepower: {
    activations: [
      { facultyId: 'reasoning', modesFired: 1, weightedScore: 0.5, weightedConfidence: 0.8, status: 'engaged' },
      { facultyId: 'data_analysis', modesFired: 2, weightedScore: 0.7, weightedConfidence: 0.8, status: 'dominant' },
      { facultyId: 'deep_thinking', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
      { facultyId: 'intelligence', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
      { facultyId: 'smartness', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
      { facultyId: 'strong_brain', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
      { facultyId: 'inference', modesFired: 1, weightedScore: 0.6, weightedConfidence: 0.8, status: 'engaged' },
      { facultyId: 'argumentation', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
      { facultyId: 'introspection', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
      { facultyId: 'ratiocination', modesFired: 0, weightedScore: 0, weightedConfidence: 0, status: 'silent' },
    ],
    modesFired: 1,
    facultiesEngaged: 3,
    categoriesSpanned: 1,
    independentEvidenceCount: 1,
    firepowerScore: 0.42,
  },
  introspection: {
    chainQuality: 0.65,
    biasesDetected: [],
    calibrationGap: 0.1,
    coverageGaps: ['faculty:strong_brain silent'],
    confidenceAdjustment: 0.02,
    notes: ['meta_pass_rate=83%'],
    producedAt: Date.now(),
  },
  conflicts: [],
};

describe('verdict exporter', () => {
  it('produces Markdown with all major sections', () => {
    const md = verdictToMarkdown(V);
    expect(md).toMatch(/# Hawkeye Sterling — Verdict/);
    expect(md).toMatch(/Subject Identifiers/);
    expect(md).toMatch(/Verdict/);
    expect(md).toMatch(/Findings/);
    expect(md).toMatch(/Cognitive Firepower/);
    expect(md).toMatch(/Introspection/);
    expect(md).toMatch(/Reasoning Chain/);
    expect(md).toMatch(/Recommended Next Steps/);
    expect(md).toMatch(/Audit Line/);
  });

  it('produces self-contained HTML', () => {
    const html = verdictToHtml(V);
    expect(html).toMatch(/<!doctype html>/);
    expect(html).toMatch(/<h1>Hawkeye Sterling/);
    expect(html).toMatch(/Acme Holdings LLC/);
    expect(html).toMatch(/<table>/);
    expect(html).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
  });

  it('digest returns a compact shape', () => {
    const d = digest(V);
    expect(d.outcome).toBe('flag');
    expect(d.posterior).toBeCloseTo(0.55);
    expect(d.firepower).toBeCloseTo(0.42);
    expect(d.modesFired).toBe(1);
  });

  it('converts **bold** markers to <strong> tags — no raw ** in output', () => {
    const html = verdictToHtml(V);
    expect(html).not.toContain('**');
  });
});
