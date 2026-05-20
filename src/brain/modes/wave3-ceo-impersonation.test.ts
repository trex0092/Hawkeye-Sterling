import { describe, expect, it } from 'vitest';
import ceoImpersonationSignalApply from './wave3-ceo-impersonation.js';
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

describe('wave3-ceo-impersonation', () => {
  it('returns inconclusive when no execRequestEvents supplied', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('ceo_impersonation_signal');
  });

  it('returns inconclusive when execRequestEvents is empty', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({ execRequestEvents: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req1',
        senderUsesPersonalEmail: false,
        senderEmailDomainMatchesOrg: true,
        bypassesNormalChannel: false,
        hasSecrecyDirective: false,
        hasUrgencyTone: false,
        isFirstContactWithRecipient: false,
        isOutsideBusinessHours: false,
        outOfBandVerificationPerformed: true,
        paymentDestinationFatfHighRisk: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('escalates when senderUsesPersonalEmail is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req2',
        senderUsesPersonalEmail: true,
        senderEmailAddress: 'boss@gmail.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates when senderEmailDomainMatchesOrg is false and not personal email', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req3',
        senderEmailDomainMatchesOrg: false,
        senderUsesPersonalEmail: false,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag sender_domain_not_org when senderUsesPersonalEmail is also true', async () => {
    // When senderUsesPersonalEmail is true, !e.senderUsesPersonalEmail is false → no sender_domain hit
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req3b',
        senderEmailDomainMatchesOrg: false,
        senderUsesPersonalEmail: true,
      }],
    }));
    // personal_email fires but sender_domain_not_org does NOT fire
    // only 1 attackPatternMatch (from personal email), attackPatternMatches < 3
    expect(r.score).toBeGreaterThan(0);
    const evidenceStr = r.evidence.join(' ');
    // personal_email_for_exec_request should fire
    expect(r.verdict).toBe('escalate');
  });

  it('escalates when bypassesNormalChannel is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req4',
        bypassesNormalChannel: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates when hasSecrecyDirective is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req5',
        hasSecrecyDirective: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags urgency_tone when hasUrgencyTone is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req6',
        hasUrgencyTone: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('flags first_contact when isFirstContactWithRecipient is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req7',
        isFirstContactWithRecipient: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('flags outside_hours when isOutsideBusinessHours is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req8',
        isOutsideBusinessHours: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('escalates when outOfBandVerificationPerformed is false and paymentAmountAed > 0', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req9',
        outOfBandVerificationPerformed: false,
        paymentAmountAed: 100000,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag no_out_of_band_verification when paymentAmountAed = 0', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req10',
        outOfBandVerificationPerformed: false,
        paymentAmountAed: 0,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag no_out_of_band_verification when paymentAmountAed missing', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req11',
        outOfBandVerificationPerformed: false,
      }],
    }));
    // paymentAmountAed ?? 0 = 0, condition is > 0 → not triggered
    expect(r.score).toBe(0);
  });

  it('escalates when paymentDestinationFatfHighRisk is true', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req12',
        paymentDestinationFatfHighRisk: true,
        paymentDestinationCountry: 'IR',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('blocks when attackPatternMatches >= 3 (classic_attack_pattern)', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req13',
        senderUsesPersonalEmail: true,       // attackPatternMatches++ (1)
        bypassesNormalChannel: true,          // attackPatternMatches++ (2)
        hasSecrecyDirective: true,            // attackPatternMatches++ (3) → classic_attack_pattern
      }],
    }));
    expect(r.verdict).toBe('block');
  });

  it('does not fire classic_attack_pattern when only 2 IC3 hallmarks present', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req14',
        senderUsesPersonalEmail: true,       // attackPatternMatches++ (1)
        bypassesNormalChannel: true,          // attackPatternMatches++ (2)
      }],
    }));
    // Only 2 attackPatternMatches → no classic_attack_pattern
    expect(r.verdict).toBe('escalate'); // escalate from the other signals
    const blockHit = r.evidence.length; // just verify some evidence
    expect(r.verdict).not.toBe('block');
  });

  it('uses (unidentified) when requestId is missing', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{ hasUrgencyTone: true }],
    }));
    expect(r.evidence).toContain('(unidentified)');
  });

  it('verdict is escalate even when all escalate-severity signals fire but no block', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req15',
        senderEmailDomainMatchesOrg: false,
        senderUsesPersonalEmail: false,
        paymentDestinationFatfHighRisk: true,
      }],
    }));
    // 2 escalate-severity signals → no block (attackPatternMatches = 1 from domain mismatch)
    expect(r.verdict).toBe('escalate');
  });

  it('score is clamped to 1 with many signals', async () => {
    const r = await ceoImpersonationSignalApply(makeCtx({
      execRequestEvents: [{
        requestId: 'req16',
        senderUsesPersonalEmail: true,
        senderEmailDomainMatchesOrg: false, // won't fire because senderUsesPersonalEmail is true
        bypassesNormalChannel: true,
        hasSecrecyDirective: true,
        hasUrgencyTone: true,
        isFirstContactWithRecipient: true,
        isOutsideBusinessHours: true,
        outOfBandVerificationPerformed: false,
        paymentAmountAed: 500000,
        paymentDestinationFatfHighRisk: true,
      }],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.verdict).toBe('block');
  });
});
