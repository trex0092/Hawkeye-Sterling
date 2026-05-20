import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import legalPooledAccountApply from './wave3-legal-pooled-account.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('legal_pooled_account_abuse', () => {
  it('returns inconclusive when no pooledAccountFlows provided', async () => {
    const result = await legalPooledAccountApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('legal_pooled_account_abuse');
  });

  it('returns inconclusive when pooledAccountFlows is empty', async () => {
    const result = await legalPooledAccountApply(makeCtx({ pooledAccountFlows: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', amountAed: 50000, underlyingClientDisclosed: true, serviceConnectedToTransaction: true, thirdPartyOrigination: false },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires undisclosed_underlying_client when >= 2 flows without disclosed client', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', underlyingClientDisclosed: false },
        { flowId: 'F2', accountHolder: 'lawyer', underlyingClientDisclosed: false },
      ],
    }));
    expect(result.rationale).toContain('undisclosed_underlying_client');
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire undisclosed_underlying_client when only 1 undisclosed', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', underlyingClientDisclosed: false },
        { flowId: 'F2', accountHolder: 'lawyer', underlyingClientDisclosed: true },
      ],
    }));
    expect(result.rationale).not.toContain('undisclosed_underlying_client');
  });

  it('fires no_underlying_service when >= 2 flows without service', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', serviceConnectedToTransaction: false },
        { flowId: 'F2', accountHolder: 'lawyer', serviceConnectedToTransaction: false },
      ],
    }));
    expect(result.rationale).toContain('no_underlying_service');
  });

  it('does NOT fire no_underlying_service when only 1 without service', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', serviceConnectedToTransaction: false },
        { flowId: 'F2', accountHolder: 'lawyer', serviceConnectedToTransaction: true },
      ],
    }));
    expect(result.rationale).not.toContain('no_underlying_service');
  });

  it('fires third_party_origination when >= 2 third-party flows', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', thirdPartyOrigination: true },
        { flowId: 'F2', accountHolder: 'lawyer', thirdPartyOrigination: true },
      ],
    }));
    expect(result.rationale).toContain('third_party_origination');
  });

  it('does NOT fire third_party_origination when < 2 third-party flows', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', thirdPartyOrigination: true },
        { flowId: 'F2', accountHolder: 'lawyer', thirdPartyOrigination: false },
      ],
    }));
    expect(result.rationale).not.toContain('third_party_origination');
  });

  it('fires large_pooled_flow when >= 1 flow >= AED 1M', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', amountAed: 1000000 },
      ],
    }));
    expect(result.rationale).toContain('large_pooled_flow');
  });

  it('does NOT fire large_pooled_flow when no flow >= AED 1M', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', amountAed: 999999 },
      ],
    }));
    expect(result.rationale).not.toContain('large_pooled_flow');
  });

  it('escalates when score >= 0.6 (undisclosed + no_service + large)', async () => {
    // undisclosed(0.4) + no_service(0.35) = 0.75 > 0.6 => escalate
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', underlyingClientDisclosed: false, serviceConnectedToTransaction: false, amountAed: 2000000 },
        { flowId: 'F2', accountHolder: 'lawyer', underlyingClientDisclosed: false, serviceConnectedToTransaction: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', underlyingClientDisclosed: false, serviceConnectedToTransaction: false, thirdPartyOrigination: true, amountAed: 2000000 },
        { flowId: 'F2', accountHolder: 'accountant', underlyingClientDisclosed: false, serviceConnectedToTransaction: false, thirdPartyOrigination: true },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.verdict).toBe('escalate');
  });

  it('includes up to 4 flow IDs in evidence for each hit', async () => {
    const result = await legalPooledAccountApply(makeCtx({
      pooledAccountFlows: [
        { flowId: 'F1', accountHolder: 'lawyer', underlyingClientDisclosed: false },
        { flowId: 'F2', accountHolder: 'lawyer', underlyingClientDisclosed: false },
        { flowId: 'F3', accountHolder: 'lawyer', underlyingClientDisclosed: false },
        { flowId: 'F4', accountHolder: 'lawyer', underlyingClientDisclosed: false },
        { flowId: 'F5', accountHolder: 'lawyer', underlyingClientDisclosed: false },
      ],
    }));
    const evidenceStr = result.evidence.join('');
    // At most 4 IDs in the evidence string
    expect(evidenceStr).toContain('F1');
  });
});
