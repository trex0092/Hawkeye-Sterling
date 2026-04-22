import { describe, expect, it } from 'vitest';
import {
  cognitiveBiasAuditApply, confidenceCalibrationApply,
  popperFalsificationApply, sourceTriangulationApply,
  triangulationApply, occamVsConspiracyApply,
} from '../modes/meta.js';
import type { BrainContext, Finding } from '../types.js';

function makeCtx(priorFindings: Finding[] = []): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: {},
    priorFindings,
    domains: ['cdd', 'sanctions'],
  };
}

function pf(partial: Partial<Finding> & { modeId: string }): Finding {
  return {
    modeId: partial.modeId,
    category: partial.category ?? 'logic',
    faculties: partial.faculties ?? ['reasoning'],
    score: partial.score ?? 0.5,
    confidence: partial.confidence ?? 0.7,
    verdict: partial.verdict ?? 'flag',
    rationale: partial.rationale ?? 'evidence observed',
    evidence: partial.evidence ?? [],
    producedAt: Date.now(),
    tags: partial.tags,
  };
}

describe('meta — cognitive_bias_audit', () => {
  it('flags loaded framing language', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', rationale: 'Subject is obviously sanctioned', score: 0.8 }),
      pf({ modeId: 'b', rationale: 'Clearly suspicious activity', score: 0.7 }),
      pf({ modeId: 'c', rationale: 'routine pattern', score: 0.3 }),
    ];
    const out = await cognitiveBiasAuditApply(makeCtx(priors));
    expect(out.verdict).toBe('flag');
    expect(out.rationale).toMatch(/framing/);
    expect(out.tags).toContain('meta');
  });

  it('passes clean when no biases present', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', rationale: 'observed sanctions list entry', score: 0.6, evidence: ['sanctions_list:un-1'] }),
      pf({ modeId: 'b', rationale: 'no PEP match', score: 0.2, verdict: 'clear', evidence: ['pep_list:neg'] }),
      pf({ modeId: 'c', rationale: 'adverse media hit via Reuters', score: 0.4, evidence: ['news_article:reu-1'] }),
    ];
    const out = await cognitiveBiasAuditApply(makeCtx(priors));
    expect(out.verdict).toBe('clear');
  });
});

describe('meta — confidence_calibration', () => {
  it('flags over-confidence when evidence is thin', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', confidence: 0.95, evidence: [] }),
      pf({ modeId: 'b', confidence: 0.9, evidence: [] }),
    ];
    const out = await confidenceCalibrationApply(makeCtx(priors));
    expect(out.verdict).toBe('flag');
    expect(out.rationale).toMatch(/over-confidence/i);
  });
});

describe('meta — popper_falsification', () => {
  it('flags when no falsification attempted', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', score: 0.9, verdict: 'escalate' }),
      pf({ modeId: 'b', score: 0.85, verdict: 'escalate' }),
    ];
    const out = await popperFalsificationApply(makeCtx(priors));
    expect(out.verdict).toBe('flag');
    expect(out.rationale).toMatch(/No falsification/);
  });

  it('passes when steelman or dissent present', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', score: 0.9 }),
      pf({ modeId: 'steelman', score: 0.1, verdict: 'clear', tags: ['counterexample'] }),
    ];
    const out = await popperFalsificationApply(makeCtx(priors));
    expect(out.verdict).toBe('clear');
  });
});

describe('meta — source_triangulation', () => {
  it('flags un-triangulated high-score finding', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', score: 0.8, evidence: ['news_article:1', 'news_article:2'] }),
    ];
    const out = await sourceTriangulationApply(makeCtx(priors));
    expect(out.verdict).toBe('flag');
  });

  it('passes when high-score claim has two kinds', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', score: 0.8, evidence: ['news_article:1', 'court_filing:2'] }),
    ];
    const out = await sourceTriangulationApply(makeCtx(priors));
    expect(out.verdict).toBe('clear');
  });
});

describe('meta — triangulation', () => {
  it('flags narrow faculty coverage', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', faculties: ['reasoning'], evidence: ['news_article:1'] }),
    ];
    const out = await triangulationApply(makeCtx(priors));
    expect(out.verdict).toBe('flag');
  });
});

describe('meta — occam_vs_conspiracy', () => {
  it('flags conjunction-heavy narrative', async () => {
    const priors: Finding[] = [
      pf({
        modeId: 'a',
        rationale:
          'The subject is suspicious and also linked and furthermore involved, additionally and moreover noted, besides other flags, assuming the ownership is concealed, unless disclosed.',
        score: 0.8,
      }),
    ];
    const out = await occamVsConspiracyApply(makeCtx(priors));
    expect(out.verdict).toBe('flag');
  });

  it('passes parsimonious narrative', async () => {
    const priors: Finding[] = [
      pf({ modeId: 'a', rationale: 'One sanctions hit observed.', score: 0.7 }),
    ];
    const out = await occamVsConspiracyApply(makeCtx(priors));
    expect(out.verdict).toBe('clear');
  });
});
