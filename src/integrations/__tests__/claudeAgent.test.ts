import { describe, it, expect } from 'vitest';
import { buildNarrativeRequest, type NarrativeReportRequest } from '../claudeAgent.js';
import type { CaseReport } from '../../reports/caseReport.js';

function minimalReport(caseId = 'HWK-0001'): CaseReport {
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
      caseId,
      recordUid: 'rec-0001',
      name: 'Zayd Al-Mansouri',
      entityType: 'Individual',
      citizenship: ['AE'],
      identificationNumbers: [],
    },
    keyFindings: {
      totalMatches: 'NO MATCHES FOUND',
      resolvedMatches: 0,
      verdictBreakdown: { Positive: 0, Possible: 0, False: 0, Unspecified: 0 },
      unresolvedMatches: 0,
    },
    reasoningChain: [],
    audit: [],
    sources: [{ date: '2026-04-20', url: 'https://scsanctions.un.org/consolidated', title: 'UN Consolidated' }],
    notes: { timezone: 'UTC', legalNotice: 'Confidential.' },
  };
}

const MINIMAL_REQ: NarrativeReportRequest = {
  caseReport: minimalReport(),
};

// ── buildNarrativeRequest ────────────────────────────────────────────────────

describe('buildNarrativeRequest — message content', () => {
  it('produces a single non-empty user message', () => {
    const { messages } = buildNarrativeRequest(MINIMAL_REQ);
    expect(messages.length).toBe(1);
    expect(messages[0]!.content.trim().length).toBeGreaterThan(0);
  });

  it('embeds the caseReport JSON in the user message', () => {
    const { messages } = buildNarrativeRequest(MINIMAL_REQ);
    const content = messages[0]!.content;
    expect(content).toContain('HWK-0001');
    expect(content).toContain('Zayd Al-Mansouri');
    expect(content).toContain('application/json');
  });

  it('labels the caseReport file with the caseId', () => {
    const { messages } = buildNarrativeRequest(MINIMAL_REQ);
    expect(messages[0]!.content).toContain('HWK-0001.json');
  });

  it('embeds sourceData files when provided', () => {
    const req: NarrativeReportRequest = {
      ...MINIMAL_REQ,
      sourceData: [
        { filename: 'txns.csv', mimeType: 'text/csv', content: 'date,amount\n2026-01-01,10000' },
      ],
    };
    const { messages } = buildNarrativeRequest(req);
    const content = messages[0]!.content;
    expect(content).toContain('txns.csv');
    expect(content).toContain('2026-01-01,10000');
  });

  it('produces a non-empty message when no sourceData is supplied', () => {
    const { messages } = buildNarrativeRequest({ caseReport: minimalReport('HWK-9999') });
    expect(messages[0]!.content.trim().length).toBeGreaterThan(0);
  });

  it('includes the instruction to produce HTML', () => {
    const { messages } = buildNarrativeRequest(MINIMAL_REQ);
    expect(messages[0]!.content).toContain('HTML');
  });
});

describe('buildNarrativeRequest — system prompt', () => {
  it('generates a non-empty system prompt', () => {
    const { system } = buildNarrativeRequest(MINIMAL_REQ);
    expect(system.trim().length).toBeGreaterThan(0);
  });

  it('includes audience text for each style', () => {
    const regulator = buildNarrativeRequest({ ...MINIMAL_REQ, style: 'regulator' }).system;
    const executive = buildNarrativeRequest({ ...MINIMAL_REQ, style: 'executive' }).system;
    const investigator = buildNarrativeRequest({ ...MINIMAL_REQ, style: 'investigator' }).system;
    expect(regulator).toContain('regulator');
    expect(executive).toContain('board');
    expect(investigator).toContain('investigator');
  });
});

describe('buildNarrativeRequest — files back-compat field', () => {
  it('returns undefined files when no sourceData is provided', () => {
    const { files } = buildNarrativeRequest(MINIMAL_REQ);
    expect(files).toBeUndefined();
  });

  it('returns sourceData in the files field when provided', () => {
    const sourceData = [{ filename: 'a.csv', mimeType: 'text/csv' as const, content: 'x' }];
    const { files } = buildNarrativeRequest({ ...MINIMAL_REQ, sourceData });
    expect(files).toEqual(sourceData);
  });
});
