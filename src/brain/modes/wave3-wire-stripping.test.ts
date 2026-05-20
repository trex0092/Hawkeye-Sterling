import { describe, expect, it } from 'vitest';
import wireStrippingApply from './wave3-wire-stripping.js';
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

describe('wave3-wire-stripping', () => {
  it('returns inconclusive when no wires', async () => {
    const r = await wireStrippingApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('wire_stripping_indicator');
  });

  it('returns inconclusive when wires is empty', async () => {
    const r = await wireStrippingApply(makeCtx({ wires: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when all wire info complete and few intermediaries', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{
        wireId: 'w1',
        originatorName: 'Alice Corp',
        originatorAccount: 'ACC001',
        beneficiaryName: 'Bob Inc',
        beneficiaryAccount: 'ACC002',
        intermediaryBanks: ['BANK1', 'BANK2'],
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags missing_originator when originatorName is missing', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1', originatorAccount: 'ACC001', beneficiaryName: 'Bob', beneficiaryAccount: 'ACC002' }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.evidence[0]).toContain('w1');
  });

  it('flags missing_originator when originatorAccount is missing', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1', originatorName: 'Alice', beneficiaryName: 'Bob', beneficiaryAccount: 'ACC002' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags missing_beneficiary when beneficiaryName is missing', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1', originatorName: 'Alice', originatorAccount: 'ACC001', beneficiaryAccount: 'ACC002' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags missing_beneficiary when beneficiaryAccount is missing', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1', originatorName: 'Alice', originatorAccount: 'ACC001', beneficiaryName: 'Bob' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags missing_originator and missing_beneficiary together', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1' }],
    }));
    // Both originator and beneficiary missing → 0.3 + 0.3 = 0.6
    expect(r.score).toBe(0.6);
    expect(r.verdict).toBe('escalate');
  });

  it('flags long_intermediary_chain when >= 3 intermediary banks', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{
        wireId: 'w1',
        originatorName: 'Alice',
        originatorAccount: 'ACC001',
        beneficiaryName: 'Bob',
        beneficiaryAccount: 'ACC002',
        intermediaryBanks: ['B1', 'B2', 'B3'],
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag long_intermediary_chain when < 3 banks', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{
        wireId: 'w1',
        originatorName: 'Alice',
        originatorAccount: 'ACC001',
        beneficiaryName: 'Bob',
        beneficiaryAccount: 'ACC002',
        intermediaryBanks: ['B1', 'B2'],
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('handles missing intermediaryBanks gracefully (defaults to empty)', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{
        wireId: 'w1',
        originatorName: 'Alice',
        originatorAccount: 'ACC001',
        beneficiaryName: 'Bob',
        beneficiaryAccount: 'ACC002',
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates when combined score >= 0.6', async () => {
    // missing_originator(0.3) + missing_beneficiary(0.3) = 0.6 → escalate
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1' }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags when score 0.3-0.59', async () => {
    // only missing_originator(0.3) = 0.3 → flag
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'w1', beneficiaryName: 'Bob', beneficiaryAccount: 'ACC002' }],
    }));
    expect(r.verdict).toBe('flag');
    expect(r.score).toBe(0.3);
  });

  it('compresses score > 0.7', async () => {
    // missing_orig(0.3) + missing_ben(0.3) + long_chain(0.2) = 0.8 → compressed
    const r = await wireStrippingApply(makeCtx({
      wires: [{
        wireId: 'w1',
        intermediaryBanks: ['B1', 'B2', 'B3'],
      }],
    }));
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.score).toBeLessThan(1);
  });

  it('handles multiple wires', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [
        { wireId: 'w1', originatorName: 'Alice', originatorAccount: 'A', beneficiaryName: 'Bob', beneficiaryAccount: 'B' },
        { wireId: 'w2' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.evidence.length).toBeGreaterThan(1);
  });

  it('includes evidence with originator/beneficiary presence indicators', async () => {
    const r = await wireStrippingApply(makeCtx({
      wires: [{ wireId: 'testWire', originatorAccount: 'ACC001' }],
    }));
    // missing originator (name missing) → evidence includes w/name=n acct=y
    expect(r.evidence[0]).toContain('testWire');
    expect(r.evidence[0]).toContain('name=n');
  });
});
