import { describe, expect, it } from 'vitest';
import cargoManifestCrossCheckApply from './wave3-cargo-manifest-cross-check.js';
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

describe('wave3-cargo-manifest-cross-check', () => {
  it('returns inconclusive when no cargoManifests supplied', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('cargo_manifest_cross_check');
  });

  it('returns inconclusive when cargoManifests is empty', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({ cargoManifests: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags orphan_manifest when no matching invoice found', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M001', blNumber: 'BL001', hsCode: '8471', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [], // no matching invoice
    }));
    expect(r.evidence).toContain('M001');
    expect(r.verdict).toBe('flag');
  });

  it('flags orphan_manifest when blNumber is missing', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M002', hsCode: '8471' }],
      invoices: [{ invoiceId: 'I001', blReference: 'BL999' }],
    }));
    // blNumber is undefined → inv = undefined → orphan
    expect(r.evidence).toContain('M002');
  });

  it('returns clear when manifest matches invoice with no discrepancies', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M003', blNumber: 'BL003', hsCode: '8471', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I003', blReference: 'BL003', hsCode: '8471', weightKg: 100, valueUsd: 10000 }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags hs_mismatch when hsCode differs', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M004', blNumber: 'BL004', hsCode: '8471', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I004', blReference: 'BL004', hsCode: '9999', weightKg: 100, valueUsd: 10000 }],
    }));
    expect(r.verdict).toBe('flag');
    expect(r.evidence).toContain('M004');
  });

  it('does not flag hs_mismatch when either hsCode is missing', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M005', blNumber: 'BL005', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I005', blReference: 'BL005', weightKg: 100, valueUsd: 10000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags weight_flag when weight difference is >= 10% but < 25%', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M006', blNumber: 'BL006', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I006', blReference: 'BL006', weightKg: 88, valueUsd: 10000 }],
    }));
    // diff = |100-88|/100 = 12% → flag
    expect(r.verdict).toBe('flag');
  });

  it('escalates when weight difference >= 25%', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M007', blNumber: 'BL007', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I007', blReference: 'BL007', weightKg: 70, valueUsd: 10000 }],
    }));
    // diff = 30/100 = 30% → escalate
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag weight when diff < 10%', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M008', blNumber: 'BL008', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I008', blReference: 'BL008', weightKg: 95, valueUsd: 10000 }],
    }));
    // diff = 5/100 = 5% < 10%
    expect(r.verdict).toBe('clear');
  });

  it('flags value_flag when value difference >= 15% but < 50%', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M009', blNumber: 'BL009', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I009', blReference: 'BL009', weightKg: 100, valueUsd: 8000 }],
    }));
    // diff = 2000/10000 = 20% → flag
    expect(r.verdict).toBe('flag');
  });

  it('escalates when value difference >= 50%', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M010', blNumber: 'BL010', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I010', blReference: 'BL010', weightKg: 100, valueUsd: 4000 }],
    }));
    // diff = 6000/10000 = 60% → escalate
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag value when diff < 15%', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M011', blNumber: 'BL011', declaredWeightKg: 100, declaredValueUsd: 10000 }],
      invoices: [{ invoiceId: 'I011', blReference: 'BL011', weightKg: 100, valueUsd: 9500 }],
    }));
    // diff = 500/10000 = 5% < 15%
    expect(r.verdict).toBe('clear');
  });

  it('handles invoices with no blReference gracefully', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M012', blNumber: 'BL012' }],
      invoices: [{ invoiceId: 'I012' }], // no blReference → not indexed
    }));
    // manifest blNumber = BL012, inv not found → orphan
    expect(r.verdict).toBe('flag');
  });

  it('accumulates multiple signals correctly', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [
        { manifestId: 'M013', blNumber: 'BL013', hsCode: '8471', declaredWeightKg: 100, declaredValueUsd: 10000 },
        { manifestId: 'M014', blNumber: 'BL014', hsCode: '1234', declaredWeightKg: 100, declaredValueUsd: 5000 },
      ],
      invoices: [
        { invoiceId: 'I013', blReference: 'BL013', hsCode: '9999', weightKg: 50, valueUsd: 3000 },
        // BL014 → orphan
      ],
    }));
    // M013: hs_mismatch + weight_escalate (50%) + value_escalate (70%)
    // M014: orphan
    expect(r.verdict).toBe('escalate');
  });

  it('uses blNumber as ref when manifestId is missing', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ blNumber: 'BL-REF' }],
      invoices: [],
    }));
    expect(r.evidence).toContain('BL-REF');
  });

  it('uses (unidentified) as ref when both ids missing', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{}],
      invoices: [],
    }));
    expect(r.evidence).toContain('(unidentified)');
  });

  it('works with no invoices key at all', async () => {
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M015', blNumber: 'BL015' }],
    }));
    // invoices defaults to [] → orphan
    expect(r.verdict).toBe('flag');
  });

  it('pctDiff uses max(|a|, |b|, 1) as denominator', async () => {
    // When both values are 0, pctDiff(0, 0) = 0/1 = 0 → no diff
    const r = await cargoManifestCrossCheckApply(makeCtx({
      cargoManifests: [{ manifestId: 'M016', blNumber: 'BL016', declaredWeightKg: 0, declaredValueUsd: 0 }],
      invoices: [{ invoiceId: 'I016', blReference: 'BL016', weightKg: 0, valueUsd: 0 }],
    }));
    expect(r.verdict).toBe('clear');
  });
});
