import { describe, expect, it } from 'vitest';
import { runMlroPipeline, type PipelineRunStep } from '../mlro-pipeline.js';
import type { MlroModeId } from '../mlro-reasoning-modes.js';
import { planBudget, equalSplit, frontWeightedSplit, HARD_CEILING_MS } from '../mlro-budget-planner.js';
import { recommendPreset, PIPELINE_PRESETS } from '../mlro-pipeline-presets.js';
import { exportResult } from '../mlro-export.js';

function fakeStep(textPerMode: Record<string, string>, delayMs = 10): PipelineRunStep {
  return async (modeId) => {
    await new Promise((r) => setTimeout(r, delayMs));
    return { ok: true, text: textPerMode[modeId] ?? `[[stub:${modeId}]]` };
  };
}

const sectionText = [
  '== SUBJECT_IDENTIFIERS ==',
  'Subject Al Test',
  '== SCOPE_DECLARATION ==',
  'UN, EOCN, OFAC as of 2026-04-22.',
  '== FINDINGS ==',
  'No confirmed hits.',
  '== GAPS ==',
  'Passport image not supplied.',
  '== RED_FLAGS ==',
  'rf_dpms_cash_walk_in',
  '== RECOMMENDED_NEXT_STEPS ==',
  'Request SoW documents.',
  '== AUDIT_LINE ==',
  'Decision support, not a decision. MLRO review required.',
].join('\n');

describe('mlro-pipeline — runner', () => {
  it('chains two stub modes and merges the 7 sections', async () => {
    const res = await runMlroPipeline(
      { question: 'Assess subject.', steps: [{ modeId: 'data' as MlroModeId }, { modeId: 'reflective' as MlroModeId }] },
      fakeStep({ data: sectionText, reflective: sectionText }),
    );
    expect(res.ok).toBe(true);
    expect(res.stepResults.length).toBe(2);
    expect(Object.keys(res.sections)).toEqual(
      expect.arrayContaining(['SUBJECT_IDENTIFIERS', 'SCOPE_DECLARATION', 'FINDINGS', 'GAPS', 'RED_FLAGS', 'RECOMMENDED_NEXT_STEPS', 'AUDIT_LINE']),
    );
    expect(res.charterGate.allowed).toBe(true);
    expect(res.audit.length).toBe(2);
    expect(res.audit[1]!.prevHash).toBe(res.audit[0]!.entryHash);
  });

  it('surfaces partial + guidance when a step times out', async () => {
    const slow: PipelineRunStep = async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, text: 'too slow' };
    };
    const res = await runMlroPipeline(
      { question: 'q', steps: [{ modeId: 'data' as MlroModeId, budgetMs: 50 }] },
      slow,
    );
    expect(res.partial).toBe(true);
    expect(res.guidance).toBeDefined();
    expect(res.stepResults[0]!.partial).toBe(true);
  });

  it('blocks charter egress on tipping-off phrasing', async () => {
    const bad = 'We have filed an STR against you. Please move funds before we submit the report.';
    const res = await runMlroPipeline(
      { question: 'q', steps: [{ modeId: 'speed' as MlroModeId }] },
      fakeStep({ speed: bad }),
    );
    expect(res.charterGate.allowed).toBe(false);
    expect(res.charterGate.tippingOffMatches).toBeGreaterThan(0);
  });
});

describe('mlro-budget-planner', () => {
  it('equal split sums below total budget', () => {
    const out = equalSplit(5, 20_000);
    const sum = out.reduce((a, b) => a + b.budgetMs, 0);
    expect(sum).toBeLessThanOrEqual(20_000);
    expect(out.length).toBe(5);
  });

  it('front-weighted gives step 0 the largest budget', () => {
    const out = frontWeightedSplit(4, 25_000);
    expect(out[0]!.budgetMs).toBeGreaterThan(out[1]!.budgetMs);
  });

  it('respects minMs floor and maxMs ceiling', () => {
    const out = planBudget([{ weight: 1, minMs: 5000 }, { weight: 3, maxMs: 7000 }], 20_000);
    expect(out[0]!.budgetMs).toBeGreaterThanOrEqual(5000);
    expect(out[1]!.budgetMs).toBeLessThanOrEqual(7000);
  });

  it('caps at the 60s hard ceiling', () => {
    const out = equalSplit(3, 90_000);
    const sum = out.reduce((a, b) => a + b.budgetMs, 0);
    expect(sum).toBeLessThanOrEqual(HARD_CEILING_MS);
  });
});

describe('mlro-pipeline-presets', () => {
  it('ships presets for the common archetypes', () => {
    expect(PIPELINE_PRESETS.length).toBeGreaterThanOrEqual(15);
  });

  it('recommender returns the fallback triage without signals', () => {
    const p = recommendPreset({});
    expect(p.id).toBe('pp_baseline_triage');
  });

  it('tipping-off signal takes priority over every other signal', () => {
    const p = recommendPreset({ tippingOff: true, cahra: true, hasPep: true });
    expect(p.id).toBe('pp_tipping_off_intercept');
  });

  it('confirmed EOCN preset is chosen for confirmed match', () => {
    const p = recommendPreset({ eocnConfirmed: true });
    expect(p.id).toBe('pp_eocn_confirmed');
  });
});

describe('mlro-export', () => {
  const fakeResult = {
    ok: true,
    partial: false,
    narrative: sectionText,
    sections: { FINDINGS: 'No confirmed hits.' },
    stepResults: [{ modeId: 'data' as MlroModeId, text: sectionText, ok: true, partial: false, elapsedMs: 14 }],
    audit: [{ seq: 1, modeId: 'data' as MlroModeId, at: '2026-04-22T06:00:00Z', elapsedMs: 14, ok: true, partial: false, chars: 123, prevHash: '00000000', entryHash: 'deadbeef' }],
    charterGate: { allowed: true, tippingOffMatches: 0, structuralIssues: [] },
    totalElapsedMs: 14,
    budgetMs: 25000,
  };

  it('produces valid JSON', () => {
    const env = exportResult(fakeResult as never, { caseId: 'HWK-01F-20260422-ABC12', subjectName: 'Al Test', format: 'json' });
    expect(env.mimeType).toBe('application/json');
    expect(() => JSON.parse(env.content)).not.toThrow();
  });

  it('produces Markdown with the case id and subject', () => {
    const env = exportResult(fakeResult as never, { caseId: 'HWK-01F-20260422-ABC12', subjectName: 'Al Test', format: 'markdown' });
    expect(env.content).toMatch(/HWK-01F-20260422-ABC12/);
    expect(env.content).toMatch(/Al Test/);
    expect(env.content).toMatch(/## Audit chain/);
  });

  it('produces self-contained HTML', () => {
    const env = exportResult(fakeResult as never, { caseId: 'HWK-01F-20260422-ABC12', subjectName: 'Al Test', format: 'html' });
    expect(env.content).toMatch(/<!doctype html>/);
    expect(env.content).toMatch(/Deep-Reasoning result/);
    expect(env.content).toMatch(/deadbeef/);
  });
});
