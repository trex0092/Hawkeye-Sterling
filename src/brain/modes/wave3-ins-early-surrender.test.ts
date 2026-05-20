import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import insEarlySurrenderCashApply from './wave3-ins-early-surrender.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ins_early_surrender_cash', () => {
  it('returns inconclusive when no policySurrenders provided', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ins_early_surrender_cash');
  });

  it('returns inconclusive when policySurrenders is empty', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({ policySurrenders: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire (old policy, no issues)', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 1000, payoutMethod: 'wire', payoutToThirdParty: false, policyType: 'whole_life' },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires surrender_under_6mo when policyAgeDays < 180', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 100, payoutMethod: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires surrender_under_1y when policyAgeDays >= 180 and < 365', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 200, payoutMethod: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire early surrender signals when policyAgeDays >= 365', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 400, payoutMethod: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('surrender_under_1y');
    expect(result.rationale).not.toContain('surrender_under_6mo');
  });

  it('fires surrender_despite_penalty when age < 365 and penalty >= 10%', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 200, premiumPaidAed: 100000, surrenderPenaltyAed: 10001, payoutMethod: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire surrender_despite_penalty when penalty < 10%', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 200, premiumPaidAed: 100000, surrenderPenaltyAed: 5000, payoutMethod: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('surrender_despite_penalty');
  });

  it('does NOT fire surrender_despite_penalty when premiumPaidAed is 0', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 200, premiumPaidAed: 0, surrenderPenaltyAed: 10000, payoutMethod: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('surrender_despite_penalty');
  });

  it('fires third_party_payout when payoutToThirdParty is true', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 1000, payoutToThirdParty: true, payoutMethod: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires high_risk_payout_channel when payoutMethod is cash', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 1000, payoutMethod: 'cash' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('fires high_risk_payout_channel when payoutMethod is crypto', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 1000, payoutMethod: 'crypto' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire high_risk_payout_channel for wire or cheque', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 1000, payoutMethod: 'cheque' },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_payout_channel');
  });

  it('fires ulip_early_surrender for unit_linked policy under 1 year', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 200, policyType: 'unit_linked', payoutMethod: 'wire' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire ulip_early_surrender for non unit_linked policy', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 200, policyType: 'whole_life', payoutMethod: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('ulip_early_surrender');
  });

  it('does NOT fire ulip_early_surrender for unit_linked policy >= 365 days', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 400, policyType: 'unit_linked', payoutMethod: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('ulip_early_surrender');
  });

  it('uses MAX_SAFE_INTEGER for undefined policyAgeDays', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', payoutMethod: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('uses unidentified fallback for policyId', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { payoutToThirdParty: true, payoutMethod: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('confidence increases with multiple hits', async () => {
    const result = await insEarlySurrenderCashApply(makeCtx({
      policySurrenders: [
        { policyId: 'P1', policyAgeDays: 50, payoutToThirdParty: true, payoutMethod: 'cash', policyType: 'unit_linked' },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
