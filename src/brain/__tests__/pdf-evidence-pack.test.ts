import { describe, expect, it } from 'vitest';
import { renderEvidencePack } from '../pdf-evidence-pack.js';
import type { BrainVerdict } from '../types.js';

function sampleVerdict(): BrainVerdict {
  return {
    runId: 'run-123',
    subject: { name: 'Mohammed Al-Hassan', type: 'individual', jurisdiction: 'AE', dateOfBirth: '1985-03-12' },
    outcome: 'escalate',
    aggregateScore: 0.78,
    aggregateConfidence: 0.82,
    primaryHypothesis: 'sanctioned',
    prior: 0.2,
    posterior: 0.91,
    methodology: 'Fusion posterior updated via 3 LRs',
    conflicts: [],
    consensus: 'strong',
    findings: [
      {
        modeId: 'modus_ponens',
        category: 'logic',
        faculties: ['reasoning'],
        score: 0.9,
        confidence: 0.85,
        verdict: 'escalate',
        rationale: 'Sanctions hit on OFAC SDN (passport match).',
        evidence: ['ev-1'],
        producedAt: Date.now(),
        likelihoodRatios: [{ evidenceId: 'sanctions_list:observed', positiveGivenHypothesis: 0.95, positiveGivenNot: 0.02 }],
      },
    ],
    chain: [],
    recommendedActions: ['Freeze funds per FDL 20/2018 Art.15'],
    generatedAt: Date.now(),
  };
}

describe('pdf-evidence-pack', () => {
  it('produces a PDF 1.4 byte stream starting with %PDF and ending with %%EOF', () => {
    const bytes = renderEvidencePack(sampleVerdict(), {
      chainAnchor: 'abcd1234',
      evidence: [
        { id: 'ev-1', kind: 'sanctions_list', title: 'OFAC SDN entry 12345', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'authoritative', sha256: 'f00ba5' },
      ],
    });
    expect(bytes.length).toBeGreaterThan(1000);
    const header = String.fromCharCode(...bytes.slice(0, 8));
    expect(header.startsWith('%PDF-1.4')).toBe(true);
    const tail = String.fromCharCode(...bytes.slice(-6));
    expect(tail.trim().endsWith('%%EOF')).toBe(true);
  });

  it('embeds the chain anchor into the doc Keywords metadata', () => {
    const bytes = renderEvidencePack(sampleVerdict(), { chainAnchor: 'deadbeef' });
    const body = String.fromCharCode(...bytes);
    expect(body).toContain('audit-chain:deadbeef');
  });

  it('escapes parentheses in PDF strings so syntax is preserved', () => {
    const v = sampleVerdict();
    v.findings[0]!.rationale = 'Flagged (with parentheses) and a backslash\\.';
    const bytes = renderEvidencePack(v);
    const body = String.fromCharCode(...bytes);
    // Literal unescaped "(with" or "Flagged (" inside a PDF string would break parsing.
    // Our sanitiser should have escaped these as \( / \) / \\.
    expect(body).toContain('\\(with parentheses\\)');
  });
});
