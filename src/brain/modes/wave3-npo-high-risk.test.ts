import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import npoHighRiskApply from './wave3-npo-high-risk.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('npo_high_risk_outflow', () => {
  it('returns inconclusive when no npoFlows provided', async () => {
    const result = await npoHighRiskApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('npo_high_risk_outflow');
  });

  it('returns inconclusive when npoFlows is empty', async () => {
    const result = await npoHighRiskApply(makeCtx({ npoFlows: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'US', hasFieldOversight: true, recipientIsRegistered: true, cashDelivery: false },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires high_tf_jurisdiction when >= 1 flow to high-TF-risk country', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'SY', hasFieldOversight: true, recipientIsRegistered: true },
      ],
    }));
    expect(result.rationale).toContain('high_tf_jurisdiction');
    expect(result.verdict).toBe('flag');
  });

  it('fires high_tf_jurisdiction for all high-risk countries', async () => {
    const countries = ['SY', 'YE', 'AF', 'SO', 'IQ', 'LY', 'PK', 'SD'];
    for (const country of countries) {
      const result = await npoHighRiskApply(makeCtx({
        npoFlows: [
          { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: country },
        ],
      }));
      expect(result.rationale).toContain('high_tf_jurisdiction');
    }
  });

  it('does NOT fire high_tf_jurisdiction for low-risk country', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'US', hasFieldOversight: true },
      ],
    }));
    expect(result.rationale).not.toContain('high_tf_jurisdiction');
  });

  it('handles case-insensitive country code', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'sy' },
      ],
    }));
    expect(result.rationale).toContain('high_tf_jurisdiction');
  });

  it('does NOT fire when recipientCountryIso2 is undefined', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1' },
      ],
    }));
    expect(result.rationale).not.toContain('high_tf_jurisdiction');
  });

  it('fires no_field_oversight when >= 2 flows without field oversight', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', hasFieldOversight: false },
        { flowId: 'F2', npoEntityId: 'NPO1', hasFieldOversight: false },
      ],
    }));
    expect(result.rationale).toContain('no_field_oversight');
  });

  it('does NOT fire no_field_oversight when < 2 flows without oversight', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', hasFieldOversight: false },
        { flowId: 'F2', npoEntityId: 'NPO1', hasFieldOversight: true },
      ],
    }));
    expect(result.rationale).not.toContain('no_field_oversight');
  });

  it('fires cash_delivery when >= 2 cash-delivered flows', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', cashDelivery: true },
        { flowId: 'F2', npoEntityId: 'NPO1', cashDelivery: true },
      ],
    }));
    expect(result.rationale).toContain('cash_delivery');
  });

  it('does NOT fire cash_delivery when < 2 cash flows', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', cashDelivery: true },
        { flowId: 'F2', npoEntityId: 'NPO1', cashDelivery: false },
      ],
    }));
    expect(result.rationale).not.toContain('cash_delivery');
  });

  it('fires unregistered_recipient when >= 1 flow to unregistered recipient', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientIsRegistered: false },
      ],
    }));
    expect(result.rationale).toContain('unregistered_recipient');
  });

  it('does NOT fire unregistered_recipient when all registered', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientIsRegistered: true },
      ],
    }));
    expect(result.rationale).not.toContain('unregistered_recipient');
  });

  it('escalates when score >= 0.6 with multiple signals', async () => {
    // high_tf(0.35) + no_oversight(0.25) + cash_delivery(0.3) = 0.9 > 0.7 with DR => escalate
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'SY', hasFieldOversight: false, cashDelivery: true, recipientIsRegistered: false },
        { flowId: 'F2', npoEntityId: 'NPO1', recipientCountryIso2: 'YE', hasFieldOversight: false, cashDelivery: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'SY', hasFieldOversight: false, cashDelivery: true, recipientIsRegistered: false },
        { flowId: 'F2', npoEntityId: 'NPO1', recipientCountryIso2: 'AF', hasFieldOversight: false, cashDelivery: true },
        { flowId: 'F3', npoEntityId: 'NPO1', recipientCountryIso2: 'YE', recipientIsRegistered: false },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('includes flow IDs with country in evidence for high_tf_jurisdiction', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'FLOW001', npoEntityId: 'NPO1', recipientCountryIso2: 'AF' },
      ],
    }));
    expect(result.evidence[0]).toContain('FLOW001');
    expect(result.evidence[0]).toContain('AF');
  });

  it('confidence increases with hits', async () => {
    const result = await npoHighRiskApply(makeCtx({
      npoFlows: [
        { flowId: 'F1', npoEntityId: 'NPO1', recipientCountryIso2: 'SY', hasFieldOversight: false, cashDelivery: true },
        { flowId: 'F2', npoEntityId: 'NPO1', cashDelivery: true, hasFieldOversight: false },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
