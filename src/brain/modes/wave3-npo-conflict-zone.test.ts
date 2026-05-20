import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import npoConflictZoneFlowApply from './wave3-npo-conflict-zone.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('npo_conflict_zone_flow', () => {
  it('returns inconclusive when no npoDisbursements provided', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('npo_conflict_zone_flow');
  });

  it('returns inconclusive when npoDisbursements is empty', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({ npoDisbursements: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when disbursement is not to conflict zone', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'US', channel: 'wire', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires conflict_zone when disbursement is to conflict zone (AF)', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'AF', channel: 'wire', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
    expect(result.evidence).toContain('D1');
  });

  it('fires conflict_zone for various conflict zones (SY, YE, IQ)', async () => {
    for (const country of ['SY', 'YE', 'IQ']) {
      const result = await npoConflictZoneFlowApply(makeCtx({
        npoDisbursements: [
          { disbursementId: 'D1', recipientCountry: country, channel: 'wire', hasFieldVerification: true, approvedByMlro: true },
        ],
      }));
      expect(result.score).toBeGreaterThan(0);
    }
  });

  it('fires conflict_zone_high_risk_channel when conflict zone + cash_courier', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'SY', channel: 'cash_courier', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires conflict_zone_high_risk_channel for hawala channel', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'AF', channel: 'hawala', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires conflict_zone_high_risk_channel for crypto channel', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'YE', channel: 'crypto', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('does NOT fire high_risk_channel for wire channel in conflict zone', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'AF', channel: 'wire', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    // only conflict_zone (0.3), not high_risk_channel => verdict flag (escalate comes from high_risk signals)
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire high_risk_channel when channel is undefined', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'AF', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    // only conflict_zone (0.3), => flag
    expect(result.verdict).toBe('flag');
  });

  it('fires no_field_verification when conflict zone + hasFieldVerification false', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'SO', channel: 'wire', hasFieldVerification: false, approvedByMlro: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire no_field_verification for non-conflict zone', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'US', channel: 'wire', hasFieldVerification: false },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('fires no_mlro_approval when conflict zone + approvedByMlro false', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'SD', channel: 'wire', hasFieldVerification: true, approvedByMlro: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('handles case-insensitive country codes', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'sy', channel: 'wire', hasFieldVerification: true, approvedByMlro: true },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('uses unidentified fallback when disbursementId is missing', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { recipientCountry: 'AF', channel: 'wire', hasFieldVerification: false, approvedByMlro: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('handles empty recipientCountry gracefully', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', channel: 'wire', hasFieldVerification: false },
      ],
    }));
    // Empty string not in CONFLICT_ZONES
    expect(result.rationale).not.toContain('conflict_zone');
    expect(result.verdict).toBe('clear');
  });

  it('confidence increases with hits', async () => {
    const result = await npoConflictZoneFlowApply(makeCtx({
      npoDisbursements: [
        { disbursementId: 'D1', recipientCountry: 'AF', channel: 'hawala', hasFieldVerification: false, approvedByMlro: false },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
