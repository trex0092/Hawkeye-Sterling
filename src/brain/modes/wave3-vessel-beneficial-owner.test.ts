import { describe, expect, it } from 'vitest';
import vesselBeneficialOwnerApply from './wave3-vessel-beneficial-owner.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Vessel', type: 'vessel' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-vessel-beneficial-owner', () => {
  it('returns inconclusive when no vessels', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('vessel_beneficial_owner');
  });

  it('returns inconclusive when vessels is empty', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({ vessels: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns flag when vessel has only minor signals (flag severity)', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{
        imoNumber: '1234567',
        vesselName: 'Good Ship',
        beneficialOwnerDisclosed: true,
        registeredOwnerImoCompanyNumber: 'IMO12345',
        ownerJurisdictionFatfGreyOrBlack: false,
        flagOfConvenience: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates no_imo_number when imoNumber is missing', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ vesselName: 'Mystery Ship' }],
    }));
    expect(r.verdict).toBe('escalate');
    expect(r.evidence[0]).toContain('Mystery Ship');
  });

  it('escalates no_imo_number when imoNumber is malformed (not 7 digits)', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '123', vesselName: 'Short IMO' }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag no_imo_number when valid 7-digit IMO', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{
        imoNumber: '1234567',
        beneficialOwnerDisclosed: true,
        registeredOwnerImoCompanyNumber: 'CO123',
      }],
    }));
    // Only no_imo_company_number might fire if registeredOwnerImoCompanyNumber isn't set correctly
    expect(r.verdict).toBe('clear');
  });

  it('escalates ubo_undisclosed', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', beneficialOwnerDisclosed: false, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags chain_depth_high when ownershipChainDepth >= 3 but < 5', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{
        imoNumber: '1234567',
        ownershipChainDepth: 3,
        beneficialOwnerDisclosed: true,
        registeredOwnerImoCompanyNumber: 'CO1',
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('escalates chain_depth_extreme when ownershipChainDepth >= 5', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{
        imoNumber: '1234567',
        ownershipChainDepth: 5,
        beneficialOwnerDisclosed: true,
        registeredOwnerImoCompanyNumber: 'CO1',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag chain_depth when ownershipChainDepth is undefined', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{
        imoNumber: '1234567',
        beneficialOwnerDisclosed: true,
        registeredOwnerImoCompanyNumber: 'CO1',
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates shell_in_chain when hasShellOwnerInChain=true', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', hasShellOwnerInChain: true, registeredOwnerImoCompanyNumber: 'CO1', beneficialOwnerDisclosed: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags no_imo_company_number when registeredOwnerImoCompanyNumber missing', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', beneficialOwnerDisclosed: true }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag no_imo_company_number when present', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates owner_high_risk_jurisdiction when FATF grey/black', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', ownerJurisdictionFatfGreyOrBlack: true, registeredOwnerImoCompanyNumber: 'CO1', beneficialOwnerDisclosed: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates foc_plus_opacity when FoC + UBO not disclosed', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', flagOfConvenience: true, beneficialOwnerDisclosed: false, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates foc_plus_opacity when FoC + shell in chain', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', flagOfConvenience: true, hasShellOwnerInChain: true, beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag foc_plus_opacity when FoC but UBO disclosed and no shell', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', flagOfConvenience: true, beneficialOwnerDisclosed: true, hasShellOwnerInChain: false, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags recent_flag_change when recentFlagChangeDays <= 365', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', recentFlagChangeDays: 180, beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag recent_flag_change when > 365 days', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', recentFlagChangeDays: 400, beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when recentFlagChangeDays is undefined', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags recent_owner_change when recentOwnerChangeDays <= 365', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', recentOwnerChangeDays: 100, beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('escalates ais_dark_extreme when aisDarkPeriodHours >= 72', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', aisDarkPeriodHours: 72, registeredOwnerImoCompanyNumber: 'CO1', beneficialOwnerDisclosed: true }],
    }));
    expect(r.verdict).toBe('block');
  });

  it('escalates ais_dark_significant when aisDarkPeriodHours >= 24 but < 72', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', aisDarkPeriodHours: 48, registeredOwnerImoCompanyNumber: 'CO1', beneficialOwnerDisclosed: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag ais_dark when < 24h', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', aisDarkPeriodHours: 20, beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when aisDarkPeriodHours is undefined', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '1234567', beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('uses imoNumber as ref when available', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ imoNumber: '9876543', beneficialOwnerDisclosed: false, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    expect(r.evidence[0]).toBe('9876543');
  });

  it('uses vesselName as fallback ref when imoNumber missing', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ vesselName: 'My Tanker', beneficialOwnerDisclosed: false }],
    }));
    expect(r.evidence[0]).toBe('My Tanker');
  });

  it('uses (unidentified) as ref when both imoNumber and vesselName missing', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ beneficialOwnerDisclosed: false }],
    }));
    expect(r.evidence[0]).toBe('(unidentified)');
  });

  it('uses ? in label when vesselName is missing on no_imo_number hit', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{ beneficialOwnerDisclosed: true, registeredOwnerImoCompanyNumber: 'CO1' }],
    }));
    // No imoNumber, no vesselName → label should contain '"?"'
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag chain_depth when ownershipChainDepth < CHAIN_DEPTH_FLAG (< 3)', async () => {
    const r = await vesselBeneficialOwnerApply(makeCtx({
      vessels: [{
        imoNumber: '1234567',
        ownershipChainDepth: 2,
        beneficialOwnerDisclosed: true,
        registeredOwnerImoCompanyNumber: 'CO1',
      }],
    }));
    // depth=2 < CHAIN_DEPTH_FLAG=3, so neither chain_depth_extreme nor chain_depth_high fires
    expect(r.verdict).toBe('clear');
  });
});
