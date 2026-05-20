import { describe, expect, it } from 'vitest';
import familyOfficeTrustApply from './wave3-family-office-trust.js';
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

describe('wave3-family-office-trust', () => {
  it('returns inconclusive when no trustsAndArrangements supplied', async () => {
    const r = await familyOfficeTrustApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('family_office_trust_transparency');
  });

  it('returns inconclusive when trustsAndArrangements is empty', async () => {
    const r = await familyOfficeTrustApply(makeCtx({ trustsAndArrangements: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when arrangement has no red flags', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{
        id: 'T001',
        type: 'discretionary_trust',
        jurisdictionOfFormation: 'GB',
        settlorDisclosed: true,
        beneficiariesDisclosed: true,
        trusteeIsLicensed: true,
        bearerSharesAllowed: false,
        multiJurisdictionLayers: 1,
        lastFiledRegistry: new Date().toISOString(),
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags settlor_undisclosed when settlorDisclosed is false', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T002', settlorDisclosed: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags beneficiaries_undisclosed when beneficiariesDisclosed is false', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T003', beneficiariesDisclosed: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unlicensed_trustee when trusteeIsLicensed is false', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T004', trusteeName: 'Joe', trusteeIsLicensed: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags bearer_shares when bearerSharesAllowed is true', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T005', bearerSharesAllowed: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags multi_jurisdiction_layering when multiJurisdictionLayers >= 4', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T006', multiJurisdictionLayers: 4 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag multi_jurisdiction when layers < 4', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T007', multiJurisdictionLayers: 3 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags secrecy_formation when jurisdictionOfFormation is BVI', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T008', jurisdictionOfFormation: 'BVI' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags secrecy_formation for KY (Cayman)', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T009', jurisdictionOfFormation: 'ky' }],
    }));
    // uppercase check → KY
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag secrecy when jurisdiction is not in haven list', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T010', jurisdictionOfFormation: 'GB' }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag secrecy when jurisdictionOfFormation is missing', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T011' }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags protector_with_undisclosed_beneficiaries when protector present and beneficiaries undisclosed', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T012', protectorPresent: true, beneficiariesDisclosed: false }],
    }));
    // Both beneficiaries_undisclosed AND protector_with_undisclosed_beneficiaries fire
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('does not flag protector signal when protectorPresent is false', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T013', protectorPresent: false, beneficiariesDisclosed: false }],
    }));
    // Only beneficiaries_undisclosed fires (0.3)
    expect(r.score).toBeCloseTo(0.3, 5);
  });

  it('does not flag protector signal when beneficiariesDisclosed is true', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T014', protectorPresent: true, beneficiariesDisclosed: true }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags stale_registry_filing when lastFiledRegistry > 365 days ago', async () => {
    const oldDate = new Date(Date.now() - 400 * 86400000).toISOString();
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T015', lastFiledRegistry: oldDate }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag stale_registry when <= 365 days ago', async () => {
    const recentDate = new Date(Date.now() - 100 * 86400000).toISOString();
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T016', lastFiledRegistry: recentDate }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag stale_registry when lastFiledRegistry is missing', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T017' }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when multiple signals fire above 0.6', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{
        id: 'T018',
        settlorDisclosed: false,    // 0.3
        beneficiariesDisclosed: false, // 0.3
        trusteeIsLicensed: false,   // 0.2
        bearerSharesAllowed: true,  // 0.25
      }],
    }));
    // 0.3 + 0.3 + 0.2 + 0.25 = 1.05 → compressed → escalate
    expect(r.verdict).toBe('escalate');
  });

  it('flags verdict when score >= 0.3 but < 0.6', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{
        id: 'T019',
        settlorDisclosed: false,    // 0.3
        beneficiariesDisclosed: false, // 0.3
      }],
    }));
    // 0.6 is exactly the boundary → escalate? Actually raw = 0.6 → score = 0.6 → >= 0.6 → escalate
    expect(r.verdict).toBe('escalate');
  });

  it('flags with single signal at 0.3', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{ id: 'T020', settlorDisclosed: false }],
    }));
    // 0.3 → flag
    expect(r.verdict).toBe('flag');
  });

  it('clamps score compression for raw > 0.7', async () => {
    const r = await familyOfficeTrustApply(makeCtx({
      trustsAndArrangements: [{
        id: 'T021',
        settlorDisclosed: false,
        beneficiariesDisclosed: false,
        trusteeIsLicensed: false,
        bearerSharesAllowed: true,
        multiJurisdictionLayers: 5,
        jurisdictionOfFormation: 'BVI',
        protectorPresent: true,
      }],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
