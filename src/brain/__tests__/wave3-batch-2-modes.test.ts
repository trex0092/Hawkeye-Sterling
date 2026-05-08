// Smoke tests for the 10 wave-3 batch-2 modes (PR feat/wave3-implement-batch-2).
// Each test exercises:
//   - inconclusive branch when no evidence supplied
//   - clean branch when evidence is benign
//   - flag/escalate/block branch when threshold breached
// Spec: src/brain/modes/WAVE_3_SPEC_DRAFTS_BATCH_2.md
import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import { reGoldenVisaInvestmentApply } from '../modes/wave3-re-golden-visa.js';
import { reShellOwnerCheckApply } from '../modes/wave3-re-shell-owner.js';
import { npoConflictZoneFlowApply } from '../modes/wave3-npo-conflict-zone.js';
import { npoProgrammeVsCashRatioApply } from '../modes/wave3-npo-programme-vs-cash.js';
import { modernSlaveryIndicatorApply } from '../modes/wave3-modern-slavery.js';
import { childLabourIndicatorApply } from '../modes/wave3-child-labour.js';
import { conflictMineralDocumentationApply } from '../modes/wave3-conflict-mineral-doc.js';
import { chainOfCustodyBreakApply } from '../modes/wave3-chain-of-custody-break.js';
import { assayCertificateAuditApply } from '../modes/wave3-assay-certificate.js';
import { vesselBeneficialOwnerApply } from '../modes/wave3-vessel-beneficial-owner.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = []): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('wave-3 batch-2 modes', () => {
  describe('re_golden_visa_investment (UAE CD 56/2018 + CR 65/2022)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await reGoldenVisaInvestmentApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on legitimate AED 2M+ purchase, no anomaly', async () => {
      const out = await reGoldenVisaInvestmentApply(makeCtx({
        realEstateGoldenVisaPurchases: [{ txnId: 't1', propertyValueAed: 2_500_000, paymentBreakdownAed: { cash: 100_000, mortgage: 2_400_000 } }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on visa application opened with sub-threshold purchase', async () => {
      const out = await reGoldenVisaInvestmentApply(makeCtx({
        realEstateGoldenVisaPurchases: [{ txnId: 't1', propertyValueAed: 800_000, buyerVisaApplicationOpened: true }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('re_shell_owner_check (UAE CD 58/2020 + FATF R.24/R.25)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await reShellOwnerCheckApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on individual buyer', async () => {
      const out = await reShellOwnerCheckApply(makeCtx({
        realEstateShellOwnerPurchases: [{ txnId: 't1', buyerType: 'individual', propertyValueAed: 1_000_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on corporate buyer with no UBO disclosed', async () => {
      const out = await reShellOwnerCheckApply(makeCtx({
        realEstateShellOwnerPurchases: [{ txnId: 't1', buyerType: 'corporate', uboDisclosed: false, isOffshoreJurisdiction: true }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('npo_conflict_zone_flow (FATF R.8 + UN Sanctions + UAE FDL 10/2025)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await npoConflictZoneFlowApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on disbursement to non-conflict country', async () => {
      const out = await npoConflictZoneFlowApply(makeCtx({
        npoDisbursements: [{ disbursementId: 'd1', recipientCountry: 'JP', amountUsd: 5_000, channel: 'wire' }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on conflict-zone disbursement via cash courier', async () => {
      const out = await npoConflictZoneFlowApply(makeCtx({
        npoDisbursements: [{ disbursementId: 'd1', recipientCountry: 'AF', channel: 'cash_courier', hasFieldVerification: false }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('npo_programme_vs_cash_ratio (FATF R.8 + Best-Practice Paper 2015)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await npoProgrammeVsCashRatioApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on healthy programme ratio', async () => {
      const out = await npoProgrammeVsCashRatioApply(makeCtx({
        npoFinancials: [{
          npoId: 'n1', reportingYear: '2024',
          totalRevenueAed: 1_000_000,
          programmeExpenditureAed: 800_000,
          administrativeExpenditureAed: 100_000,
          fundraisingExpenditureAed: 50_000,
          cashOnHandAed: 200_000,
          hasAuditedAccounts: true,
          auditOpinion: 'unqualified',
        }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on programme ratio < 50% + adverse audit', async () => {
      const out = await npoProgrammeVsCashRatioApply(makeCtx({
        npoFinancials: [{
          npoId: 'n1',
          totalRevenueAed: 1_000_000,
          programmeExpenditureAed: 100_000,
          administrativeExpenditureAed: 200_000,
          fundraisingExpenditureAed: 100_000,
          auditOpinion: 'adverse',
        }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('modern_slavery_indicator (UK MSA 2015 + ILO + TIP)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await modernSlaveryIndicatorApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on benign supplier', async () => {
      const out = await modernSlaveryIndicatorApply(makeCtx({
        supplyChainSuppliers: [{ supplierId: 's1', sector: 'software', jurisdiction: 'GB', ilo_forcedLabour_indicators: 0 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates at 5+ ILO indicators', async () => {
      const out = await modernSlaveryIndicatorApply(makeCtx({
        supplyChainSuppliers: [{ supplierId: 's1', ilo_forcedLabour_indicators: 6 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
    it('escalates on high-risk sector + TIP-Tier-3 jurisdiction', async () => {
      const out = await modernSlaveryIndicatorApply(makeCtx({
        supplyChainSuppliers: [{ supplierId: 's1', sector: 'cotton', jurisdiction: 'CN' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('child_labour_indicator (ILO C138 + C182 + TVPRA)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await childLabourIndicatorApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on adult-only supplier', async () => {
      const out = await childLabourIndicatorApply(makeCtx({
        childLabourSuppliers: [{ supplierId: 's1', minAgeOfWorkers: 18, sector: 'software' }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('blocks on workers below ILO absolute minimum age', async () => {
      const out = await childLabourIndicatorApply(makeCtx({
        childLabourSuppliers: [{ supplierId: 's1', minAgeOfWorkers: 12 }],
      }));
      expect(out.verdict).toBe('block');
    });
    it('escalates on TVPRA sector with no audit', async () => {
      const out = await childLabourIndicatorApply(makeCtx({
        childLabourSuppliers: [{ supplierId: 's1', sector: 'cocoa', hasIndependentAudit: false }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('conflict_mineral_documentation (Dodd-Frank §1502 + EU 2017/821 + OECD)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await conflictMineralDocumentationApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on fully-documented batch', async () => {
      const out = await conflictMineralDocumentationApply(makeCtx({
        conflictMineralBatches: [{
          batchId: 'b1', mineral: 'gold', countryOfOrigin: 'AU',
          smelterRmapStatus: 'conformant',
          hasOriginCertificate: true, hasChainOfCustodyDocs: true,
          hasSection1502Filing: true, hasEuImporterDueDiligence: true,
        }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on CAHRA origin + RMAP-not-enrolled smelter', async () => {
      const out = await conflictMineralDocumentationApply(makeCtx({
        conflictMineralBatches: [{ batchId: 'b1', mineral: 'gold', countryOfOrigin: 'CD', smelterRmapStatus: 'not_enrolled' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('chain_of_custody_break (LBMA RGG v9 + OECD DDG Step 4)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await chainOfCustodyBreakApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on intact, well-documented chain', async () => {
      const out = await chainOfCustodyBreakApply(makeCtx({
        chainOfCustodyBatches: [{
          batchId: 'b1', declaredMassGrams: 1_000, finalRefinedMassGrams: 999,
          events: [
            { custodianName: 'Origin', releasedAt: '2026-01-01T00:00:00Z', releasedMassGrams: 1_000, sealIntact: true },
            { custodianName: 'Refinery', receivedAt: '2026-01-01T12:00:00Z', receivedMassGrams: 1_000, sealIntact: true },
          ],
        }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on broken seal + critical mass loss', async () => {
      const out = await chainOfCustodyBreakApply(makeCtx({
        chainOfCustodyBatches: [{
          batchId: 'b1',
          events: [
            { custodianName: 'Origin', releasedAt: '2026-01-01T00:00:00Z', releasedMassGrams: 1_000, sealIntact: true },
            { custodianName: 'Refinery', receivedAt: '2026-01-01T12:00:00Z', receivedMassGrams: 950, sealIntact: false },
          ],
        }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('assay_certificate_audit (LBMA Good Delivery + ISO 17025)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await assayCertificateAuditApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on accredited lab + clean certificate', async () => {
      const out = await assayCertificateAuditApply(makeCtx({
        assayCertificates: [{
          certId: 'c1',
          laboratoryIso17025Accredited: true,
          laboratoryLbmaApproved: true,
          finenessReportedPpt: 999.9,
          declaredMassGrams: 1_000, assayedMassGrams: 1_000,
          hasSignature: true, hasOriginCountry: true,
          certificateAgeDays: 30,
        }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on non-accredited lab + critical mass deviation', async () => {
      const out = await assayCertificateAuditApply(makeCtx({
        assayCertificates: [{
          certId: 'c1',
          laboratoryIso17025Accredited: false,
          declaredMassGrams: 1_000, assayedMassGrams: 950,
        }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('vessel_beneficial_owner (FATF UBO 2023 + IMO A.1117(30) + OFAC Maritime)', () => {
    it('inconclusive on no evidence', async () => {
      expect((await vesselBeneficialOwnerApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on transparent vessel ownership', async () => {
      const out = await vesselBeneficialOwnerApply(makeCtx({
        vessels: [{
          imoNumber: '9123456',
          beneficialOwnerDisclosed: true,
          ownershipChainDepth: 1,
          registeredOwnerImoCompanyNumber: '1234567',
          flagOfConvenience: false,
        }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('blocks on AIS dark > 72h (UNSC 2397 typology)', async () => {
      const out = await vesselBeneficialOwnerApply(makeCtx({
        vessels: [{
          imoNumber: '9123456',
          beneficialOwnerDisclosed: true,
          registeredOwnerImoCompanyNumber: '1234567',
          aisDarkPeriodHours: 96,
        }],
      }));
      expect(out.verdict).toBe('block');
    });
    it('escalates on undisclosed UBO + shell in chain', async () => {
      const out = await vesselBeneficialOwnerApply(makeCtx({
        vessels: [{
          imoNumber: '9123456',
          beneficialOwnerDisclosed: false,
          hasShellOwnerInChain: true,
          registeredOwnerImoCompanyNumber: '1234567',
        }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });
});
