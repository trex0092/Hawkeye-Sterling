import { describe, expect, it } from 'vitest';
import flagOfConvenienceApply from './wave3-flag-of-convenience.js';
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

describe('wave3-flag-of-convenience', () => {
  it('returns inconclusive when no vesselRegistrations supplied', async () => {
    const r = await flagOfConvenienceApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('flag_of_convenience');
  });

  it('returns inconclusive when vesselRegistrations is empty', async () => {
    const r = await flagOfConvenienceApply(makeCtx({ vesselRegistrations: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when vessel has no red flags', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO1234567',
        currentFlag: 'GB',
        flagHistory: [],
        ownerJurisdiction: 'GB',
        operatorJurisdiction: 'GB',
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags foc_registration when vessel is registered under ITF FoC flag (PA)', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_PA',
        currentFlag: 'PA',
        ownerJurisdiction: 'PA',
        operatorJurisdiction: 'PA',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags foc_registration for lowercase flag (case insensitive)', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_LR',
        currentFlag: 'lr', // Liberia lowercase
        ownerJurisdiction: 'lr',
        operatorJurisdiction: 'lr',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag foc when currentFlag is not in FoC list', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_DE',
        currentFlag: 'DE',
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag foc when currentFlag is empty string', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_NO_FLAG',
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when vessel has >= 3 flag changes in 24 months', async () => {
    const now = new Date();
    const within24mo = (monthsAgo: number) => new Date(now.getTime() - monthsAgo * 30 * 86400000).toISOString();
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_REFLAG',
        currentFlag: 'DE',
        flagHistory: [
          { flag: 'PA', from: within24mo(20) },
          { flag: 'LR', from: within24mo(16) },
          { flag: 'MH', from: within24mo(12) },
        ],
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags multiple_reflagging when >= 2 but < 3 flag changes in 24 months', async () => {
    const now = new Date();
    const within24mo = (monthsAgo: number) => new Date(now.getTime() - monthsAgo * 30 * 86400000).toISOString();
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_REFLAG2',
        currentFlag: 'DE',
        flagHistory: [
          { flag: 'PA', from: within24mo(20) },
          { flag: 'LR', from: within24mo(16) },
        ],
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag reflagging when changes are outside 24 month window', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_OLD',
        currentFlag: 'DE',
        flagHistory: [
          { flag: 'PA', from: '2000-01-01T00:00:00Z' }, // well outside 24 months
          { flag: 'LR', from: '2001-06-01T00:00:00Z' },
          { flag: 'MH', from: '2002-01-01T00:00:00Z' },
        ],
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    // All flag changes are outside the 24-month window
    expect(r.score).toBe(0);
  });

  it('does not flag reflagging when flagHistory is empty', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_EMPTY_HIST',
        currentFlag: 'DE',
        flagHistory: [],
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('handles flagHistory entries with no from field', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_NO_FROM',
        currentFlag: 'DE',
        flagHistory: [
          { flag: 'PA' }, // no from → NaN
          { flag: 'LR' },
          { flag: 'MH' },
        ],
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    // from is undefined → Date.parse(undefined) = NaN → isNaN → filtered out
    expect(r.score).toBe(0);
  });

  it('flags jurisdiction_mismatch when owner/operator differs from flag', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_MISMATCH',
        currentFlag: 'MH',
        ownerJurisdiction: 'HK',
        operatorJurisdiction: 'SG',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag jurisdiction_mismatch when owner matches flag', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_MATCH_OWNER',
        currentFlag: 'MH',
        ownerJurisdiction: 'MH',
        operatorJurisdiction: 'SG',
      }],
    }));
    // owner === flag → no mismatch
    expect(r.score).toBeGreaterThan(0); // foc_registration may fire (MH is FoC)
    const hasMismatch = r.evidence.some((e) => e.includes('mismatch'));
    expect(hasMismatch).toBe(false);
  });

  it('does not flag jurisdiction_mismatch when operator matches flag', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_MATCH_OP',
        currentFlag: 'DE',
        ownerJurisdiction: 'HK',
        operatorJurisdiction: 'DE',
      }],
    }));
    // op === flag → no mismatch
    expect(r.score).toBe(0);
  });

  it('does not flag jurisdiction_mismatch when flag is empty', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_NOFLAG',
        ownerJurisdiction: 'HK',
        operatorJurisdiction: 'SG',
      }],
    }));
    // flag is '' → condition: flag && (owner || op) → false → no mismatch
    expect(r.score).toBe(0);
  });

  it('does not flag jurisdiction_mismatch when both owner and operator are empty', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_NOJURIS',
        currentFlag: 'DE',
      }],
    }));
    // owner = '', op = '' → (owner || op) = '' → falsy → no mismatch
    expect(r.score).toBe(0);
  });

  it('uses (unknown IMO) as ref when imo is missing', async () => {
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        currentFlag: 'PA',
        ownerJurisdiction: 'DE',
        operatorJurisdiction: 'DE',
      }],
    }));
    expect(r.evidence).toContain('(unknown IMO)');
  });

  it('accumulates multiple signals', async () => {
    const now = new Date();
    const within24mo = (monthsAgo: number) => new Date(now.getTime() - monthsAgo * 30 * 86400000).toISOString();
    const r = await flagOfConvenienceApply(makeCtx({
      vesselRegistrations: [{
        imo: 'IMO_COMBO',
        currentFlag: 'PA', // foc_registration (0.3)
        flagHistory: [
          { flag: 'LR', from: within24mo(20) },
          { flag: 'MH', from: within24mo(16) },
          { flag: 'VC', from: within24mo(12) },
        ], // frequent_reflagging (0.45)
        ownerJurisdiction: 'CN',
        operatorJurisdiction: 'RU',
        // jurisdiction_mismatch: PA != CN and PA != RU → flag (0.2)
      }],
    }));
    // foc (0.3) + frequent_reflagging (0.45) + mismatch (0.2) = 0.95 → escalate
    expect(r.verdict).toBe('escalate');
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
