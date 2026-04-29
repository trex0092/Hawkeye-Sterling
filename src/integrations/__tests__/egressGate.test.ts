import { describe, it, expect } from 'vitest';
import {
  gatedAsanaDelivery,
  gatedGoamlEmission,
  gatedMlroAdvisor,
  verdictToStatus,
  type EgressGateDeps,
} from '../egressGate.js';
import type { ChatCall } from '../complianceAgent.js';
import type { AsanaConfig, AsanaDeliveryResult } from '../asana.js';
import type { CaseReport } from '../../reports/caseReport.js';
import type { GoAmlEnvelope } from '../../brain/goaml-shapes.js';
import type {
  MlroAdvisorConfig,
  MlroAdvisorRequest,
  MlroAdvisorResult,
} from '../mlroAdvisor.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function cleanReport(overrides: Partial<CaseReport> = {}): CaseReport {
  return {
    header: {
      product: 'Hawkeye Sterling V2',
      reportKind: 'CASE REPORT',
      confidential: true,
      generatedAt: '2026-04-22T00:00:00Z',
      printedBy: 'mlro@example.ae',
      group: 'Compliance',
      mode: 'first_screening',
    },
    identity: {
      caseId: 'HWK-0001',
      recordUid: 'rec-0001',
      name: 'Zayd Al-Mansouri',
      entityType: 'Individual',
      dateOfBirth: '1982-03-14',
      citizenship: ['AE'],
      identificationNumbers: [{ kind: 'passport', number: 'AE1234567', country: 'AE' }],
    },
    keyFindings: {
      totalMatches: 'NO MATCHES FOUND',
      resolvedMatches: 0,
      verdictBreakdown: { Positive: 0, Possible: 0, False: 0, Unspecified: 0 },
      unresolvedMatches: 0,
    },
    reasoningChain: [],
    audit: [{
      date: '2026-04-22T00:00:00Z',
      actionedBy: 'system',
      action: 'case_generated',
      source: 'Desktop',
    }],
    sources: [
      { date: '2026-04-20', url: 'https://scsanctions.un.org/consolidated', title: 'UN Consolidated List' },
      { date: '2026-04-20', url: 'https://sanctionssearch.ofac.treas.gov/', title: 'OFAC SDN' },
    ],
    notes: { timezone: 'UTC', legalNotice: 'Confidential.' },
    ...overrides,
  };
}

const CLEAN_NARRATIVE = [
  'SUBJECT IDENTIFIERS: Zayd Al-Mansouri, passport AE1234567.',
  'SCOPE DECLARATION: Lists checked: UN Consolidated, OFAC SDN.',
  'FINDINGS: NO MATCH at any confidence level.',
  'GAPS: No further identifiers required at this stage.',
  'RED FLAGS: None observed.',
  'RECOMMENDED NEXT STEPS: Proceed to standard onboarding.',
  'AUDIT LINE: This output is decision support, not a decision. MLRO review required. charterIntegrityHash attached.',
].join('\n');

const ASANA_CFG: AsanaConfig = {
  personalAccessToken: 'test-token',
  workspaceGid: 'W1',
  projectGid: 'P1',
  sections: { firstScreening: 'S1', dailyMonitoring: 'S2' },
};

const AGENT_CFG = { apiKey: 'test' };

function approvingChat(): ChatCall {
  return async () => ({
    ok: true,
    text: 'All P1–P10 pass. No blocking issues.\nAPPROVED',
  });
}

function blockingChat(): ChatCall {
  return async () => ({
    ok: true,
    text: 'P1 violation detected: sanctions asserted without primary source.\nBLOCKED',
  });
}

function reviseChat(): ChatCall {
  return async () => ({
    ok: true,
    text: 'Minor concerns in GAPS section.\nRETURNED_FOR_REVISION',
  });
}

// ── verdictToStatus ─────────────────────────────────────────────────────────

describe('verdictToStatus', () => {
  it('maps approved → approved', () => {
    expect(verdictToStatus('approved')).toBe('approved');
  });
  it('maps returned_for_revision → held_for_revision', () => {
    expect(verdictToStatus('returned_for_revision')).toBe('held_for_revision');
  });
  it('maps blocked → blocked', () => {
    expect(verdictToStatus('blocked')).toBe('blocked');
  });
  it('maps incomplete → incomplete', () => {
    expect(verdictToStatus('incomplete')).toBe('incomplete');
  });
});

// ── gatedAsanaDelivery ──────────────────────────────────────────────────────

describe('gatedAsanaDelivery', () => {
  it('releases and delivers when compliance approves', async () => {
    let delivered = false;
    const fakeDeliver = async (): Promise<AsanaDeliveryResult> => {
      delivered = true;
      return { ok: true, taskGid: 'GID-1', url: 'https://asana/GID-1' };
    };

    const result = await gatedAsanaDelivery(
      { report: cleanReport(), draftNarrative: CLEAN_NARRATIVE },
      ASANA_CFG,
      AGENT_CFG,
      { chat: approvingChat(), deliverAsana: fakeDeliver },
    );

    expect(result.released).toBe(true);
    expect(result.status).toBe('approved');
    expect(delivered).toBe(true);
    expect(result.delivery?.ok).toBe(true);
    expect(result.delivery?.taskGid).toBe('GID-1');
  });

  it('holds and does NOT deliver when compliance blocks', async () => {
    let delivered = false;
    const fakeDeliver: EgressGateDeps['deliverAsana'] = async () => {
      delivered = true;
      return { ok: true };
    };

    // Customer-facing text containing tipping-off language forces P4.
    const result = await gatedAsanaDelivery(
      {
        report: cleanReport(),
        draftNarrative: CLEAN_NARRATIVE,
        customerFacingText: 'We are filing a suspicious activity report about this customer.',
      },
      ASANA_CFG,
      AGENT_CFG,
      { chat: blockingChat(), deliverAsana: fakeDeliver },
    );

    expect(result.released).toBe(false);
    expect(['blocked', 'held_for_revision']).toContain(result.status);
    expect(delivered).toBe(false);
    expect(result.delivery).toBeUndefined();
    expect(result.gate.verdict).not.toBe('approved');
  });

  it('holds on returned_for_revision (semantic concern)', async () => {
    let delivered = false;
    const fakeDeliver: EgressGateDeps['deliverAsana'] = async () => {
      delivered = true;
      return { ok: true };
    };

    const result = await gatedAsanaDelivery(
      { report: cleanReport(), draftNarrative: CLEAN_NARRATIVE },
      ASANA_CFG,
      AGENT_CFG,
      { chat: reviseChat(), deliverAsana: fakeDeliver },
    );

    expect(result.released).toBe(false);
    expect(result.status).toBe('held_for_revision');
    expect(delivered).toBe(false);
  });

  it('short-circuits on precheck blocked without calling chat', async () => {
    let chatCalled = false;
    const countingChat: ChatCall = async () => {
      chatCalled = true;
      return { ok: true, text: 'APPROVED' };
    };
    let delivered = false;
    const fakeDeliver: EgressGateDeps['deliverAsana'] = async () => {
      delivered = true;
      return { ok: true };
    };

    // Empty sources + no list-version dates → P7 violation → precheck blocks.
    const bad = cleanReport({ sources: [] });

    const result = await gatedAsanaDelivery(
      { report: bad, draftNarrative: CLEAN_NARRATIVE },
      ASANA_CFG,
      AGENT_CFG,
      { chat: countingChat, deliverAsana: fakeDeliver },
    );

    expect(result.released).toBe(false);
    expect(result.status).toBe('blocked');
    expect(chatCalled).toBe(false);
    expect(delivered).toBe(false);
  });
});

// ── gatedGoamlEmission ──────────────────────────────────────────────────────

function baseEnvelope(overrides: Partial<GoAmlEnvelope> = {}): GoAmlEnvelope {
  return {
    reportCode: 'STR',
    rentityId: 'RE-001',
    reportingPerson: {
      fullName: 'Amal Compliance',
      occupation: 'MLRO',
      email: 'mlro@example.ae',
      phoneNumber: '+9710000000',
    },
    submissionCode: 'E',
    currencyCodeLocal: 'AED',
    reason:
      'Subject presented STRONG identifiers matching UN Consolidated list entry ' +
      'with charter hash attached. See charterIntegrityHash in envelope. ' +
      'GAPS: none. RED FLAGS: wire pattern. RECOMMENDED NEXT STEPS: freeze.',
    action: 'freeze',
    internalReference: 'HWK-01F-0001',
    generatedAt: '2026-04-22T00:00:00Z',
    charterIntegrityHash: 'abcd1234',
    ...overrides,
  };
}

describe('gatedGoamlEmission', () => {
  it('releases XML when compliance approves', async () => {
    let serialised = false;
    const fakeSerialise = (_env: GoAmlEnvelope): string => {
      serialised = true;
      return '<?xml version="1.0"?><report>ok</report>';
    };

    const result = await gatedGoamlEmission(
      cleanReport(),
      baseEnvelope(),
      AGENT_CFG,
      { chat: approvingChat(), serialiseGoaml: fakeSerialise },
    );

    expect(result.released).toBe(true);
    expect(result.status).toBe('approved');
    expect(serialised).toBe(true);
    expect(result.xml).toContain('<report>');
  });

  it('blocks XML emission when the envelope reason tips off', async () => {
    let serialised = false;
    const fakeSerialise = (_env: GoAmlEnvelope): string => {
      serialised = true;
      return '<?xml version="1.0"?><report/>';
    };

    // This reason text would be flagged by tippingOffScan if placed in
    // customerFacingText. For STR reason it won't trigger tipping-off (FIU-
    // facing), but the GAPS/RED_FLAGS/RECOMMENDED_NEXT_STEPS sections are
    // absent so we should at minimum get held_for_revision.
    const envelope = baseEnvelope({
      reason: 'Short reason without structured sections.',
    });

    const result = await gatedGoamlEmission(
      cleanReport(),
      envelope,
      AGENT_CFG,
      { chat: reviseChat(), serialiseGoaml: fakeSerialise },
    );

    expect(result.released).toBe(false);
    expect(result.status).not.toBe('approved');
    expect(serialised).toBe(false);
    expect(result.xml).toBeUndefined();
  });

  it('handles envelopes with no reason narrative gracefully', async () => {
    // STR without reason is invalid upstream, but the gate should not crash.
    const envelope = baseEnvelope({ reason: '' });
    const result = await gatedGoamlEmission(
      cleanReport(),
      envelope,
      AGENT_CFG,
      { chat: approvingChat() },
    );
    // Without draftNarrative the mandatory-sections precheck will mark many
    // sections missing; verdict is at least held_for_revision.
    expect(result.released).toBe(false);
    expect(result.gate.mandatorySections.some((s) => !s.present)).toBe(true);
  });
});

// ── gatedMlroAdvisor ────────────────────────────────────────────────────────

describe('gatedMlroAdvisor', () => {
  it('releases when advisor narrative passes compliance', async () => {
    const advisorResult: MlroAdvisorResult = {
      ok: true,
      mode: 'multi_perspective',
      budgetMs: 25_000,
      elapsedMs: 100,
      partial: false,
      reasoningTrail: [],
      narrative: CLEAN_NARRATIVE,
      complianceReview: { prohibitionsChecked: [], issues: [], advisorVerdict: 'approved' },
      charterIntegrityHash: 'abc',
    };
    const fakeAdvise = async () => advisorResult;

    const req: MlroAdvisorRequest = {
      question: 'Is this subject clear?',
      caseContext: {
        caseId: 'HWK-0001',
        subjectName: 'Zayd',
        entityType: 'individual',
        scope: { listsChecked: [], listVersionDates: {}, jurisdictions: [], matchingMethods: [] },
        evidenceIds: [],
      },
      audience: 'regulator',
    };

    const result = await gatedMlroAdvisor(
      req,
      cleanReport(),
      { apiKey: 'test' } as MlroAdvisorConfig,
      AGENT_CFG,
      { chat: approvingChat(), adviseMlro: fakeAdvise },
    );

    expect(result.released).toBe(true);
    expect(result.status).toBe('approved');
    expect(result.advisor).toBe(advisorResult);
  });

  it('holds (but still returns advisor) when compliance blocks', async () => {
    const advisorResult: MlroAdvisorResult = {
      ok: true,
      mode: 'speed',
      budgetMs: 12_000,
      elapsedMs: 50,
      partial: false,
      reasoningTrail: [],
      narrative: 'Thin narrative missing mandatory sections.',
      complianceReview: { prohibitionsChecked: [], issues: [], advisorVerdict: 'approved' },
      charterIntegrityHash: 'abc',
    };
    const fakeAdvise = async () => advisorResult;

    const req: MlroAdvisorRequest = {
      question: 'Clear?',
      caseContext: {
        caseId: 'HWK-0001',
        subjectName: 'Zayd',
        entityType: 'individual',
        scope: { listsChecked: [], listVersionDates: {}, jurisdictions: [], matchingMethods: [] },
        evidenceIds: [],
      },
    };

    const result = await gatedMlroAdvisor(
      req,
      cleanReport(),
      { apiKey: 'test' } as MlroAdvisorConfig,
      AGENT_CFG,
      { chat: reviseChat(), adviseMlro: fakeAdvise },
    );

    expect(result.released).toBe(false);
    expect(result.status).not.toBe('approved');
    // The advisor result is ALWAYS returned so the MLRO can inspect it.
    expect(result.advisor).toBe(advisorResult);
  });

  it('handles advisor returning no narrative (partial/timeout)', async () => {
    const advisorResult: MlroAdvisorResult = {
      ok: false,
      mode: 'balanced',
      budgetMs: 20_000,
      elapsedMs: 20_000,
      partial: true,
      guidance: 'budget exceeded',
      reasoningTrail: [],
      complianceReview: { prohibitionsChecked: [], issues: [], advisorVerdict: 'incomplete' },
      charterIntegrityHash: 'abc',
    };
    const fakeAdvise = async () => advisorResult;

    const req: MlroAdvisorRequest = {
      question: 'Clear?',
      caseContext: {
        caseId: 'HWK-0001',
        subjectName: 'Zayd',
        entityType: 'individual',
        scope: { listsChecked: [], listVersionDates: {}, jurisdictions: [], matchingMethods: [] },
        evidenceIds: [],
      },
    };

    const result = await gatedMlroAdvisor(
      req,
      cleanReport(),
      { apiKey: 'test' } as MlroAdvisorConfig,
      AGENT_CFG,
      { chat: approvingChat(), adviseMlro: fakeAdvise },
    );

    expect(result.released).toBe(false);
    expect(result.advisor.partial).toBe(true);
  });
});
