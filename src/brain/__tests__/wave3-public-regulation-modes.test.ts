// Smoke tests for the 8 wave-3 modes implemented from public UAE/FATF
// regulations (PR feat/wave3-implement-8-modes). Each test exercises:
//   - inconclusive branch when no evidence supplied
//   - clean branch when evidence is benign
//   - flag/escalate branch when threshold breached
// Spec: src/brain/modes/WAVE_3_SPEC_DRAFTS.md
import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import { reCashPurchaseCheckApply } from '../modes/wave3-re-cash-purchase.js';
import { npoGranteeDiligenceApply } from '../modes/wave3-npo-grantee-diligence.js';
import { lcConfirmationGapApply } from '../modes/wave3-lc-confirmation-gap.js';
import { flagOfConvenienceApply } from '../modes/wave3-flag-of-convenience.js';
import { portStateControlApply } from '../modes/wave3-port-state-control.js';
import { oecdAnnexIIDisciplineApply } from '../modes/wave3-oecd-annex-ii.js';
import { lbmaFiveStepGateApply } from '../modes/wave3-lbma-five-step.js';
import { cargoManifestCrossCheckApply } from '../modes/wave3-cargo-manifest-cross-check.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = []): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('wave-3 public-regulation modes', () => {
  describe('re_cash_purchase_check (UAE FDL 10/2025 + CR 134/2025)', () => {
    it('inconclusive on no evidence', async () => {
      const out = await reCashPurchaseCheckApply(makeCtx());
      expect(out.verdict).toBe('inconclusive');
    });
    it('clear on small cash component', async () => {
      const out = await reCashPurchaseCheckApply(makeCtx({
        realEstateTransactions: [{ txnId: 't1', cashComponentAed: 10_000, propertyValueAed: 500_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('flags at AED 55,000 cash threshold', async () => {
      const out = await reCashPurchaseCheckApply(makeCtx({
        realEstateTransactions: [{ txnId: 't1', cashComponentAed: 60_000, propertyValueAed: 500_000 }],
      }));
      expect(['flag', 'escalate']).toContain(out.verdict);
    });
    it('escalates at AED 100,000+ cash', async () => {
      const out = await reCashPurchaseCheckApply(makeCtx({
        realEstateTransactions: [{ txnId: 't1', cashComponentAed: 200_000, propertyValueAed: 500_000 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('npo_grantee_diligence (FATF R.8 + UAE CD 50/2018)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await npoGranteeDiligenceApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear when CDD complete', async () => {
      const out = await npoGranteeDiligenceApply(makeCtx({
        npoGrants: [{ grantId: 'g1', cddCompleted: true, cddDocsRetained: true, amountAed: 5_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on CAHRA grantee with no CDD', async () => {
      const out = await npoGranteeDiligenceApply(makeCtx({
        npoGrants: [{ grantId: 'g1', isCahraJurisdiction: true, cddCompleted: false, amountAed: 50_000 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('lc_confirmation_gap (FATF R.16 + ICC UCP 600)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await lcConfirmationGapApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on small confirmed LC', async () => {
      const out = await lcConfirmationGapApply(makeCtx({
        letterOfCreditTransactions: [{ lcId: 'lc1', amountUsd: 100_000, confirmingBank: 'CITI', uCpVersion: 'UCP600' }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on $5M+ unconfirmed', async () => {
      const out = await lcConfirmationGapApply(makeCtx({
        letterOfCreditTransactions: [{ lcId: 'lc1', amountUsd: 6_000_000 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
    it('escalates on FATF high-risk-issuer unconfirmed', async () => {
      const out = await lcConfirmationGapApply(makeCtx({
        letterOfCreditTransactions: [{ lcId: 'lc1', issuingBankCountry: 'IR', amountUsd: 10_000 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('flag_of_convenience (ITF FoC list + IMO Res A.1117(30))', () => {
    it('inconclusive on no evidence', async () => {
      expect((await flagOfConvenienceApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear for non-FoC, single-flag vessel', async () => {
      const out = await flagOfConvenienceApply(makeCtx({
        vesselRegistrations: [{ imo: '9000001', currentFlag: 'GB', ownerJurisdiction: 'GB', operatorJurisdiction: 'GB', flagHistory: [] }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('flags vessel under FoC flag', async () => {
      const out = await flagOfConvenienceApply(makeCtx({
        vesselRegistrations: [{ imo: '9000002', currentFlag: 'PA', ownerJurisdiction: 'PA', operatorJurisdiction: 'PA' }],
      }));
      expect(['flag', 'escalate']).toContain(out.verdict);
    });
  });

  describe('port_state_control (Paris/Tokyo MoU)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await portStateControlApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on no detentions', async () => {
      const out = await portStateControlApply(makeCtx({
        pscRecords: [{ imo: 'i1', detentions: 0, deficiencies: 2 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on Tier-1 MoU detention', async () => {
      const out = await portStateControlApply(makeCtx({
        pscRecords: [{ imo: 'i1', mou: 'paris', detentions: 1, portCountry: 'NL' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('oecd_annex_ii_discipline (OECD DDG Gold Annex II)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await oecdAnnexIIDisciplineApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('blocks on military-controlled refinery', async () => {
      const out = await oecdAnnexIIDisciplineApply(makeCtx({
        goldSupplyChain: [{ shipmentId: 's1', hasMilitaryControl: true }],
      }));
      expect(out.verdict).toBe('block');
    });
    it('escalates on CAHRA + RMAP-not-enrolled', async () => {
      const out = await oecdAnnexIIDisciplineApply(makeCtx({
        goldSupplyChain: [{ shipmentId: 's1', isCahraOrigin: true, refineryRmapStatus: 'not_enrolled' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('lbma_five_step_gate (LBMA RGG v9)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await lbmaFiveStepGateApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear when all 5 steps complete', async () => {
      const out = await lbmaFiveStepGateApply(makeCtx({
        lbmaCompliance: [{
          refinerId: 'r1',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'conformant' },
          step5_publicReport: { complete: true },
        }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates when audit reports major findings', async () => {
      const out = await lbmaFiveStepGateApply(makeCtx({
        lbmaCompliance: [{
          refinerId: 'r1',
          step1_managementSystems: { complete: true },
          step2_riskIdentification: { complete: true },
          step3_riskMitigation: { complete: true },
          step4_independentAudit: { complete: true, outcome: 'major_findings' },
          step5_publicReport: { complete: true },
        }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('cargo_manifest_cross_check (FATF TBML 2021)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await cargoManifestCrossCheckApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on matching manifest+invoice', async () => {
      const out = await cargoManifestCrossCheckApply(makeCtx({
        cargoManifests: [{ manifestId: 'm1', blNumber: 'BL1', hsCode: '7108', declaredWeightKg: 100, declaredValueUsd: 50_000 }],
        invoices:       [{ invoiceId: 'i1', blReference: 'BL1', hsCode: '7108', weightKg: 100, valueUsd: 50_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on >50% value diff (TBML)', async () => {
      const out = await cargoManifestCrossCheckApply(makeCtx({
        cargoManifests: [{ manifestId: 'm1', blNumber: 'BL1', hsCode: '7108', declaredWeightKg: 100, declaredValueUsd: 50_000 }],
        invoices:       [{ invoiceId: 'i1', blReference: 'BL1', hsCode: '7108', weightKg: 100, valueUsd: 200_000 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });
});
