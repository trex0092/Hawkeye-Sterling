// Smoke tests for the 10 wave-3 batch-3 modes (PR feat/wave3-implement-batch-3).
// Each test exercises:
//   - inconclusive branch when no evidence supplied
//   - clean branch when evidence is benign
//   - flag/escalate/block branch when threshold breached
// Spec: src/brain/modes/WAVE_3_SPEC_DRAFTS_BATCH_3.md
import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import { insEarlySurrenderCashApply } from '../modes/wave3-ins-early-surrender.js';
import { insPremiumOverfundApply } from '../modes/wave3-ins-premium-overfund.js';
import { insPolicyAssignmentApply } from '../modes/wave3-ins-policy-assignment.js';
import { insBeneficiaryRotationApply } from '../modes/wave3-ins-beneficiary-rotation.js';
import { insCrossBorderNomineeApply } from '../modes/wave3-ins-cross-border-nominee.js';
import { insSinglePremiumScrutinyApply } from '../modes/wave3-ins-single-premium.js';
import { emailSpoofForensicApply } from '../modes/wave3-email-spoof.js';
import { typosquatDomainDetectionApply } from '../modes/wave3-typosquat-domain.js';
import { invoiceRedirectionTraceApply } from '../modes/wave3-invoice-redirection.js';
import { ceoImpersonationSignalApply } from '../modes/wave3-ceo-impersonation.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = []): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('wave-3 batch-3 modes', () => {
  // ── Insurance (FATF Life-Insurance Guidance Oct 2018 + IAIS ICP 22) ──

  describe('ins_early_surrender_cash', () => {
    it('inconclusive on no evidence', async () => {
      expect((await insEarlySurrenderCashApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on long-held policy with normal payout', async () => {
      const out = await insEarlySurrenderCashApply(makeCtx({
        policySurrenders: [{ policyId: 'p1', policyAgeDays: 1500, payoutMethod: 'wire' }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on surrender < 6mo + third-party payout', async () => {
      const out = await insEarlySurrenderCashApply(makeCtx({
        policySurrenders: [{ policyId: 'p1', policyAgeDays: 60, payoutToThirdParty: true }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('ins_premium_overfund', () => {
    it('inconclusive on no evidence', async () => {
      expect((await insPremiumOverfundApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on policy paid as scheduled', async () => {
      const out = await insPremiumOverfundApply(makeCtx({
        policyFunding: [{ policyId: 'p1', scheduledAnnualPremiumAed: 10_000, actualPremiumPaidYtdAed: 10_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates at 3×+ overfunding', async () => {
      const out = await insPremiumOverfundApply(makeCtx({
        policyFunding: [{ policyId: 'p1', scheduledAnnualPremiumAed: 10_000, actualPremiumPaidYtdAed: 50_000, hasFinancialJustification: false }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('ins_policy_assignment', () => {
    it('inconclusive on no evidence', async () => {
      expect((await insPolicyAssignmentApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on family-member assignment with CDD', async () => {
      const out = await insPolicyAssignmentApply(makeCtx({
        policyAssignments: [{ assignmentId: 'a1', assigneeRelationship: 'spouse', cddOnAssigneeCompleted: true, policyValueAed: 100_000, considerationPaidAed: 100_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on unrelated assignee at 50%+ discount', async () => {
      const out = await insPolicyAssignmentApply(makeCtx({
        policyAssignments: [{ assignmentId: 'a1', assigneeRelationship: 'unrelated', cddOnAssigneeCompleted: true, policyValueAed: 100_000, considerationPaidAed: 30_000 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('ins_beneficiary_rotation', () => {
    it('inconclusive on no evidence', async () => {
      expect((await insBeneficiaryRotationApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on single benign change', async () => {
      const out = await insBeneficiaryRotationApply(makeCtx({
        beneficiaryChanges: [{ policyId: 'p1', changedAt: '2026-01-01T00:00:00Z', newBeneficiaryRelationship: 'spouse', cddOnNewBeneficiary: true }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on PEP new beneficiary', async () => {
      const out = await insBeneficiaryRotationApply(makeCtx({
        beneficiaryChanges: [{ policyId: 'p1', changedAt: '2026-01-01T00:00:00Z', newBeneficiaryIsPep: true, cddOnNewBeneficiary: true }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('ins_cross_border_nominee', () => {
    it('inconclusive on no evidence', async () => {
      expect((await insCrossBorderNomineeApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on single-jurisdiction policy', async () => {
      const out = await insCrossBorderNomineeApply(makeCtx({
        crossBorderPolicies: [{ policyId: 'p1', policyholderJurisdiction: 'AE', premiumSourceJurisdiction: 'AE', beneficiaryJurisdiction: 'AE', payoutJurisdiction: 'AE' }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on nominee + high-risk source', async () => {
      const out = await insCrossBorderNomineeApply(makeCtx({
        crossBorderPolicies: [{ policyId: 'p1', hasNomineeIndicators: true, premiumSourceFatfHighRisk: true, premiumSourceJurisdiction: 'IR' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('ins_single_premium_scrutiny', () => {
    it('inconclusive on no evidence', async () => {
      expect((await insSinglePremiumScrutinyApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on small annual-premium product', async () => {
      const out = await insSinglePremiumScrutinyApply(makeCtx({
        singlePremiumPolicies: [{ policyId: 'p1', isSinglePremium: false, premiumAmountAed: 5_000 }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on AED 1M+ single premium without SoF', async () => {
      const out = await insSinglePremiumScrutinyApply(makeCtx({
        singlePremiumPolicies: [{ policyId: 'p1', isSinglePremium: true, premiumAmountAed: 2_000_000, customerSourceOfFundsDocumented: false }],
      }));
      expect(out.verdict).toBe('escalate');
    });
    it('escalates on tranche-structured single-premium', async () => {
      const out = await insSinglePremiumScrutinyApply(makeCtx({
        singlePremiumPolicies: [{ policyId: 'p1', isSinglePremium: true, premiumAmountAed: 50_000, paidInMultipleTranches: true, trancheCount: 5 }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  // ── Cyber-fraud (NIST SP 800-177r1 + FBI IC3 BEC + UAE CBUAE 21/2018) ──

  describe('email_spoof_forensic', () => {
    it('inconclusive on no evidence', async () => {
      expect((await emailSpoofForensicApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on DMARC=pass, matching domains', async () => {
      const out = await emailSpoofForensicApply(makeCtx({
        emailEvidence: [{ messageId: 'm1', fromAddress: 'a@example.com', replyToAddress: 'a@example.com', dmarcResult: 'pass', spfResult: 'pass', dkimResult: 'pass' }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('blocks on payment-instruction change via spoofed email', async () => {
      const out = await emailSpoofForensicApply(makeCtx({
        emailEvidence: [{ messageId: 'm1', hasPaymentInstruction: true, paymentInstructionDifferentFromOnFile: true, dmarcResult: 'fail' }],
      }));
      expect(out.verdict).toBe('block');
    });
  });

  describe('typosquat_domain_detection', () => {
    it('inconclusive on no evidence', async () => {
      expect((await typosquatDomainDetectionApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on identical legit domain', async () => {
      const out = await typosquatDomainDetectionApply(makeCtx({
        domainObservations: [{ observedDomain: 'amazon.com', legitimateDomain: 'amazon.com', hasValidTls: true, hasMxRecords: true }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('escalates on edit-distance-1 typosquat', async () => {
      const out = await typosquatDomainDetectionApply(makeCtx({
        domainObservations: [{ observedDomain: 'amazom.com', legitimateDomain: 'amazon.com' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
    it('escalates on homoglyph substitution', async () => {
      const out = await typosquatDomainDetectionApply(makeCtx({
        domainObservations: [{ observedDomain: 'amaz0n.com', legitimateDomain: 'amazon.com' }],
      }));
      expect(out.verdict).toBe('escalate');
    });
  });

  describe('invoice_redirection_trace', () => {
    it('inconclusive on no evidence', async () => {
      expect((await invoiceRedirectionTraceApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on normal invoice payment', async () => {
      const out = await invoiceRedirectionTraceApply(makeCtx({
        invoicePaymentEvents: [{ invoiceId: 'i1', amountAed: 10_000, ibanDifferentFromVendorOnFile: false, approvedByDualControl: true }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('blocks on email-channel IBAN change without callback', async () => {
      const out = await invoiceRedirectionTraceApply(makeCtx({
        invoicePaymentEvents: [{ invoiceId: 'i1', changeRequestChannel: 'email', changeRequestVerifiedOutOfBand: false, ibanDifferentFromVendorOnFile: true }],
      }));
      expect(out.verdict).toBe('block');
    });
    it('blocks on 1-day-old destination account', async () => {
      const out = await invoiceRedirectionTraceApply(makeCtx({
        invoicePaymentEvents: [{ invoiceId: 'i1', destinationAccountAgeDays: 1 }],
      }));
      expect(out.verdict).toBe('block');
    });
  });

  describe('ceo_impersonation_signal', () => {
    it('inconclusive on no evidence', async () => {
      expect((await ceoImpersonationSignalApply(makeCtx())).verdict).toBe('inconclusive');
    });
    it('clear on legitimate-looking exec request', async () => {
      const out = await ceoImpersonationSignalApply(makeCtx({
        execRequestEvents: [{ requestId: 'r1', senderEmailDomainMatchesOrg: true, outOfBandVerificationPerformed: true }],
      }));
      expect(out.verdict).toBe('clear');
    });
    it('blocks on classic 3+ hallmark attack pattern', async () => {
      const out = await ceoImpersonationSignalApply(makeCtx({
        execRequestEvents: [{
          requestId: 'r1',
          senderUsesPersonalEmail: true,
          bypassesNormalChannel: true,
          hasSecrecyDirective: true,
          hasUrgencyTone: true,
        }],
      }));
      expect(out.verdict).toBe('block');
    });
  });
});
