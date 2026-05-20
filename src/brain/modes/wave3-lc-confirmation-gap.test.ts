import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import lcConfirmationGapApply from './wave3-lc-confirmation-gap.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('lc_confirmation_gap', () => {
  it('returns inconclusive when no letterOfCreditTransactions provided', async () => {
    const result = await lcConfirmationGapApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('lc_confirmation_gap');
  });

  it('returns inconclusive when letterOfCreditTransactions is empty', async () => {
    const result = await lcConfirmationGapApply(makeCtx({ letterOfCreditTransactions: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when LC is confirmed and low value', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', confirmingBank: 'HSBC', amountUsd: 100000, uCpVersion: 'UCP600' },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires unconfirmed_high_value when unconfirmed and amount >= 5_000_000', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', amountUsd: 5000000 }, // no confirmingBank => unconfirmed
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires unconfirmed_flag_value when unconfirmed and 1_000_000 <= amount < 5_000_000', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', amountUsd: 2000000 }, // no confirmingBank => unconfirmed
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire value signals when LC is confirmed', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', confirmingBank: 'HSBC', amountUsd: 5000000 },
      ],
    }));
    expect(result.rationale).not.toContain('unconfirmed_high_value');
    expect(result.rationale).not.toContain('unconfirmed_flag_value');
  });

  it('does NOT fire value signals when amount < 1_000_000', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', amountUsd: 500000 }, // unconfirmed, but below flag threshold
      ],
    }));
    expect(result.rationale).not.toContain('unconfirmed_high_value');
    expect(result.rationale).not.toContain('unconfirmed_flag_value');
  });

  it('fires high_risk_issuer_unconfirmed when issuing bank from high-risk country and unconfirmed', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', issuingBankCountry: 'IR', amountUsd: 100000 }, // unconfirmed + IR is high-risk
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire high_risk_issuer when LC is confirmed', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', issuingBankCountry: 'IR', confirmingBank: 'HSBC', amountUsd: 100000 },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_issuer_unconfirmed');
  });

  it('does NOT fire high_risk_issuer for low-risk country', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', issuingBankCountry: 'US', amountUsd: 100000 },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_issuer_unconfirmed');
  });

  it('does NOT fire high_risk_issuer when issuingBankCountry is undefined', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', amountUsd: 100000 },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_issuer_unconfirmed');
  });

  it('fires obsolete_ucp when uCpVersion is not UCP600', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', confirmingBank: 'HSBC', uCpVersion: 'UCP500', amountUsd: 100000 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('fires obsolete_ucp when uCpVersion is other', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', confirmingBank: 'HSBC', uCpVersion: 'other', amountUsd: 100000 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire obsolete_ucp when uCpVersion is undefined', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', confirmingBank: 'HSBC', amountUsd: 100000 },
      ],
    }));
    expect(result.rationale).not.toContain('obsolete_ucp');
  });

  it('handles high-risk country case-insensitively', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', issuingBankCountry: 'kp', amountUsd: 100000 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('uses unidentified fallback when lcId is missing', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { amountUsd: 5000000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('confidence increases with hits', async () => {
    const result = await lcConfirmationGapApply(makeCtx({
      letterOfCreditTransactions: [
        { lcId: 'LC1', issuingBankCountry: 'IR', amountUsd: 5000000, uCpVersion: 'UCP500' },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
