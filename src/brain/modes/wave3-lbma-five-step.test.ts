import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import lbmaFiveStepGateApply from './wave3-lbma-five-step.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

const THIS_YEAR = new Date().getFullYear().toString();

describe('lbma_five_step_gate', () => {
  it('returns inconclusive when no lbmaCompliance provided', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('lbma_five_step_gate');
  });

  it('returns inconclusive when lbmaCompliance is empty', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({ lbmaCompliance: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when all 5 steps complete', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: '2023',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires step1_incomplete with flag severity when step1 is not complete', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: '2023',
          step1_managementSystems: { complete: false },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    // step1 is not audit => flag severity; only flag signals => flag verdict
    expect(result.verdict).toBe('flag');
  });

  it('fires step4_incomplete with escalate severity when step4 is not complete', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: '2023',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: false },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('escalate');
  });

  it('fires step4_major_findings when audit outcome is major_findings', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'major_findings' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire step4_major_findings when outcome is minor_findings', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: '2023',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'minor_findings' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.rationale).not.toContain('step4_major_findings');
  });

  it('fires majority_incomplete when completeCount < 3', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          step1_managementSystems: { complete: false },
          step2_riskIdentification: { complete: false },
          step3_riskMitigation: { complete: false },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('escalate');
  });

  it('does NOT fire majority_incomplete when completeCount >= 3', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: '2023',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: false },
          step5_publicReport: { complete: false },
        },
      ],
    }));
    expect(result.rationale).not.toContain('majority_incomplete');
  });

  it('fires year_end_gap when incomplete and reportingYear is current year', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: THIS_YEAR,
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: false },
        },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire year_end_gap for previous year', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: '2022',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: false },
        },
      ],
    }));
    expect(result.rationale).not.toContain('year_end_gap');
  });

  it('does NOT fire year_end_gap when all steps complete', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          reportingYear: THIS_YEAR,
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.rationale).not.toContain('year_end_gap');
  });

  it('handles undefined step objects (all incomplete)', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [{ refinerId: 'R1' }],
    }));
    // All 5 steps are undefined/incomplete => all 5 fired
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('uses unidentified fallback when refinerId is missing', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          step1_managementSystems: { complete: false },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: true },
        },
      ],
    }));
    expect(result.modeId).toBe('lbma_five_step_gate');
  });

  it('confidence increases with hits', async () => {
    const result = await lbmaFiveStepGateApply(makeCtx({
      lbmaCompliance: [
        {
          refinerId: 'R1',
          step1_managementSystems: { complete: false },
          step4_independentAudit: { complete: false },
        },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
