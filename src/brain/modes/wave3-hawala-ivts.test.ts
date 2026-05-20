import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import hawalaIvtsApply from './wave3-hawala-ivts.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('hawala_ivts_pattern', () => {
  it('returns inconclusive when no corridorFlows provided', async () => {
    const result = await hawalaIvtsApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('hawala_ivts_pattern');
  });

  it('returns inconclusive when corridorFlows is empty array', async () => {
    const result = await hawalaIvtsApply(makeCtx({ corridorFlows: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when flows present but no signals fire', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'US', toCountryIso2: 'GB', channel: 'wire', bookkeepingRef: 'REF1', settlementWindowHours: 24 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires cash_heavy when >= 3 cash flows', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'US', toCountryIso2: 'GB', channel: 'cash', bookkeepingRef: 'R1' },
        { fromCountryIso2: 'US', toCountryIso2: 'FR', channel: 'cash', bookkeepingRef: 'R2' },
        { fromCountryIso2: 'US', toCountryIso2: 'DE', channel: 'cash', bookkeepingRef: 'R3' },
      ],
    }));
    expect(result.rationale).toContain('cash_heavy');
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('clear'); // cash_heavy alone = score 0.2, below flag threshold
  });

  it('does NOT fire cash_heavy when only 2 cash flows', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'cash', bookkeepingRef: 'R1' },
        { channel: 'cash', bookkeepingRef: 'R2' },
      ],
    }));
    expect(result.rationale).not.toContain('cash_heavy');
  });

  it('fires explicit_hawala_referral when channel is hawala_referral', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'hawala_referral', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.rationale).toContain('explicit_hawala_referral');
    expect(result.verdict).toBe('flag');
  });

  it('fires missing_bookkeeping when >= 50% of flows missing ref and >= 3 flows', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire' }, // no bookkeepingRef
        { channel: 'wire' }, // no bookkeepingRef
        { channel: 'wire', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.rationale).toContain('missing_bookkeeping');
  });

  it('does NOT fire missing_bookkeeping when < 3 flows even if all missing ref', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire' },
        { channel: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('missing_bookkeeping');
  });

  it('does NOT fire missing_bookkeeping when < 50% flows missing ref (with >= 3 flows)', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire', bookkeepingRef: 'R1' },
        { channel: 'wire', bookkeepingRef: 'R2' },
        { channel: 'wire' }, // only 1/3 missing
      ],
    }));
    expect(result.rationale).not.toContain('missing_bookkeeping');
  });

  it('fires fast_settlement when >= 2 flows with settlementWindowHours <= 4', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire', bookkeepingRef: 'R1', settlementWindowHours: 2 },
        { channel: 'wire', bookkeepingRef: 'R2', settlementWindowHours: 4 },
      ],
    }));
    expect(result.rationale).toContain('fast_settlement');
  });

  it('does NOT fire fast_settlement when only 1 fast flow', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire', bookkeepingRef: 'R1', settlementWindowHours: 2 },
        { channel: 'wire', bookkeepingRef: 'R2', settlementWindowHours: 24 },
      ],
    }));
    expect(result.rationale).not.toContain('fast_settlement');
  });

  it('does NOT fire fast_settlement when settlementWindowHours is undefined', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire', bookkeepingRef: 'R1' },
        { channel: 'wire', bookkeepingRef: 'R2' },
      ],
    }));
    expect(result.rationale).not.toContain('fast_settlement');
  });

  it('fires high_risk_corridor when flow in high-risk corridor (PK-AE)', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'PK', toCountryIso2: 'AE', channel: 'wire', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.rationale).toContain('high_risk_corridor');
  });

  it('fires high_risk_corridor for AF-AE corridor', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'AF', toCountryIso2: 'AE', channel: 'wire', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.rationale).toContain('high_risk_corridor');
  });

  it('does NOT fire high_risk_corridor for low-risk corridor', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'US', toCountryIso2: 'GB', channel: 'wire', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.rationale).not.toContain('high_risk_corridor');
  });

  it('handles missing fromCountryIso2 and toCountryIso2 in corridor construction', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'wire', bookkeepingRef: 'R1' }, // corridor becomes ??-??
      ],
    }));
    expect(result.modeId).toBe('hawala_ivts_pattern');
    expect(result.rationale).not.toContain('high_risk_corridor');
  });

  it('fires agent_concentration when single agent channels >= 4 flows', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R1' },
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R2' },
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R3' },
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R4' },
      ],
    }));
    expect(result.rationale).toContain('agent_concentration');
  });

  it('does NOT fire agent_concentration when agent has only 3 flows', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R1' },
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R2' },
        { agentName: 'AgentX', channel: 'wire', bookkeepingRef: 'R3' },
      ],
    }));
    expect(result.rationale).not.toContain('agent_concentration');
  });

  it('escalates when score >= 0.6 (multiple signals)', async () => {
    // hawala_referral(0.35) + high_risk_corridor(0.25) + missing_bookkeeping(0.25) = 0.85 => escalate
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'PK', toCountryIso2: 'AE', channel: 'hawala_referral' },
        { fromCountryIso2: 'AF', toCountryIso2: 'AE', channel: 'wire' },
        { fromCountryIso2: 'IR', toCountryIso2: 'AE', channel: 'wire' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'PK', toCountryIso2: 'AE', channel: 'hawala_referral', settlementWindowHours: 1 },
        { fromCountryIso2: 'AF', toCountryIso2: 'AE', channel: 'hawala_referral', settlementWindowHours: 2 },
        { fromCountryIso2: 'IR', toCountryIso2: 'AE', channel: 'cash' },
        { fromCountryIso2: 'SO', toCountryIso2: 'AE', channel: 'cash' },
        { fromCountryIso2: 'YE', toCountryIso2: 'AE', channel: 'cash' },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.verdict).toBe('escalate');
  });

  it('confidence increases with hits', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { fromCountryIso2: 'PK', toCountryIso2: 'AE', channel: 'hawala_referral', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('handles crypto channel without triggering cash or hawala signals', async () => {
    const result = await hawalaIvtsApply(makeCtx({
      corridorFlows: [
        { channel: 'crypto', bookkeepingRef: 'R1' },
      ],
    }));
    expect(result.rationale).not.toContain('cash_heavy');
    expect(result.rationale).not.toContain('explicit_hawala_referral');
  });
});
