import { describe, expect, it } from 'vitest';
import emailSpoofForensicApply from './wave3-email-spoof.js';
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

describe('wave3-email-spoof', () => {
  it('returns inconclusive when no emailEvidence supplied', async () => {
    const r = await emailSpoofForensicApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('email_spoof_forensic');
  });

  it('returns inconclusive when emailEvidence is empty', async () => {
    const r = await emailSpoofForensicApply(makeCtx({ emailEvidence: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg1',
        fromAddress: 'ceo@company.com',
        replyToAddress: 'ceo@company.com',
        returnPath: 'ceo@company.com',
        spfResult: 'pass',
        dkimResult: 'pass',
        dmarcResult: 'pass',
        senderIpCountryDiffersFromOrgDomain: false,
        hasPaymentInstruction: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('escalates when dmarcResult is fail', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg2', dmarcResult: 'fail' }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag dmarc when dmarcResult is pass', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg3', dmarcResult: 'pass' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag dmarc when dmarcResult is none', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg3b', dmarcResult: 'none' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags spf_fail when spfResult is fail', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg4', spfResult: 'fail' }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('does not flag spf when softfail', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg5', spfResult: 'softfail' }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags dkim_fail when dkimResult is fail', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg6', dkimResult: 'fail' }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('does not flag dkim when result is none', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ messageId: 'msg7', dkimResult: 'none' }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when reply-to domain differs from from domain', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg8',
        fromAddress: 'ceo@company.com',
        replyToAddress: 'reply@attacker.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag reply_to_mismatch when domains match', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg9',
        fromAddress: 'ceo@company.com',
        replyToAddress: 'info@company.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag reply_to_mismatch when replyToAddress is missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg10',
        fromAddress: 'ceo@company.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag reply_to_mismatch when fromAddress is missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg11',
        replyToAddress: 'info@attacker.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags return_path_mismatch when return-path domain differs from from domain', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg12',
        fromAddress: 'ceo@company.com',
        returnPath: 'bounce@attacker.com',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('does not flag return_path when domains match', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg13',
        fromAddress: 'ceo@company.com',
        returnPath: 'bounce@company.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag return_path when returnPath is missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg14',
        fromAddress: 'ceo@company.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags sender_ip_country_anomaly when senderIpCountryDiffersFromOrgDomain is true', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg15',
        senderIpCountryDiffersFromOrgDomain: true,
        senderIpCountry: 'RU',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('escalates when expectedSenderDomain differs from fromAddress domain', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg16',
        fromAddress: 'invoice@fakecounterparty.com',
        expectedSenderDomain: 'realcounterparty.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag unexpected_sender when domain matches expected', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg17',
        fromAddress: 'invoice@realcounterparty.com',
        expectedSenderDomain: 'realcounterparty.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag unexpected_sender when expectedSenderDomain is missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg18',
        fromAddress: 'invoice@anydomain.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag unexpected_sender when fromAddress is missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg19',
        expectedSenderDomain: 'realcounterparty.com',
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('blocks when hasPaymentInstruction = true AND paymentInstructionDifferentFromOnFile = true', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg20',
        hasPaymentInstruction: true,
        paymentInstructionDifferentFromOnFile: true,
      }],
    }));
    expect(r.verdict).toBe('block');
  });

  it('does not block when paymentInstructionDifferentFromOnFile is false', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg21',
        hasPaymentInstruction: true,
        paymentInstructionDifferentFromOnFile: false,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not block when hasPaymentInstruction is false', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg22',
        hasPaymentInstruction: false,
        paymentInstructionDifferentFromOnFile: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('uses fromAddress as ref when messageId is missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ fromAddress: 'test@evil.com', dmarcResult: 'fail' }],
    }));
    expect(r.evidence).toContain('test@evil.com');
  });

  it('uses (unidentified) when both ids missing', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{ dmarcResult: 'fail' }],
    }));
    expect(r.evidence).toContain('(unidentified)');
  });

  it('domainOf returns empty string for email without @', async () => {
    // email with no @ → domainOf returns '' → no mismatch
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg23',
        fromAddress: 'nodomain',
        replyToAddress: 'attacker@evil.com',
      }],
    }));
    // fromDomain is '' → condition: replyDomain && fromDomain → false → no flag
    expect(r.score).toBe(0);
  });

  it('escalates with block verdict taking priority', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg24',
        dmarcResult: 'fail',
        hasPaymentInstruction: true,
        paymentInstructionDifferentFromOnFile: true,
      }],
    }));
    expect(r.verdict).toBe('block');
  });

  it('score is clamped to 1 with many signals', async () => {
    const r = await emailSpoofForensicApply(makeCtx({
      emailEvidence: [{
        messageId: 'msg25',
        fromAddress: 'ceo@company.com',
        replyToAddress: 'reply@attacker.com',
        returnPath: 'bounce@attacker.com',
        spfResult: 'fail',
        dkimResult: 'fail',
        dmarcResult: 'fail',
        senderIpCountryDiffersFromOrgDomain: true,
        expectedSenderDomain: 'realcounterparty.com',
        hasPaymentInstruction: true,
        paymentInstructionDifferentFromOnFile: true,
      }],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.verdict).toBe('block');
  });
});
