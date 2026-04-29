// Layer 3 acceptance tests — 8-section schema + completion gate.
//
// Build-spec acceptance criterion: deliberately feed the model a
// query that exhausts its token budget mid-answer and confirm the
// gate triggers a fail-closed response rather than shipping a
// truncated output. We simulate "exhausted budget" with a partial
// response object and assert each section's defect surfaces.

import { describe, expect, it } from 'vitest';
import {
  checkCompletion,
  buildFailClosed,
  SECTION_IDS,
  type AdvisorResponseV1,
  type CompletionDefect,
} from '../registry/response-schema.js';

function clean(): AdvisorResponseV1 {
  return {
    schemaVersion: 1,
    facts: { bullets: ['Walk-in customer attempting AED 1.15M cash gold purchase.'] },
    redFlags: {
      flags: [
        { indicator: 'Cash threshold exceeded for unverified customer', typology: 'structuring' },
        { indicator: 'Counter-party origin Sub-Saharan Africa, no source-of-funds', typology: 'cahra_origin' },
      ],
    },
    frameworkCitations: {
      byClass: {
        A: ['FDL 10/2025 Art.16', 'FDL 10/2025 Art.22'],
        B: ['Cabinet Decision 134/2025 Art.11'],
        C: ['UAE FIU goAML Manual §2'],
        D: ['FATF R.10', 'FATF R.20'],
      },
    },
    decision: { verdict: 'escalate', oneLineRationale: 'High-value cash, missing CDD, CAHRA origin — escalate to MLRO.' },
    confidence: { score: 4, reason: 'Origin claim unverified — pending counterparty docs.' },
    counterArgument: {
      inspectorChallenge:
        'An inspector would ask whether the entity completed identification per FDL 10/2025 Art.16 before proceeding to any threshold-based check.',
      rebuttal: 'CDD was attempted but the customer declined; this triggers the FDL Art.18 EDD path which itself supports the escalate verdict.',
    },
    auditTrail: {
      charterVersionHash: 'deadbeef',
      directivesInvoked: ['P3', 'P5', 'P9'],
      doctrinesApplied: ['cdd_doctrine', 'cahra_doctrine'],
      retrievedSources: [
        { class: 'A', classLabel: 'Primary Law', sourceId: 'FDL-10-2025', articleRef: 'Art.16' },
        { class: 'A', classLabel: 'Primary Law', sourceId: 'FDL-10-2025', articleRef: 'Art.22' },
        { class: 'B', classLabel: 'Executive Regulations', sourceId: 'CD-134-2025', articleRef: 'Art.11' },
      ],
      timestamp: '2026-04-29T10:00:00Z',
      userId: 'mlro-01',
      mode: 'deep',
      modelVersions: { sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
    },
    escalationPath: {
      responsible: 'Compliance Analyst (1LoD)',
      accountable: 'MLRO (2LoD)',
      consulted: ['Branch Manager'],
      informed: ['Senior Management'],
      nextAction: 'Open case in vault, request source-of-funds documents, file STR if not resolved within 48h.',
    },
  };
}

describe('completion gate: clean response passes', () => {
  it('a fully-populated 8-section response passes', () => {
    const r = checkCompletion(clean());
    expect(r.passed, JSON.stringify(r.defects)).toBe(true);
    expect(r.defects).toEqual([]);
  });

  it('all eight section ids are mandated in canonical order', () => {
    expect(SECTION_IDS).toEqual([
      'facts', 'redFlags', 'frameworkCitations', 'decision', 'confidence',
      'counterArgument', 'auditTrail', 'escalationPath',
    ]);
  });
});

describe('completion gate: catches missing sections', () => {
  it('flags every absent section', () => {
    const r = checkCompletion({});
    const missing = r.defects.filter((d) => d.failure === 'missing').map((d) => d.section);
    // All eight sections should be reported missing.
    for (const id of SECTION_IDS) {
      expect(missing).toContain(id);
    }
  });

  it('flags an empty bullet list in facts', () => {
    const c = clean();
    c.facts = { bullets: [] };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'facts' && d.failure === 'under_threshold')).toBe(true);
  });

  it('flags a bullet containing only whitespace', () => {
    const c = clean();
    c.facts = { bullets: ['  '] };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'facts' && d.failure === 'malformed')).toBe(true);
  });

  it('flags zero citations across all classes', () => {
    const c = clean();
    c.frameworkCitations = { byClass: {} };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'frameworkCitations' && d.failure === 'empty')).toBe(true);
  });

  it('flags an invalid verdict', () => {
    const c = clean();
    // @ts-expect-error — testing runtime guard
    c.decision = { verdict: 'maybe', oneLineRationale: 'x' };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'decision' && d.failure === 'malformed')).toBe(true);
  });

  it('flags confidence < 5 without a reason', () => {
    const c = clean();
    c.confidence = { score: 3 };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'confidence' && d.failure === 'malformed')).toBe(true);
  });

  it('flags counterArgument under threshold', () => {
    const c = clean();
    c.counterArgument = { inspectorChallenge: 'short', rebuttal: 'short' };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'counterArgument' && d.failure === 'under_threshold')).toBe(true);
  });

  it('flags retrievedSources entries missing class metadata', () => {
    const c = clean();
    // @ts-expect-error — testing runtime guard
    c.auditTrail.retrievedSources = [{ sourceId: 'FDL-10-2025', articleRef: 'Art.16' }];
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'auditTrail' && d.failure === 'malformed')).toBe(true);
  });

  it('flags non-proceed verdict with empty redFlags (logical contradiction)', () => {
    const c = clean();
    c.redFlags = { flags: [] };
    c.decision = { verdict: 'escalate', oneLineRationale: 'something' };
    const r = checkCompletion(c);
    expect(r.defects.some((d) => d.section === 'redFlags' && d.failure === 'logic')).toBe(true);
  });

  it('allows empty redFlags when verdict is proceed', () => {
    const c = clean();
    c.redFlags = { flags: [] };
    c.decision = { verdict: 'proceed', oneLineRationale: 'low risk, full CDD complete' };
    c.confidence = { score: 5 };
    const r = checkCompletion(c);
    expect(r.defects.filter((d) => d.section === 'redFlags' && d.failure === 'logic')).toEqual([]);
  });
});

describe('completion gate: fail-closed object', () => {
  it('build-spec acceptance: simulated mid-answer truncation produces fail-closed', () => {
    // Simulate the model exhausting token budget after section 4.
    const truncated: Partial<AdvisorResponseV1> = {
      schemaVersion: 1,
      facts: clean().facts,
      redFlags: clean().redFlags,
      frameworkCitations: clean().frameworkCitations,
      decision: clean().decision,
      // confidence onward — missing.
    };
    const initial = checkCompletion(truncated);
    expect(initial.passed).toBe(false);
    // Simulate retry that is also incomplete.
    const retry = checkCompletion(truncated);
    const failClosed = buildFailClosed(retry.defects, [initial.defects, retry.defects]);
    expect(failClosed.ok).toBe(false);
    expect(failClosed.reason).toBe('completion_gate_tripped');
    expect(failClosed.message).toMatch(/could not produce a complete/);
    expect(failClosed.escalation.to).toMatch(/MLRO/);
    expect(failClosed.attempts).toHaveLength(2);
    expect(failClosed.attempts[0]!.defectCount).toBeGreaterThan(0);
  });

  it('fail-closed names the first failing section', () => {
    const partial = checkCompletion({}).defects;
    const fc = buildFailClosed(partial, [partial]);
    expect(fc.message).toContain(SECTION_IDS[0]); // first section that's missing
  });
});

describe('completion gate: defect ordering & determinism', () => {
  it('produces the same defect set on repeated calls', () => {
    const c = clean();
    c.frameworkCitations = { byClass: {} };
    const a: CompletionDefect[] = checkCompletion(c).defects;
    const b: CompletionDefect[] = checkCompletion(c).defects;
    expect(a).toEqual(b);
  });
});
