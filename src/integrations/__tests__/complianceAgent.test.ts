import { describe, it, expect } from 'vitest';
import {
  aggregateVerdict,
  buildComplianceSystemPrompt,
  buildComplianceUserMessage,
  COMPLIANCE_TASK_ROLE,
  invokeComplianceAgent,
  precheckMandatorySections,
  precheckMatchConfidence,
  precheckRedlines,
  precheckScope,
  precheckTippingOff,
  type ChatCall,
  type ComplianceReviewRequest,
  type ProhibitionCheck,
  type RedlinesAudit,
} from '../complianceAgent.js';
import { SYSTEM_PROMPT } from '../../policy/systemPrompt.js';
import type { CaseReport } from '../../reports/caseReport.js';

function baseReport(overrides: Partial<CaseReport> = {}): CaseReport {
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
    notes: {
      timezone: 'UTC',
      legalNotice: 'Confidential.',
    },
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

describe('complianceAgent — prompt composition', () => {
  it('buildComplianceSystemPrompt prepends the frozen charter and includes the task role', () => {
    const prompt = buildComplianceSystemPrompt({ caseReport: baseReport() });
    expect(prompt.startsWith(SYSTEM_PROMPT.slice(0, 80))).toBe(true);
    expect(prompt).toContain('TASK ROLE');
    expect(prompt).toContain(COMPLIANCE_TASK_ROLE.slice(0, 60));
    expect(prompt).toContain('Audience: regulator');
  });

  it('buildComplianceUserMessage JSON-serialises the artefact', () => {
    const req: ComplianceReviewRequest = {
      caseReport: baseReport(),
      draftNarrative: CLEAN_NARRATIVE,
      customerFacingText: 'Hello.',
    };
    const msg = buildComplianceUserMessage(req);
    expect(msg).toContain('ARTEFACT UNDER REVIEW');
    expect(msg).toContain('"caseReport"');
    expect(msg).toContain('"draftNarrative"');
    expect(msg).toContain('"customerFacingText"');
    expect(msg).toMatch(/APPROVED, RETURNED_FOR_REVISION, or BLOCKED/);
  });
});

describe('complianceAgent — precheckScope', () => {
  it('flags empty sources', () => {
    const audit = precheckScope(baseReport({ sources: [] }));
    expect(audit.sourcesDeclared).toBe(false);
    expect(audit.concerns).toContain('no_sources_declared');
  });

  it('passes when sources + dates are present', () => {
    const audit = precheckScope(baseReport());
    expect(audit.sourcesDeclared).toBe(true);
    expect(audit.listVersionDatesPresent).toBe(true);
    expect(audit.concerns).not.toContain('no_sources_declared');
  });

  it('flags missing list-version dates', () => {
    const audit = precheckScope(baseReport({
      sources: [{ date: '', url: 'https://x', title: 't' }],
    }));
    expect(audit.listVersionDatesPresent).toBe(false);
    expect(audit.concerns).toContain('list_version_dates_missing');
  });
});

describe('complianceAgent — precheckMandatorySections', () => {
  it('flags missing GAPS / RED_FLAGS / RECOMMENDED_NEXT_STEPS / AUDIT_LINE when narrative lacks them', () => {
    const thin = 'Subject: Zayd. Scope: UN list. Findings: nothing.';
    const result = precheckMandatorySections(baseReport(), thin);
    const missing = result.filter((r) => !r.present).map((r) => r.section);
    expect(missing).toContain('GAPS');
    expect(missing).toContain('RED_FLAGS');
    expect(missing).toContain('RECOMMENDED_NEXT_STEPS');
  });

  it('accepts a narrative with all seven headings', () => {
    const result = precheckMandatorySections(baseReport(), CLEAN_NARRATIVE);
    const missing = result.filter((r) => !r.present).map((r) => r.section);
    expect(missing).toEqual([]);
  });
});

describe('complianceAgent — precheckMatchConfidence', () => {
  it('flags a name-only assertion above WEAK', () => {
    const narrative = 'This was a name-only STRONG match against the sanctions list.';
    const audit = precheckMatchConfidence(baseReport(), narrative);
    expect(audit.violations).toContain('name_only_match_above_WEAK');
  });

  it('flags a transliterated EXACT without native script', () => {
    const narrative = 'transliteration match, classified EXACT.';
    const audit = precheckMatchConfidence(baseReport(), narrative);
    expect(audit.violations).toContain('transliteration_above_POSSIBLE_without_native_script');
  });

  it('passes on a disciplined WEAK classification', () => {
    const narrative = 'Classified as WEAK match — name-only, no strong identifiers.';
    const audit = precheckMatchConfidence(baseReport(), narrative);
    expect(audit.violations).toEqual([]);
  });
});

describe('complianceAgent — precheckTippingOff', () => {
  it('blocks on STR language', () => {
    const audit = precheckTippingOff('We have filed an STR against you.');
    expect(audit.allowed).toBe(false);
    expect(audit.matches.some((m) => m.severity === 'high')).toBe(true);
  });

  it('blocks on "ongoing investigation" phrasing', () => {
    const audit = precheckTippingOff('Your account is under an ongoing investigation.');
    expect(audit.allowed).toBe(false);
  });

  it('returns scanned=false with no customer text', () => {
    const audit = precheckTippingOff(undefined);
    expect(audit.scanned).toBe(false);
    expect(audit.allowed).toBe(true);
  });
});

describe('complianceAgent — precheckRedlines', () => {
  it('fires rl_missing_charter_hash when the envelope lacks the integrity hash', () => {
    const audit = precheckRedlines(baseReport(), 'Bare narrative with no hash mention.');
    expect(audit.fired).toContain('rl_missing_charter_hash');
  });

  it('does not fire rl_missing_charter_hash when the narrative carries the hash', () => {
    const audit = precheckRedlines(baseReport(), CLEAN_NARRATIVE);
    expect(audit.fired).not.toContain('rl_missing_charter_hash');
  });

  it('fires rl_tipping_off_draft when the tipping-off guard catches a high hit', () => {
    const tippingOff = precheckTippingOff('We have filed an STR against you.');
    const audit = precheckRedlines(baseReport(), CLEAN_NARRATIVE, tippingOff);
    expect(audit.fired).toContain('rl_tipping_off_draft');
    expect(audit.action).not.toBeNull();
  });

  it('fires rl_training_data_as_sanctions_source when sanctions claimed without sources', () => {
    const audit = precheckRedlines(
      baseReport({ sources: [] }),
      'Subject is sanctioned per our records.',
    );
    expect(audit.fired).toContain('rl_training_data_as_sanctions_source');
  });
});

describe('complianceAgent — aggregateVerdict', () => {
  const pass: ProhibitionCheck = { id: 'P1', label: 'x', status: 'pass', evidence: [] };
  const concern: ProhibitionCheck = { id: 'P3', label: 'x', status: 'concern', evidence: ['y'] };
  const violation: ProhibitionCheck = { id: 'P4', label: 'x', status: 'violation', evidence: ['y'] };
  const noRedlines: RedlinesAudit = { fired: [], action: null, summary: 'none' };
  const withRedline: RedlinesAudit = { fired: ['rl_missing_charter_hash'], action: 'block', summary: 'fired' };

  it('blocks on any violation', () => {
    expect(aggregateVerdict([pass, violation], noRedlines, null)).toBe('blocked');
  });

  it('blocks on any fired redline even when checks pass', () => {
    expect(aggregateVerdict([pass], withRedline, null)).toBe('blocked');
  });

  it('returns_for_revision on concerns only', () => {
    expect(aggregateVerdict([pass, concern], noRedlines, null)).toBe('returned_for_revision');
  });

  it('approves when everything is clean and semantic approves', () => {
    expect(aggregateVerdict([pass, pass], noRedlines, 'approved')).toBe('approved');
  });

  it('upgrades to semantic blocked even if prechecks were clean', () => {
    expect(aggregateVerdict([pass], noRedlines, 'blocked')).toBe('blocked');
  });
});

describe('complianceAgent — invokeComplianceAgent', () => {
  it('returns approved on a clean artefact when the fake chat returns APPROVED', async () => {
    const fakeChat: ChatCall = async () => ({
      ok: true,
      text: 'All P1–P10 pass. No blocking issues.\nAPPROVED',
    });
    const res = await invokeComplianceAgent(
      {
        caseReport: baseReport(),
        draftNarrative: CLEAN_NARRATIVE,
      },
      { apiKey: 'test' },
      fakeChat,
    );
    expect(res.verdict).toBe('approved');
    expect(res.ok).toBe(true);
    expect(res.partial).toBe(false);
    expect(res.charterIntegrityHash).toMatch(/^[0-9a-f]{8}$/);
    expect(res.redlines.fired).toEqual([]);
    expect(res.agentTrail.map((s) => s.actor)).toEqual(['precheck', 'advisor']);
  });

  it('short-circuits to blocked on tipping-off without calling the model', async () => {
    let called = false;
    const fakeChat: ChatCall = async () => { called = true; return { ok: true, text: 'APPROVED' }; };
    const res = await invokeComplianceAgent(
      {
        caseReport: baseReport(),
        draftNarrative: CLEAN_NARRATIVE,
        customerFacingText: 'We have filed an STR.',
      },
      { apiKey: 'test' },
      fakeChat,
    );
    expect(res.verdict).toBe('blocked');
    expect(called).toBe(false);
    expect(res.blockingIssues.length).toBeGreaterThan(0);
    expect(res.tippingOff.allowed).toBe(false);
  });

  it('emits the charter hash deterministically (matches mlroAdvisor hash space)', async () => {
    const fakeChat: ChatCall = async () => ({ ok: true, text: 'APPROVED' });
    const a = await invokeComplianceAgent({ caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE }, { apiKey: 'x' }, fakeChat);
    const b = await invokeComplianceAgent({ caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE }, { apiKey: 'x' }, fakeChat);
    expect(a.charterIntegrityHash).toBe(b.charterIntegrityHash);
  });

  it('calls the chat function with non-empty user content', async () => {
    const calls: string[] = [];
    const capturingChat: ChatCall = async ({ user }) => {
      calls.push(user);
      return { ok: true, text: 'APPROVED' };
    };
    await invokeComplianceAgent(
      { caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE },
      { apiKey: 'x' },
      capturingChat,
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const u of calls) {
      expect(u.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns ok=false with descriptive error when defaultChat receives empty user content', async () => {
    const emptyContentChat: ChatCall = async ({ user }) => {
      if (!user.trim()) return { ok: false, error: 'message content must be non-empty' };
      return { ok: true, text: 'APPROVED' };
    };
    const res = await invokeComplianceAgent(
      { caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE },
      { apiKey: 'x' },
      emptyContentChat,
    );
    expect(res.ok).toBe(true);
  });
});

describe('complianceAgent — parseSemanticVerdict case-insensitivity', () => {
  it('parses lowercase approved from chat response', async () => {
    const fakeChat: ChatCall = async () => ({ ok: true, text: 'All checks pass.\napproved' });
    const res = await invokeComplianceAgent(
      { caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE },
      { apiKey: 'x' },
      fakeChat,
    );
    expect(res.verdict).toBe('approved');
  });

  it('parses lowercase blocked from chat response', async () => {
    const fakeChat: ChatCall = async () => ({ ok: true, text: 'Critical violation found.\nblocked' });
    const res = await invokeComplianceAgent(
      { caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE },
      { apiKey: 'x' },
      fakeChat,
    );
    expect(res.verdict).toBe('blocked');
  });

  it('parses lowercase returned_for_revision from chat response', async () => {
    const fakeChat: ChatCall = async () => ({ ok: true, text: 'Minor issues.\nreturned_for_revision' });
    const res = await invokeComplianceAgent(
      { caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE },
      { apiKey: 'x' },
      fakeChat,
    );
    expect(res.verdict).toBe('returned_for_revision');
  });

  it('returns incomplete when chat response contains no verdict token', async () => {
    const fakeChat: ChatCall = async () => ({ ok: true, text: 'No verdict here.' });
    const res = await invokeComplianceAgent(
      { caseReport: baseReport(), draftNarrative: CLEAN_NARRATIVE },
      { apiKey: 'x' },
      fakeChat,
    );
    expect(res.verdict).toBe('incomplete');
  });
});
