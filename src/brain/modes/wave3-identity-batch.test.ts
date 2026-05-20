import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import { IDENTITY_BATCH_APPLIES } from './wave3-identity-batch.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

// ── synthetic_identity_indicator ──────────────────────────────────────────────

describe('synthetic_identity_indicator', () => {
  const apply = IDENTITY_BATCH_APPLIES['synthetic_identity_indicator']!;

  it('returns inconclusive when no syntheticIdSignals provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.modeId).toBe('synthetic_identity_indicator');
  });

  it('returns clear when items present but no signals fire', async () => {
    const result = await apply(makeCtx({
      syntheticIdSignals: [
        { customerId: 'C1', creditFileAgeDays: 365, ssnEmiratesIdAge: 5, nameDobMixedSourceMatch: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires thin_file_old_id when creditFileAgeDays <= 90 and ssnEmiratesIdAge >= 10', async () => {
    const result = await apply(makeCtx({
      syntheticIdSignals: [
        { customerId: 'C1', creditFileAgeDays: 80, ssnEmiratesIdAge: 12 },
      ],
    }));
    expect(result.rationale).toContain('thin_file_old_id');
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire thin_file_old_id when creditFileAgeDays > 90', async () => {
    const result = await apply(makeCtx({
      syntheticIdSignals: [
        { customerId: 'C1', creditFileAgeDays: 91, ssnEmiratesIdAge: 12 },
      ],
    }));
    expect(result.rationale).not.toContain('thin_file_old_id');
  });

  it('does NOT fire thin_file_old_id when ssnEmiratesIdAge < 10', async () => {
    const result = await apply(makeCtx({
      syntheticIdSignals: [
        { customerId: 'C1', creditFileAgeDays: 30, ssnEmiratesIdAge: 5 },
      ],
    }));
    expect(result.rationale).not.toContain('thin_file_old_id');
  });

  it('fires name_dob_mismatch when nameDobMixedSourceMatch is false', async () => {
    const result = await apply(makeCtx({
      syntheticIdSignals: [
        { customerId: 'C1', nameDobMixedSourceMatch: false },
      ],
    }));
    expect(result.rationale).toContain('name_dob_mismatch');
  });

  it('escalates when score >= 0.6', async () => {
    // thin_file_old_id(0.4) + name_dob_mismatch(0.35) = 0.75 => escalate
    const result = await apply(makeCtx({
      syntheticIdSignals: [
        { customerId: 'C1', creditFileAgeDays: 30, ssnEmiratesIdAge: 15, nameDobMixedSourceMatch: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });
});

// ── id_document_deepfake ──────────────────────────────────────────────────────

describe('id_document_deepfake', () => {
  const apply = IDENTITY_BATCH_APPLIES['id_document_deepfake']!;

  it('returns inconclusive when no docChecks provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('id_document_deepfake');
  });

  it('returns clear when no signals fire', async () => {
    const result = await apply(makeCtx({
      docChecks: [
        { docId: 'D1', deepfakeScore: 0.1, livenessScore: 0.9, ocrConfidence: 0.9 },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('fires deepfake_score when deepfakeScore >= 0.5', async () => {
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', deepfakeScore: 0.5 }],
    }));
    expect(result.rationale).toContain('deepfake_score');
  });

  it('does NOT fire deepfake_score when < 0.5', async () => {
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', deepfakeScore: 0.4 }],
    }));
    expect(result.rationale).not.toContain('deepfake_score');
  });

  it('fires low_liveness when livenessScore <= 0.4', async () => {
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', livenessScore: 0.3 }],
    }));
    expect(result.rationale).toContain('low_liveness');
  });

  it('does NOT fire low_liveness when livenessScore > 0.4', async () => {
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', livenessScore: 0.5 }],
    }));
    expect(result.rationale).not.toContain('low_liveness');
  });

  it('fires low_ocr_conf when ocrConfidence <= 0.5', async () => {
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', ocrConfidence: 0.4 }],
    }));
    expect(result.rationale).toContain('low_ocr_conf');
  });

  it('does NOT fire low_ocr_conf when ocrConfidence > 0.5', async () => {
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', ocrConfidence: 0.8 }],
    }));
    expect(result.rationale).not.toContain('low_ocr_conf');
  });

  it('escalates when multiple signals fire', async () => {
    // deepfake(0.45) + low_liveness(0.3) = 0.75 => escalate
    const result = await apply(makeCtx({
      docChecks: [{ docId: 'D1', deepfakeScore: 0.8, livenessScore: 0.2 }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});

// ── address_aggregation_red_flag ──────────────────────────────────────────────

describe('address_aggregation_red_flag', () => {
  const apply = IDENTITY_BATCH_APPLIES['address_aggregation_red_flag']!;

  it('returns inconclusive when no addressClusters provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('address_aggregation_red_flag');
  });

  it('fires address_aggregation when uniqueCustomers >= 5', async () => {
    const result = await apply(makeCtx({
      addressClusters: [{ addressKey: 'addr1', uniqueCustomers: 5 }],
    }));
    expect(result.rationale).toContain('address_aggregation');
  });

  it('does NOT fire address_aggregation when uniqueCustomers < 5', async () => {
    const result = await apply(makeCtx({
      addressClusters: [{ addressKey: 'addr1', uniqueCustomers: 4 }],
    }));
    expect(result.rationale).not.toContain('address_aggregation');
  });

  it('fires shared_devices when sharedDevicesCount >= 3', async () => {
    const result = await apply(makeCtx({
      addressClusters: [{ addressKey: 'addr1', sharedDevicesCount: 3 }],
    }));
    expect(result.rationale).toContain('shared_devices');
  });

  it('does NOT fire shared_devices when count < 3', async () => {
    const result = await apply(makeCtx({
      addressClusters: [{ addressKey: 'addr1', sharedDevicesCount: 2 }],
    }));
    expect(result.rationale).not.toContain('shared_devices');
  });

  it('escalates with both signals', async () => {
    // address_aggregation(0.4) + shared_devices(0.3) = 0.7 => score >= 0.6 escalate
    const result = await apply(makeCtx({
      addressClusters: [{ addressKey: 'addr1', uniqueCustomers: 10, sharedDevicesCount: 5 }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});

// ── multi_account_same_device ─────────────────────────────────────────────────

describe('multi_account_same_device', () => {
  const apply = IDENTITY_BATCH_APPLIES['multi_account_same_device']!;

  it('returns inconclusive when no deviceClusters provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('multi_account_same_device');
  });

  it('fires multi_account_device when accountCount >= 3', async () => {
    const result = await apply(makeCtx({
      deviceClusters: [{ deviceFingerprint: 'FP1', accountCount: 3 }],
    }));
    expect(result.rationale).toContain('multi_account_device');
  });

  it('does NOT fire multi_account_device when < 3 accounts', async () => {
    const result = await apply(makeCtx({
      deviceClusters: [{ deviceFingerprint: 'FP1', accountCount: 2 }],
    }));
    expect(result.rationale).not.toContain('multi_account_device');
  });

  it('fires ip_velocity when ipChangesPerHour >= 10', async () => {
    const result = await apply(makeCtx({
      deviceClusters: [{ deviceFingerprint: 'FP1', ipChangesPerHour: 10 }],
    }));
    expect(result.rationale).toContain('ip_velocity');
  });

  it('does NOT fire ip_velocity when < 10', async () => {
    const result = await apply(makeCtx({
      deviceClusters: [{ deviceFingerprint: 'FP1', ipChangesPerHour: 9 }],
    }));
    expect(result.rationale).not.toContain('ip_velocity');
  });

  it('escalates with both signals', async () => {
    const result = await apply(makeCtx({
      deviceClusters: [{ deviceFingerprint: 'FP1', accountCount: 5, ipChangesPerHour: 15 }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});

// ── disposable_email_signal ───────────────────────────────────────────────────

describe('disposable_email_signal', () => {
  const apply = IDENTITY_BATCH_APPLIES['disposable_email_signal']!;

  it('returns inconclusive when no emailSignals provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('disposable_email_signal');
  });

  it('fires disposable_domain when isDisposable is true', async () => {
    const result = await apply(makeCtx({
      emailSignals: [{ customerId: 'C1', emailDomain: 'temp.com', isDisposable: true }],
    }));
    expect(result.rationale).toContain('disposable_domain');
  });

  it('does NOT fire disposable_domain when isDisposable is false', async () => {
    const result = await apply(makeCtx({
      emailSignals: [{ customerId: 'C1', emailDomain: 'gmail.com', isDisposable: false }],
    }));
    expect(result.rationale).not.toContain('disposable_domain');
  });

  it('fires fresh_email when ageDays <= 7', async () => {
    const result = await apply(makeCtx({
      emailSignals: [{ customerId: 'C1', emailDomain: 'gmail.com', ageDays: 5 }],
    }));
    expect(result.rationale).toContain('fresh_email');
  });

  it('does NOT fire fresh_email when ageDays > 7', async () => {
    const result = await apply(makeCtx({
      emailSignals: [{ customerId: 'C1', emailDomain: 'gmail.com', ageDays: 8 }],
    }));
    expect(result.rationale).not.toContain('fresh_email');
  });

  it('escalates with disposable + fresh email', async () => {
    // disposable(0.35) + fresh(0.25) = 0.6 => escalate
    const result = await apply(makeCtx({
      emailSignals: [{ customerId: 'C1', emailDomain: 'temp.com', isDisposable: true, ageDays: 3 }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});

// ── voip_phone_anomaly ────────────────────────────────────────────────────────

describe('voip_phone_anomaly', () => {
  const apply = IDENTITY_BATCH_APPLIES['voip_phone_anomaly']!;

  it('returns inconclusive when no phoneSignals provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('voip_phone_anomaly');
  });

  it('fires voip_phone when phoneType is voip', async () => {
    const result = await apply(makeCtx({
      phoneSignals: [{ customerId: 'C1', phoneType: 'voip', carrier: 'Skype' }],
    }));
    expect(result.rationale).toContain('voip_phone');
  });

  it('does NOT fire voip_phone for mobile', async () => {
    const result = await apply(makeCtx({
      phoneSignals: [{ customerId: 'C1', phoneType: 'mobile' }],
    }));
    expect(result.rationale).not.toContain('voip_phone');
  });

  it('fires frequent_porting when portedCount >= 3', async () => {
    const result = await apply(makeCtx({
      phoneSignals: [{ customerId: 'C1', portedCount: 3 }],
    }));
    expect(result.rationale).toContain('frequent_porting');
  });

  it('does NOT fire frequent_porting when portedCount < 3', async () => {
    const result = await apply(makeCtx({
      phoneSignals: [{ customerId: 'C1', portedCount: 2 }],
    }));
    expect(result.rationale).not.toContain('frequent_porting');
  });

  it('handles undefined carrier gracefully', async () => {
    const result = await apply(makeCtx({
      phoneSignals: [{ customerId: 'C1', phoneType: 'voip' }],
    }));
    expect(result.rationale).toContain('voip_phone');
  });
});

// ── sim_swap_indicator ────────────────────────────────────────────────────────

describe('sim_swap_indicator', () => {
  const apply = IDENTITY_BATCH_APPLIES['sim_swap_indicator']!;

  it('returns inconclusive when no simSwapSignals provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('sim_swap_indicator');
  });

  it('fires sim_swap_then_transfer when simSwapWithin72h + large transfer', async () => {
    const result = await apply(makeCtx({
      simSwapSignals: [{ customerId: 'C1', simSwapWithin72h: true, subsequentLargeTransferAed: 50000 }],
    }));
    expect(result.rationale).toContain('sim_swap_then_transfer');
  });

  it('does NOT fire sim_swap_then_transfer when transfer < 50000', async () => {
    const result = await apply(makeCtx({
      simSwapSignals: [{ customerId: 'C1', simSwapWithin72h: true, subsequentLargeTransferAed: 49999 }],
    }));
    expect(result.rationale).not.toContain('sim_swap_then_transfer');
  });

  it('does NOT fire sim_swap_then_transfer when simSwapWithin72h is false', async () => {
    const result = await apply(makeCtx({
      simSwapSignals: [{ customerId: 'C1', simSwapWithin72h: false, subsequentLargeTransferAed: 100000 }],
    }));
    expect(result.rationale).not.toContain('sim_swap_then_transfer');
  });

  it('fires sim_and_device when both SIM and device changed within 72h', async () => {
    const result = await apply(makeCtx({
      simSwapSignals: [{ customerId: 'C1', simSwapWithin72h: true, deviceChangeWithin72h: true, subsequentLargeTransferAed: 10000 }],
    }));
    expect(result.rationale).toContain('sim_and_device');
  });

  it('does NOT fire sim_and_device when deviceChangeWithin72h is false', async () => {
    const result = await apply(makeCtx({
      simSwapSignals: [{ customerId: 'C1', simSwapWithin72h: true, deviceChangeWithin72h: false }],
    }));
    expect(result.rationale).not.toContain('sim_and_device');
  });

  it('escalates with sim_swap_then_transfer signal', async () => {
    const result = await apply(makeCtx({
      simSwapSignals: [{ customerId: 'C1', simSwapWithin72h: true, subsequentLargeTransferAed: 100000, deviceChangeWithin72h: true }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});

// ── velocity_account_creation ─────────────────────────────────────────────────

describe('velocity_account_creation', () => {
  const apply = IDENTITY_BATCH_APPLIES['velocity_account_creation']!;

  it('returns inconclusive when no accountVelocity provided', async () => {
    const result = await apply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.modeId).toBe('velocity_account_creation');
  });

  it('fires mass_creation when accountsCreatedLast24h >= 10', async () => {
    const result = await apply(makeCtx({
      accountVelocity: [{ tenantId: 'T1', accountsCreatedLast24h: 10 }],
    }));
    expect(result.rationale).toContain('mass_creation');
  });

  it('does NOT fire mass_creation when < 10', async () => {
    const result = await apply(makeCtx({
      accountVelocity: [{ tenantId: 'T1', accountsCreatedLast24h: 9 }],
    }));
    expect(result.rationale).not.toContain('mass_creation');
  });

  it('fires same_ip_range when sameIpRange true and accountsCreatedLast24h >= 5', async () => {
    const result = await apply(makeCtx({
      accountVelocity: [{ tenantId: 'T1', sameIpRange: true, accountsCreatedLast24h: 5 }],
    }));
    expect(result.rationale).toContain('same_ip_range');
  });

  it('does NOT fire same_ip_range when accountsCreatedLast24h < 5', async () => {
    const result = await apply(makeCtx({
      accountVelocity: [{ tenantId: 'T1', sameIpRange: true, accountsCreatedLast24h: 4 }],
    }));
    expect(result.rationale).not.toContain('same_ip_range');
  });

  it('does NOT fire same_ip_range when sameIpRange is false', async () => {
    const result = await apply(makeCtx({
      accountVelocity: [{ tenantId: 'T1', sameIpRange: false, accountsCreatedLast24h: 10 }],
    }));
    expect(result.rationale).not.toContain('same_ip_range');
  });

  it('escalates with both signals', async () => {
    // mass_creation(0.4) + same_ip_range(0.3) = 0.7 => escalate
    const result = await apply(makeCtx({
      accountVelocity: [{ tenantId: 'T1', accountsCreatedLast24h: 15, sameIpRange: true }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});
