import { describe, expect, it } from 'vitest';
import correspondentNestingApply from './wave3-correspondent-nesting.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-correspondent-nesting', () => {
  it('returns inconclusive when no correspondentRelationships supplied', async () => {
    const r = await correspondentNestingApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('correspondent_banking_nesting');
  });

  it('returns inconclusive when correspondentRelationships is empty', async () => {
    const r = await correspondentNestingApply(makeCtx({ correspondentRelationships: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BICAAUS33',
        respondentBic: 'BICBGB22',
        respondentJurisdictionIso2: 'GB',
        respondentServicesDownstreamBanks: false,
        walkThroughAccount: false,
        respondentHasShellCharacteristics: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags nested_correspondent when respondentServicesDownstreamBanks is true', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC1',
        respondentBic: 'BIC2',
        respondentServicesDownstreamBanks: true,
        downstreamBankCount: 5,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags walk_through_account when walkThroughAccount is true', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC3',
        respondentBic: 'BIC4',
        walkThroughAccount: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags shell_respondent when respondentHasShellCharacteristics is true', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC5',
        respondentBic: 'BIC6',
        respondentHasShellCharacteristics: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high_risk_respondent_jurisdiction when respondent is in IR', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC7',
        respondentBic: 'BIC8',
        respondentJurisdictionIso2: 'IR',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high_risk_respondent_jurisdiction when respondent is in KP', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC9',
        respondentBic: 'BIC10',
        respondentJurisdictionIso2: 'KP',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high_risk jurisdiction for lowercase iso2 (case insensitive)', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC11',
        respondentBic: 'BIC12',
        respondentJurisdictionIso2: 'mm', // Myanmar → high risk
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag jurisdiction when not in high-risk list', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC13',
        respondentBic: 'BIC14',
        respondentJurisdictionIso2: 'US',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag jurisdiction when respondentJurisdictionIso2 is missing', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC15',
        respondentBic: 'BIC16',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when multiple signals fire', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC17',
        respondentBic: 'BIC18',
        respondentServicesDownstreamBanks: true,
        downstreamBankCount: 10,
        walkThroughAccount: true,
        respondentHasShellCharacteristics: true,
        respondentJurisdictionIso2: 'AF',
      }],
    }));
    // 0.4 + 0.45 + 0.35 + 0.25 = 1.45 → clamped, score > 0.6 → escalate
    expect(r.verdict).toBe('escalate');
  });

  it('flags verdict when score >= 0.3 but < 0.6', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [{
        correspondentBic: 'BIC19',
        respondentBic: 'BIC20',
        respondentServicesDownstreamBanks: true,
        downstreamBankCount: 2,
      }],
    }));
    // 0.4 → flag
    expect(r.verdict).toBe('flag');
  });

  it('clamps score compression for raw > 0.7', async () => {
    const r = await correspondentNestingApply(makeCtx({
      correspondentRelationships: [
        {
          correspondentBic: 'BIC21',
          respondentBic: 'BIC22',
          respondentServicesDownstreamBanks: true,
          walkThroughAccount: true,
          respondentHasShellCharacteristics: true,
          respondentJurisdictionIso2: 'IR',
        },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
