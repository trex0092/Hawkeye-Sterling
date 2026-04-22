import { describe, it, expect } from 'vitest';
import {
  weaponizedSystemPrompt,
  weaponizedIntegrity,
  assertWeaponized,
} from '../weaponized.js';
import {
  buildComplianceSystemPrompt,
} from '../../integrations/complianceAgent.js';
import {
  buildExecutorRequest,
  buildAdvisorRequest,
} from '../../integrations/mlroAdvisor.js';

const MINIMAL_ADVISOR_REQ = {
  question: 'Is this subject clear?',
  caseContext: {
    caseId: 'HWK-0001',
    subjectName: 'Zayd',
    entityType: 'individual',
    scope: {
      listsChecked: [],
      listVersionDates: {},
      jurisdictions: [],
      matchingMethods: [],
    },
    evidenceIds: [],
  },
  audience: 'regulator' as const,
};

const MINIMAL_COMPLIANCE_REQ = {
  caseReport: {
    header: {
      product: 'Hawkeye Sterling V2',
      reportKind: 'CASE REPORT' as const,
      confidential: true,
      generatedAt: '2026-04-22T00:00:00Z',
      printedBy: 'mlro@example.ae',
      group: 'Compliance',
      mode: 'first_screening' as const,
    },
    identity: {
      caseId: 'HWK-0001',
      recordUid: 'rec-0001',
      name: 'Zayd',
      entityType: 'Individual' as const,
      citizenship: [],
      identificationNumbers: [],
    },
    keyFindings: {
      totalMatches: 'NO MATCHES FOUND' as const,
      resolvedMatches: 0,
      verdictBreakdown: { Positive: 0, Possible: 0, False: 0, Unspecified: 0 },
      unresolvedMatches: 0,
    },
    reasoningChain: [],
    audit: [],
    sources: [],
    notes: { timezone: 'UTC', legalNotice: '' },
  },
};

describe('weaponizedIntegrity', () => {
  it('produces three stable hashes', () => {
    const a = weaponizedIntegrity();
    const b = weaponizedIntegrity();
    expect(a).toEqual(b);
    for (const key of ['charterHash', 'catalogueHash', 'compositeHash'] as const) {
      expect(a[key]).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('composite hash differs from the component hashes', () => {
    const { charterHash, catalogueHash, compositeHash } = weaponizedIntegrity();
    expect(compositeHash).not.toBe(charterHash);
    expect(compositeHash).not.toBe(catalogueHash);
  });
});

describe('assertWeaponized — default prompt', () => {
  it('returns ok=true with every assertion present', () => {
    const prompt = weaponizedSystemPrompt({
      taskRole: 'TEST',
      audience: 'regulator',
    });
    const report = assertWeaponized(prompt);
    expect(report.missing).toEqual([]);
    expect(report.ok).toBe(true);
    for (const s of report.sections) expect(s.present).toBe(true);
  });

  it('emits all three integrity hashes inline', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST' });
    const integrity = weaponizedIntegrity();
    expect(prompt).toContain(`charterHash:   ${integrity.charterHash}`);
    expect(prompt).toContain(`catalogueHash: ${integrity.catalogueHash}`);
    expect(prompt).toContain(`compositeHash: ${integrity.compositeHash}`);
  });
});

describe('assertWeaponized — opt-outs detected', () => {
  it('flags missing skills catalogue', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST', includeSkillsCatalogue: false });
    const report = assertWeaponized(prompt);
    expect(report.ok).toBe(false);
    expect(report.missing).toContain('skills-catalogue');
    expect(report.missing).toContain('skills-total');
  });

  it('flags missing cognitive catalogue', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST', includeCatalogueSummary: false });
    const report = assertWeaponized(prompt);
    expect(report.ok).toBe(false);
    expect(report.missing).toContain('cognitive-catalogue');
    expect(report.missing).toContain('faculties');
    expect(report.missing).toContain('reasoning-modes');
  });

  it('flags missing integrity block', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST', includeIntegrityBlock: false });
    const report = assertWeaponized(prompt);
    expect(report.ok).toBe(false);
    expect(report.missing).toContain('integrity-block');
    expect(report.missing).toContain('charter-hash');
    expect(report.missing).toContain('catalogue-hash');
    expect(report.missing).toContain('composite-hash');
  });
});

describe('assertWeaponized — agent prompts', () => {
  it('buildComplianceSystemPrompt emits a fully weaponized prompt', () => {
    const prompt = buildComplianceSystemPrompt(MINIMAL_COMPLIANCE_REQ);
    const report = assertWeaponized(prompt);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(prompt).toContain('COMPLIANCE REVIEW agent');
    expect(prompt).toContain('skill id(s)');
  });

  it('buildExecutorRequest emits a fully weaponized prompt', () => {
    const { system } = buildExecutorRequest(MINIMAL_ADVISOR_REQ);
    const report = assertWeaponized(system);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(system).toContain('Deep-Reasoning EXECUTOR');
    expect(system).toContain('skill id(s)');
  });

  it('buildAdvisorRequest emits a fully weaponized prompt', () => {
    const { system } = buildAdvisorRequest(MINIMAL_ADVISOR_REQ, 'executor draft here');
    const report = assertWeaponized(system);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(system).toContain('Deep-Reasoning ADVISOR');
    expect(system).toContain('compositeHash');
  });
});

describe('assertWeaponized — prompt scale', () => {
  it('the lean weaponized prompt is at least 15,000 chars', () => {
    const prompt = weaponizedSystemPrompt({ taskRole: 'TEST' });
    const report = assertWeaponized(prompt);
    expect(report.prompt.length).toBeGreaterThanOrEqual(15_000);
  });

  it('the maximal weaponized prompt (full skills list) is at least 45,000 chars', () => {
    const prompt = weaponizedSystemPrompt({
      taskRole: 'TEST',
      includeSkillsFullList: true,
    });
    const report = assertWeaponized(prompt);
    expect(report.prompt.length).toBeGreaterThanOrEqual(45_000);
  });
});
