import { describe, expect, it } from 'vitest';
import reShellOwnerCheckApply from './wave3-re-shell-owner.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-re-shell-owner', () => {
  it('returns inconclusive when no realEstateShellOwnerPurchases', async () => {
    const r = await reShellOwnerCheckApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('re_shell_owner_check');
  });

  it('returns inconclusive when array is empty', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({ realEstateShellOwnerPurchases: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear for individual buyer with no signals', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'individual',
        uboDisclosed: true,
        isOffshoreJurisdiction: false,
        hasNomineeIndicators: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates no_ubo_disclosed for corporate buyer without UBO', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'corporate',
        uboDisclosed: false,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates no_ubo_disclosed for trust buyer without UBO', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'trust',
        uboDisclosed: false,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates no_ubo_disclosed for foundation buyer without UBO', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'foundation',
        uboDisclosed: false,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag no_ubo for individual buyer even if uboDisclosed=false', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'individual',
        uboDisclosed: false,
      }],
    }));
    // individual is not corpish
    expect(r.verdict).toBe('clear');
  });

  it('flags offshore_corp_buyer for corporate in offshore jurisdiction', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'corporate',
        uboDisclosed: true,
        isOffshoreJurisdiction: true,
        buyerJurisdiction: 'KY',
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('escalates nominee_signals', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        buyerType: 'individual',
        hasNomineeIndicators: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags fresh_registered_office when registeredOfficeAge < 90', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        registeredOfficeAge: 30,
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag fresh_registered_office when >= 90 days', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        registeredOfficeAge: 90,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag fresh_registered_office when registeredOfficeAge is undefined', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{ txnId: 't1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags fragmented_ownership when uboCount > 5', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        uboCount: 6,
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag fragmented_ownership when uboCount = 5', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{
        txnId: 't1',
        uboCount: 5,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag fragmented_ownership when uboCount undefined', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{ txnId: 't1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('uses (unidentified) when txnId missing', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [{ buyerType: 'corporate', uboDisclosed: false }],
    }));
    expect(r.evidence[0]).toBe('(unidentified)');
  });

  it('handles multiple purchases', async () => {
    const r = await reShellOwnerCheckApply(makeCtx({
      realEstateShellOwnerPurchases: [
        { txnId: 't1', buyerType: 'corporate', uboDisclosed: false },
        { txnId: 't2', hasNomineeIndicators: true },
      ],
    }));
    expect(r.verdict).toBe('escalate');
    expect(r.evidence.length).toBeGreaterThan(1);
  });
});
