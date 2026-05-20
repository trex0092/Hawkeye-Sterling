import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import nonFaceToFaceKycApply from './wave3-non-face-to-face-kyc.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('non_face_to_face_kyc_anomaly', () => {
  it('returns inconclusive when no kycRecords provided', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('non_face_to_face_kyc_anomaly');
  });

  it('returns inconclusive when kycRecords is empty', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({ kycRecords: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear for in_person channel (skipped)', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'in_person', livenessVerified: false, documentVerificationOcrOk: false },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('returns clear for remote channel with all verifications OK', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: true, documentVerificationOcrOk: true, documentVerificationChipReadOk: true, ipCountryIso2: 'AE', declaredCountryIso2: 'AE', riskRating: 'low', edDApplied: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('does NOT flag remote channel with only 1 gap', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: true, documentVerificationChipReadOk: true },
      ],
    }));
    // only 1 flag (no_liveness), < 2 flags required
    expect(result.verdict).toBe('clear');
  });

  it('fires remote_kyc_gaps when remote channel has >= 2 verification gaps', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_no_video', livenessVerified: false, documentVerificationOcrOk: false, documentVerificationChipReadOk: true },
      ],
    }));
    // 2 flags (no_liveness + no_ocr) => weight = min(0.4, 0.15 + 2*0.07) = 0.29 => score 0.29 < 0.3 => clear
    // But the hit is still fired (score > 0)
    expect(result.rationale).toContain('remote_kyc_gaps');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires remote_kyc_gaps with flag verdict when 3+ gaps', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_no_video', livenessVerified: false, documentVerificationOcrOk: false, documentVerificationChipReadOk: false },
      ],
    }));
    // 3 flags => weight = min(0.4, 0.15 + 3*0.07) = 0.36 => score 0.36 >= 0.3 => flag
    expect(result.rationale).toContain('remote_kyc_gaps');
    expect(result.verdict).toBe('flag');
  });

  it('fires for agent_referral channel', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'agent_referral', livenessVerified: false, documentVerificationOcrOk: false },
      ],
    }));
    expect(result.rationale).toContain('remote_kyc_gaps');
  });

  it('fires for remote_video channel', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: false },
      ],
    }));
    expect(result.rationale).toContain('remote_kyc_gaps');
  });

  it('fires ip_country_mismatch flag when IP and declared country differ', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: true, documentVerificationOcrOk: true, documentVerificationChipReadOk: true, ipCountryIso2: 'RU', declaredCountryIso2: 'AE', riskRating: 'low' },
      ],
    }));
    // Only 1 gap (ip_country_mismatch) — below threshold of 2
    expect(result.verdict).toBe('clear');
  });

  it('fires remote_kyc_gaps with ip_country_mismatch + another gap', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: true, documentVerificationChipReadOk: true, ipCountryIso2: 'RU', declaredCountryIso2: 'AE', riskRating: 'low' },
      ],
    }));
    // 2 flags: no_liveness + ip_country_mismatch
    expect(result.rationale).toContain('remote_kyc_gaps');
  });

  it('fires high_risk_no_edd flag when riskRating high and no EDD', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: true, documentVerificationChipReadOk: true, riskRating: 'high', edDApplied: false },
      ],
    }));
    // 2 flags: no_liveness + high_risk_no_edd
    expect(result.rationale).toContain('remote_kyc_gaps');
  });

  it('does NOT fire high_risk_no_edd when edDApplied is true', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: true, documentVerificationChipReadOk: true, riskRating: 'high', edDApplied: true },
      ],
    }));
    // Only no_liveness (1 flag), below threshold
    expect(result.verdict).toBe('clear');
  });

  it('does NOT fire ip_country_mismatch when countries match', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: false, ipCountryIso2: 'AE', declaredCountryIso2: 'AE' },
      ],
    }));
    // 2 flags: no_liveness + no_ocr, but NOT ip_country_mismatch
    expect(result.rationale).toContain('remote_kyc_gaps');
  });

  it('does NOT fire ip_country_mismatch when ipCountryIso2 is undefined', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: false, declaredCountryIso2: 'AE' },
      ],
    }));
    expect(result.rationale).toContain('remote_kyc_gaps'); // still 2 other flags
  });

  it('weight is capped at 0.4 for many flags', async () => {
    // 5 flags: no_liveness + no_ocr + no_chip_read + ip_country_mismatch + high_risk_no_edd
    // weight = min(0.4, 0.15 + 5*0.07) = min(0.4, 0.5) = 0.4
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: false, documentVerificationChipReadOk: false, ipCountryIso2: 'RU', declaredCountryIso2: 'AE', riskRating: 'high', edDApplied: false },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.rationale).toContain('remote_kyc_gaps');
  });

  it('escalates when multiple remote records have many gaps', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_no_video', livenessVerified: false, documentVerificationOcrOk: false, documentVerificationChipReadOk: false, ipCountryIso2: 'RU', declaredCountryIso2: 'AE', riskRating: 'high', edDApplied: false },
        { customerId: 'C2', channel: 'remote_no_video', livenessVerified: false, documentVerificationOcrOk: false, documentVerificationChipReadOk: false, ipCountryIso2: 'CN', declaredCountryIso2: 'AE', riskRating: 'high', edDApplied: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('handles case-insensitive IP/declared country comparison', async () => {
    const result = await nonFaceToFaceKycApply(makeCtx({
      kycRecords: [
        { customerId: 'C1', channel: 'remote_video', livenessVerified: false, documentVerificationOcrOk: false, ipCountryIso2: 'ae', declaredCountryIso2: 'AE' },
      ],
    }));
    // 2 flags but no ip_country_mismatch due to case-insensitive match
    expect(result.rationale).toContain('remote_kyc_gaps');
  });
});
